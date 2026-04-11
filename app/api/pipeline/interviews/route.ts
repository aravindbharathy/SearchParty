import { NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'

interface Interview {
  id: string
  company: string
  role: string
  round: string
  date: string
  time: string
  format: string
  interviewer: string
  prep_status: 'not-started' | 'in-progress' | 'ready'
  prep_file?: string
  notes: string
  status: 'upcoming' | 'completed' | 'cancelled'
}

function getStorePath(): string {
  return join(getSearchDir(), 'pipeline', 'interviews.yaml')
}

function loadStore(): { interviews: Interview[] } {
  const fp = getStorePath()
  if (!existsSync(fp)) return { interviews: [] }
  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'))
    return { interviews: Array.isArray(raw?.interviews) ? raw.interviews : [] }
  } catch {
    return { interviews: [] }
  }
}

function saveStore(data: { interviews: Interview[] }): void {
  const fp = getStorePath()
  const dir = join(fp, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(fp, YAML.stringify(data))
}

export async function GET() {
  try {
    const store = loadStore()
    const today = new Date().toISOString().split('T')[0]
    const upcoming = store.interviews.filter(i => i.status === 'upcoming' && i.date >= today)
    const past = store.interviews.filter(i => i.status === 'completed' || i.date < today)

    return NextResponse.json({
      interviews: store.interviews,
      upcoming: upcoming.length,
      completed: past.length,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<Interview>
    const store = loadStore()

    const interview: Interview = {
      id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      company: body.company || '',
      role: body.role || '',
      round: body.round || 'phone-screen',
      date: body.date || '',
      time: body.time || '',
      format: body.format || 'video',
      interviewer: body.interviewer || '',
      prep_status: 'not-started',
      notes: body.notes || '',
      status: 'upcoming',
    }

    store.interviews.push(interview)
    saveStore(store)

    return NextResponse.json({ ok: true, interview })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { id: string; field: string; value: unknown }
    const store = loadStore()
    const idx = store.interviews.findIndex(i => i.id === body.id)
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    ;(store.interviews[idx] as unknown as Record<string, unknown>)[body.field] = body.value
    saveStore(store)

    return NextResponse.json({ ok: true, interview: store.interviews[idx] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { id: string }
    const store = loadStore()
    store.interviews = store.interviews.filter(i => i.id !== body.id)
    saveStore(store)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
