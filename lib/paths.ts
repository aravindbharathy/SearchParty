/**
 * lib/paths.ts — Shared path helpers for the search directory structure.
 *
 * All modules that need to resolve paths under the search/ directory
 * should import from here instead of computing them independently.
 */

import { join } from 'path'

/** Root of the search/operations directory */
export function getSearchDir(): string {
  return join(process.cwd(), process.env.BLACKBOARD_DIR || 'search')
}

/** Vault directory (search/vault/) */
export function getVaultDir(): string {
  return join(getSearchDir(), 'vault')
}

/** User uploads directory (search/vault/uploads/) */
export function getUploadsDir(): string {
  return join(getSearchDir(), 'vault', 'uploads')
}

/** Generated artifacts directory (search/vault/generated/) */
export function getGeneratedDir(): string {
  return join(getSearchDir(), 'vault', 'generated')
}
