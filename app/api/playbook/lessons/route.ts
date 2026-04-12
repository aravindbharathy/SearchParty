import { NextResponse } from 'next/server'
import { addLesson } from '@/lib/playbook'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { text?: string; category?: string; source?: string; company?: string }
    if (!body.text || !body.category) {
      return NextResponse.json({ error: 'text and category are required' }, { status: 400 })
    }
    const validCategories = ['interview', 'resume', 'networking', 'negotiation', 'general']
    if (!validCategories.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    const lesson = addLesson({
      text: body.text,
      category: body.category as 'interview' | 'resume' | 'networking' | 'negotiation' | 'general',
      source: (body.source as 'debrief' | 'retro' | 'manual') || 'manual',
      company: body.company,
    })
    return NextResponse.json({ lesson }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
