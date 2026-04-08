import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ spawnId: string }> },
) {
  try {
    const { spawnId } = await params
    const managerStatus = processManager.getStatus()

    // Search all agents for the matching spawn_id
    for (const [, agentInfo] of Object.entries(managerStatus.agents)) {
      if (agentInfo.spawn_id === spawnId) {
        return NextResponse.json({
          spawn_id: spawnId,
          status: agentInfo.status,
          started_at: agentInfo.started_at,
        })
      }
    }

    return NextResponse.json(
      { error: `Spawn not found: ${spawnId}` },
      { status: 404 },
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
