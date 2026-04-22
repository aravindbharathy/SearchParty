/**
 * Shared utilities for agent API routes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import YAML from 'yaml'
import processManager from './process-manager'
import { getSearchDir } from './paths'
import { acquireFileLock } from './file-lock'

const BLACKBOARD_URL = 'http://localhost:8790'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getProcessManager = () => (globalThis as any).__processManager || processManager

export function postToBlackboard(path: string, value: unknown, logEntry: string): Promise<void> {
  return fetch(`${BLACKBOARD_URL}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, value, log_entry: logEntry }),
    signal: AbortSignal.timeout(3000),
  }).then(() => {}).catch(() => {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface OpenRolesStore { roles: any[]; last_scan: string | null; scan_count: number }

/**
 * Safely append roles to open-roles.yaml with file locking.
 * Prevents concurrent writes from clobbering each other.
 */
export async function appendRolesToOpenRoles(newRoles: unknown[]): Promise<void> {
  if (newRoles.length === 0) return
  const orPath = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
  const dir = dirname(orPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const release = await acquireFileLock(orPath)
  try {
    let store: OpenRolesStore = { roles: [], last_scan: null, scan_count: 0 }
    if (existsSync(orPath)) {
      store = YAML.parse(readFileSync(orPath, 'utf-8'), { uniqueKeys: false }) || store
      if (!Array.isArray(store.roles)) store.roles = []
    }
    store.roles.push(...newRoles)
    store.last_scan = new Date().toISOString()
    store.scan_count = (store.scan_count || 0) + 1
    writeFileSync(orPath, YAML.stringify(store))
  } finally {
    release()
  }
}

export async function waitForCompletion(spawnId: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:8791/api/agent/spawn/${spawnId}`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json() as { status?: string }
        if (data.status === 'completed' || data.status === 'failed') return
      } else if (res.status === 404) return
    } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
}
