#!/usr/bin/env bun
/**
 * Blackboard Server — shared singleton for multi-agent coordination.
 *
 * This is the true blackboard: one process, one YAML file, multiple observers.
 * Agents connect via thin MCP shims that register callback ports.
 * On any write, the server broadcasts to ALL registered agents.
 *
 * Run independently:  BLACKBOARD_PORT=8790 bun blackboard/server.ts
 *
 * Architecture:
 *   blackboard-live.yaml <- this server owns the file
 *   POST /register       <- shims register their callback port
 *   POST /unregister     <- shims deregister on shutdown
 *   POST /read           <- shims read state via HTTP
 *   POST /write          <- shims write state via HTTP (triggers broadcast)
 *   POST /directive      <- dashboard posts directives (triggers broadcast)
 *   GET  /state          <- raw JSON state
 *   GET  /agents         <- registered agent callbacks (debug)
 *   POST /sweep          <- remove stale agents (last_seen > 10 min)
 *   GET  /               <- redirect to Next.js dashboard
 *   WS   /ws             <- live dashboard updates
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import YAML from 'yaml'
import type { ServerWebSocket } from 'bun'

// --- Types ---
interface LogEntry {
  ts: string
  entry: string
}

interface Directive {
  id: string
  title: string
  text: string
  from: string
  posted_at: string
  status: string
  assigned_to?: string
  priority?: 'P0' | 'P1' | 'P2'
  due?: string
}

interface BlackboardState {
  blackboard: { project: string; description: string }
  agents: Record<string, Record<string, unknown>>
  directives: Directive[]
  log: LogEntry[]
}

// --- Config ---
const PORT = Number(process.env.BLACKBOARD_PORT ?? 8790)
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 8791)
const ALLOWED_ORIGINS = [
  `http://localhost:${DASHBOARD_PORT}`,
  `http://127.0.0.1:${DASHBOARD_PORT}`,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]
const MAX_PAYLOAD_BYTES = 512 * 1024 // 512 KB
const DIR = process.env.BLACKBOARD_DIR ?? join(process.cwd(), 'search')
const TEMPLATE = join(DIR, 'blackboard.yaml')
const LIVE = join(DIR, 'blackboard-live.yaml')

// Paths agents are not allowed to overwrite directly
const PROTECTED_ROOTS = new Set(['blackboard'])

// --- Helpers ---
function now(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  if (ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
  }
  if (!origin) {
    return { 'Access-Control-Allow-Origin': `http://localhost:${DASHBOARD_PORT}` }
  }
  return {}
}

function ensureLive(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
  if (!existsSync(LIVE)) {
    if (!existsSync(TEMPLATE)) {
      writeFileSync(LIVE, YAML.stringify({
        blackboard: { project: basename(DIR), description: 'Shared state' },
        agents: {},
        directives: [],
        log: [],
      }))
    } else {
      copyFileSync(TEMPLATE, LIVE)
    }
  }
  ensureSearchStructure()
}

/** Create the full job search directory structure inside search/ if not present.
 *  All writes are idempotent — existing files are never overwritten.
 */
function ensureSearchStructure(): void {
  // Directories
  const dirs = [
    'vault/uploads/resumes',
    'vault/uploads/jds',
    'vault/uploads/transcripts',
    'vault/uploads/portfolio',
    'vault/uploads/templates',
    'vault/generated/resumes',
    'vault/generated/cover-letters',
    'vault/generated/outreach',
    'vault/generated/prep',
    'vault/generated/messages',
    'vault/generated/closing',
    'vault/generated/linkedin-audit',
    'context',
    'pipeline',
    'intel',
    'entries',
    'agents',
  ]
  for (const d of dirs) {
    const p = join(DIR, d)
    if (!existsSync(p)) mkdirSync(p, { recursive: true })
  }

  // Bootstrap YAML files with initial content
  const files: Record<string, string> = {
    'snapshot.yaml': YAML.stringify({ phase: 0, status: 'setup', updated: '' }),
    'board.md': '# Board\n\n_No directives yet._\n',
    'pipeline/applications.yaml': YAML.stringify({ applications: [] }),
    'pipeline/interviews.yaml': YAML.stringify({ interviews: [] }),
    'pipeline/offers.yaml': YAML.stringify({ offers: [] }),
    'pipeline/open-roles.yaml': 'roles: []\nlast_scan: null\nscan_count: 0\n',
    'context/experience-library.yaml': YAML.stringify({ experiences: [] }),
    'context/career-plan.yaml': YAML.stringify({ target: { level: '', functions: [], industries: [], locations: [], comp_floor: 0 } }),
    'context/interview-answers.yaml': YAML.stringify({ why_searching: '', why_leaving: '', visa_status: '' }),
    'context/target-companies.yaml': YAML.stringify({ companies: [] }),
    'context/connection-tracker.yaml': YAML.stringify({ contacts: [] }),
    'context/interview-history.yaml': YAML.stringify({ interviews: [], patterns: {} }),
    'vault/.manifest.yaml': YAML.stringify({ files: [] }),
    'agents/sessions.yaml': YAML.stringify({ sessions: {} }),
  }

  for (const [rel, content] of Object.entries(files)) {
    const p = join(DIR, rel)
    if (!existsSync(p)) {
      writeFileSync(p, content)
    }
  }

  console.log(`search structure ensured at ${DIR}`)
}

function loadFromDisk(): BlackboardState {
  ensureLive()
  const raw = YAML.parse(readFileSync(LIVE, 'utf-8')) ?? {}
  return {
    blackboard: raw.blackboard ?? { project: basename(DIR), description: 'Shared state' },
    agents: raw.agents ?? {},
    directives: Array.isArray(raw.directives) ? raw.directives : [],
    log: Array.isArray(raw.log) ? raw.log : [],
  }
}

function persistToDisk(): void {
  const tmp = LIVE + '.tmp'
  writeFileSync(tmp, YAML.stringify(memState))
  renameSync(tmp, LIVE)
}

function appendLog(entry: string): void {
  memState.log.push({ ts: now(), entry })
  if (memState.log.length > 200) memState.log = memState.log.slice(-200)
}

// --- Agent profile auto-creation ---
const AGENTS_DIR = join(DIR, 'agents')

function ensureAgentProfile(agentId: string, data: Record<string, unknown>): void {
  try {
    if (!existsSync(AGENTS_DIR)) mkdirSync(AGENTS_DIR, { recursive: true })
    const filePath = join(AGENTS_DIR, `${agentId}.md`)
    if (existsSync(filePath)) return

    const role = (data.role as string) || 'agent'
    const model = (data.model as string) || ''
    const ts = now()

    const content = [
      '---',
      `name: ${data.name || agentId}`,
      `role: ${role}`,
      ...(model ? [`model: ${model}`] : []),
      `status: active`,
      `registered: ${ts}`,
      '---',
      '',
      `# ${agentId}`,
      '',
      `Registered ${ts}.`,
      '',
      '## Session Log',
      `- ${ts.slice(0, 10)}: Agent registered (${role}${model ? `, ${model}` : ''})`,
      '',
    ].join('\n')

    writeFileSync(filePath, content, 'utf-8')
    console.log(`auto-created agent profile: ${filePath}`)
  } catch (err) {
    console.error(`failed to create agent profile for ${agentId}:`, err)
  }
}

// --- In-memory state (source of truth — fixes race condition) ---
let memState: BlackboardState = loadFromDisk()

function commitWrite(): void {
  try { persistToDisk() } catch (err) { console.error('persist failed:', err) }
}

// --- Agent registry: callback_port -> { name, failures } ---
const agentCallbacks = new Map<number, { name: string; failures: number }>()
const MAX_FAILURES = 3

// --- Agent -> shim routing: agent name -> callback port ---
const agentToShim = new Map<string, number>()

async function notifyAgent(callbackPort: number, agent: { name: string; failures: number }, source: string, message: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const r = await fetch(`http://127.0.0.1:${callbackPort}/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, message }),
      signal: controller.signal,
    })
    if (r.ok) {
      agent.failures = 0
    } else {
      console.error(`notify ${agent.name}@${callbackPort}: HTTP ${r.status}`)
      agent.failures++
    }
  } catch (err: unknown) {
    console.error(`notify ${agent.name}@${callbackPort}: ${err instanceof Error ? err.message : String(err)}`)
    agent.failures++
  } finally {
    clearTimeout(timeout)
    if (agent.failures >= MAX_FAILURES) {
      console.log(`evicting ${agent.name}@${callbackPort} after ${MAX_FAILURES} consecutive failures`)
      agentCallbacks.delete(callbackPort)
    }
  }
}

async function broadcastToAgents(source: string, message: string): Promise<void> {
  const promises: Promise<void>[] = []
  for (const [callbackPort, agent] of agentCallbacks) {
    promises.push(notifyAgent(callbackPort, agent, source, message))
  }
  await Promise.allSettled(promises)
}

async function notifyTargetedAgent(targetAgentId: string, source: string, message: string): Promise<void> {
  const targetPort = agentToShim.get(targetAgentId)
  if (targetPort) {
    const agent = agentCallbacks.get(targetPort)
    if (agent) {
      console.log(`routing to ${targetAgentId} via shim@${targetPort}`)
      await notifyAgent(targetPort, agent, source, message)
      return
    }
  }
  console.log(`no shim mapping for ${targetAgentId}, broadcasting to all`)
  await broadcastToAgents(source, message)
}

// --- WebSocket clients for dashboard live updates ---
const wsClients = new Set<ServerWebSocket<unknown>>()

function broadcastDashboard(): void {
  try {
    const msg = JSON.stringify({ type: 'state', data: memState })
    for (const ws of wsClients) {
      if (ws.readyState === 1) ws.send(msg)
    }
  } catch (err) {
    console.error('broadcastDashboard failed:', err)
  }
}

async function broadcastAll(source: string, message: string): Promise<void> {
  broadcastDashboard()
  await broadcastToAgents(source, message)
}

// --- Payload size guard ---
async function safeJson(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > MAX_PAYLOAD_BYTES) {
    throw new Error(`payload too large: ${len} bytes (max ${MAX_PAYLOAD_BYTES})`)
  }
  return await req.json() as Record<string, unknown>
}

// --- HTTP + WebSocket server ---
ensureLive()

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch(req, server) {
    const url = new URL(req.url)
    const cors = corsHeaders(req)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
        },
      })
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      if (server.upgrade(req)) return
      return new Response('upgrade failed', { status: 400 })
    }

    // POST /register
    if (url.pathname === '/register' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await safeJson(req) as { agent: string; callback_port: number }
          agentCallbacks.set(body.callback_port, { name: body.agent, failures: 0 })
          console.log(`registered: ${body.agent} @ callback port ${body.callback_port}`)
          return new Response(JSON.stringify({ ok: true, agents: agentCallbacks.size }), {
            headers: { 'content-type': 'application/json', ...cors },
          })
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
        }
      })()
    }

    // POST /unregister
    if (url.pathname === '/unregister' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await safeJson(req) as { callback_port: number }
          const agent = agentCallbacks.get(body.callback_port)
          agentCallbacks.delete(body.callback_port)
          console.log(`unregistered: ${agent?.name ?? 'unknown'} @ callback port ${body.callback_port}`)
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'content-type': 'application/json', ...cors },
          })
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
        }
      })()
    }

    // POST /read
    if (url.pathname === '/read' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await safeJson(req) as { section?: string }
          if (body.section && body.section in memState) {
            return new Response(JSON.stringify({ data: memState[body.section as keyof BlackboardState] }), {
              headers: { 'content-type': 'application/json', ...cors },
            })
          }
          return new Response(JSON.stringify({ data: memState }), {
            headers: { 'content-type': 'application/json', ...cors },
          })
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
        }
      })()
    }

    // POST /write
    if (url.pathname === '/write' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await safeJson(req) as { path: string; value: unknown; log_entry?: string; source?: string }

          if (typeof body.path !== 'string' || !body.path) {
            return new Response(JSON.stringify({ error: 'path is required and must be a string' }), { status: 400 })
          }

          const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])
          const parts = body.path.split('.')
          if (parts.some(p => FORBIDDEN.has(p))) {
            return new Response(JSON.stringify({ error: 'invalid path' }), { status: 400 })
          }

          if (PROTECTED_ROOTS.has(parts[0])) {
            return new Response(JSON.stringify({ error: `cannot overwrite protected root "${parts[0]}"` }), { status: 403 })
          }

          let target: Record<string, unknown> = memState as unknown as Record<string, unknown>
          for (let i = 0; i < parts.length - 1; i++) {
            if (target[parts[i]] === undefined || target[parts[i]] === null) {
              target[parts[i]] = {}
            }
            target = target[parts[i]] as Record<string, unknown>
          }
          target[parts[parts.length - 1]] = body.value

          if (body.log_entry && typeof body.log_entry === 'string') {
            appendLog(body.log_entry.slice(0, 500))
          }

          if (parts[0] === 'agents' && parts.length === 2 && body.value != null && typeof body.value === 'object') {
            ensureAgentProfile(parts[1], body.value as Record<string, unknown>)
            const sourceMatch = typeof body.source === 'string' && body.source.match(/^shim@(\d+)$/)
            if (sourceMatch) {
              const shimPort = Number(sourceMatch[1])
              agentToShim.set(parts[1], shimPort)
              console.log(`mapped agent ${parts[1]} -> shim@${shimPort}`)
            }
          }

          commitWrite()

          if (parts[0] === 'chat' && parts[1] && body.value && typeof body.value === 'object') {
            const chatVal = body.value as Record<string, unknown>
            const preview = typeof chatVal.text === 'string' ? chatVal.text.slice(0, 100) : ''
            const from = typeof chatVal.from === 'string' ? chatVal.from : 'unknown'
            const msg = preview ? `chat from ${from} to ${parts[1]}: ${preview}` : `write to ${body.path}`
            broadcastDashboard()
            await notifyTargetedAgent(parts[1], body.source ?? 'dashboard', msg)
          } else if (parts[0] === 'agents' && parts.length === 2) {
            broadcastDashboard()
          } else if (parts[0] === 'transports') {
            broadcastDashboard()
          } else {
            await broadcastAll(body.source ?? 'agent', `write to ${body.path}`)
          }

          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'content-type': 'application/json', ...cors },
          })
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
        }
      })()
    }

    // POST /directive
    if (url.pathname === '/directive' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await safeJson(req) as {
            text: string
            title?: string
            assignee?: string
            assigned_to?: string
            from?: string
            priority?: 'P0' | 'P1' | 'P2'
            due?: string
          }

          if (typeof body.text !== 'string' || !body.text) {
            return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 })
          }

          const assignee = body.assigned_to ?? body.assignee
          const directive: Directive = {
            id: `d${Date.now()}`,
            title: (typeof body.title === 'string' ? body.title : body.text).slice(0, 200),
            text: body.text.slice(0, 2000),
            from: (typeof body.from === 'string' ? body.from : 'dashboard').slice(0, 50),
            posted_at: now(),
            status: 'pending',
          }
          if (typeof assignee === 'string' && assignee) directive.assigned_to = assignee.slice(0, 50)
          if (body.priority) directive.priority = body.priority
          if (typeof body.due === 'string' && body.due) directive.due = body.due

          memState.directives.push(directive)
          const target = directive.assigned_to ? ` -> ${directive.assigned_to}` : ''
          appendLog(`directive posted: ${directive.text}${target}`)
          commitWrite()
          broadcastDashboard()

          if (directive.assigned_to) {
            await notifyTargetedAgent(directive.assigned_to, 'dashboard', `New directive: ${directive.text} -> ${directive.assigned_to}`)
          } else {
            await broadcastToAgents('dashboard', `New directive: ${directive.text}`)
          }

          return new Response(JSON.stringify({ ok: true, id: directive.id }), {
            headers: { 'content-type': 'application/json', ...cors },
          })
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
        }
      })()
    }

    // POST /sweep
    if (url.pathname === '/sweep' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await safeJson(req).catch(() => ({})) as { stale_minutes?: number }
          const staleMs = (body.stale_minutes ?? 10) * 60 * 1000
          const agents = memState.agents
          const cutoff = Date.now() - staleMs
          const removed: string[] = []

          for (const [id, agent] of Object.entries(agents)) {
            const lastSeen = agent.last_seen ? new Date(agent.last_seen as string).getTime() : 0
            if (!lastSeen || lastSeen < cutoff) {
              delete agents[id]
              removed.push(id)
            }
          }

          if (removed.length > 0) {
            appendLog(`swept ${removed.length} stale agent(s): ${removed.join(', ')}`)
            commitWrite()
            await broadcastAll('server', `swept stale agents: ${removed.join(', ')}`)
          }

          return new Response(JSON.stringify({ ok: true, removed }), {
            headers: { 'content-type': 'application/json', ...cors },
          })
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
        }
      })()
    }

    // GET /state
    // POST /reset — reload state from disk (called after dashboard reset writes clean file)
    if (url.pathname === '/reset' && req.method === 'POST') {
      memState = loadFromDisk()
      persistToDisk()
      broadcastToAgents('dashboard', 'reset')
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json', ...cors },
      })
    }

    if (url.pathname === '/state') {
      return new Response(JSON.stringify(memState), {
        headers: { 'content-type': 'application/json', ...cors },
      })
    }

    // GET /agents
    if (url.pathname === '/agents') {
      const agents: Record<string, { port: number; failures: number }> = {}
      for (const [port, info] of agentCallbacks) agents[info.name] = { port, failures: info.failures }
      return new Response(JSON.stringify(agents), {
        headers: { 'content-type': 'application/json', ...cors },
      })
    }

    // GET / — redirect to Next.js dashboard
    if (url.pathname === '/') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': `http://localhost:${DASHBOARD_PORT}` },
      })
    }

    return new Response('404', { status: 404 })
  },
  websocket: {
    open: (ws) => {
      wsClients.add(ws)
      ws.send(JSON.stringify({ type: 'state', data: memState }))
    },
    close: (ws) => { wsClients.delete(ws) },
    message: () => {},
  },
})

console.log(`blackboard-server: http://localhost:${PORT}`)
console.log(`  dashboard: http://localhost:${DASHBOARD_PORT}`)
console.log(`  agents register via POST /register`)
