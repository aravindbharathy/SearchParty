/**
 * Generic file-level locking using .lock files.
 * Extracted from lib/context.ts pattern.
 */

import { existsSync, writeFileSync, unlinkSync, statSync } from 'fs'

const LOCK_TIMEOUT_MS = 10_000 // 10 seconds — pipeline writes can take a moment

/**
 * Acquire an exclusive lock for a file path.
 * Returns a release function. Always call release() when done.
 *
 * Usage:
 *   const release = await acquireFileLock('/path/to/file.yaml')
 *   try {
 *     // read, modify, write the file
 *   } finally {
 *     release()
 *   }
 */
export async function acquireFileLock(filePath: string): Promise<() => void> {
  const lockFile = filePath + '.lock'
  const start = Date.now()

  while (true) {
    try {
      // Check for stale lock
      if (existsSync(lockFile)) {
        const stat = statSync(lockFile)
        if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
          try { unlinkSync(lockFile) } catch {}
        }
      }

      if (!existsSync(lockFile)) {
        writeFileSync(lockFile, `${process.pid}:${Date.now()}`, { flag: 'wx' })
        return () => { try { unlinkSync(lockFile) } catch {} }
      }
    } catch {
      // wx flag throws if file exists — expected
    }

    if (Date.now() - start > LOCK_TIMEOUT_MS) {
      try { unlinkSync(lockFile) } catch {}
      writeFileSync(lockFile, `${process.pid}:${Date.now()}`)
      return () => { try { unlinkSync(lockFile) } catch {} }
    }

    await new Promise(r => setTimeout(r, 50))
  }
}
