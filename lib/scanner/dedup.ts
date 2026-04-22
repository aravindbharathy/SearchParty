/**
 * Deduplication against existing pipeline state.
 * Adapted from CareerOps scan.mjs + dedup-tracker.mjs (MIT, Santiago Fernandez de Valderrama).
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '../paths'

export function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function normalizeRole(role: string): string {
  return role.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Load all existing role URLs from open-roles.yaml.
 */
export function loadExistingRoleUrls(): Set<string> {
  const seen = new Set<string>()
  try {
    const fp = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(fp)) return seen
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    for (const role of raw.roles || []) {
      if (role.url) seen.add(role.url)
    }
  } catch {}
  return seen
}

/**
 * Load existing company::role pairs from open-roles.yaml and applications.yaml.
 */
export function loadExistingCompanyRoles(): Set<string> {
  const seen = new Set<string>()
  const searchDir = getSearchDir()

  // From open-roles
  try {
    const fp = join(searchDir, 'pipeline', 'open-roles.yaml')
    if (existsSync(fp)) {
      const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
      for (const role of raw.roles || []) {
        if (role.company && role.title) {
          seen.add(`${normalizeCompany(role.company)}::${normalizeRole(role.title)}`)
        }
      }
    }
  } catch {}

  // From applications
  try {
    const fp = join(searchDir, 'pipeline', 'applications.yaml')
    if (existsSync(fp)) {
      const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
      for (const app of raw.applications || []) {
        if (app.company && app.title) {
          seen.add(`${normalizeCompany(app.company)}::${normalizeRole(app.title)}`)
        }
      }
    }
  } catch {}

  return seen
}
