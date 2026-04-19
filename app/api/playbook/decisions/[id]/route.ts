import { NextResponse } from 'next/server'
import { updateDecisionStatus, deleteItem } from '@/lib/playbook'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as { status?: string }
    if (!body.status || !['active', 'archived'].includes(body.status)) {
      return NextResponse.json({ error: 'status must be active or archived' }, { status: 400 })
    }
    const decision = updateDecisionStatus(id, body.status as 'active' | 'archived')
    return NextResponse.json({ decision })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const deleted = deleteItem('decisions', id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
