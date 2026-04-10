import { NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'

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
    const raw = YAML.parse(readFileSync(fp, 'utf-8'))
    return {
      last_scan: raw?.last_scan || null,
      scan_count: raw?.scan_count || 0,
      roles: Array.isArray(raw?.roles) ? raw.roles : [],
    }
  } catch {
    return { last_scan: null, scan_count: 0, roles: [] }
  }
}

function saveStore(store: OpenRolesStore): void {
  const fp = getStorePath()
  const dir = join(fp, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(fp, YAML.stringify(store))
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

    const store = loadStore()

    if (body.action === 'mark_scanned') {
      store.last_scan = new Date().toISOString()
      store.scan_count = (store.scan_count || 0) + 1
      saveStore(store)
      return NextResponse.json({ ok: true, last_scan: store.last_scan })
    }

    if (body.action === 'add_roles' && body.roles) {
      // Deduplicate by URL or company+title
      const existing = new Set(store.roles.map(r => r.url || `${r.company}:${r.title}`))
      const newRoles = body.roles.filter(r => !existing.has(r.url || `${r.company}:${r.title}`))
      store.roles.push(...newRoles)
      store.last_scan = new Date().toISOString()
      store.scan_count = (store.scan_count || 0) + 1
      saveStore(store)
      return NextResponse.json({ ok: true, added: newRoles.length, total: store.roles.length })
    }

    if (body.action === 'dismiss' && body.role_id) {
      const idx = store.roles.findIndex(r => r.id === body.role_id)
      if (idx !== -1) {
        store.roles[idx].status = 'dismissed'
        saveStore(store)
        return NextResponse.json({ ok: true })
      }
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
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
    const store = loadStore()
    const idx = store.roles.findIndex(r => r.id === body.id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }

    (store.roles[idx] as unknown as Record<string, unknown>)[body.field] = body.value
    saveStore(store)

    return NextResponse.json({ ok: true, role: store.roles[idx] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
