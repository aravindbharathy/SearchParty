import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { acquireFileLock } from '@/lib/file-lock'

interface UpdateBody {
  id?: string
  company?: string
  title?: string
  status?: string
  score?: number
  score_file?: string
  resume_file?: string
  cover_letter_file?: string
  application_ids?: string[]
}

// Valid status transitions — target status → allowed source statuses
const ALLOWED_FROM: Record<string, string[]> = {
  'scored': ['new'],
  'resume-ready': ['scored'],
  'applied': ['new', 'scored', 'resume-ready'],
  'dismissed': ['new', 'scored', 'resume-ready'],
  'closed': ['new', 'scored', 'resume-ready', 'applied'],
}

// Fields that can be set as artifacts on a role
const ARTIFACT_FIELDS = ['score', 'score_file', 'resume_file', 'cover_letter_file', 'application_ids'] as const

/**
 * POST /api/finding/open-roles/update-status
 *
 * Updates a role's status and/or artifact fields in open-roles.yaml.
 * Matching priority: id (exact) > company+title (fuzzy).
 * If no match found and status allows it, creates a new role entry.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as UpdateBody
    if (!body.company && !body.id) {
      return NextResponse.json({ error: 'company or id is required' }, { status: 400 })
    }

    const fp = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(fp)) {
      mkdirSync(join(getSearchDir(), 'pipeline'), { recursive: true })
      writeFileSync(fp, 'roles: []\n')
    }

    const release = await acquireFileLock(fp)
    try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    const roles = raw.roles || []
    const validFrom = body.status ? ALLOWED_FROM[body.status] : undefined

    // Step 1: Find matching role — by ID first, then by company+title
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let match: any = null
    if (body.id) {
      match = roles.find((r: { id?: string }) => r.id === body.id)
    }
    if (!match && body.company) {
      const companyLower = body.company.toLowerCase()
      const titleLower = body.title?.toLowerCase() || ''
      // Normalize to slug for fuzzy matching (handles "Senior PM" vs "Senior Product Manager")
      const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const titleSlug = slugify(titleLower)
      const titleWords = titleSlug.split(' ').filter(w => w.length > 2)
      match = roles.find((r: { company?: string; title?: string; status?: string }) => {
        const companyMatch = r.company?.toLowerCase() === companyLower
        if (!companyMatch) return false
        if (!titleLower) return true
        // Try exact includes first
        if (r.title?.toLowerCase().includes(titleLower)) {
          return !validFrom || validFrom.includes(r.status || '')
        }
        // Fuzzy: check if most significant words match
        const roleSlug = slugify(r.title || '')
        const matchingWords = titleWords.filter(w => roleSlug.includes(w))
        const wordMatch = matchingWords.length >= Math.min(3, titleWords.length)
        return wordMatch && (!validFrom || validFrom.includes(r.status || ''))
      })
    }

    if (match) {
      // Update existing role — status is optional (artifact-only updates)
      if (body.status) match.status = body.status
      for (const field of ARTIFACT_FIELDS) {
        if (body[field] !== undefined) {
          if (field === 'application_ids' && Array.isArray(match.application_ids)) {
            // Append new IDs without duplicates
            const existing = new Set(match.application_ids)
            for (const id of body.application_ids || []) existing.add(id)
            match.application_ids = [...existing]
          } else {
            match[field] = body[field]
          }
        }
      }
    } else {
      // No match — create a new role entry (manual scoring, manual application)
      const company = body.company || ''
      const slug = `${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(body.title || 'role').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const newRole: Record<string, unknown> = {
        id: body.id || `role-${Date.now()}-${slug}`.slice(0, 60),
        company,
        company_slug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: body.title || '',
        url: '',
        location: '',
        posted_date: new Date().toISOString().split('T')[0],
        discovered_date: new Date().toISOString().split('T')[0],
        source: 'manual',
        fit_estimate: 0,
        status: body.status || 'new',
      }
      for (const field of ARTIFACT_FIELDS) {
        if (body[field] !== undefined) newRole[field] = body[field]
      }
      roles.push(newRole)
      match = newRole
    }

    raw.roles = roles
    writeFileSync(fp, YAML.stringify(raw))
    return NextResponse.json({ ok: true, id: match.id })
    } finally { release() }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
