'use client'

import { useEffect, useState, useCallback } from 'react'

interface UserAction {
  id: string
  text: string
  from: string
  route?: string
  priority?: string
}

const ROUTE_MAP: Record<string, { route: string; label: string }> = {
  coach: { route: '/coach', label: 'Go to Coach' },
  'career-plan': { route: '/coach', label: 'Complete Career Plan' },
  'experience-library': { route: '/coach', label: 'Complete Background' },
  'target-companies': { route: '/finding', label: 'Go to Finding Roles' },
  networking: { route: '/networking', label: 'Go to Networking' },
  resume: { route: '/applying', label: 'Go to Applying' },
  interview: { route: '/interviewing', label: 'Go to Interviewing' },
}

const AGENT_LABELS: Record<string, string> = {
  research: 'Research agent',
  resume: 'Resume agent',
  coach: 'Coach',
  networking: 'Networking agent',
  interview: 'Interview agent',
  strategist: 'Strategist',
}

/**
 * Detect the best route for a user-action directive based on its text.
 */
function detectRoute(text: string, assignedTo: string): { route: string; label: string } {
  const t = text.toLowerCase()
  if (t.includes('career plan') || t.includes('career-plan')) return ROUTE_MAP['career-plan']
  if (t.includes('background') || t.includes('experience')) return ROUTE_MAP['experience-library']
  if (t.includes('target companies') || t.includes('company list')) return ROUTE_MAP['target-companies']
  if (t.includes('networking') || t.includes('outreach') || t.includes('connection')) return ROUTE_MAP.networking
  if (t.includes('resume') || t.includes('cover letter')) return ROUTE_MAP.resume
  if (t.includes('interview')) return ROUTE_MAP.interview
  return ROUTE_MAP[assignedTo] || { route: '/coach', label: 'Go to Coach' }
}

/**
 * Humanize a directive into a user-friendly action prompt.
 */
function humanize(text: string, from: string): string {
  const agent = AGENT_LABELS[from] || from
  const t = text.toLowerCase()

  if (t.includes('career plan') && t.includes('incomplete'))
    return `${agent} needs your career plan to continue. Complete your profile to unlock company search and role matching.`
  if (t.includes('career plan') && t.includes('missing'))
    return `${agent} can't work without your career plan. Set up your target role, industries, and preferences first.`
  if (t.includes('target companies') && t.includes('missing'))
    return `${agent} needs your target company list. Generate companies from your career plan first.`
  if (t.includes('outreach') || t.includes('networking'))
    return `${agent} has prepared outreach — review and send your connection requests.`
  if (t.includes('resume') && t.includes('review'))
    return `${agent} prepared a tailored resume — review and approve it.`
  if (t.includes('score') && t.includes('review'))
    return `New job descriptions scored — review the results and decide which to pursue.`

  // Fallback: clean up the raw text
  return text.length > 120 ? text.slice(0, 120) + '...' : text
}

const STORAGE_KEY = 'dismissed-user-actions'

export function UserActionBar() {
  const [actions, setActions] = useState<UserAction[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setDismissed(new Set(JSON.parse(saved)))
    } catch {}
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return
      const state = await res.json() as {
        directives?: Array<{
          id: string
          text: string
          assigned_to?: string
          from?: string
          status?: string
          type?: string
        }>
      }

      const userActions: UserAction[] = []
      for (const d of state.directives ?? []) {
        // Only show pending directives assigned to 'coach' (user-facing) or with type 'user_action'
        if (d.status === 'done' || d.status === 'completed') continue
        const isUserAction = d.type === 'user_action' ||
          (d.assigned_to === 'coach' && d.text?.toLowerCase().includes('user'))
        if (!isUserAction) continue
        if (dismissed.has(d.id)) continue

        userActions.push({
          id: d.id,
          text: d.text,
          from: d.from || 'unknown',
          priority: d.type === 'user_action' ? 'high' : undefined,
        })
      }

      setActions(userActions)
    } catch {}
  }, [dismissed])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 15_000)
    return () => clearInterval(interval)
  }, [poll])

  const dismiss = (id: string) => {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    setActions(prev => prev.filter(a => a.id !== id))
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch {}
  }

  if (actions.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {actions.map(action => {
        const { route, label } = detectRoute(action.text, 'coach')
        const message = humanize(action.text, action.from)

        return (
          <div key={action.id} className="flex items-center gap-3 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
            <span className="text-warning text-lg">!</span>
            <p className="flex-1 text-sm text-text">{message}</p>
            <a
              href={route}
              className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-md hover:bg-accent-hover shrink-0"
            >
              {label}
            </a>
            <button onClick={() => dismiss(action.id)} className="text-xs text-text-muted hover:text-text shrink-0">
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
