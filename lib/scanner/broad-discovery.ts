/**
 * Broad discovery — generates WebSearch queries from the career plan
 * to find roles at companies NOT on the target list.
 *
 * Unlike the targeted ATS scan (which checks known companies),
 * broad discovery searches across all companies on each ATS platform.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '../paths'

export interface SearchQuery {
  id: string
  name: string
  query: string
  platform: 'ashby' | 'greenhouse' | 'lever' | 'general'
  enabled: boolean
}

/**
 * Generate search queries from the user's career plan.
 * Returns queries that search across ATS platforms for matching roles.
 */
export function generateSearchQueries(): SearchQuery[] {
  const cpPath = join(getSearchDir(), 'context', 'career-plan.yaml')
  if (!existsSync(cpPath)) return []

  const cp = YAML.parse(readFileSync(cpPath, 'utf-8'), { uniqueKeys: false }) || {}
  const target = cp.target || {}
  const functions: string[] = target.functions || []
  const level: string = target.level || ''
  const locations: string[] = target.locations || []

  if (functions.length === 0) return []

  const queries: SearchQuery[] = []
  let idx = 0

  // Build role keywords from functions
  const roleKeywords: string[] = []
  for (const fn of functions) {
    roleKeywords.push(fn)
    const lower = fn.toLowerCase()
    if (lower.includes('ux research') || lower.includes('user research')) {
      roleKeywords.push('UX researcher', 'user researcher', 'design researcher', 'research ops')
    }
    if (lower.includes('product manager')) {
      roleKeywords.push('product manager', 'group product manager', 'technical PM')
    }
    if (lower.includes('software engineer')) {
      roleKeywords.push('software engineer', 'staff engineer', 'backend engineer', 'frontend engineer')
    }
    if (lower.includes('data scien')) {
      roleKeywords.push('data scientist', 'ML engineer', 'applied scientist')
    }
    if (lower.includes('design') && !lower.includes('research')) {
      roleKeywords.push('product designer', 'UX designer', 'interaction designer')
    }
  }

  // Deduplicate
  const uniqueKeywords = [...new Set(roleKeywords)]

  // Build OR groups (max 3 keywords per query for better results)
  const keywordGroups: string[][] = []
  for (let i = 0; i < uniqueKeywords.length; i += 3) {
    keywordGroups.push(uniqueKeywords.slice(i, i + 3))
  }

  // Level keywords
  const levelTerms = level ? level.split(/[\/,]/).map(s => s.trim()).filter(Boolean) : []

  // Per-platform queries
  const platforms: Array<{ name: string; platform: SearchQuery['platform']; siteFilter: string }> = [
    { name: 'Greenhouse', platform: 'greenhouse', siteFilter: 'site:job-boards.greenhouse.io' },
    { name: 'Ashby', platform: 'ashby', siteFilter: 'site:jobs.ashbyhq.com' },
    { name: 'Lever', platform: 'lever', siteFilter: 'site:jobs.lever.co' },
  ]

  for (const plat of platforms) {
    for (const group of keywordGroups) {
      const roleClause = group.map(k => `"${k}"`).join(' OR ')
      const levelClause = levelTerms.length > 0 ? ` ${levelTerms[0]}` : ''
      queries.push({
        id: `broad-${++idx}`,
        name: `${plat.name} — ${group[0]}`,
        query: `${plat.siteFilter} ${roleClause}${levelClause}`,
        platform: plat.platform,
        enabled: true,
      })
    }
  }

  // Location-specific queries for remote roles
  if (locations.some(l => l.toLowerCase().includes('remote'))) {
    for (const group of keywordGroups.slice(0, 2)) {
      const roleClause = group.map(k => `"${k}"`).join(' OR ')
      queries.push({
        id: `broad-${++idx}`,
        name: `Remote — ${group[0]}`,
        query: `${roleClause} remote job opening 2026`,
        platform: 'general',
        enabled: true,
      })
    }
  }

  return queries
}

/**
 * Load stored search queries, or generate from career plan if none exist.
 */
export function loadOrGenerateQueries(): SearchQuery[] {
  const sqPath = join(getSearchDir(), 'context', 'search-queries.yaml')
  if (existsSync(sqPath)) {
    try {
      const raw = YAML.parse(readFileSync(sqPath, 'utf-8'), { uniqueKeys: false }) || {}
      if (Array.isArray(raw.queries) && raw.queries.length > 0) {
        return raw.queries
      }
    } catch {}
  }
  return generateSearchQueries()
}

/**
 * Parse a role from a WebSearch result title.
 * Handles patterns like:
 *   "Senior UX Researcher @ Loom"
 *   "UX Researcher at Miro | Lever"
 *   "Product Designer — Figma"
 */
export function parseSearchResult(title: string, url: string): { role: string; company: string } | null {
  if (!title || !url) return null

  // Try structured patterns: "Role @ Company", "Role at Company", "Role — Company", "Role | Company"
  const match = title.match(/^(.+?)(?:\s*[@|—–\-]\s*|\s+at\s+)(.+?)(?:\s*[|—–\-]\s*.+)?$/)
  if (match) {
    const role = match[1].trim()
    let company = match[2].trim()
    // Clean up common suffixes
    company = company.replace(/\s*\|.*$/, '').replace(/\s*[-—–].*$/, '').trim()
    if (role && company) return { role, company }
  }

  // Fallback: extract company from URL domain
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    // ATS URLs: jobs.ashbyhq.com/{company}, job-boards.greenhouse.io/{company}
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (host.includes('ashbyhq.com') && pathParts[0]) {
      return { role: title.split(/[@|—–\-]/)[0].trim(), company: pathParts[0] }
    }
    if (host.includes('greenhouse.io') && pathParts[0]) {
      return { role: title.split(/[@|—–\-]/)[0].trim(), company: pathParts[0] }
    }
    if (host.includes('lever.co') && pathParts[0]) {
      return { role: title.split(/[@|—–\-]/)[0].trim(), company: pathParts[0] }
    }
  } catch {}

  return null
}
