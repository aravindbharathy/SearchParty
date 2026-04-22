/**
 * Shared utilities for agent API routes.
 */

import processManager from './process-manager'

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
