'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAgentEvents } from './hooks/use-agent-events'
import { AgentChat } from './_components/agent-chat'
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

export default function Dashboard() {
  const router = useRouter()
  const [contextStatus, setContextStatus] = useState<ContextStatusResponse | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [urgency, setUrgency] = useState<UrgencyData | null>(null)
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [netStats, setNetStats] = useState<NetworkingStats | null>(null)
  const [briefingContent, setBriefingContent] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('dashboard')

  useEffect(() => {
    fetch('/api/context/status')
      .then((r) => r.json())
      .then((data: ContextStatusResponse) => {
        setContextStatus(data)
        if (!data.contextReady) {
          setRedirecting(true)
          router.push('/coach')
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
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>
      <p className="text-text-muted mb-8">Your job search at a glance.</p>

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

        {/* Daily Briefing */}
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
