#!/usr/bin/env bun
/**
 * Search Party — CLI Launcher
 *
 * Commands:
 *   job-search start   — Starts blackboard server (:8790) and Next.js dashboard (:8791). Opens browser.
 *   job-search stop    — Graceful shutdown of all services
 *   job-search status  — Shows running services, port allocations, agent spawn stats
 *   job-search setup   — Launches /setup skill interactively (Phase 1 — stub for now)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { spawn, execSync } from 'child_process'

const PROJECT_ROOT = join(import.meta.dir, '..')
const SEARCH_DIR = join(PROJECT_ROOT, process.env.BLACKBOARD_DIR || 'search')
const PIDS_DIR = join(SEARCH_DIR, '.pids')
const BLACKBOARD_PORT = Number(process.env.BLACKBOARD_PORT ?? 8790)
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 8791)

// --- Helpers ---

function ensurePidsDir(): void {
  if (!existsSync(PIDS_DIR)) mkdirSync(PIDS_DIR, { recursive: true })
}

function writePid(name: string, pid: number): void {
  ensurePidsDir()
  writeFileSync(join(PIDS_DIR, `${name}.pid`), String(pid))
}

function readPid(name: string): number | null {
  const path = join(PIDS_DIR, `${name}.pid`)
  if (!existsSync(path)) return null
  const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10)
  return isNaN(pid) ? null : pid
}

function removePid(name: string): void {
  const path = join(PIDS_DIR, `${name}.pid`)
  try { unlinkSync(path) } catch {}
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) })
    // Port is in use
    return false
  } catch {
    return true
  }
}

function checkPrerequisites(): void {
  // Check bun
  try {
    execSync('bun --version', { stdio: 'pipe' })
  } catch {
    console.error('Error: bun is not installed. Install it at https://bun.sh')
    process.exit(1)
  }

  // Check node_modules
  if (!existsSync(join(PROJECT_ROOT, 'node_modules'))) {
    console.error('Error: node_modules not found. Run `npm install` first.')
    process.exit(1)
  }

  // Check blackboard node_modules
  if (!existsSync(join(PROJECT_ROOT, 'blackboard', 'node_modules'))) {
    console.error('Error: blackboard/node_modules not found. Run `cd blackboard && bun install` first.')
    process.exit(1)
  }
}

// --- Commands ---

async function startServices(): Promise<void> {
  checkPrerequisites()
  ensurePidsDir()

  // Check if already running
  const bbPid = readPid('blackboard')
  if (bbPid && isProcessRunning(bbPid)) {
    console.log('Services are already running. Use `job-search stop` first.')
    return
  }

  // Check port availability
  if (!(await isPortAvailable(BLACKBOARD_PORT))) {
    console.error(`Error: Port ${BLACKBOARD_PORT} is already in use.`)
    process.exit(1)
  }
  if (!(await isPortAvailable(DASHBOARD_PORT))) {
    console.error(`Error: Port ${DASHBOARD_PORT} is already in use.`)
    process.exit(1)
  }

  console.log('Starting Search Party...\n')

  // 1. Start blackboard server
  console.log(`  Starting blackboard server on :${BLACKBOARD_PORT}...`)
  const blackboard = spawn('bun', [join(PROJECT_ROOT, 'blackboard', 'server.ts')], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      BLACKBOARD_DIR: SEARCH_DIR,
      BLACKBOARD_PORT: String(BLACKBOARD_PORT),
      DASHBOARD_PORT: String(DASHBOARD_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  if (!blackboard.pid) {
    console.error('  Failed to start blackboard server.')
    process.exit(1)
  }
  writePid('blackboard', blackboard.pid)
  blackboard.unref()

  // Wait for blackboard to be ready
  let bbReady = false
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250))
    try {
      const resp = await fetch(`http://127.0.0.1:${BLACKBOARD_PORT}/state`, { signal: AbortSignal.timeout(500) })
      if (resp.ok) { bbReady = true; break }
    } catch {}
  }

  if (!bbReady) {
    console.error('  Blackboard server did not start within 5s. Aborting.')
    try { process.kill(blackboard.pid, 'SIGTERM') } catch {}
    removePid('blackboard')
    process.exit(1)
  }
  console.log(`  Blackboard server started on :${BLACKBOARD_PORT}`)

  // 2. Start Next.js dashboard
  console.log(`  Starting dashboard on :${DASHBOARD_PORT}...`)
  const dashboard = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(DASHBOARD_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  if (!dashboard.pid) {
    console.error('  Failed to start dashboard. Stopping blackboard...')
    try { process.kill(blackboard.pid, 'SIGTERM') } catch {}
    removePid('blackboard')
    process.exit(1)
  }
  writePid('dashboard', dashboard.pid)
  dashboard.unref()

  console.log(`  Dashboard started on :${DASHBOARD_PORT}`)

  console.log('\n  All services started.')
  console.log(`  Dashboard: http://localhost:${DASHBOARD_PORT}`)
  console.log(`  Blackboard: http://localhost:${BLACKBOARD_PORT}`)

  // Open browser
  try {
    const { platform } = process
    const cmd = platform === 'darwin' ? 'open' : platform === 'linux' ? 'xdg-open' : 'start'
    spawn(cmd, [`http://localhost:${DASHBOARD_PORT}`], { stdio: 'ignore', detached: true }).unref()
  } catch {}
}

async function stopServices(): Promise<void> {
  console.log('Stopping Search Party...\n')
  let stopped = 0

  for (const name of ['dashboard', 'blackboard']) {
    const pid = readPid(name)
    if (pid && isProcessRunning(pid)) {
      console.log(`  Stopping ${name} (PID ${pid})...`)
      try {
        // Kill the process group to get child processes too
        process.kill(-pid, 'SIGTERM')
      } catch {
        try { process.kill(pid, 'SIGTERM') } catch {}
      }
      stopped++
    } else {
      console.log(`  ${name}: not running`)
    }
    removePid(name)
  }

  console.log(stopped > 0 ? '\n  All services stopped.' : '\n  No services were running.')
}

async function showStatus(): Promise<void> {
  console.log('Search Party Status\n')

  const services = [
    { name: 'Blackboard Server', port: BLACKBOARD_PORT, pidName: 'blackboard' },
    { name: 'Dashboard', port: DASHBOARD_PORT, pidName: 'dashboard' },
  ]

  for (const svc of services) {
    const pid = readPid(svc.pidName)
    const running = pid ? isProcessRunning(pid) : false
    const status = running ? `running (PID ${pid})` : 'stopped'
    console.log(`  ${svc.name} [:${svc.port}]: ${status}`)
  }

  // Check blackboard for agent info
  try {
    const resp = await fetch(`http://127.0.0.1:${BLACKBOARD_PORT}/state`, { signal: AbortSignal.timeout(1000) })
    if (resp.ok) {
      const state = await resp.json() as { agents?: Record<string, unknown>; directives?: unknown[] }
      const agentCount = Object.keys(state.agents ?? {}).length
      const directiveCount = (state.directives ?? []).length
      console.log(`\n  Agents: ${agentCount}`)
      console.log(`  Directives: ${directiveCount}`)
    }
  } catch {
    console.log('\n  (blackboard not reachable)')
  }
}

function showSetup(): void {
  console.log('Setup wizard coming in Phase 1.')
  console.log('For now, edit context files directly in search/context/')
}

// --- Main ---
const command = process.argv[2]

switch (command) {
  case 'start':
    await startServices()
    break
  case 'stop':
    await stopServices()
    break
  case 'status':
    await showStatus()
    break
  case 'setup':
    showSetup()
    break
  default:
    console.log('Usage: job-search <start|stop|status|setup>')
    console.log('')
    console.log('Commands:')
    console.log('  start   Start blackboard server and dashboard')
    console.log('  stop    Stop all services')
    console.log('  status  Show service status')
    console.log('  setup   Run setup wizard (Phase 1)')
    process.exit(command ? 1 : 0)
}
