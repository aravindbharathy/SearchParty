import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { agent?: string; directive?: Record<string, unknown> }

    if (!body.agent || !body.directive) {
      return NextResponse.json(
        { error: 'agent and directive are required' },
        { status: 400 }
      )
    }

    const result = await processManager.spawn({
      agent: body.agent,
      directive: body.directive,
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
