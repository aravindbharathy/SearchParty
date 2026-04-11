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

      // Also check context file status directly — don't rely solely on agents posting directives
      try {
        const ctxRes = await fetch('/api/context/profile-status', { signal: AbortSignal.timeout(3000) })
        if (ctxRes.ok) {
          const ctx = await ctxRes.json() as { contextReady: boolean; sections: Record<string, { filled: boolean; label: string }> }
          if (!ctx.contextReady) {
            const missing = Object.entries(ctx.sections)
              .filter(([, s]) => !s.filled)
              .map(([, s]) => s.label)

            const contextActionId = 'context-incomplete'
            if (!dismissed.has(contextActionId) && !userActions.some(a => a.id === contextActionId)) {
              userActions.push({
                id: contextActionId,
                text: `Your profile is incomplete (missing: ${missing.join(', ')}). Complete it so agents can find roles, tailor resumes, and generate outreach.`,
                from: 'system',
                button_label: 'Complete Profile',
                route: '/coach',
                chat_message: `I need to complete my profile. These sections are still missing: ${missing.join(', ')}.`,
              })
            }
          }
        }
      } catch {}

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

  if (actions.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {actions.map(action => {
        const fb = fallbackRoute(action.text)
        const buttonLabel = action.button_label || fb.label
        const agent = AGENT_LABELS[action.from] || action.from

        return (
          <div key={action.id} className="flex items-center gap-3 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
            <span className="text-warning text-lg">!</span>
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
  )
}
