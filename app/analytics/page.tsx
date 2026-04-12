'use client'

import { useEffect, useState, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface PipelineStats {
  total: number
  byStatus: Record<string, number>
  responseRate: number
  averageFitScore: number
}

interface Application {
  id: string
  company: string
  role: string
  status: string
  applied_date: string
  fit_score: number
  notes: string
}

interface Interview {
  id: string
  company: string
  role: string
  round: string
  date: string
  status: string
  score: number
}

interface Offer {
  id: string
  company: string
  role: string
  status: string
  date_received: string
  comp: { base: number; equity: number; bonus: number; sign_on: number }
}

interface ScoredJD {
  company: string
  role: string
  score: number
  recommendation: string
  date: string
}

interface NetworkingStats {
  totalContacts: number
  totalOutreach: number
  totalReplies: number
  replyRate: number
  referrals: number
  pendingFollowUps: number
}

interface UrgencyData {
  overdue: unknown[]
  today: unknown[]
  upcoming: unknown[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  researching: 'Researching',
  applied: 'Applied',
  'phone-screen': 'Phone Screen',
  onsite: 'Onsite',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

const FUNNEL_ORDER = ['researching', 'applied', 'phone-screen', 'onsite', 'offer']

const STALE_THRESHOLD_DAYS = 14

function pct(n: number, d: number): string {
  if (d === 0) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

function avgScore(items: { score: number }[]): number {
  const scored = items.filter(i => i.score > 0)
  if (scored.length === 0) return 0
  return Math.round(scored.reduce((s, i) => s + i.score, 0) / scored.length)
}

function totalComp(c: Offer['comp']): number {
  return c.base + (c.equity / 4) + c.bonus + c.sign_on
}

function fmtK(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}K`
  return `$${n}`
}

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
}

function daysAgoLabel(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  if (days < 14) return '1 week ago'
  return `${Math.floor(days / 7)} weeks ago`
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [apps, setApps] = useState<Application[]>([])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [scoredJDs, setScoredJDs] = useState<ScoredJD[]>([])
  const [networking, setNetworking] = useState<NetworkingStats | null>(null)
  const [urgency, setUrgency] = useState<UrgencyData | null>(null)
  const [searchStarted, setSearchStarted] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<'company' | 'status' | 'fit' | 'date'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const loadAll = useCallback(async () => {
    const [statsRes, appsRes, interviewsRes, offersRes, jdsRes, netRes, urgRes, careerRes] = await Promise.all([
      fetch('/api/pipeline/stats').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/pipeline/applications').then(r => r.ok ? r.json() : { applications: [] }).catch(() => ({ applications: [] })),
      fetch('/api/pipeline/interviews').then(r => r.ok ? r.json() : { interviews: [] }).catch(() => ({ interviews: [] })),
      fetch('/api/pipeline/offers').then(r => r.ok ? r.json() : { offers: [] }).catch(() => ({ offers: [] })),
      fetch('/api/finding/scored-jds').then(r => r.ok ? r.json() : { scoredJDs: [] }).catch(() => ({ scoredJDs: [] })),
      fetch('/api/networking/stats').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/pipeline/urgency').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/context/career-plan').then(r => r.ok ? r.json() : null).catch(() => null),
    ])
    if (statsRes) setStats(statsRes)
    setApps(appsRes.applications || [])
    setInterviews(interviewsRes.interviews || [])
    setOffers(offersRes.offers || [])
    setScoredJDs(jdsRes.scoredJDs || [])
    if (netRes) setNetworking(netRes)
    if (urgRes) setUrgency(urgRes)
    if (careerRes?.search_started) setSearchStarted(careerRes.search_started)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">Loading analytics...</p>
      </div>
    )
  }

  // ─── Derived metrics ────────────────────────────────────────────────────

  const activeApps = apps.filter(a => !['rejected', 'withdrawn'].includes(a.status))
  const completedInterviews = interviews.filter(i => i.status === 'completed')
  const scheduledInterviews = interviews.filter(i => i.status === 'scheduled')
  const activeOffers = offers.filter(o => ['received', 'negotiating'].includes(o.status))

  // Weekly application velocity (last 4 weeks)
  const weeklyApps: number[] = [0, 0, 0, 0]
  for (const app of apps) {
    if (!app.applied_date) continue
    const w = Math.floor(daysAgo(app.applied_date) / 7)
    if (w >= 0 && w < 4) weeklyApps[w]++
  }

  // Fit score distribution
  const fitBuckets = { high: 0, medium: 0, low: 0, unscored: 0 }
  for (const app of apps) {
    if (app.fit_score >= 75) fitBuckets.high++
    else if (app.fit_score >= 60) fitBuckets.medium++
    else if (app.fit_score > 0) fitBuckets.low++
    else fitBuckets.unscored++
  }

  // JD recommendation breakdown
  const jdRecs = { apply: 0, referral: 0, skip: 0 }
  for (const jd of scoredJDs) {
    if (jd.recommendation === 'Apply') jdRecs.apply++
    else if (jd.recommendation === 'Referral Only') jdRecs.referral++
    else jdRecs.skip++
  }

  // Funnel conversion
  const funnel = FUNNEL_ORDER.map(status => ({
    status,
    label: STATUS_LABELS[status] || status,
    count: stats?.byStatus[status] || 0,
  }))

  const overdueCount = urgency?.overdue?.length || 0
  const todayCount = urgency?.today?.length || 0

  // Search duration — from career-plan.search_started (survives activity reset), fallback to earliest app date
  const searchStart = searchStarted || apps.reduce((earliest, a) => {
    if (!a.applied_date) return earliest
    return !earliest || a.applied_date < earliest ? a.applied_date : earliest
  }, '' as string)
  const searchDays = searchStart ? daysAgo(searchStart) : 0

  // Stale applications (applied 14+ days ago, still in researching/applied)
  const staleApps = apps.filter(a =>
    ['researching', 'applied'].includes(a.status) && a.applied_date && daysAgo(a.applied_date) >= STALE_THRESHOLD_DAYS
  )

  // Fit score vs outcome — does scoring predict success?
  const highFitApps = apps.filter(a => a.fit_score >= 75)
  const highFitResponded = highFitApps.filter(a => ['phone-screen', 'onsite', 'offer'].includes(a.status))
  const lowFitApps = apps.filter(a => a.fit_score > 0 && a.fit_score < 75)
  const lowFitResponded = lowFitApps.filter(a => ['phone-screen', 'onsite', 'offer'].includes(a.status))

  // Company engagement (how many roles per company)
  const companyMap: Record<string, { count: number; statuses: string[]; bestFit: number }> = {}
  for (const app of apps) {
    if (!companyMap[app.company]) companyMap[app.company] = { count: 0, statuses: [], bestFit: 0 }
    companyMap[app.company].count++
    companyMap[app.company].statuses.push(app.status)
    if (app.fit_score > companyMap[app.company].bestFit) companyMap[app.company].bestFit = app.fit_score
  }
  const topCompanies = Object.entries(companyMap).sort((a, b) => b[1].count - a[1].count).slice(0, 8)

  const sortedApps = [...apps].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortField) {
      case 'company': return dir * a.company.localeCompare(b.company)
      case 'status': return dir * (FUNNEL_ORDER.indexOf(a.status) - FUNNEL_ORDER.indexOf(b.status))
      case 'fit': return dir * (a.fit_score - b.fit_score)
      case 'date': return dir * ((a.applied_date || '').localeCompare(b.applied_date || ''))
    }
  })
  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-1">Analytics</h1>
      <p className="text-text-muted text-sm mb-6">Overview of your job search progress and metrics.</p>

      {/* ─── Top-Level KPIs ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {[
          { label: 'Applications', value: stats?.total || 0, sub: `${activeApps.length} active` },
          { label: 'Response Rate', value: stats ? `${Math.round(stats.responseRate)}%` : '—', sub: stats && stats.total > 0 ? `${(stats.byStatus['phone-screen'] || 0) + (stats.byStatus['onsite'] || 0) + (stats.byStatus['offer'] || 0)} responded` : 'No data' },
          { label: 'Interviews', value: completedInterviews.length + scheduledInterviews.length, sub: scheduledInterviews.length > 0 ? `${scheduledInterviews.length} upcoming` : 'None scheduled' },
          { label: 'Offers', value: offers.length, sub: activeOffers.length > 0 ? `${activeOffers.length} active` : 'None yet' },
          { label: 'Search Duration', value: searchDays > 0 ? `${searchDays}d` : '—', sub: searchDays > 0 ? `Started ${daysAgoLabel(searchDays)}` : 'No applications yet' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-surface border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-text-muted">{kpi.label}</p>
            <p className="text-2xl font-bold mt-0.5">{kpi.value}</p>
            <p className="text-[10px] text-text-muted mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ─── Pipeline Funnel ────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-6">
        <h2 className="font-semibold text-sm mb-4">Pipeline Funnel</h2>
        <div className="flex items-end gap-1">
          {funnel.map((stage, i) => {
            const maxCount = Math.max(...funnel.map(f => f.count), 1)
            const height = Math.max((stage.count / maxCount) * 120, stage.count > 0 ? 24 : 8)
            const conversionRate = i > 0 && funnel[i - 1].count > 0
              ? pct(stage.count, funnel[i - 1].count)
              : null
            return (
              <div key={stage.status} className="flex-1 flex flex-col items-center">
                {conversionRate && (
                  <p className="text-[9px] text-text-muted mb-1">{conversionRate}</p>
                )}
                <div
                  className="w-full rounded-t-md bg-accent/20 border border-accent/30 flex items-end justify-center transition-all"
                  style={{ height: `${height}px` }}
                >
                  {stage.count > 0 && <span className="text-xs font-bold text-accent pb-1">{stage.count}</span>}
                </div>
                <p className="text-[10px] text-text-muted mt-1.5 text-center leading-tight">{stage.label}</p>
              </div>
            )
          })}
          {/* Rejected/Withdrawn as separate smaller bars */}
          {['rejected', 'withdrawn'].map(status => {
            const count = stats?.byStatus[status] || 0
            if (count === 0) return null
            return (
              <div key={status} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-full rounded-t-md ${status === 'rejected' ? 'bg-danger/15 border border-danger/20' : 'bg-text-muted/10 border border-text-muted/15'} flex items-end justify-center`}
                  style={{ height: `${Math.max(24, count * 20)}px` }}
                >
                  <span className={`text-xs font-bold pb-1 ${status === 'rejected' ? 'text-danger' : 'text-text-muted'}`}>{count}</span>
                </div>
                <p className="text-[10px] text-text-muted mt-1.5 text-center leading-tight">{STATUS_LABELS[status]}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ─── Activity & Velocity ────────────────────────────── */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-semibold text-sm mb-4">Weekly Activity</h2>
          <div className="flex items-end gap-2 h-24 mb-2">
            {weeklyApps.map((count, i) => {
              const max = Math.max(...weeklyApps, 1)
              const h = Math.max((count / max) * 80, count > 0 ? 16 : 4)
              const labels = ['This week', '1 week ago', '2 weeks ago', '3 weeks ago']
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-bold text-accent mb-1">{count > 0 ? count : ''}</span>
                  <div className="w-full bg-accent/20 rounded-t-sm" style={{ height: `${h}px` }} />
                  <p className="text-[9px] text-text-muted mt-1 text-center">{labels[i]}</p>
                </div>
              )
            })}
          </div>
          <div className="border-t border-border pt-3 mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-text-muted">Avg fit score</span>
              <p className="font-bold text-lg">{stats?.averageFitScore || 0}<span className="text-xs font-normal text-text-muted">/100</span></p>
            </div>
            <div>
              <span className="text-text-muted">Pending actions</span>
              <p className="font-bold text-lg">
                {overdueCount + todayCount}
                {overdueCount > 0 && <span className="text-xs font-normal text-danger ml-1">{overdueCount} overdue</span>}
              </p>
            </div>
          </div>
        </div>

        {/* ─── Fit Score Distribution ─────────────────────────── */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-semibold text-sm mb-4">Fit Score Distribution</h2>
          <div className="space-y-3">
            {[
              { label: 'Strong fit (75+)', count: fitBuckets.high, color: 'bg-success', textColor: 'text-success' },
              { label: 'Moderate (60-74)', count: fitBuckets.medium, color: 'bg-warning', textColor: 'text-warning' },
              { label: 'Weak (<60)', count: fitBuckets.low, color: 'bg-danger', textColor: 'text-danger' },
              { label: 'Unscored', count: fitBuckets.unscored, color: 'bg-text-muted/30', textColor: 'text-text-muted' },
            ].map(b => {
              const total = apps.length || 1
              const width = Math.max((b.count / total) * 100, b.count > 0 ? 8 : 0)
              return (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="text-xs text-text-muted w-28 shrink-0">{b.label}</span>
                  <div className="flex-1 bg-bg rounded-full h-4 overflow-hidden">
                    <div className={`${b.color} h-full rounded-full transition-all`} style={{ width: `${width}%` }} />
                  </div>
                  <span className={`text-xs font-bold w-8 text-right ${b.textColor}`}>{b.count}</span>
                </div>
              )
            })}
          </div>

          {/* JD Scoring summary */}
          {scoredJDs.length > 0 && (
            <div className="border-t border-border pt-3 mt-4">
              <p className="text-xs text-text-muted mb-2">JD Scores ({scoredJDs.length} evaluated)</p>
              <div className="flex gap-3 text-xs">
                <span className="text-success font-medium">{jdRecs.apply} Apply</span>
                <span className="text-warning font-medium">{jdRecs.referral} Referral</span>
                <span className="text-danger font-medium">{jdRecs.skip} Skip</span>
                <span className="text-text-muted ml-auto">Avg: {avgScore(scoredJDs)}/100</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Insights Row ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Scoring prediction */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-text-muted mb-3">Does Fit Scoring Predict Responses?</h3>
          {highFitApps.length > 0 || lowFitApps.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs">Score 75+</span>
                <span className="text-xs font-bold text-success">{pct(highFitResponded.length, highFitApps.length)} response rate</span>
              </div>
              <div className="bg-bg rounded-full h-2 overflow-hidden">
                <div className="bg-success h-full rounded-full" style={{ width: highFitApps.length > 0 ? `${(highFitResponded.length / highFitApps.length) * 100}%` : '0%' }} />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs">Score &lt;75</span>
                <span className="text-xs font-bold text-warning">{pct(lowFitResponded.length, lowFitApps.length)} response rate</span>
              </div>
              <div className="bg-bg rounded-full h-2 overflow-hidden">
                <div className="bg-warning h-full rounded-full" style={{ width: lowFitApps.length > 0 ? `${(lowFitResponded.length / lowFitApps.length) * 100}%` : '0%' }} />
              </div>
              <p className="text-[10px] text-text-muted mt-2">
                {highFitApps.length} high-fit apps, {lowFitApps.length} lower-fit apps
              </p>
            </div>
          ) : (
            <p className="text-xs text-text-muted">Need scored applications with responses to analyze.</p>
          )}
        </div>

        {/* Stale applications */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-text-muted mb-3">Stale Applications</h3>
          {staleApps.length > 0 ? (
            <div>
              <p className="text-2xl font-bold text-warning mb-1">{staleApps.length}</p>
              <p className="text-xs text-text-muted mb-3">Applied 2+ weeks ago with no response</p>
              <div className="space-y-1.5">
                {staleApps.slice(0, 4).map(app => (
                  <div key={app.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate">{app.company}</span>
                    <span className="text-text-muted shrink-0 ml-2">{daysAgoLabel(daysAgo(app.applied_date))}</span>
                  </div>
                ))}
                {staleApps.length > 4 && <p className="text-[10px] text-text-muted">+{staleApps.length - 4} more</p>}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-success mb-1">0</p>
              <p className="text-xs text-text-muted">No stale applications. All are moving.</p>
            </div>
          )}
        </div>

        {/* Company engagement */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-text-muted mb-3">Top Companies</h3>
          {topCompanies.length > 0 ? (
            <div className="space-y-2">
              {topCompanies.map(([company, info]) => {
                const furthest = FUNNEL_ORDER.reduce((best, status) =>
                  info.statuses.includes(status) ? status : best, 'researching')
                return (
                  <div key={company} className="flex items-center gap-2 text-xs">
                    <span className="font-medium truncate flex-1">{company}</span>
                    {info.bestFit > 0 && <span className={`${info.bestFit >= 75 ? 'text-success' : info.bestFit >= 60 ? 'text-warning' : 'text-danger'}`}>{info.bestFit}</span>}
                    <span className="text-[10px] px-1.5 py-0.5 bg-bg rounded text-text-muted shrink-0">{STATUS_LABELS[furthest]}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted">No applications yet.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ─── Interviews ────────────────────────────────────── */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-semibold text-sm mb-4">Interviews</h2>
          {interviews.length === 0 ? (
            <p className="text-sm text-text-muted py-4">No interviews recorded yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{completedInterviews.length}</p>
                  <p className="text-[10px] text-text-muted">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{scheduledInterviews.length}</p>
                  <p className="text-[10px] text-text-muted">Scheduled</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{avgScore(completedInterviews)}<span className="text-xs font-normal text-text-muted">/100</span></p>
                  <p className="text-[10px] text-text-muted">Avg Score</p>
                </div>
              </div>
              {/* Round breakdown */}
              <div className="border-t border-border pt-3">
                <p className="text-xs text-text-muted mb-2">By round type</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    interviews.reduce((acc, iv) => { acc[iv.round] = (acc[iv.round] || 0) + 1; return acc }, {} as Record<string, number>)
                  ).map(([round, count]) => (
                    <span key={round} className="text-[10px] px-2 py-1 bg-bg border border-border rounded-full">
                      {round.replace(/-/g, ' ')} ({count})
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ─── Networking ────────────────────────────────────── */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-semibold text-sm mb-4">Networking</h2>
          {!networking || networking.totalContacts === 0 ? (
            <p className="text-sm text-text-muted py-4">No networking activity yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{networking.totalContacts}</p>
                  <p className="text-[10px] text-text-muted">Contacts</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{Math.round(networking.replyRate)}%</p>
                  <p className="text-[10px] text-text-muted">Reply Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{networking.referrals}</p>
                  <p className="text-[10px] text-text-muted">Referrals</p>
                </div>
              </div>
              <div className="border-t border-border pt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-text-muted">Total outreach</span>
                  <p className="font-bold">{networking.totalOutreach}</p>
                </div>
                <div>
                  <span className="text-text-muted">Pending follow-ups</span>
                  <p className="font-bold">{networking.pendingFollowUps}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Offers / Compensation ──────────────────────────── */}
      {offers.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-6">
          <h2 className="font-semibold text-sm mb-4">Offers & Compensation</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs text-text-muted font-medium">Company</th>
                  <th className="text-left py-2 text-xs text-text-muted font-medium">Status</th>
                  <th className="text-right py-2 text-xs text-text-muted font-medium">Base</th>
                  <th className="text-right py-2 text-xs text-text-muted font-medium">Equity/yr</th>
                  <th className="text-right py-2 text-xs text-text-muted font-medium">Bonus</th>
                  <th className="text-right py-2 text-xs text-text-muted font-medium">Total Comp</th>
                </tr>
              </thead>
              <tbody>
                {offers.map(offer => (
                  <tr key={offer.id} className="border-b border-border/50">
                    <td className="py-2 font-medium">{offer.company}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        offer.status === 'accepted' ? 'bg-success/10 text-success' :
                        offer.status === 'negotiating' ? 'bg-warning/10 text-warning' :
                        offer.status === 'declined' ? 'bg-danger/10 text-danger' :
                        'bg-bg text-text-muted'
                      }`}>{offer.status}</span>
                    </td>
                    <td className="py-2 text-right font-mono text-xs">{fmtK(offer.comp.base)}</td>
                    <td className="py-2 text-right font-mono text-xs">{fmtK(offer.comp.equity / 4)}</td>
                    <td className="py-2 text-right font-mono text-xs">{fmtK(offer.comp.bonus)}</td>
                    <td className="py-2 text-right font-mono text-xs font-bold">{fmtK(totalComp(offer.comp))}/yr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Application Details Table (sortable) ────────────── */}
      {apps.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-semibold text-sm mb-4">All Applications</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {([
                    { field: 'company' as const, label: 'Company', align: 'text-left' },
                    { field: 'status' as const, label: 'Status', align: 'text-left' },
                    { field: 'fit' as const, label: 'Fit', align: 'text-right' },
                    { field: 'date' as const, label: 'Applied', align: 'text-right' },
                  ]).map(col => (
                    <th key={col.field} className={`${col.align} py-2 text-xs font-medium`}>
                      <button onClick={() => toggleSort(col.field)}
                        className={`hover:text-text ${sortField === col.field ? 'text-accent' : 'text-text-muted'}`}>
                        {col.label} {sortField === col.field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                  ))}
                  <th className="text-right py-2 text-xs text-text-muted font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {sortedApps.map(app => {
                  const age = app.applied_date ? daysAgo(app.applied_date) : 0
                  const isStale = ['researching', 'applied'].includes(app.status) && age >= STALE_THRESHOLD_DAYS
                  return (
                    <tr key={app.id} className={`border-b border-border/50 ${isStale ? 'bg-warning/5' : ''}`}>
                      <td className="py-2">
                        <span className="font-medium">{app.company}</span>
                        <span className="text-text-muted text-xs ml-1.5">{app.role}</span>
                      </td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ['offer'].includes(app.status) ? 'bg-success/10 text-success' :
                          ['phone-screen', 'onsite'].includes(app.status) ? 'bg-warning/10 text-warning' :
                          ['rejected', 'withdrawn'].includes(app.status) ? 'bg-danger/10 text-danger' :
                          'bg-bg text-text-muted'
                        }`}>{STATUS_LABELS[app.status] || app.status}</span>
                      </td>
                      <td className="py-2 text-right">
                        {app.fit_score > 0 && (
                          <span className={`text-xs font-bold ${
                            app.fit_score >= 75 ? 'text-success' : app.fit_score >= 60 ? 'text-warning' : 'text-danger'
                          }`}>{app.fit_score}</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-xs text-text-muted">
                        {app.applied_date ? new Date(app.applied_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`text-xs ${isStale ? 'text-warning font-medium' : 'text-text-muted'}`}>
                          {age > 0 ? `${age}d` : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {apps.length === 0 && !loading && (
        <div className="text-center py-16">
          <p className="text-text-muted text-lg mb-2">No data yet</p>
          <p className="text-text-muted text-sm">Start by scoring a JD on the Finding page or adding an application to the pipeline.</p>
        </div>
      )}
    </div>
  )
}
