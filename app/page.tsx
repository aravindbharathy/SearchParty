'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBlackboard } from './hooks/use-blackboard'
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

const FUNNEL_STAGES = [
  { key: 'researching', label: 'Researching', color: 'bg-text-muted' },
  { key: 'applied', label: 'Applied', color: 'bg-accent' },
  { key: 'phone-screen', label: 'Phone Screen', color: 'bg-warning' },
  { key: 'onsite', label: 'Onsite', color: 'bg-warning' },
  { key: 'offer', label: 'Offer', color: 'bg-success' },
  { key: 'rejected', label: 'Rejected', color: 'bg-danger' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'bg-text-muted/50' },
]

export default function CommandCenter() {
  const { state } = useBlackboard()
  const router = useRouter()
  const [contextStatus, setContextStatus] = useState<ContextStatusResponse | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [urgency, setUrgency] = useState<UrgencyData | null>(null)
  const [stats, setStats] = useState<PipelineStats | null>(null)

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

  useEffect(() => {
    if (contextStatus?.contextReady) {
      fetch('/api/pipeline/urgency')
        .then((r) => r.json())
        .then((data: UrgencyData) => setUrgency(data))
        .catch(() => {})

      fetch('/api/pipeline/stats')
        .then((r) => r.json())
        .then((data: PipelineStats) => setStats(data))
        .catch(() => {})
    }
  }, [contextStatus])

  if (!contextStatus || redirecting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  const totalUrgency = (urgency?.overdue.length ?? 0) + (urgency?.today.length ?? 0)
  const maxFunnelCount = stats ? Math.max(1, ...Object.values(stats.byStatus)) : 1

  // Recent activity from blackboard log
  const recentLog = state?.log?.slice(-5).reverse() ?? []

  // Momentum: weekly apps count (applications created in the last 7 days)
  // We approximate from stats — in a full version we'd check applied_date
  const weeklyApps = stats?.byStatus['applied'] ?? 0

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Command Center</h1>
      <p className="text-text-muted mb-8">Your job search at a glance.</p>

      {/* Urgency Sections */}
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
              {urgency.overdue.slice(0, 5).map((item, i) => (
                <div key={`${item.id}-${i}`} className="text-sm">
                  <div className="font-medium">{item.company}</div>
                  <div className="text-xs text-text-muted">{item.role} - Due {item.due}</div>
                </div>
              ))}
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
              {urgency.today.slice(0, 5).map((item, i) => (
                <div key={`${item.id}-${i}`} className="text-sm">
                  <div className="font-medium">{item.company}</div>
                  <div className="text-xs text-text-muted">{item.role}</div>
                </div>
              ))}
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
              {urgency.upcoming.slice(0, 5).map((item, i) => (
                <div key={`${item.id}-${i}`} className="text-sm">
                  <div className="font-medium">{item.company}</div>
                  <div className="text-xs text-text-muted">{item.role} - {item.due}</div>
                </div>
              ))}
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

        {/* Recent Activity */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-semibold mb-3">Recent Activity</h2>
          {recentLog.length === 0 ? (
            <p className="text-text-muted text-sm">No recent activity. Start by scoring a JD or adding an application.</p>
          ) : (
            <div className="space-y-2">
              {recentLog.map((entry, i) => (
                <div key={i} className="text-sm py-1 border-b border-border/50 last:border-0">
                  <div className="text-text-muted text-xs">{entry.ts}</div>
                  <div>{entry.entry}</div>
                </div>
              ))}
            </div>
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
