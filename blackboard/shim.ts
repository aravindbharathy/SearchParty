#!/usr/bin/env bun
/**
 * Blackboard Shim — thin MCP stdio proxy to the shared blackboard server.
 *
 * Claude Code spawns one of these per agent session. It:
 *   1. Declares claude/channel capability (so Claude gets <channel> notifications)
 *   2. On startup, registers a callback port with the shared blackboard server
 *   3. Proxies read/write tools via HTTP to the shared server
 *   4. Listens on callback port for broadcast notifications from the server
 *   5. Translates HTTP POST /notify -> notifications/claude/channel over stdio
 *
 * Env:
 *   BLACKBOARD_SERVER  — URL of the shared server (default: http://127.0.0.1:8790)
 *   BLACKBOARD_DIR     — Directory name for search state (default: search)
 *   SHIM_PORT          — callback port for this shim (default: auto-assign)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const SERVER_URL = process.env.BLACKBOARD_SERVER ?? 'http://127.0.0.1:8790'
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 8791)
const SHIM_PORT = Number(process.env.SHIM_PORT || 0) // 0 = auto-assign

function now(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

// --- MCP Server ---
const mcp = new Server(
  { name: 'blackboard-channel', version: '0.1.0' },
  {
    capabilities: { tools: {}, experimental: { 'claude/channel': {} } },
    instructions: [
      `You are connected to a MAS blackboard coordination channel.`,
      `The shared blackboard server is at ${SERVER_URL}`,
      ``,
      `## On startup`,
      `1. Use read_blackboard to see current state`,
      `2. Use write_to_blackboard to register yourself under agents: with your name, role, and status: "active"`,
      ``,
      `## When you receive a <channel> notification`,
      `1. Use read_blackboard to see what changed`,
      `2. Check directives: for any tasks assigned to you`,
      `3. Do the work`,
      `4. Use write_to_blackboard to update your status and log results`,
      ``,
      `## Rules`,
      `- Only write to your own section under agents:`,
      `- Write results under your agent key`,
      `- Add log entries for significant actions`,
      `- All agents share one blackboard — you will be notified when anyone writes`,
      ``,
      `Dashboard: http://127.0.0.1:${DASHBOARD_PORT}`,
    ].join('\n'),
  },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'read_blackboard',
      description: 'Read the current blackboard state. Returns the full shared state including all agents, directives, and log.',
      inputSchema: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            description: 'Optional: return only this top-level key (e.g. "agents", "directives", "log"). Omit for full state.',
          },
        },
      },
    },
    {
      name: 'write_to_blackboard',
      description: 'Write to a section of the blackboard. All connected agents will be notified of the change.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Dot-separated path to the key to write (e.g. "agents.researcher", "directives").',
          },
          value: {
            description: 'The value to set at that path. Can be any JSON-compatible value.',
          },
          log_entry: {
            type: 'string',
            description: 'Optional log message describing what changed.',
          },
        },
        required: ['path', 'value'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>

  try {
    switch (req.params.name) {
      case 'read_blackboard': {
        const resp = await fetch(`${SERVER_URL}/read`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ section: args.section }),
        })
        const result = await resp.json() as { data: unknown; error?: string }
        if (result.error) throw new Error(result.error)

        const YAML = (await import('yaml')).default
        return { content: [{ type: 'text', text: YAML.stringify(result.data) }] }
      }

      case 'write_to_blackboard': {
        const resp = await fetch(`${SERVER_URL}/write`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            path: args.path,
            value: args.value,
            log_entry: args.log_entry,
            source: `shim@${actualPort}`,
          }),
        })
        const result = await resp.json() as { ok: boolean; error?: string }
        if (result.error) throw new Error(result.error)
        return { content: [{ type: 'text', text: `wrote to ${args.path}` }] }
      }

      default:
        return { content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }], isError: true }
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `${req.params.name}: ${err instanceof Error ? err.message : err}` }],
      isError: true,
    }
  }
})

// Connect MCP over stdio
await mcp.connect(new StdioServerTransport())

// Deliver a channel notification into this Claude session
function deliverNotification(source: string, message: string): void {
  void mcp.notification({
    method: 'notifications/claude/channel',
    params: {
      content: message,
      meta: { source, ts: now() },
    },
  })
}

// --- Callback HTTP server (receives broadcasts from shared server) ---
const httpServer = Bun.serve({
  port: SHIM_PORT,
  hostname: '127.0.0.1',
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/notify' && req.method === 'POST') {
      return (async () => {
        try {
          const body = await req.json() as { source?: string; message?: string }
          deliverNotification(body.source ?? 'server', body.message ?? 'blackboard updated')
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'content-type': 'application/json' },
          })
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
        }
      })()
    }

    return new Response('blackboard-shim callback', { status: 200 })
  },
})

const actualPort = httpServer.port

// Use search/ directory (managed by CLI launcher, not by shim)
const searchDir = process.env.BLACKBOARD_DIR || 'search'
process.stderr.write(`blackboard-shim: callback on port ${actualPort}, server at ${SERVER_URL}, dir: ${searchDir}\n`)

// Register with the shared blackboard server
async function register(): Promise<void> {
  try {
    const resp = await fetch(`${SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: `shim-${actualPort}`, callback_port: actualPort }),
    })
    const result = await resp.json() as { ok: boolean; agents: number }
    process.stderr.write(`blackboard-shim: registered (${result.agents} agents connected)\n`)
  } catch (err) {
    process.stderr.write(`blackboard-shim: failed to register with server: ${err}\n`)
  }
}

// Unregister on exit (with timeout so Ctrl+C always works)
async function safeExit(): Promise<void> {
  try {
    await Promise.all([
      fetch(`${SERVER_URL}/unregister`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callback_port: actualPort }),
        signal: AbortSignal.timeout(1500),
      }),
      fetch(`${SERVER_URL}/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: `transports.shim-${actualPort}`,
          value: null,
        }),
        signal: AbortSignal.timeout(1500),
      }),
    ])
  } catch {}
  process.exit(0)
}

process.on('SIGINT', safeExit)
process.on('SIGTERM', safeExit)

// --- Heartbeat: write last_seen every 5 minutes ---
const HEARTBEAT_MS = 5 * 60 * 1000
const shimId = `shim-${actualPort}`

async function heartbeat(): Promise<void> {
  try {
    await fetch(`${SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: shimId, callback_port: actualPort }),
      signal: AbortSignal.timeout(3000),
    })
    await fetch(`${SERVER_URL}/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: `transports.${shimId}`,
        value: { status: 'active', last_seen: now(), port: actualPort },
      }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {}
}

async function startHeartbeat(): Promise<void> {
  await heartbeat()
  setInterval(heartbeat, HEARTBEAT_MS)
}

await register()
await startHeartbeat()
