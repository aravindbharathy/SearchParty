'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useBlackboard } from './hooks/use-blackboard'
import { useAgentEvents } from './hooks/use-agent-events'
import { AgentChat } from './_components/agent-chat'
import { MarkdownView } from './_components/markdown-view'
import type { ContextStatusResponse } from './types/context'

interface UrgencyItem {
  id: string
  company: string
  role: string
  type: string
  due: string
  followUpType: string
  status: string
}

interface UrgencyData {
  overdue: UrgencyItem[]
  today: UrgencyItem[]
  upcoming: UrgencyItem[]
}

interface PipelineStats {
  total: number
  byStatus: Record<string, number>
  responseRate: number
  averageFitScore: number
}

interface NetworkingStats {
  totalContacts: number
  totalOutreach: number
  replyRate: number
  referrals: number
  pendingFollowUps: number
}

const FUNNEL_STAGES = [
  { key: 'researching', label: 'Researching', color: 'bg-text-muted' },
  { key: 'applied', label: 'Applied', color: 'bg-accent' },
  { key: 'phone-screen', label: 'Phone Screen', color: 'bg-warning' },
  { key: 'onsite', label: 'Onsite', color: 'bg-warning' },
  { key: 'offer', label: 'Offer', color: 'bg-success' },
  { key: 'rejected', label: 'Rejected', color: 'bg-danger' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'bg-text-muted/50' },
]

const AGENT_COLORS: Record<string, string> = {
  research: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  resume: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  coach: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  networking: 'bg-green-500/10 text-green-400 border-green-500/20',
  interview: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
}

function agentBadgeColor(name: string): string {
  return AGENT_COLORS[name.toLowerCase()] ?? 'bg-text-muted/10 text-text-muted border-text-muted/20'
}

export default function CommandCenter() {
  const { state, connected } = useBlackboard()
  const router = useRouter()
  const [contextStatus, setContextStatus] = useState<ContextStatusResponse | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [urgency, setUrgency] = useState<UrgencyData | null>(null)
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [netStats, setNetStats] = useState<NetworkingStats | null>(null)
  const [briefingContent, setBriefingContent] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents()

  useEffect(() => {
    fetch('/api/context/status')
      .then((r) => r.json())
      .then((data: ContextStatusResponse) => {
        setContextStatus(data)
        if (!data.contextReady) {
          setRedirecting(true)
          router.push('/onboarding')
        }
      })
      .catch(() => {})
  }, [router])

  const fetchDashboardData = useCallback(() => {
    fetch('/api/pipeline/urgency')
      .then((r) => r.json())
      .then((data: UrgencyData) => setUrgency(data))
      .catch(() => {})

    fetch('/api/pipeline/stats')
      .then((r) => r.json())
      .then((data: PipelineStats) => setStats(data))
      .catch(() => {})

    fetch('/api/networking/stats')
      .then((r) => r.json())
      .then((data: NetworkingStats) => setNetStats(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (contextStatus?.contextReady) {
      fetchDashboardData()
    }
  }, [contextStatus, fetchDashboardData])

  useEffect(() => {
    const handleFocus = () => {
      if (contextStatus?.contextReady) fetchDashboardData()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [contextStatus, fetchDashboardData])

  useEffect(() => {
    if (agentStatus === 'completed' || agentStatus === 'failed') {
      fetchDashboardData()
    }
  }, [agentStatus, fetchDashboardData])

  useEffect(() => {
    if (agentStatus === 'completed' && agentOutput) {
      setBriefingContent(agentOutput)
      setBriefingLoading(false)
    }
    if (agentStatus === 'failed') {
      setBriefingLoading(false)
    }
  }, [agentStatus, agentOutput])

  const handleRunBriefing = async () => {
    agentReset()
    setBriefingLoading(true)
    setBriefingContent(null)

    try {
      await spawnAgent('coach', {
        skill: 'daily-briefing',
        entry_name: 'briefing',
        metadata: {},
        text: `Produce a daily briefing for today. Read search/pipeline/applications.yaml, search/pipeline/interviews.yaml, search/context/connection-tracker.yaml, and search/context/snapshot.yaml for current status.`,
      })
    } catch {
      setBriefingLoading(false)
    }
  }

  if (!contextStatus || redirecting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  const totalUrgency = (urgency?.overdue.length ?? 0) + (urgency?.today.length ?? 0)
  const maxFunnelCount = stats ? Math.max(1, ...Object.values(stats.byStatus)) : 1

  // Blackboard-derived data
  const agents = state?.agents ?? {}
  const agentEntries = Object.entries(agents)
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
  const recentLog = state?.log?.slice(-10).reverse() ?? []

  // Momentum: weekly apps count
  const weeklyApps = stats?.byStatus['applied'] ?? 0

  // Separate networking follow-ups from application follow-ups for display
  const networkingUrgency = {
    overdue: (urgency?.overdue ?? []).filter((i) => ['connection-nudge', 'referral-step-2', 'referral-step-3'].includes(i.followUpType)),
    today: (urgency?.today ?? []).filter((i) => ['connection-nudge', 'referral-step-2', 'referral-step-3'].includes(i.followUpType)),
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Command Center</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-text-muted/40'}`} />
          <span className="text-text-muted">{connected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>
      <p className="text-text-muted mb-8">Your job search at a glance.</p>

      {/* ─── 1. Agent Team Status ─────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <h2 className="font-semibold mb-4">Your Team</h2>
        {agentEntries.length === 0 ? (
          <p className="text-sm text-text-muted">
            {connected ? 'No agents registered on the blackboard yet.' : 'Blackboard disconnected — agent status unavailable.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agentEntries.map(([key, agent]) => {
              const name = agent.name ?? agent.role ?? key
              const isActive = agent.status === 'active' || agent.status === 'running'
              const statusDot = isActive ? 'bg-green-500' : 'bg-text-muted/40'
              const statusLabel = isActive ? 'active' : agent.status ?? 'idle'
              const taskText =
                (isActive && typeof agent.current_task === 'string' && agent.current_task) ||
                (typeof agent.last_task === 'string' && agent.last_task) ||
                (typeof agent.result_summary === 'string' && agent.result_summary) ||
                null
              const interactions =
                typeof agent.interactions === 'number' ? agent.interactions : null

              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${agentBadgeColor(name)}`}
                >
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm capitalize">{name}</span>
                      <span className="text-xs opacity-70">{statusLabel}</span>
                      {interactions != null && (
                        <span className="text-xs opacity-50 ml-auto">{interactions} runs</span>
                      )}
                    </div>
                    {taskText && (
                      <p className="text-xs mt-1 opacity-80 truncate" title={taskText}>
                        {taskText}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── 2. Recent Findings ────────────────────────────────── */}
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

      {/* ─── 3. Active Directives ──────────────────────────────── */}
      {pendingDirectives.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-8">
          <h2 className="font-semibold mb-4">Pending Directives</h2>
          <div className="space-y-3">
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
        </div>
      )}

      {/* ─── 4. Activity Feed (last 10 log entries) ────────────── */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <h2 className="font-semibold mb-3">Activity Feed</h2>
        {recentLog.length === 0 ? (
          <p className="text-text-muted text-sm">No recent activity. Start by scoring a JD or adding an application.</p>
        ) : (
          <div className="space-y-1">
            {recentLog.map((entry, i) => {
              // Try to extract agent name from log entry prefix like "[research]" or "research:"
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

      {/* ─── Urgency Sections ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Overdue */}
        <div className="bg-surface border border-danger/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 bg-danger rounded-full" />
            <h2 className="font-semibold text-sm text-danger">Overdue</h2>
            <span className="ml-auto text-xs text-danger font-bold">
              {urgency?.overdue.length ?? 0}
            </span>
          </div>
          {(!urgency || urgency.overdue.length === 0) ? (
            <p className="text-xs text-text-muted">Nothing overdue</p>
          ) : (
            <div className="space-y-2">
              {urgency.overdue.slice(0, 5).map((item, i) => {
                const isNetworking = ['connection-nudge', 'referral-step-2', 'referral-step-3'].includes(item.followUpType)
                const href = isNetworking ? '/networking' : `/applying?app=${item.id}`
                return (
                  <a
                    key={`${item.id}-${i}`}
                    href={href}
                    className="block text-sm p-2 rounded-md hover:bg-bg cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{item.company}</div>
                      <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                    </div>
                    <div className="text-xs text-text-muted">{item.role} - Due {item.due}</div>
                    <div className="text-xs text-text-muted capitalize">{item.followUpType.replace(/-/g, ' ')}</div>
                  </a>
                )
              })}
            </div>
          )}
        </div>

        {/* Due Today */}
        <div className="bg-surface border border-warning/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 bg-warning rounded-full" />
            <h2 className="font-semibold text-sm text-warning">Due Today</h2>
            <span className="ml-auto text-xs text-warning font-bold">
              {urgency?.today.length ?? 0}
            </span>
          </div>
          {(!urgency || urgency.today.length === 0) ? (
            <p className="text-xs text-text-muted">Nothing due today</p>
          ) : (
            <div className="space-y-2">
              {urgency.today.slice(0, 5).map((item, i) => {
                const isNetworking = ['connection-nudge', 'referral-step-2', 'referral-step-3'].includes(item.followUpType)
                const href = isNetworking ? '/networking' : `/applying?app=${item.id}`
                return (
                  <a
                    key={`${item.id}-${i}`}
                    href={href}
                    className="block text-sm p-2 rounded-md hover:bg-bg cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{item.company}</div>
                      <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                    </div>
                    <div className="text-xs text-text-muted">{item.role}</div>
                    <div className="text-xs text-text-muted capitalize">{item.followUpType.replace(/-/g, ' ')}</div>
                  </a>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="bg-surface border border-success/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 bg-success rounded-full" />
            <h2 className="font-semibold text-sm text-success">Upcoming</h2>
            <span className="ml-auto text-xs text-success font-bold">
              {urgency?.upcoming.length ?? 0}
            </span>
          </div>
          {(!urgency || urgency.upcoming.length === 0) ? (
            <p className="text-xs text-text-muted">Nothing upcoming</p>
          ) : (
            <div className="space-y-2">
              {urgency.upcoming.slice(0, 5).map((item, i) => {
                const isNetworking = ['connection-nudge', 'referral-step-2', 'referral-step-3'].includes(item.followUpType)
                const href = isNetworking ? '/networking' : `/applying?app=${item.id}`
                return (
                  <a
                    key={`${item.id}-${i}`}
                    href={href}
                    className="block text-sm p-2 rounded-md hover:bg-bg cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{item.company}</div>
                      <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                    </div>
                    <div className="text-xs text-text-muted">{item.role} - {item.due}</div>
                    <div className="text-xs text-text-muted capitalize">{item.followUpType.replace(/-/g, ' ')}</div>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Total Apps</div>
          <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Response Rate</div>
          <div className="text-2xl font-bold">{stats?.responseRate ?? 0}%</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Avg Fit Score</div>
          <div className="text-2xl font-bold">{stats?.averageFitScore ?? 0}</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">This Week</div>
          <div className="text-2xl font-bold">{weeklyApps}</div>
          <div className="text-xs text-text-muted">applications</div>
        </div>
      </div>

      {/* Networking Pulse */}
      {netStats && netStats.totalContacts > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-8">
          <h2 className="font-semibold mb-3">Networking Pulse</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-text-muted">Contacts</div>
              <div className="text-xl font-bold">{netStats.totalContacts}</div>
            </div>
            <div>
              <div className="text-sm text-text-muted">Reply Rate</div>
              <div className="text-xl font-bold">{netStats.replyRate}%</div>
            </div>
            <div>
              <div className="text-sm text-text-muted">Referrals</div>
              <div className="text-xl font-bold">{netStats.referrals}</div>
            </div>
            <div>
              <div className="text-sm text-text-muted">Pending F/Us</div>
              <div className="text-xl font-bold">{netStats.pendingFollowUps}</div>
            </div>
          </div>
          {(networkingUrgency.overdue.length > 0 || networkingUrgency.today.length > 0) && (
            <div className="mt-4 pt-3 border-t border-border">
              <h3 className="text-sm font-medium text-warning mb-2">Networking Follow-ups Due</h3>
              <div className="space-y-1">
                {[...networkingUrgency.overdue, ...networkingUrgency.today].slice(0, 5).map((item, i) => (
                  <div key={`net-${item.id}-${i}`} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{item.role}</span>
                      <span className="text-text-muted"> at {item.company}</span>
                    </div>
                    <span className={`text-xs ${item.type === 'overdue' ? 'text-danger' : 'text-warning'}`}>
                      {item.due}
                    </span>
                  </div>
                ))}
              </div>
              <a href="/networking" className="text-xs text-accent hover:text-accent-hover mt-2 inline-block">
                View all in Networking
              </a>
            </div>
          )}
        </div>
      )}

      {/* Pipeline Funnel */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-8">
        <h2 className="font-semibold mb-4">Pipeline Funnel</h2>
        {!stats || stats.total === 0 ? (
          <p className="text-text-muted text-sm">No applications yet. <a href="/applying" className="text-accent hover:text-accent-hover">Add your first application</a>.</p>
        ) : (
          <div className="space-y-2">
            {FUNNEL_STAGES.map((stage) => {
              const count = stats.byStatus[stage.key] ?? 0
              const pct = Math.max(2, (count / maxFunnelCount) * 100)
              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <div className="w-28 text-sm text-right">{stage.label}</div>
                  <div className="flex-1 h-6 bg-bg rounded overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-8 text-sm text-right font-medium">{count}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Actions + Daily Briefing side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Quick Actions */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="space-y-2">
            <a
              href="/finding"
              className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-bg transition-colors"
            >
              <span className="text-lg">&#x1F50D;</span>
              <div>
                <div className="text-sm font-medium">Score a JD</div>
                <div className="text-xs text-text-muted">Paste a job description for fit analysis</div>
              </div>
            </a>
            <a
              href="/applying"
              className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-bg transition-colors"
            >
              <span className="text-lg">&#x1F4DD;</span>
              <div>
                <div className="text-sm font-medium">Tailor Resume</div>
                <div className="text-xs text-text-muted">Generate a targeted resume from a JD</div>
              </div>
            </a>
            <a
              href="/networking"
              className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-bg transition-colors"
            >
              <span className="text-lg">&#x1F91D;</span>
              <div>
                <div className="text-sm font-medium">Generate Connection Batch</div>
                <div className="text-xs text-text-muted">Create personalized LinkedIn outreach</div>
              </div>
            </a>
            <a
              href="/applying"
              className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-bg transition-colors"
            >
              <span className="text-lg">&#x2795;</span>
              <div>
                <div className="text-sm font-medium">Add Application</div>
                <div className="text-xs text-text-muted">Track a new application in the pipeline</div>
              </div>
            </a>
          </div>
        </div>

        {/* 5. Daily Briefing */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Daily Briefing</h2>
            <button
              onClick={handleRunBriefing}
              disabled={briefingLoading}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {briefingLoading ? 'Generating...' : 'Run Briefing'}
            </button>
          </div>
          {briefingLoading && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Coach agent generating daily briefing...
            </div>
          )}
          {briefingContent && (
            <>
              <div className="mt-2">
                <AgentChat
                  agentName="coach"
                  initialOutput={briefingContent}
                  skill="daily-briefing"
                  onClose={() => setBriefingContent(null)}
                />
              </div>
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border">
                <a href="/applying" className="text-xs text-accent hover:text-accent-hover font-medium">
                  Go to Applications &rarr;
                </a>
                <a href="/networking" className="text-xs text-accent hover:text-accent-hover font-medium">
                  Go to Networking &rarr;
                </a>
                <a href="/interviewing" className="text-xs text-accent hover:text-accent-hover font-medium">
                  Go to Interviews &rarr;
                </a>
              </div>
            </>
          )}
          {!briefingLoading && !briefingContent && (
            <p className="text-sm text-text-muted">Click &quot;Run Briefing&quot; for the coach&apos;s deeper analysis of today&apos;s priorities, follow-ups, and pipeline health.</p>
          )}
        </div>
      </div>

      {/* Urgency badge count for sidebar */}
      {totalUrgency > 0 && (
        <div className="hidden" data-urgency-count={totalUrgency} />
      )}
    </div>
  )
}
