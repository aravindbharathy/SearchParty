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
import { spawn, type ChildProcess } from 'child_process'
import YAML from 'yaml'
import { DEFAULT_MODEL, AGENT_MODELS } from '@/project.config'
import { getSearchDir } from './paths'

/** Read the "## Directive Rules" section from an agent's .md definition file */
function loadDirectiveRules(agentName: string): string {
  try {
    const fp = join(process.cwd(), '.claude', 'agents', `${agentName}.md`)
    if (!existsSync(fp)) return 'Do NOT post directives to other agents. Only update your own status.'
    const content = readFileSync(fp, 'utf-8')
    const match = content.match(/## Directive Rules\n([\s\S]*?)(?=\n## |\Z)/i)
    if (match) return match[1].trim()
  } catch {}
  return 'Do NOT post directives to other agents. Only update your own status.'
}

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
  /** One-off mode: uses -p (print), no session persistence, no blackboard postamble */
  oneOff?: boolean
  /** Override model for this spawn only */
  model?: string
}

interface SpawnResult {
  ok: boolean
  spawn_id: string
  session_id?: string
  error?: string
  queued?: boolean
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

/** Truncate to limit but cut at a paragraph/line boundary to avoid mid-sentence cuts */
function truncateClean(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(-limit)
  // Find the first newline to start at a clean boundary
  const firstNewline = cut.indexOf('\n')
  return firstNewline > 0 && firstNewline < 200 ? cut.slice(firstNewline + 1) : cut
}

class ProcessManager {
  private processes = new Map<string, ChildProcess>()
  /** One-off spawn results — in-memory only, not persisted to sessions.yaml */
  private oneOffResults = new Map<string, { status: 'running' | 'completed' | 'failed'; output?: string }>()
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

  getSessionForAgent(agent: string): AgentSession | null {
    const sessions = this.loadSessions()
    return sessions.sessions[agent] ?? null
  }

  private saveSessions(data: SessionsFile): void {
    const dir = join(this.searchDir, 'agents')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.sessionsPath, YAML.stringify(data))
  }

  /** Pending message queue — keyed by agent name */
  private messageQueue = new Map<string, { request: SpawnRequest; spawnId: string }[]>()

  async spawn(request: SpawnRequest): Promise<SpawnResult> {
    const spawnId = `spawn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sessions = this.loadSessions()
    const existing = request.oneOff ? undefined : sessions.sessions[request.agent]

    // For persistent agents: if the agent already has a running process, queue the message
    if (!request.oneOff && existing?.spawn_id && this.processes.has(existing.spawn_id)) {
      console.log(`[process-manager] ${request.agent} is busy — queuing message (${this.getQueueLength(request.agent) + 1} in queue)`)
      if (!this.messageQueue.has(request.agent)) this.messageQueue.set(request.agent, [])
      this.messageQueue.get(request.agent)!.push({ request, spawnId })
      return { ok: true, spawn_id: spawnId, queued: true }
    }

    // Check if there's a persistent session to resume
    const hasExistingSession = !request.oneOff && existing?.session_id && existing.session_id !== 'pending' && existing.status !== 'failed'

    try {
      // Build the message from directive
      const rawText = typeof request.directive.text === 'string'
        ? request.directive.text
        : JSON.stringify(request.directive)

      // Blackboard postamble — only appended when the agent might produce shareable work
      // The blackboard is a shared knowledge surface, not a message log.
      // Agents only write when they have something worth sharing.
      const directiveRules = loadDirectiveRules(request.agent)
      const blackboardPostamble = `

---
FIRST: Call read_blackboard NOW before doing anything else. Your memory of the blackboard state from earlier in this conversation may be stale. Always use the CURRENT blackboard state, not what you remember.

BLACKBOARD PROTOCOL (use write_to_blackboard):
The blackboard is a shared knowledge store. Other agents read it to coordinate.

WHEN YOU CANNOT PROCEED because context files are empty or missing required data:
Post a user-action directive so the user sees a prompt to fix it.
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

3. CROSS-AGENT DIRECTIVES — only post when the rules below explicitly say to:
${directiveRules}
   To post: read current "directives" array, append your new entry, write the full array back.
   Entry format: {"id":"dir-<timestamp>","text":"<task>","assigned_to":"<agent>","from":"${request.agent}","priority":"<low|medium|high>","status":"pending","posted_at":"<ISO>"}

WHEN TO SKIP ALL BLACKBOARD WRITES:
- User just asked a question, wanted an explanation, or had a conversation — just answer them.
- You repeated work that was already done — no need to re-post.

CRITICAL: You MUST always end your turn with a text response to the user. After using Write/Edit/Bash tools, you MUST still provide a final text message. If your last action is a tool call with no follow-up text, the user sees nothing — your response is lost.
---`

      const directiveText = request.oneOff ? rawText : rawText + blackboardPostamble

      // Resolve model
      const model = request.model || AGENT_MODELS[request.agent] || DEFAULT_MODEL
      const claudePath = process.env.CLAUDE_PATH || 'claude'

      // Build args
      const args: string[] = [
        '--output-format', 'json',
        '--model', model,
      ]

      if (request.oneOff) {
        // One-off: print mode, no agent definition, no blackboard
        args.push('-p')
        console.log(`[process-manager] one-off spawn: ${request.agent} (${model})`)
      } else {
        // Persistent agent: interactive mode with blackboard
        args.push('--dangerously-load-development-channels', 'server:blackboard-channel')
        if (hasExistingSession) {
          args.push('--resume', existing!.session_id)
          console.log(`[process-manager] resuming session ${existing!.session_id} for ${request.agent}`)
        } else {
          args.push('--agent', request.agent)
          console.log(`[process-manager] creating new session for ${request.agent}`)
        }
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

      // Track session (one-off spawns use in-memory map instead)
      const interactions = (existing?.interactions || 0) + 1
      if (request.oneOff) {
        this.oneOffResults.set(spawnId, { status: 'running' })
      } else {
        sessions.sessions[request.agent] = {
          agent: request.agent,
          session_id: existing?.session_id || 'pending',
          spawn_id: spawnId,
          started_at: new Date().toISOString(),
          status: 'running',
          interactions,
        }
        this.saveSessions(sessions)
      }

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
        if (request.oneOff) {
          this.oneOffResults.set(spawnId, { status: 'failed', output: `Spawn error: ${err.message}` })
          setTimeout(() => this.oneOffResults.delete(spawnId), 5 * 60 * 1000)
        } else {
          const errSessions = this.loadSessions()
          if (errSessions.sessions[request.agent]?.spawn_id === spawnId) {
            errSessions.sessions[request.agent].status = 'failed'
            errSessions.sessions[request.agent].output = `Spawn error: ${err.message}`
            this.saveSessions(errSessions)
          }
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
          console.log(`[process-manager] ${request.agent}: session_id=${sessionId}, turns=${json.num_turns}, cost=$${json.total_cost_usd}, result=${result.length}b`)

          // Fallback: if result is empty, try to extract the last text content
          // from the conversation messages (agent ended on a tool call without text)
          if (!result && json.messages && Array.isArray(json.messages)) {
            // Walk backward through messages looking for the last assistant text
            for (let i = json.messages.length - 1; i >= 0; i--) {
              const msg = json.messages[i]
              if (msg.role === 'assistant') {
                // Content can be string or array of content blocks
                if (typeof msg.content === 'string' && msg.content.trim()) {
                  result = msg.content.trim()
                  break
                }
                if (Array.isArray(msg.content)) {
                  const textBlocks = msg.content
                    .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text?.trim())
                    .map((b: { text: string }) => b.text.trim())
                  if (textBlocks.length > 0) {
                    result = textBlocks.join('\n\n')
                    break
                  }
                }
              }
            }
            if (result) {
              console.log(`[process-manager] ${request.agent}: recovered ${result.length}b from conversation messages`)
            } else {
              console.warn(`[process-manager] ${request.agent}: result is EMPTY and no text found in messages`)
            }
          }
        } catch {
          result = stdout
          console.warn(`[process-manager] ${request.agent}: failed to parse JSON (${stdout.length}b), using raw output`)
        }

        if (request.oneOff) {
          this.oneOffResults.set(spawnId, {
            status: code === 0 ? 'completed' : 'failed',
            output: truncateClean(result, 8000),
          })
          // Auto-cleanup after 5 minutes
          setTimeout(() => this.oneOffResults.delete(spawnId), 5 * 60 * 1000)
        } else {
          const currentSessions = this.loadSessions()
          if (currentSessions.sessions[request.agent]?.spawn_id === spawnId) {
            currentSessions.sessions[request.agent].status = code === 0 ? 'completed' : 'failed'
            currentSessions.sessions[request.agent].session_id = sessionId
            currentSessions.sessions[request.agent].output = truncateClean(result, 8000)
            currentSessions.sessions[request.agent].interactions = interactions
            this.saveSessions(currentSessions)
            console.log(`[process-manager] ${request.agent} output saved (${result.length}b → ${truncateClean(result, 8000).length}b)`)
          } else {
            console.warn(`[process-manager] ${request.agent} spawn_id mismatch — output DROPPED. Expected ${spawnId}, found ${currentSessions.sessions[request.agent]?.spawn_id}`)
          }
        }

        if (code === 0 && result.trim() && !request.directive.skipEntry) {
          this.saveAsEntry(request, result.trim(), spawnId)
        }

        // Drain queue: if there's a pending message for this agent, spawn it
        if (!request.oneOff) {
          this.drainQueue(request.agent)
        }
      })

      // Safety timeout: 15 minutes (scans with web search can take 8-12 min)
      setTimeout(() => {
        if (this.processes.has(spawnId)) {
          console.log(`[process-manager] killing ${request.agent} after timeout`)
          child.kill('SIGTERM')
          this.processes.delete(spawnId)
        }
      }, 15 * 60 * 1000)

      return { ok: true, spawn_id: spawnId, session_id: existing?.session_id }
    } catch (err) {
      return {
        ok: false,
        spawn_id: spawnId,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /** Check status of a one-off spawn by spawn_id */
  getOneOffStatus(spawnId: string): { status: string; output?: string } | null {
    const result = this.oneOffResults.get(spawnId)
    if (result) return result
    // Check if it's still running
    if (this.processes.has(spawnId)) return { status: 'running' }
    return null
  }

  isSpawnQueued(spawnId: string): boolean {
    for (const queue of this.messageQueue.values()) {
      if (queue.some(q => q.spawnId === spawnId)) return true
    }
    return false
  }

  getQueueLength(agent: string): number {
    return this.messageQueue.get(agent)?.length ?? 0
  }

  private drainQueue(agent: string): void {
    const queue = this.messageQueue.get(agent)
    if (!queue || queue.length === 0) return
    const next = queue.shift()!
    if (queue.length === 0) this.messageQueue.delete(agent)
    console.log(`[process-manager] draining queue for ${agent} — spawning next (${queue.length} remaining)`)
    // Spawn the queued request (async, fire-and-forget from the close handler)
    this.spawn(next.request).catch(err => {
      console.error(`[process-manager] queued spawn failed for ${agent}:`, err)
    })
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
