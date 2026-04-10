import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

const BLACKBOARD_URL = 'http://localhost:8790'

interface Directive {
  id: string
  text: string
  assigned_to?: string
  assignee?: string
  from?: string
  priority?: string
  status?: string
  posted_at?: string
}

/**
 * POST /api/agent/dispatch
 *
 * Polls the blackboard for pending directives and auto-spawns the assigned agent
 * to pick them up. Called periodically by the dashboard.
 *
 * Returns which agents were dispatched and which directives were claimed.
 */
export async function POST() {
  try {
    // Read blackboard state
    const bbRes = await fetch(`${BLACKBOARD_URL}/state`, { signal: AbortSignal.timeout(3000) })
    if (!bbRes.ok) {
      return NextResponse.json({ dispatched: [], error: 'Blackboard unreachable' })
    }

    const state = await bbRes.json() as { directives?: Directive[] }
    const directives = state.directives ?? []

    // Find pending directives with an assigned agent
    const pending = directives.filter(
      d => (!d.status || d.status === 'pending' || d.status === 'open') && (d.assigned_to || d.assignee)
    )

    if (pending.length === 0) {
      return NextResponse.json({ dispatched: [], pending: 0 })
    }

    // Group by assigned agent — only dispatch one directive per agent per cycle
    const byAgent = new Map<string, Directive>()
    for (const d of pending) {
      const agent = d.assigned_to || d.assignee || ''
      if (!agent || byAgent.has(agent)) continue
      byAgent.set(agent, d)
    }

    // Check which agents are already running
    const status = processManager.getStatus()
    const dispatched: Array<{ agent: string; directive_id: string; spawn_id: string }> = []

    for (const [agent, directive] of byAgent) {
      // Skip if agent is already running or completed very recently (within 30s)
      // The cooldown prevents dispatch from stomping on a session that the user's
      // poll hasn't caught up with yet
      const agentStatus = status.agents[agent]
      if (agentStatus?.status === 'running') continue
      if (agentStatus?.started_at) {
        const elapsedMs = Date.now() - new Date(agentStatus.started_at).getTime()
        if (elapsedMs < 30_000) continue // too recent — let the user's poll catch up
      }

      // Mark directive as in-progress on the blackboard
      try {
        const updatedDirectives = directives.map(d =>
          d.id === directive.id ? { ...d, status: 'in-progress' } : d
        )
        await fetch(`${BLACKBOARD_URL}/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'directives',
            value: updatedDirectives,
            log_entry: `Auto-dispatch: ${agent} picking up directive from ${directive.from || 'dashboard'}`,
          }),
          signal: AbortSignal.timeout(3000),
        })
      } catch { /* proceed anyway */ }

      // Spawn the agent with the directive
      const result = await processManager.spawn({
        agent,
        directive: {
          skill: 'directive',
          entry_name: `directive-${directive.id}`,
          text: `You have a pending directive on the blackboard:\n\nFrom: ${directive.from || 'unknown'}\nPriority: ${directive.priority || 'medium'}\nTask: ${directive.text}\n\nRead the blackboard for full context, then execute this directive. When done, mark the directive as "done" by updating the directives array on the blackboard.`,
        },
      })

      if (result.ok) {
        dispatched.push({ agent, directive_id: directive.id, spawn_id: result.spawn_id })
      }
    }

    return NextResponse.json({ dispatched, pending: pending.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), dispatched: [] },
      { status: 500 },
    )
  }
}
