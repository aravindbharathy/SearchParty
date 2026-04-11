import { NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'

interface Offer {
  id: string
  company: string
  role: string
  level: string
  base: number
  equity: string
  equity_annual: number
  bonus_target: string
  sign_on: number
  total_year1: number
  total_steady: number
  location: string
  remote: string
  deadline: string
  status: 'pending' | 'negotiating' | 'accepted' | 'declined' | 'expired'
  notes: string
  received_date: string
}

function getStorePath(): string {
  return join(getSearchDir(), 'pipeline', 'offers.yaml')
}

function loadStore(): { offers: Offer[] } {
  const fp = getStorePath()
  if (!existsSync(fp)) return { offers: [] }
  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'))
    return { offers: Array.isArray(raw?.offers) ? raw.offers : [] }
  } catch {
    return { offers: [] }
  }
}

function saveStore(data: { offers: Offer[] }): void {
  const fp = getStorePath()
  const dir = join(fp, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(fp, YAML.stringify(data))
}

export async function GET() {
  try {
    const store = loadStore()
    return NextResponse.json({
      offers: store.offers,
      total: store.offers.length,
      pending: store.offers.filter(o => o.status === 'pending' || o.status === 'negotiating').length,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<Offer>
    const store = loadStore()

    const offer: Offer = {
      id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      company: body.company || '',
      role: body.role || '',
      level: body.level || '',
      base: body.base || 0,
      equity: body.equity || '',
      equity_annual: body.equity_annual || 0,
      bonus_target: body.bonus_target || '',
      sign_on: body.sign_on || 0,
      total_year1: body.total_year1 || 0,
      total_steady: body.total_steady || 0,
      location: body.location || '',
      remote: body.remote || '',
      deadline: body.deadline || '',
      status: 'pending',
      notes: body.notes || '',
      received_date: new Date().toISOString().split('T')[0],
    }

    store.offers.push(offer)
    saveStore(store)

    return NextResponse.json({ ok: true, offer })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { id: string; field: string; value: unknown }
    const store = loadStore()
    const idx = store.offers.findIndex(o => o.id === body.id)
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    ;(store.offers[idx] as unknown as Record<string, unknown>)[body.field] = body.value
    saveStore(store)

    return NextResponse.json({ ok: true, offer: store.offers[idx] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { id: string }
    const store = loadStore()
    store.offers = store.offers.filter(o => o.id !== body.id)
    saveStore(store)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
