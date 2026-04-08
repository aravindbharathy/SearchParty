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
    // On startup, mark any stale "running" sessions as failed
    // (they were orphaned by a previous dashboard restart)
    this.cleanupStaleSessions()
  }

  private cleanupStaleSessions(): void {
    try {
      const sessions = this.loadSessions()
      let changed = false
      for (const [name, session] of Object.entries(sessions.sessions)) {
        if (session.status === 'running' && !this.processes.has(session.spawn_id)) {
          console.log(`[process-manager] marking stale session as failed: ${name} (${session.spawn_id})`)
          session.status = 'failed'
          session.output = 'Process lost — dashboard was restarted while agent was running'
          changed = true
        }
      }
      if (changed) this.saveSessions(sessions)
    } catch {}
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

      // Cap output buffer — 64KB for write_to targets (need full YAML), 8KB otherwise
      const hasWriteTo = !!request.directive.write_to
      const MAX_OUTPUT = hasWriteTo ? 65536 : 8192
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

        // Route agent output to the right file based on directive
        if (code === 0 && output.trim()) {
          this.routeOutput(request, output.trim(), spawnId)
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

  /**
   * Route agent output to the correct file based on the directive.
   * - If directive.write_to is set: write directly to that path (relative to search/)
   * - Otherwise: save as an entry file in search/entries/
   */
  private routeOutput(request: SpawnRequest, output: string, spawnId: string): void {
    try {
      const writeTo = request.directive.write_to as string | undefined
      const skill = typeof request.directive.skill === 'string' ? request.directive.skill : request.agent
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

      if (writeTo) {
        // Direct file write — agent output goes to the specified path
        const targetPath = join(this.searchDir, writeTo)
        const targetDir = join(targetPath, '..')
        if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

        // Try to extract just the YAML/content portion from agent output
        const cleanedOutput = this.extractContent(output, writeTo)

        // Validate YAML before writing to context files — don't corrupt them
        if (writeTo.endsWith('.yaml') || writeTo.endsWith('.yml')) {
          try {
            const parsed = YAML.parse(cleanedOutput)
            if (!parsed || typeof parsed !== 'object') {
              console.error(`[process-manager] extracted content is not valid YAML object, saving as entry instead`)
              this.saveAsEntry(skill, timestamp, spawnId, output, request.directive)
              return
            }
            writeFileSync(targetPath, YAML.stringify(parsed))
            console.log(`[process-manager] wrote validated YAML to: ${writeTo}`)
          } catch (yamlErr) {
            console.error(`[process-manager] YAML parse failed for ${writeTo}, saving raw output as entry instead:`, yamlErr)
            this.saveAsEntry(skill, timestamp, spawnId, output, request.directive)
            return
          }
        } else {
          writeFileSync(targetPath, cleanedOutput)
          console.log(`[process-manager] wrote output to: ${writeTo}`)
        }
      } else {
        this.saveAsEntry(skill, timestamp, spawnId, output, request.directive)
      }
    } catch (err) {
      console.error('[process-manager] failed to route output:', err)
    }
  }

  private saveAsEntry(skill: string, timestamp: string, spawnId: string, output: string, directive?: Record<string, unknown>): void {
    try {
      const entriesDir = join(this.searchDir, 'entries')
      if (!existsSync(entriesDir)) mkdirSync(entriesDir, { recursive: true })

      // Use entry_name from directive for contextual filenames (e.g., "stripe-staff-engineer")
      const entryName = typeof directive?.entry_name === 'string' ? directive.entry_name : ''
      const namePart = entryName ? `-${entryName}` : ''
      const filename = `${skill}${namePart}-${timestamp}.md`

      // Prepend metadata header if available
      const metadata = directive?.metadata as Record<string, string> | undefined
      let header = ''
      if (metadata) {
        const parts: string[] = []
        if (metadata.company) parts.push(`Company: ${metadata.company}`)
        if (metadata.role) parts.push(`Role: ${metadata.role}`)
        if (metadata.url) parts.push(`URL: ${metadata.url}`)
        if (metadata.jd_file) parts.push(`JD File: ${metadata.jd_file}`)
        parts.push(`Date: ${new Date().toISOString().split('T')[0]}`)
        header = `---\n${parts.join('\n')}\n---\n\n`
      }

      writeFileSync(join(entriesDir, filename), header + output)
      console.log(`[process-manager] saved entry: ${filename}`)
    } catch (err) {
      console.error('[process-manager] failed to save entry:', err)
    }
  }

  /**
   * Extract content from agent output, handling markdown code blocks.
   * For YAML targets: extract from code blocks, or find YAML structure in output.
   * For other targets: use output as-is.
   */
  private extractContent(output: string, targetPath: string): string {
    if (targetPath.endsWith('.yaml') || targetPath.endsWith('.yml')) {
      // Priority 1: Extract from ```yaml ... ``` code blocks (greedy — get largest block)
      const yamlBlocks = [...output.matchAll(/```(?:yaml|yml)?\s*\n([\s\S]*?)```/g)]
      if (yamlBlocks.length > 0) {
        // Use the longest block (most likely the full YAML)
        const longest = yamlBlocks.reduce((a, b) => a[1].length > b[1].length ? a : b)
        return longest[1].trim()
      }

      // Priority 2: Find the start of actual YAML structure and strip non-YAML lines
      const knownKeys = ['contact:', 'summary:', 'experiences:', 'target:', 'salary_expectations:', 'companies:', 'contacts:', 'interviews:']
      const lines = output.split('\n')
      let startIdx = -1
      for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim()
        if (knownKeys.some(key => trimmedLine.startsWith(key))) {
          startIdx = i
          break
        }
      }

      if (startIdx >= 0) {
        // Take from the YAML start, strip any trailing markdown fences or non-YAML
        const yamlLines = lines.slice(startIdx).filter(line => {
          const t = line.trim()
          return !t.startsWith('```')  // strip code fences
        })
        return yamlLines.join('\n').trim()
      }

      // Priority 3: Strip all code fences and try the whole output
      return output.replace(/```(?:yaml|yml)?\s*\n?/g, '').trim()
    }

    // For markdown targets: extract from ```markdown code blocks if present,
    // otherwise strip any leading preamble before the first heading (#)
    if (targetPath.endsWith('.md')) {
      // Check for markdown code block
      const mdBlock = output.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/)
      if (mdBlock) return mdBlock[1].trim()

      // Find first markdown heading and take everything from there
      const headingIdx = output.indexOf('\n#')
      if (headingIdx > 0 && headingIdx < 200) {
        return output.slice(headingIdx + 1).trim()
      }
    }

    return output
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
