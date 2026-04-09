'use client'

import { useState, useCallback } from 'react'
import { useBlackboard } from '../hooks/use-blackboard'
import { useAgentEvents } from '../hooks/use-agent-events'
import { MarkdownView } from '../_components/markdown-view'

const AGENT_COLORS: Record<string, string> = {
  research: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  resume: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  coach: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  networking: 'bg-green-500/10 text-green-400 border-green-500/20',
  interview: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  archivist: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  strategist: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
}

const ALL_AGENTS = [
  { name: 'research', role: 'Role Discovery' },
  { name: 'resume', role: 'Resume Tailoring' },
  { name: 'coach', role: 'Career Coach' },
  { name: 'networking', role: 'Outreach & Connections' },
  { name: 'interview', role: 'Interview Prep' },
  { name: 'archivist', role: 'Knowledge Management' },
  { name: 'strategist', role: 'Search Strategy' },
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

  // Fetch sessions on mount
  useState(() => {
    fetchSessions()
  })

  const handleStartAgent = async (agentName: string) => {
    setSpawningAgent(agentName)
    try {
      await spawnAgent(agentName, {
        skill: 'check-in',
        text: `Check the blackboard for any pending directives assigned to you. If you find one, execute it. If none, read the blackboard state, register yourself as available, and report what you see.`,
      })
    } finally {
      setSpawningAgent(null)
      // Refresh sessions after spawn
      setTimeout(fetchSessions, 2000)
    }
  }

  const handleResetSession = async (agentName: string) => {
    try {
      await fetch('/api/agent/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentName }),
      })
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
  const directives = state?.directives ?? []
  const pendingDirectives = directives.filter(
    (d) => !d.status || d.status === 'pending' || d.status === 'open'
  )
  const findings = state?.findings ?? {}
  const findingEntries = Object.entries(findings).sort((a, b) => {
    const tA = a[1].timestamp ?? ''
    const tB = b[1].timestamp ?? ''
    return tB.localeCompare(tA)
  })
  const recentLog = state?.log?.slice(-20).reverse() ?? []

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Command Center</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSessions}
            className="text-xs text-text-muted hover:text-text px-2 py-1 border border-border rounded transition-colors"
          >
            {sessionsLoading ? 'Refreshing...' : 'Refresh Sessions'}
          </button>
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-text-muted/40'}`} />
            <span className="text-text-muted">{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>
      </div>
      <p className="text-text-muted mb-8">Agent management and blackboard status.</p>

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
            const isActive = bbAgent?.status === 'active' || bbAgent?.status === 'running'
            const statusDot = isActive ? 'bg-green-500' : 'bg-text-muted/40'
            const statusLabel = isActive ? 'active' : bbAgent?.status ?? 'idle'
            const taskText =
              (isActive && typeof bbAgent?.current_task === 'string' && bbAgent.current_task) ||
              (typeof bbAgent?.last_task === 'string' && bbAgent.last_task) ||
              (typeof bbAgent?.result_summary === 'string' && bbAgent.result_summary) ||
              null
            const interactions =
              typeof bbAgent?.interactions === 'number' ? bbAgent.interactions : null
            const isSpawning = spawningAgent === def.name && spawnStatus === 'running'

            return (
              <div
                key={def.name}
                className={`rounded-lg border p-3 ${agentBadgeColor(def.name)}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                  <span className="font-medium text-sm capitalize">{def.name}</span>
                  <span className="text-xs opacity-70">{statusLabel}</span>
                  {interactions != null && (
                    <span className="text-xs opacity-50 ml-auto">{interactions} runs</span>
                  )}
                </div>
                <div className="text-xs opacity-60 mb-2">{def.role}</div>
                {taskText && (
                  <p className="text-xs opacity-80 truncate mb-2" title={taskText as string}>
                    {taskText as string}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStartAgent(def.name)}
                    disabled={isSpawning}
                    className="px-3 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSpawning ? 'Starting...' : 'Start'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── 2. Blackboard State ───────────────────────────────── */}
      {/* Latest Findings */}
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

      {/* Pending Directives */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <h2 className="font-semibold mb-4">Pending Directives</h2>
        {pendingDirectives.length === 0 ? (
          <p className="text-sm text-text-muted mb-4">No pending directives.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {pendingDirectives.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-start gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <span className="mt-1 w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.from && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${agentBadgeColor(d.from)}`}>
                        {d.from}
                      </span>
                    )}
                    {(d.assigned_to ?? d.assignee) && (
                      <>
                        <span className="text-text-muted text-xs">&rarr;</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${agentBadgeColor(d.assigned_to ?? d.assignee ?? '')}`}>
                          {d.assigned_to ?? d.assignee}
                        </span>
                      </>
                    )}
                    {d.priority && (
                      <span className={`text-xs ml-auto ${d.priority === 'high' ? 'text-danger' : d.priority === 'medium' ? 'text-warning' : 'text-text-muted'}`}>
                        {d.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1">{d.title ?? d.text ?? d.id}</p>
                  {d.posted_at && (
                    <div className="text-xs text-text-muted mt-1">{d.posted_at}</div>
                  )}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  {d.status ?? 'pending'}
                </span>
              </div>
            ))}
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
    </div>
  )
}
