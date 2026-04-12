import { NextResponse } from 'next/server'
import { upsertChecklist } from '@/lib/playbook'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { id?: string; title?: string; items?: { text: string; checked: boolean }[] }
    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    const checklist = upsertChecklist({
      id: body.id,
      title: body.title,
      items: body.items || [],
    })
    return NextResponse.json({ checklist }, { status: body.id ? 200 : 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
