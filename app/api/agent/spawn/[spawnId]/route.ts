import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ spawnId: string }> },
) {
  try {
    const { spawnId } = await params
    const managerStatus = processManager.getStatus()

    for (const [, agentInfo] of Object.entries(managerStatus.agents)) {
      if (agentInfo.spawn_id === spawnId) {
        // Read output from sessions.yaml for completed/failed
        let output: string | undefined
        if (agentInfo.status !== 'running') {
          try {
            const { readFileSync, existsSync } = await import('fs')
            const { join } = await import('path')
            const { getSearchDir } = await import('@/lib/paths')
            const YAML = (await import('yaml')).default
            const sessionsPath = join(getSearchDir(), 'agents', 'sessions.yaml')
            if (existsSync(sessionsPath)) {
              const raw = YAML.parse(readFileSync(sessionsPath, 'utf-8'))
              const agentName = Object.keys(managerStatus.agents).find(
                k => managerStatus.agents[k].spawn_id === spawnId
              )
              if (agentName) output = raw?.sessions?.[agentName]?.output
            }
          } catch {}
        }

        return NextResponse.json({
          spawn_id: spawnId,
          status: agentInfo.status,
          started_at: agentInfo.started_at,
          session_id: agentInfo.session_id,
          interactions: agentInfo.interactions,
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
