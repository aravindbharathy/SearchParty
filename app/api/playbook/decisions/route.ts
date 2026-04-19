import { NextResponse } from 'next/server'
import { addDecision } from '@/lib/playbook'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { text?: string; reasoning?: string; source?: string }
    if (!body.text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
    if (body.source && !['retro', 'manual'].includes(body.source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }
    const decision = addDecision({
      text: body.text,
      reasoning: body.reasoning,
      source: (body.source as 'retro' | 'manual') || 'manual',
    })
    return NextResponse.json({ decision }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
