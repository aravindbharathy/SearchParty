/**
 * Process Manager Singleton — manages Claude agent child processes.
 *
 * Lives inside the Next.js process (no separate HTTP service).
 * Handles spawning, session registry, lifecycle tracking.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import YAML from 'yaml'
import { DEFAULT_MODEL, AGENT_MODELS } from '@/project.config'
import { getSearchDir } from './paths'

interface AgentSession {
  agent: string
  session_id: string
  spawn_id: string
  started_at: string
  status: 'running' | 'completed' | 'failed'
  output?: string
}

interface SessionsFile {
  sessions: Record<string, AgentSession>
}

interface SpawnRequest {
  agent: string
  directive: Record<string, unknown>
}

interface SpawnResult {
  ok: boolean
  spawn_id: string
  error?: string
}

interface ManagerStatus {
  active: number
  agents: Record<string, { status: string; spawn_id: string; started_at: string }>
}

class ProcessManager {
  private processes = new Map<string, ChildProcess>()
  private searchDir: string

  constructor() {
    this.searchDir = getSearchDir()
  }

  private get sessionsPath(): string {
    return join(this.searchDir, 'agents', 'sessions.yaml')
  }

  private loadSessions(): SessionsFile {
    try {
      if (existsSync(this.sessionsPath)) {
        const raw = YAML.parse(readFileSync(this.sessionsPath, 'utf-8'))
        return { sessions: raw?.sessions ?? {} }
      }
    } catch {}
    return { sessions: {} }
  }

  private saveSessions(data: SessionsFile): void {
    const dir = join(this.searchDir, 'agents')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.sessionsPath, YAML.stringify(data))
  }

  private generateUUID(): string {
    // Generate a proper UUID v4 for Claude Code session IDs
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  async spawn(request: SpawnRequest): Promise<SpawnResult> {
    const spawnId = `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sessions = this.loadSessions()

    // Generate a fresh session ID for each spawn.
    // Note: claude -p (print mode) sessions are NOT resumable — they don't persist.
    // Session resume will be implemented when we switch to interactive agent mode.
    const sessionId = this.generateUUID()

    try {
      // Build prompt from directive
      const directiveText = typeof request.directive.text === 'string'
        ? request.directive.text
        : JSON.stringify(request.directive)

      // Resolve model: per-agent override > default
      const model = AGENT_MODELS[request.agent] || DEFAULT_MODEL

      // Build args: claude -p "prompt" --model <model>
      // Each spawn is a fresh session — no --resume for -p mode
      const args = ['-p', directiveText, '--model', model]

      // Resolve claude binary path — Next.js server may not have full user PATH
      const claudePath = process.env.CLAUDE_PATH || 'claude'

      const child = spawn(claudePath, args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Ensure user PATH is available for claude binary resolution
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        },
      })

      this.processes.set(spawnId, child)

      // Close stdin immediately so claude doesn't wait for piped input
      child.stdin?.end()

      // Track session
      sessions.sessions[request.agent] = {
        agent: request.agent,
        session_id: sessionId,
        spawn_id: spawnId,
        started_at: new Date().toISOString(),
        status: 'running',
      }
      this.saveSessions(sessions)

      // Cap output buffer to prevent unbounded memory growth
      const MAX_OUTPUT = 8192
      let output = ''

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString()
        if (output.length > MAX_OUTPUT) output = output.slice(-MAX_OUTPUT)
      })

      child.stderr?.on('data', (data: Buffer) => {
        output += data.toString()
        if (output.length > MAX_OUTPUT) output = output.slice(-MAX_OUTPUT)
      })

      child.on('error', (err: Error) => {
        console.error(`[process-manager] spawn error for ${request.agent}:`, err.message)
        this.processes.delete(spawnId)
        const errSessions = this.loadSessions()
        if (errSessions.sessions[request.agent]?.spawn_id === spawnId) {
          errSessions.sessions[request.agent].status = 'failed'
          errSessions.sessions[request.agent].output = `Spawn error: ${err.message}`
          this.saveSessions(errSessions)
        }
      })

      child.on('close', (code: number | null) => {
        console.log(`[process-manager] ${request.agent} exited with code ${code}, output length: ${output.length}`)
        this.processes.delete(spawnId)
        const currentSessions = this.loadSessions()
        if (currentSessions.sessions[request.agent]?.spawn_id === spawnId) {
          currentSessions.sessions[request.agent].status = code === 0 ? 'completed' : 'failed'
          currentSessions.sessions[request.agent].output = output.slice(-2000)
          this.saveSessions(currentSessions)
        }

        // Save agent output as an entry file so dashboard pages can read it
        if (code === 0 && output.trim()) {
          try {
            const entriesDir = join(this.searchDir, 'entries')
            if (!existsSync(entriesDir)) mkdirSync(entriesDir, { recursive: true })

            const skill = typeof request.directive.skill === 'string' ? request.directive.skill : request.agent
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const filename = `${skill}-${timestamp}-${spawnId.slice(-6)}.md`

            writeFileSync(join(entriesDir, filename), output.trim())
            console.log(`[process-manager] saved entry: ${filename}`)
          } catch (err) {
            console.error('[process-manager] failed to save entry file:', err)
          }
        }
      })

      // Safety: kill process if it runs longer than 5 minutes
      setTimeout(() => {
        if (this.processes.has(spawnId)) {
          child.kill('SIGTERM')
          this.processes.delete(spawnId)
        }
      }, 5 * 60 * 1000)

      return { ok: true, spawn_id: spawnId }
    } catch (err) {
      return {
        ok: false,
        spawn_id: spawnId,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  getStatus(): ManagerStatus {
    const sessions = this.loadSessions()
    const agents: ManagerStatus['agents'] = {}

    for (const [name, session] of Object.entries(sessions.sessions)) {
      // Check if process is still actually running
      const isRunning = this.processes.has(session.spawn_id)
      agents[name] = {
        status: isRunning ? 'running' : session.status,
        spawn_id: session.spawn_id,
        started_at: session.started_at,
      }
    }

    return {
      active: this.processes.size,
      agents,
    }
  }

  async rotateSession(agent: string): Promise<{ ok: boolean; new_session_id?: string; error?: string }> {
    const sessions = this.loadSessions()
    const existing = sessions.sessions[agent]

    if (!existing) {
      return { ok: false, error: `No existing session for agent: ${agent}` }
    }

    // Kill existing process if running
    const proc = this.processes.get(existing.spawn_id)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(existing.spawn_id)
    }

    // Create new session ID
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    sessions.sessions[agent] = {
      ...existing,
      session_id: newSessionId,
      status: 'completed',
    }
    this.saveSessions(sessions)

    return { ok: true, new_session_id: newSessionId }
  }
}

// Singleton instance
const processManager = new ProcessManager()
export default processManager
