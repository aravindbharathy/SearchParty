'use client'

import { useState, useCallback, useEffect } from 'react'
import { useBlackboard } from '../hooks/use-blackboard'
import { useAgentEvents } from '../hooks/use-agent-events'
import { MarkdownView } from '../_components/markdown-view'

const AGENT_COLORS: Record<string, string> = {
  research: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  resume: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  coach: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  networking: 'bg-green-500/10 text-green-400 border-green-500/20',
  interview: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  negotiation: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

const ALL_AGENTS = [
  { name: 'research', role: 'Role Discovery' },
  { name: 'resume', role: 'Resume Tailoring' },
  { name: 'coach', role: 'Job Search Coach' },
  { name: 'networking', role: 'Outreach & Connections' },
  { name: 'interview', role: 'Interview Prep' },
  { name: 'negotiation', role: 'Salary & Negotiation' },
]

function agentBadgeColor(name: string): string {
  return AGENT_COLORS[name.toLowerCase()] ?? 'bg-text-muted/10 text-text-muted border-text-muted/20'
}

interface AgentSessionInfo {
  status: string
  spawn_id: string
  started_at: string
  session_id: string
  interactions: number
}

interface AgentStatusResponse {
  active: number
  agents: Record<string, AgentSessionInfo>
}

export default function CommandCenterPage() {
  const { state, connected } = useBlackboard()
  const { spawnAgent, status: spawnStatus, spawnId: activeSpawnId } = useAgentEvents()

  const [showBlackboard, setShowBlackboard] = useState(false)

  // Track which agent is currently being spawned
  const [spawningAgent, setSpawningAgent] = useState<string | null>(null)

  // Agent sessions from process manager
  const [sessions, setSessions] = useState<AgentStatusResponse | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Directive form state
  const [directiveTitle, setDirectiveTitle] = useState('')
  const [directiveText, setDirectiveText] = useState('')
  const [directiveAgent, setDirectiveAgent] = useState('')
  const [directivePriority, setDirectivePriority] = useState('medium')
  const [directiveSubmitting, setDirectiveSubmitting] = useState(false)

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch('/api/agent/status')
      if (res.ok) {
        const data = await res.json() as AgentStatusResponse
        setSessions(data)
      }
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  // Fetch sessions on mount and poll every 10 seconds
  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 10000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const clearBlackboard = async () => {
    // The reset API already wrote a clean blackboard-live.yaml to disk.
    // Tell the blackboard server to reload from the clean file.
    await fetch('http://localhost:8790/reset', { method: 'POST' }).catch(() => {
      // Fallback: clear individual paths if /reset endpoint not available (server not restarted yet)
      for (const [path, value] of [['agents', {}], ['directives', []], ['findings', {}], ['transports', {}]] as const) {
        fetch('http://localhost:8790/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, value }),
        }).catch(() => {})
      }
    })
  }

  const handleReset = async () => {
    const choice = prompt(
      'What do you want to reset?\n\n' +
      '1 — Reset activity (pipeline, entries, output, agent sessions)\n' +
      '    Keeps: context files, vault files, intel\n\n' +
      '2 — Full reset (everything back to onboarding)\n' +
      '    Clears: context files, pipeline, entries, output, sessions\n' +
      '    Keeps: vault source files, intel\n\n' +
      'Type 1 or 2:'
    )

    if (choice !== '1' && choice !== '2') return

    const full = choice === '2'
    if (full && !confirm('Are you sure? This will erase your experience library, career plan, Q&A answers, and all other context. You will need to go through onboarding again.')) return

    try {
      const res = await fetch(`/api/reset?full=${full}`, { method: 'POST' })
      if (res.ok) {
        await clearBlackboard()
        fetchSessions()
        // Clear all agent chat localStorage
        const keysToRemove = [
          'coach-messages', 'coach-section', 'coach-resume-zone', 'coach-last-briefing-date',
          'finding-chat-messages', 'finding-active-tab',
          'applying-chat-messages', 'applying-active-tab',
          'networking-chat-messages', 'net-active-tab', 'net-parsed-messages', 'net-active-batch',
          'interviewing-chat-messages', 'interviewing-active-tab',
          'closing-chat-messages', 'closing-active-tab',
          'agent-spawn-coach-agent', 'agent-spawn-finding-chat', 'agent-spawn-applying-chat',
          'agent-spawn-networking-chat', 'agent-spawn-interviewing-chat', 'agent-spawn-closing-chat',
        ]
        for (const key of keysToRemove) {
          try { localStorage.removeItem(key) } catch {}
        }

        if (full) {
          window.location.href = '/coach'
        } else {
          alert('Activity reset complete.')
          window.location.reload()
        }
      }
    } catch {
      alert('Reset failed')
    }
  }

  const handleStartAgent = async (agentName: string) => {
    setSpawningAgent(agentName)
    try {
      await spawnAgent(agentName, {
        skill: 'check-in',
        text: `Check the blackboard for any pending directives assigned to you. If you find one, execute it. If none, read the blackboard state, register yourself as available, and report what you see.`,
      })
    } finally {
      setSpawningAgent(null)
      fetchSessions()
    }
  }

  // Refresh sessions when any spawn status changes
  useEffect(() => {
    if (spawnStatus === 'completed' || spawnStatus === 'failed') {
      fetchSessions()
    }
  }, [spawnStatus, fetchSessions])

  const handleResetSession = async (agentName: string) => {
    if (!confirm(`Reset the ${agentName} agent? This clears its conversation memory. It will start fresh on the next interaction.`)) return
    try {
      await fetch('/api/agent/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentName }),
      })
      // Clear the chat localStorage for this agent's page
      const chatKeys: Record<string, string[]> = {
        coach: ['coach-messages', 'agent-spawn-coach-agent'],
        research: ['finding-chat-messages', 'agent-spawn-finding-chat'],
        resume: ['applying-chat-messages', 'agent-spawn-applying-chat'],
        networking: ['networking-chat-messages', 'agent-spawn-networking-chat'],
        interview: ['interviewing-chat-messages', 'agent-spawn-interviewing-chat'],
        negotiation: ['closing-chat-messages', 'agent-spawn-closing-chat'],
      }
      for (const key of chatKeys[agentName] || []) {
        try { localStorage.removeItem(key) } catch {}
      }
      fetchSessions()
    } catch {
      // ignore
    }
  }

  const handleAddDirective = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!directiveText.trim()) return

    setDirectiveSubmitting(true)
    try {
      await fetch('http://localhost:8790/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: directiveText,
          title: directiveTitle || undefined,
          assigned_to: directiveAgent || undefined,
          from: 'dashboard',
          priority: directivePriority,
        }),
      })
      setDirectiveTitle('')
      setDirectiveText('')
      setDirectiveAgent('')
      setDirectivePriority('medium')
    } catch {
      // ignore — blackboard may be down
    } finally {
      setDirectiveSubmitting(false)
    }
  }

  // Blackboard-derived data
  const agents = state?.agents ?? {}
  const directives = (state?.directives ?? []) as Array<Record<string, string>>
  const activeDirectives = directives.filter(
    (d) => !d.status || d.status === 'pending' || d.status === 'open' || d.status === 'in-progress'
  )
  const completedDirectives = directives.filter(
    (d) => d.status === 'done' || d.status === 'completed'
  )
  const findings = state?.findings ?? {}
  const findingEntries = Object.entries(findings).sort((a, b) => {
    const tA = a[1].timestamp ?? ''
    const tB = b[1].timestamp ?? ''
    return tB.localeCompare(tA)
  })
  const recentLog = (state?.log ?? [])
    .filter((e: { entry: string }) => !e.entry.match(/^shim[- ]\d+ (exited|started|crashed)/i))
    .slice(-20)
    .reverse()

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Command Center</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="text-xs text-danger hover:text-danger/80 px-2 py-1 border border-danger/30 rounded transition-colors"
          >
            Reset All
          </button>
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-text-muted/40'}`} />
            <span className="text-text-muted">{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>
      </div>
      <p className="text-text-muted mb-4">Agent management and blackboard status.</p>

      {/* Warning banner */}
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-6 flex items-start gap-3">
        <span className="text-warning text-lg mt-0.5">!</span>
        <div>
          <p className="text-sm font-medium text-text">Advanced area</p>
          <p className="text-xs text-text-muted mt-0.5">Resetting agents clears their memory of your conversations. Only reset an agent if it&apos;s behaving incorrectly or stuck. The full reset erases all your profile data and generated materials.</p>
        </div>
      </div>

      {/* ─── Connection Status ─────────────────────────────────── */}
      {!connected && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6 flex items-center gap-3">
          <span className="w-3 h-3 bg-amber-400 rounded-full shrink-0" />
          <div>
            <div className="text-sm font-medium text-amber-400">Blackboard Disconnected</div>
            <div className="text-xs text-text-muted">
              The blackboard server at ws://127.0.0.1:8790 is unreachable. Agent status and findings will not update until reconnected.
            </div>
          </div>
        </div>
      )}

      {/* ─── 1. Agent Team ─────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <h2 className="font-semibold mb-4">Agent Team</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_AGENTS.map((def) => {
            const bbAgent = agents[def.name]
            const pmAgent = sessions?.agents?.[def.name]

            // Truth comes from process manager (is a process actually running?)
            // Blackboard is for context (what was the agent's last task/finding?)
            const isProcessRunning = pmAgent?.status === 'running'
            const isSpawning = spawningAgent === def.name && spawnStatus === 'running'
            const isActive = isProcessRunning || isSpawning

            const statusDot = isActive ? 'bg-green-500 animate-pulse' : pmAgent ? 'bg-text-muted/60' : 'bg-text-muted/20'
            const statusLabel = isActive ? 'running' : pmAgent?.status === 'completed' ? 'ready' : pmAgent?.status === 'failed' ? 'error' : 'not started'

            // Task info: prefer blackboard (richer) but fall back to process manager
            const taskText =
              (isActive && typeof bbAgent?.current_task === 'string' && bbAgent.current_task) ||
              (typeof bbAgent?.last_task === 'string' && bbAgent.last_task) ||
              (typeof bbAgent?.result_summary === 'string' && bbAgent.result_summary) ||
              (pmAgent?.status === 'completed' ? 'Last run completed' : null)

            // Interaction count from process manager (more accurate than blackboard)
            const interactions = pmAgent?.interactions ?? 0

            return (
              <div
                key={def.name}
                className={`rounded-lg border p-3 ${agentBadgeColor(def.name)}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                  <span className="font-medium text-sm capitalize">{def.name}</span>
                  <span className={`text-xs ${isActive ? 'text-green-500' : 'opacity-70'}`}>{statusLabel}</span>
                  {interactions > 0 && (
                    <span className="text-xs opacity-50 ml-auto">{interactions} {interactions === 1 ? 'run' : 'runs'}</span>
                  )}
                </div>
                <div className="text-xs opacity-60 mb-2">{def.role}</div>
                {taskText && (
                  <p className="text-xs opacity-80 truncate mb-2" title={taskText as string}>
                    {taskText as string}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  {isActive ? (
                    <span className="px-3 py-1 text-xs text-green-500 border border-green-500/30 rounded bg-green-500/10 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      Running...
                    </span>
                  ) : pmAgent ? (
                    <button
                      onClick={() => handleResetSession(def.name)}
                      className="px-3 py-1 text-xs text-danger border border-danger/30 rounded hover:bg-danger/10 transition-colors"
                    >
                      Reset
                    </button>
                  ) : (
                    <span className="text-xs opacity-40">No session yet</span>
                  )}
                  {pmAgent && !isActive && pmAgent.status === 'failed' && (
                    <span className="text-xs text-warning">Error — reset to fix</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── 2. Latest Findings */}
      {findingEntries.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-8">
          <h2 className="font-semibold mb-4">Latest Findings</h2>
          <div className="space-y-3">
            {findingEntries.slice(0, 8).map(([id, finding]) => (
              <div key={id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {finding.from && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${agentBadgeColor(finding.from)}`}>
                      {finding.from}
                    </span>
                  )}
                  {finding.for && (
                    <>
                      <span className="text-text-muted text-xs">&rarr;</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${agentBadgeColor(finding.for)}`}>
                        {finding.for}
                      </span>
                    </>
                  )}
                  {finding.type && (
                    <span className="text-xs text-text-muted ml-auto">{finding.type}</span>
                  )}
                </div>
                {finding.text && (
                  <MarkdownView content={finding.text} className="text-sm" />
                )}
                {finding.timestamp && (
                  <div className="text-xs text-text-muted mt-1">{finding.timestamp}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Directives */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Directives</h2>
          {directives.length > 0 && (
            <span className="text-xs text-text-muted">
              {activeDirectives.length} pending · {completedDirectives.length} completed
            </span>
          )}
        </div>
        {directives.length === 0 ? (
          <p className="text-sm text-text-muted mb-4">No directives yet. Post one below or let agents create them.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {[...activeDirectives, ...completedDirectives].slice(0, 15).map((d) => {
              const isActive = !d.status || d.status === 'pending' || d.status === 'open' || d.status === 'in-progress'
              const statusColor = isActive
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                : d.status === 'done' || d.status === 'completed'
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : 'bg-text-muted/10 text-text-muted border-text-muted/20'

              return (
                <div key={d.id} className={`flex items-start gap-3 py-2.5 px-3 rounded-lg border ${isActive ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/50'}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-amber-400' : 'bg-green-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {d.from && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${agentBadgeColor(d.from)}`}>
                          {d.from}
                        </span>
                      )}
                      {(d.assigned_to ?? d.assignee) && (
                        <>
                          <span className="text-text-muted text-xs">&rarr;</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${agentBadgeColor(d.assigned_to ?? d.assignee ?? '')}`}>
                            {d.assigned_to ?? d.assignee}
                          </span>
                        </>
                      )}
                      {d.priority && (
                        <span className={`text-[10px] font-medium uppercase ml-auto ${d.priority === 'high' ? 'text-danger' : d.priority === 'medium' ? 'text-warning' : 'text-text-muted'}`}>
                          {d.priority}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${isActive ? '' : 'text-text-muted'}`}>{d.title ?? d.text ?? d.id}</p>
                    {d.text && d.title && (
                      <p className="text-xs text-text-muted mt-0.5 truncate">{d.text}</p>
                    )}
                    {d.posted_at && (
                      <div className="text-[10px] text-text-muted mt-1">{d.posted_at}</div>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 capitalize ${statusColor}`}>
                    {d.status ?? 'pending'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Add Directive Form */}
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-3">Add Directive</h3>
          <form onSubmit={handleAddDirective} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Title (optional)"
                value={directiveTitle}
                onChange={(e) => setDirectiveTitle(e.target.value)}
                className="px-3 py-2 bg-bg border border-border rounded-md text-sm focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <select
                  value={directiveAgent}
                  onChange={(e) => setDirectiveAgent(e.target.value)}
                  className="flex-1 px-3 py-2 bg-bg border border-border rounded-md text-sm focus:outline-none focus:border-accent"
                >
                  <option value="">Any agent</option>
                  {ALL_AGENTS.map((a) => (
                    <option key={a.name} value={a.name}>{a.name}</option>
                  ))}
                </select>
                <select
                  value={directivePriority}
                  onChange={(e) => setDirectivePriority(e.target.value)}
                  className="px-3 py-2 bg-bg border border-border rounded-md text-sm focus:outline-none focus:border-accent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <textarea
              placeholder="Directive text..."
              value={directiveText}
              onChange={(e) => setDirectiveText(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-bg border border-border rounded-md text-sm focus:outline-none focus:border-accent resize-none"
            />
            <button
              type="submit"
              disabled={!directiveText.trim() || directiveSubmitting || !connected}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {directiveSubmitting ? 'Posting...' : 'Post Directive'}
            </button>
          </form>
        </div>
      </div>

      {/* Activity Feed (last 20 log entries) */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <h2 className="font-semibold mb-3">Activity Feed</h2>
        {recentLog.length === 0 ? (
          <p className="text-text-muted text-sm">No recent activity.</p>
        ) : (
          <div className="space-y-1">
            {recentLog.map((entry, i) => {
              const agentMatch = entry.entry.match(/^\[(\w+)]|^(\w+):/i)
              const agentName = agentMatch ? (agentMatch[1] ?? agentMatch[2]) : null

              return (
                <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-xs text-text-muted shrink-0 w-16 pt-0.5 tabular-nums">
                    {entry.ts?.slice(11, 16) || entry.ts?.slice(0, 10) || ''}
                  </span>
                  {agentName && (
                    <span className={`text-xs px-1.5 py-0.5 rounded border capitalize shrink-0 ${agentBadgeColor(agentName)}`}>
                      {agentName}
                    </span>
                  )}
                  <span className="text-sm flex-1">{entry.entry}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── 3. Agent Sessions ─────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <h2 className="font-semibold mb-4">Agent Sessions</h2>
        {!sessions || Object.keys(sessions.agents).length === 0 ? (
          <p className="text-sm text-text-muted">
            No active sessions. Start an agent above to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(sessions.agents).map(([name, session]) => (
              <div
                key={name}
                className="flex items-center gap-4 p-3 border border-border/50 rounded-lg"
              >
                <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${agentBadgeColor(name)}`}>
                  {name}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>Session: <code className="text-text">{session.session_id?.slice(0, 8) ?? 'n/a'}...</code></span>
                    <span>Spawn: <code className="text-text">{session.spawn_id?.slice(0, 8) ?? 'n/a'}</code></span>
                    <span>{session.interactions} interactions</span>
                    <span className={`capitalize ${session.status === 'running' ? 'text-green-400' : session.status === 'failed' ? 'text-danger' : 'text-text-muted'}`}>
                      {session.status}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleResetSession(name)}
                  className="px-3 py-1 text-xs text-danger border border-danger/30 rounded hover:bg-danger/10 transition-colors"
                >
                  Reset Session
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 4. Live Blackboard ──────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg mb-8">
        <button
          onClick={() => setShowBlackboard(prev => !prev)}
          className="w-full px-5 py-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Blackboard</h2>
            <span className="text-xs text-text-muted">Live shared state — what agents read and write</span>
          </div>
          <span className="text-xs text-text-muted">{showBlackboard ? '▲ Hide' : '▼ Show'}</span>
        </button>

        {showBlackboard && (
          <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
            {/* Agent States */}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-text-muted">agents.*</h3>
              {Object.keys(agents).length === 0 ? (
                <p className="text-xs text-text-muted italic">No agents registered</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(agents).map(([name, data]) => {
                    const a = data as Record<string, unknown>
                    return (
                      <div key={name} className="bg-bg border border-border/60 rounded-md p-3 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded border capitalize ${agentBadgeColor(name)}`}>{name}</span>
                          <span className={`${a.status === 'completed' ? 'text-success' : a.status === 'active' ? 'text-accent' : 'text-text-muted'}`}>
                            {String(a.status || 'unknown')}
                          </span>
                        </div>
                        {typeof a.last_task === 'string' && <p className="text-text-muted mt-1"><span className="text-text font-medium">Task:</span> {a.last_task}</p>}
                        {typeof a.result_summary === 'string' && <p className="text-text-muted mt-0.5"><span className="text-text font-medium">Result:</span> {a.result_summary.slice(0, 200)}{a.result_summary.length > 200 ? '...' : ''}</p>}
                        {Array.isArray(a.output_files) && a.output_files.length > 0 && (
                          <p className="text-text-muted mt-0.5"><span className="text-text font-medium">Files:</span> {(a.output_files as string[]).join(', ')}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Findings */}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-text-muted">findings.*</h3>
              {findingEntries.length === 0 ? (
                <p className="text-xs text-text-muted italic">No findings posted</p>
              ) : (
                <div className="space-y-2">
                  {findingEntries.map(([id, finding]) => (
                    <div key={id} className="bg-bg border border-border/60 rounded-md p-3 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        {finding.from && <span className={`px-1.5 py-0.5 rounded border capitalize ${agentBadgeColor(finding.from)}`}>{finding.from}</span>}
                        {finding.for && (
                          <>
                            <span className="text-text-muted">→</span>
                            <span className={`px-1.5 py-0.5 rounded border capitalize ${agentBadgeColor(finding.for)}`}>{finding.for}</span>
                          </>
                        )}
                        {finding.type && <span className="text-text-muted ml-auto">{finding.type}</span>}
                      </div>
                      {finding.text && <p className="text-text mt-1">{String(finding.text).slice(0, 300)}{String(finding.text).length > 300 ? '...' : ''}</p>}
                      {finding.timestamp && <p className="text-text-muted mt-1">{finding.timestamp}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Directives */}
            <div>
              <h3 className="text-sm font-semibold mb-2 text-text-muted">directives[]</h3>
              {directives.length === 0 ? (
                <p className="text-xs text-text-muted italic">No directives</p>
              ) : (
                <div className="space-y-2">
                  {directives.map((d, i) => {
                    const isActive = !d.status || d.status === 'pending' || d.status === 'open' || d.status === 'in-progress'
                    return (
                      <div key={d.id || i} className={`bg-bg border rounded-md p-3 text-xs ${isActive ? 'border-amber-500/30' : 'border-border/60'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {d.from && <span className={`px-1.5 py-0.5 rounded border capitalize ${agentBadgeColor(d.from)}`}>{d.from}</span>}
                          {(d.assigned_to || d.assignee) && (
                            <>
                              <span className="text-text-muted">→</span>
                              <span className={`px-1.5 py-0.5 rounded border capitalize ${agentBadgeColor(d.assigned_to || d.assignee || '')}`}>{d.assigned_to || d.assignee}</span>
                            </>
                          )}
                          <span className={`ml-auto font-medium ${isActive ? 'text-amber-500' : 'text-success'}`}>{d.status || 'pending'}</span>
                          {d.priority && <span className={`${d.priority === 'high' ? 'text-danger' : d.priority === 'medium' ? 'text-warning' : 'text-text-muted'}`}>{d.priority}</span>}
                        </div>
                        <p className="text-text mt-1">{d.title || d.text || d.id}</p>
                        {d.posted_at && <p className="text-text-muted mt-1">{d.posted_at}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
