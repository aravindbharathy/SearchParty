import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

/**
 * GET /api/agent/session/[agent]
 * Returns the last session output for a named agent.
 * Used as a fallback when spawn_id polling returns 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agent: string }> },
) {
  try {
    const { agent } = await params
    const session = processManager.getSessionForAgent(agent)

    if (!session) {
      return NextResponse.json({ error: `No session for agent: ${agent}` }, { status: 404 })
    }

    return NextResponse.json({
      agent,
      status: session.status,
      output: session.output || null,
      session_id: session.session_id,
      spawn_id: session.spawn_id,
      interactions: session.interactions,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
