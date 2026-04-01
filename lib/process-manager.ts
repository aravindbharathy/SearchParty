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
    this.searchDir = join(process.cwd(), process.env.BLACKBOARD_DIR || 'search')
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

  async spawn(request: SpawnRequest): Promise<SpawnResult> {
    const spawnId = `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sessions = this.loadSessions()

    // Check for existing session to resume
    const existing = sessions.sessions[request.agent]
    const sessionId = existing?.session_id || spawnId

    try {
      // Build prompt from directive
      const directiveText = typeof request.directive.text === 'string'
        ? request.directive.text
        : JSON.stringify(request.directive)

      const args = ['-p', directiveText]

      // If resuming an existing session, use --resume
      if (existing?.session_id) {
        args.unshift('--resume', existing.session_id)
      }

      const child = spawn('claude', args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      this.processes.set(spawnId, child)

      // Track session
      sessions.sessions[request.agent] = {
        agent: request.agent,
        session_id: sessionId,
        spawn_id: spawnId,
        started_at: new Date().toISOString(),
        status: 'running',
      }
      this.saveSessions(sessions)

      let output = ''

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      child.stderr?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      child.on('close', (code: number | null) => {
        this.processes.delete(spawnId)
        const currentSessions = this.loadSessions()
        if (currentSessions.sessions[request.agent]?.spawn_id === spawnId) {
          currentSessions.sessions[request.agent].status = code === 0 ? 'completed' : 'failed'
          currentSessions.sessions[request.agent].output = output.slice(-2000)
          this.saveSessions(currentSessions)
        }
      })

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
