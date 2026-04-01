import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

export async function POST(req: Request) {
  try {
    const body = await req.json() as { agent?: string }

    if (!body.agent) {
      return NextResponse.json(
        { error: 'agent is required' },
        { status: 400 }
      )
    }

    const result = await processManager.rotateSession(body.agent)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
