/**
 * Process Manager Singleton — manages Claude agent child processes.
 *
 * Architecture: Persistent Agent Sessions
 * - Agents run in interactive mode (NOT -p print mode)
 * - Each agent has a persistent Claude Code session that accumulates memory
 * - First spawn: `echo "msg" | claude --agent {name} --output-format json`
 * - Subsequent spawns: `echo "msg" | claude --resume {session_id} --output-format json`
 * - Agents have full tool access (Read, Write, Bash, WebSearch)
 * - Agents read context files directly — no build-prompt API needed
 * - Sessions persist across dashboard restarts via session_id in sessions.yaml
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess, execSync } from 'child_process'
import YAML from 'yaml'
import { DEFAULT_MODEL, AGENT_MODELS } from '@/project.config'
import { getSearchDir } from './paths'

interface AgentSession {
  agent: string
  session_id: string       // Claude Code persistent session UUID
  spawn_id: string         // current spawn tracking ID
  started_at: string
  status: 'running' | 'completed' | 'failed'
  interactions: number     // total messages sent to this agent
  output?: string          // last output (truncated)
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
  session_id?: string
  error?: string
}

interface ManagerStatus {
  active: number
  agents: Record<string, {
    status: string
    spawn_id: string
    started_at: string
    session_id: string
    interactions: number
  }>
}

class ProcessManager {
  private processes = new Map<string, ChildProcess>()
  private searchDir: string

  constructor() {
    this.searchDir = getSearchDir()
    this.cleanupStaleSessions()
  }

  private cleanupStaleSessions(): void {
    try {
      const sessions = this.loadSessions()
      let changed = false
      for (const [name, session] of Object.entries(sessions.sessions)) {
        if (session.status === 'running' && !this.processes.has(session.spawn_id)) {
          console.log(`[process-manager] marking stale spawn as idle: ${name} (${session.spawn_id})`)
          // Don't mark as failed — the SESSION is still valid for resume
          // Just mark the spawn as completed (agent exited while dashboard was down)
          session.status = 'completed'
          session.output = undefined
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

  async spawn(request: SpawnRequest): Promise<SpawnResult> {
    const spawnId = `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sessions = this.loadSessions()
    const existing = sessions.sessions[request.agent]

    // Check if there's a persistent session to resume
    const hasExistingSession = existing?.session_id && existing.session_id !== 'pending' && existing.status !== 'failed'

    try {
      // Build the message from directive + blackboard postamble
      const rawText = typeof request.directive.text === 'string'
        ? request.directive.text
        : JSON.stringify(request.directive)

      // Blackboard postamble — only appended when the agent might produce shareable work
      // The blackboard is a shared knowledge surface, not a message log.
      // Agents only write when they have something worth sharing.
      const blackboardPostamble = `

---
BLACKBOARD PROTOCOL (use write_to_blackboard):
The blackboard is a shared knowledge store. Other agents read it to coordinate.

WHEN YOU CANNOT PROCEED because context files are empty or missing required data:
You MUST post a user-action directive so the user sees a prompt to fix it.
Do this EXACT sequence:
  Step A: Call read_blackboard
  Step B: Get the "directives" array from the response
  Step C: Call write_to_blackboard with path "directives" and value = the existing array + your new entry:
    {"id":"dir-<timestamp>","type":"user_action","text":"<what's missing and why>","button_label":"<e.g. Complete Career Plan>","route":"<e.g. /coach>","chat_message":"<first person message for the target page agent>","assigned_to":"coach","from":"${request.agent}","priority":"high","status":"pending","posted_at":"<ISO>"}
  IMPORTANT: Write to path "directives", NOT "findings". Only directives with type "user_action" trigger the user prompt.
  Then STOP — tell the user what's missing and where to go.

WHEN YOU PRODUCED SHAREABLE WORK, do these:

1. UPDATE YOUR STATUS (only when you completed meaningful work — wrote a file, scored a JD, researched a company):
   path: "agents.${request.agent}"
   value: {"role":"${request.agent}","status":"completed","last_task":"<what you did>","result_summary":"<key outcomes>","output_files":["<file paths>"]}
   Include a log_entry (under 100 chars): "${request.agent}: <brief summary>"

2. POST A FINDING (only when you discovered something another agent should know):
   path: "findings.${request.agent}"
   value: {"type":"<type>","text":"<what you found — be specific: company names, scores, file paths>","for":"<target agent name or 'all'>","timestamp":"<ISO>"}

3. POST A DIRECTIVE (only when follow-up work is needed from a specific agent):
   path: "directives" (read current array first, then write the full array with your new entry appended)
   New entry: {"id":"dir-<timestamp>","text":"<task>","assigned_to":"<agent>","from":"${request.agent}","priority":"<low|medium|high>","status":"pending","posted_at":"<ISO>"}
   Examples of when to post directives:
   - JD scored >= 75 → resume: "Tailor resume for {company} {role}, JD at {path}"
   - Company intel created → networking: "Generate outreach for {company}"
   - Interview scheduled → interview: "Prep package needed for {company} {date}"
   - Context file stale → archivist: "Review and update {file}"

WHEN TO SKIP: If the user just asked a question, wanted an explanation, or had a conversation — do NOT write to the blackboard. Just answer them.
---`

      const directiveText = rawText + blackboardPostamble

      // Resolve model
      const model = AGENT_MODELS[request.agent] || DEFAULT_MODEL
      const claudePath = process.env.CLAUDE_PATH || 'claude'

      // Build args: interactive mode with JSON output, MCP blackboard enabled
      const args: string[] = [
        '--output-format', 'json',
        '--model', model,
        '--dangerously-load-development-channels', 'server:blackboard-channel',
      ]

      if (hasExistingSession) {
        // Resume existing persistent session — agent has full memory + blackboard access
        args.push('--resume', existing.session_id)
        console.log(`[process-manager] resuming session ${existing.session_id} for ${request.agent}`)
      } else {
        // First interaction — create new session with agent definition + blackboard
        args.push('--agent', request.agent)
        console.log(`[process-manager] creating new session for ${request.agent}`)
      }

      const child = spawn(claudePath, args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        },
      })

      this.processes.set(spawnId, child)

      // Send the directive via stdin, then close to signal completion
      child.stdin?.write(directiveText)
      child.stdin?.end()

      // Track session (session_id will be updated from JSON response)
      const interactions = (existing?.interactions || 0) + 1
      sessions.sessions[request.agent] = {
        agent: request.agent,
        session_id: existing?.session_id || 'pending',
        spawn_id: spawnId,
        started_at: new Date().toISOString(),
        status: 'running',
        interactions,
      }
      this.saveSessions(sessions)

      // Capture output
      const MAX_OUTPUT = 65536
      let stdout = ''

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
        if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(-MAX_OUTPUT)
      })

      child.stderr?.on('data', () => {})

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
        console.log(`[process-manager] ${request.agent} exited code=${code}, stdout=${stdout.length}b`)
        this.processes.delete(spawnId)

        let result = ''
        let sessionId = existing?.session_id || ''
        try {
          const json = JSON.parse(stdout)
          result = json.result || ''
          if (json.session_id) sessionId = json.session_id
          console.log(`[process-manager] ${request.agent}: session_id=${sessionId}, turns=${json.num_turns}, cost=$${json.total_cost_usd}`)
        } catch {
          result = stdout
          console.error(`[process-manager] failed to parse JSON response, using raw output`)
        }

        const currentSessions = this.loadSessions()
        if (currentSessions.sessions[request.agent]?.spawn_id === spawnId) {
          currentSessions.sessions[request.agent].status = code === 0 ? 'completed' : 'failed'
          currentSessions.sessions[request.agent].session_id = sessionId
          currentSessions.sessions[request.agent].output = result.slice(-2000)
          currentSessions.sessions[request.agent].interactions = interactions
          this.saveSessions(currentSessions)
        }

        if (code === 0 && result.trim()) {
          this.saveAsEntry(request, result.trim(), spawnId)
        }
      })

      // Safety timeout: 5 minutes
      setTimeout(() => {
        if (this.processes.has(spawnId)) {
          console.log(`[process-manager] killing ${request.agent} after timeout`)
          child.kill('SIGTERM')
          this.processes.delete(spawnId)
        }
      }, 5 * 60 * 1000)

      return { ok: true, spawn_id: spawnId, session_id: existing?.session_id }
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
      const isRunning = this.processes.has(session.spawn_id)
      agents[name] = {
        status: isRunning ? 'running' : session.status,
        spawn_id: session.spawn_id,
        started_at: session.started_at,
        session_id: session.session_id,
        interactions: session.interactions || 0,
      }
    }

    return {
      active: this.processes.size,
      agents,
    }
  }

  private saveAsEntry(request: SpawnRequest, output: string, spawnId: string): void {
    try {
      const entriesDir = join(this.searchDir, 'entries')
      if (!existsSync(entriesDir)) mkdirSync(entriesDir, { recursive: true })

      const skill = typeof request.directive.skill === 'string' ? request.directive.skill : request.agent
      const entryName = typeof request.directive.entry_name === 'string' ? request.directive.entry_name : ''
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const namePart = entryName ? `-${entryName}` : ''
      const filename = `${skill}${namePart}-${timestamp}.md`

      // Metadata header
      const metadata = request.directive.metadata as Record<string, string> | undefined
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

    // Clear the session — next spawn will create a fresh one with --agent
    delete sessions.sessions[agent]
    this.saveSessions(sessions)

    return { ok: true, new_session_id: 'will-be-assigned-on-next-spawn' }
  }
}

// Singleton instance — use globalThis to survive Next.js HMR in dev mode.
// Without this, hot module replacement creates a new ProcessManager instance,
// losing the in-memory `processes` Map. Child process close handlers then fire
// on a stale instance and status never updates to 'completed'.
const globalForPM = globalThis as unknown as { __processManager?: ProcessManager }
const processManager = globalForPM.__processManager ?? new ProcessManager()
if (process.env.NODE_ENV !== 'production') {
  globalForPM.__processManager = processManager
}
export default processManager
