import { NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { acquireFileLock } from '@/lib/file-lock'

export interface OpenRole {
  id: string
  company: string
  company_slug: string
  title: string
  url: string
  location: string
  posted_date: string
  discovered_date: string
  source: string // 'careers_page' | 'linkedin' | 'manual' | 'web_search'
  fit_estimate: number // 0-100 quick estimate before full scoring
  status: 'new' | 'scored' | 'applied' | 'dismissed'
  score?: number // full score after /score-jd
  jd_file?: string
  notes?: string
  salary_range?: string
  verified_active?: boolean
  verification_note?: string
}

interface OpenRolesStore {
  last_scan: string | null
  scan_count: number
  roles: OpenRole[]
}

function getStorePath(): string {
  return join(getSearchDir(), 'pipeline', 'open-roles.yaml')
}

function loadStore(): OpenRolesStore {
  const fp = getStorePath()
  if (!existsSync(fp)) return { last_scan: null, scan_count: 0, roles: [] }
  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false })
    // Accept both "roles" and "open_roles" keys (agents may use either)
    const rawRoles = Array.isArray(raw?.roles) ? raw.roles
      : Array.isArray(raw?.open_roles) ? raw.open_roles
      : []

    // Normalize field name aliases from agent-written data
    const roles = rawRoles.map((r: Record<string, unknown>) => ({
      ...r,
      id: r.id || r.role_id || `role-${Math.random().toString(36).slice(2, 8)}`,
      url: r.url || r.link || r.job_url || '',
      location: r.location || (Array.isArray(r.locations) ? (r.locations as string[]).join(', ') : ''),
      source: r.source || 'web_search',
      status: r.status || 'new',
      fit_estimate: r.fit_estimate ?? r.fit_score ?? 0,
    }))

    return {
      last_scan: raw?.last_scan || raw?.last_updated || null,
      scan_count: raw?.scan_count || 0,
      roles,
    }
  } catch {
    return { last_scan: null, scan_count: 0, roles: [] }
  }
}

function writeStore(store: OpenRolesStore): void {
  const fp = getStorePath()
  const dir = join(fp, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(fp, YAML.stringify(store))
}

/**
 * Lock, read, modify, write. Prevents concurrent lost updates.
 */
async function modifyStore(fn: (store: OpenRolesStore) => void): Promise<OpenRolesStore> {
  const fp = getStorePath()
  const release = await acquireFileLock(fp)
  try {
    const store = loadStore()
    fn(store)
    writeStore(store)
    return store
  } finally { release() }
}

/**
 * GET — read all open roles + scan metadata
 */
export async function GET() {
  try {
    const store = loadStore()

    const newRoles = store.roles.filter(r => r.status === 'new')
    const scoredRoles = store.roles.filter(r => r.status === 'scored')

    // Check if scan is stale (>24 hours)
    const scanStale = !store.last_scan ||
      (Date.now() - new Date(store.last_scan).getTime()) > 24 * 60 * 60 * 1000

    return NextResponse.json({
      roles: store.roles,
      total: store.roles.length,
      new_count: newRoles.length,
      scored_count: scoredRoles.length,
      last_scan: store.last_scan,
      scan_count: store.scan_count,
      scan_stale: scanStale,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * POST — add roles (from agent scan) or update scan metadata
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      action: 'add_roles' | 'mark_scanned' | 'dismiss'
      roles?: OpenRole[]
      role_id?: string
    }

    if (body.action === 'mark_scanned') {
      const store = await modifyStore(s => {
        s.last_scan = new Date().toISOString()
        s.scan_count = (s.scan_count || 0) + 1
      })
      return NextResponse.json({ ok: true, last_scan: store.last_scan })
    }

    if (body.action === 'add_roles' && body.roles) {
      let added = 0
      const store = await modifyStore(s => {
        const existing = new Set(s.roles.map(r => r.url || `${r.company}:${r.title}`))
        const newRoles = (body.roles || []).filter(r => !existing.has(r.url || `${r.company}:${r.title}`))
        s.roles.push(...newRoles)
        s.last_scan = new Date().toISOString()
        s.scan_count = (s.scan_count || 0) + 1
        added = newRoles.length
      })
      return NextResponse.json({ ok: true, added, total: store.roles.length })
    }

    if (body.action === 'dismiss' && body.role_id) {
      let found = false
      await modifyStore(s => {
        const idx = s.roles.findIndex(r => r.id === body.role_id)
        if (idx !== -1) { s.roles[idx].status = 'dismissed'; found = true }
      })
      return found
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * PUT — update a role (status, score, notes)
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json() as { id: string; field: string; value: unknown }
    let role: OpenRole | undefined
    let found = false
    await modifyStore(s => {
      const idx = s.roles.findIndex(r => r.id === body.id)
      if (idx !== -1) {
        (s.roles[idx] as unknown as Record<string, unknown>)[body.field] = body.value
        role = s.roles[idx]
        found = true
      }
    })
    return found
      ? NextResponse.json({ ok: true, role })
      : NextResponse.json({ error: 'Role not found' }, { status: 404 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
