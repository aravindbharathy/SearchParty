import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ spawnId: string }> },
) {
  try {
    const { spawnId } = await params
    const managerStatus = processManager.getStatus()

    // Search all agents for the matching spawn_id — also check sessions.yaml for output
    for (const [agentName, agentInfo] of Object.entries(managerStatus.agents)) {
      if (agentInfo.spawn_id === spawnId) {
        // Read output from sessions.yaml if completed
        let output: string | undefined
        try {
          const { readFileSync, existsSync } = await import('fs')
          const { join } = await import('path')
          const { getSearchDir } = await import('@/lib/paths')
          const YAML = (await import('yaml')).default
          const sessionsPath = join(getSearchDir(), 'agents', 'sessions.yaml')
          if (existsSync(sessionsPath)) {
            const raw = YAML.parse(readFileSync(sessionsPath, 'utf-8'))
            output = raw?.sessions?.[agentName]?.output
          }
        } catch {}

        return NextResponse.json({
          spawn_id: spawnId,
          status: agentInfo.status,
          started_at: agentInfo.started_at,
          output,
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
