'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UserAction {
  id: string
  text: string
  from: string
  button_label?: string
  route?: string
  tab?: string
  chat_message?: string
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
 * Fallback: detect route from text when agent didn't specify one.
 */
function fallbackRoute(text: string): { route: string; label: string; chatMessage: string } {
  const t = text.toLowerCase()
  if (t.includes('career plan')) return { route: '/coach', label: 'Complete Career Plan', chatMessage: 'I need to complete my career plan.' }
  if (t.includes('resume')) return { route: '/applying', label: 'Review Resume', chatMessage: 'I\'d like to review the tailored resume.' }
  if (t.includes('outreach') || t.includes('connection') || t.includes('message')) return { route: '/networking', label: 'Review Messages', chatMessage: 'I\'d like to review the messages.' }
  if (t.includes('role') || t.includes('score')) return { route: '/finding', label: 'Review Roles', chatMessage: 'Show me the new roles.' }
  if (t.includes('interview')) return { route: '/interviewing', label: 'View Prep', chatMessage: 'Show me the interview prep.' }
  if (t.includes('offer')) return { route: '/closing', label: 'Review Offers', chatMessage: 'I\'d like to review the offers.' }
  return { route: '/coach', label: 'Take Action', chatMessage: `An agent needs my help: ${text}` }
}

const STORAGE_KEY = 'dismissed-user-actions'

export function UserActionBar() {
  const router = useRouter()
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
        directives?: Array<Record<string, string>>
      }

      const userActions: UserAction[] = []
      for (const d of state.directives ?? []) {
        if (d.status === 'done' || d.status === 'completed') continue
        const isUserAction = d.type === 'user_action' ||
          (d.assigned_to === 'coach' && d.text?.toLowerCase().includes('user'))
        if (!isUserAction) continue
        if (dismissed.has(d.id)) continue

        userActions.push({
          id: d.id,
          text: d.text,
          from: d.from || 'unknown',
          button_label: d.button_label,
          route: d.route,
          tab: d.tab,
          chat_message: d.chat_message,
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

  const handleAction = (action: UserAction) => {
    const fb = fallbackRoute(action.text)
    const route = action.route || fb.route
    const chatMessage = action.chat_message || fb.chatMessage

    // Store the message so the target page can pick it up
    try {
      localStorage.setItem('pending-agent-message', JSON.stringify({
        message: chatMessage,
        tab: action.tab || null,
        from: action.from,
        timestamp: Date.now(),
      }))
    } catch {}

    dismiss(action.id)
    router.push(route)
  }

  const [expanded, setExpanded] = useState(true)

  if (actions.length === 0) return null

  return (
    <div className="border-b border-warning/30 bg-warning/5">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-warning text-base font-bold">!</span>
          {expanded ? (
            <span className="text-base font-medium">{actions.length} action{actions.length !== 1 ? 's' : ''} needed</span>
          ) : (
            <span className="text-base text-text">
              {actions.map(a => {
                const label = a.button_label || fallbackRoute(a.text).label
                return label
              }).join(', ')}
            </span>
          )}
        </div>
        <span className="text-sm text-text-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {actions.map(action => {
            const fb = fallbackRoute(action.text)
            const buttonLabel = action.button_label || fb.label
            const agent = AGENT_LABELS[action.from] || action.from

            return (
              <div key={action.id} className="flex items-center gap-3 bg-surface border border-warning/20 rounded-lg px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text">{action.text}</p>
                  <p className="text-xs text-text-muted mt-0.5">From: {agent}</p>
                </div>
                <button
                  onClick={() => handleAction(action)}
                  className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-md hover:bg-accent-hover shrink-0"
                >
                  {buttonLabel}
                </button>
                <button onClick={() => dismiss(action.id)} className="text-xs text-text-muted hover:text-text shrink-0">
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
