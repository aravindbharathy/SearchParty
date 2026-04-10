'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UserAction {
  id: string
  text: string
  from: string
}

interface ActionRoute {
  route: string
  label: string
  chatMessage: string // sent to the agent on the target page
  tab?: string // optional tab to activate on target page
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
 * Determine the action route, button label, and chat message based on directive text.
 */
function resolveAction(text: string, from: string): ActionRoute {
  const t = text.toLowerCase()

  if (t.includes('career plan') && (t.includes('incomplete') || t.includes('missing') || t.includes('empty'))) {
    return {
      route: '/coach',
      label: 'Complete Career Plan',
      chatMessage: 'I need to complete my career plan. The research agent needs it to find companies and score job descriptions for me. Let\'s work on it now.',
    }
  }

  if (t.includes('background') || t.includes('experience') && t.includes('missing')) {
    return {
      route: '/coach',
      label: 'Complete Background',
      chatMessage: 'I need to fill in my work background. Let\'s go through my experience.',
    }
  }

  if (t.includes('target companies') && (t.includes('missing') || t.includes('empty'))) {
    return {
      route: '/finding',
      label: 'Generate Companies',
      chatMessage: 'I need to generate my target company list. Let\'s do that now.',
      tab: 'companies',
    }
  }

  if (t.includes('outreach') || t.includes('connection request') || t.includes('linkedin request')) {
    return {
      route: '/networking',
      label: 'Review Messages',
      chatMessage: 'I\'d like to review the outreach messages that were prepared.',
      tab: 'messages',
    }
  }

  if (t.includes('resume') && (t.includes('review') || t.includes('ready') || t.includes('tailored'))) {
    return {
      route: '/applying',
      label: 'Review Resume',
      chatMessage: 'I\'d like to review the tailored resume.',
    }
  }

  if (t.includes('interview') && (t.includes('prep') || t.includes('scheduled') || t.includes('confirm'))) {
    return {
      route: '/interviewing',
      label: 'View Prep',
      chatMessage: 'Show me the interview prep materials.',
    }
  }

  if (t.includes('score') || t.includes('open role')) {
    return {
      route: '/finding',
      label: 'Review Roles',
      chatMessage: 'Show me the new roles and scores.',
      tab: 'open-roles',
    }
  }

  if (t.includes('offer') || t.includes('negotiat')) {
    return {
      route: '/closing',
      label: 'Review Offers',
      chatMessage: 'I\'d like to review and compare the offers.',
    }
  }

  return {
    route: '/coach',
    label: 'Take Action',
    chatMessage: `An agent needs my help: ${text}`,
  }
}

/**
 * Humanize a directive into a user-friendly message.
 */
function humanize(text: string, from: string): string {
  const agent = AGENT_LABELS[from] || from
  const t = text.toLowerCase()

  if (t.includes('career plan') && (t.includes('incomplete') || t.includes('missing') || t.includes('empty')))
    return `${agent} needs your career plan to find matching roles and companies.`
  if (t.includes('target companies') && (t.includes('missing') || t.includes('empty')))
    return `${agent} needs your target company list before generating outreach.`
  if (t.includes('outreach') || t.includes('connection request'))
    return `${agent} prepared connection requests — review and send them.`
  if (t.includes('resume') && (t.includes('ready') || t.includes('tailored') || t.includes('review')))
    return `${agent} tailored a resume — review it before applying.`
  if (t.includes('score') && t.includes('review'))
    return `New job descriptions scored — review the results.`
  if (t.includes('interview') && t.includes('prep'))
    return `${agent} prepared interview materials — review before your interview.`
  if (t.includes('offer') || t.includes('negotiat'))
    return `${agent} needs you to review offers and make a decision.`

  return text.length > 120 ? text.slice(0, 120) + '...' : text
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
        if (d.status === 'done' || d.status === 'completed') continue
        const isUserAction = d.type === 'user_action' ||
          (d.assigned_to === 'coach' && d.text?.toLowerCase().includes('user'))
        if (!isUserAction) continue
        if (dismissed.has(d.id)) continue

        userActions.push({
          id: d.id,
          text: d.text,
          from: d.from || 'unknown',
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
    const resolved = resolveAction(action.text, action.from)

    // Store the chat message so the target page can pick it up and send to its agent
    try {
      localStorage.setItem('pending-agent-message', JSON.stringify({
        message: resolved.chatMessage,
        tab: resolved.tab,
        from: action.from,
        timestamp: Date.now(),
      }))
    } catch {}

    dismiss(action.id)
    router.push(resolved.route)
  }

  if (actions.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {actions.map(action => {
        const resolved = resolveAction(action.text, action.from)
        const message = humanize(action.text, action.from)

        return (
          <div key={action.id} className="flex items-center gap-3 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
            <span className="text-warning text-lg">!</span>
            <p className="flex-1 text-sm text-text">{message}</p>
            <button
              onClick={() => handleAction(action)}
              className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-md hover:bg-accent-hover shrink-0"
            >
              {resolved.label}
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
