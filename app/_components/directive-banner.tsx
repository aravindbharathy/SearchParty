'use client'

import type { DirectiveNotification } from '../hooks/use-directive-notifications'

interface DirectiveBannerProps {
  notifications: DirectiveNotification[]
  onDismiss: (id: string) => void
  onDismissAll: () => void
  onDiscuss?: (text: string) => void
}

const AGENT_ICONS: Record<string, string> = {
  research: '🔍',
  resume: '📄',
  coach: '🤖',
  networking: '🤝',
  interview: '🎯',
  strategist: '📊',
  archivist: '📁',
}

/**
 * Humanize a directive/finding into a user-friendly message.
 * "Tailor resume for Stripe Staff Engineer, JD at vault/..." → "A tailored resume is ready for Stripe Staff Engineer"
 */
function humanize(text: string, agent: string): string {
  const t = text.toLowerCase()

  if (agent === 'resume' || t.includes('tailor resume') || t.includes('tailored resume')) {
    const company = text.match(/for\s+(\S+(?:\s+\S+)?)/i)?.[1] || ''
    return company ? `A tailored resume is ready for ${company}` : 'A new tailored resume is ready for review'
  }

  if (agent === 'networking' || t.includes('connection') || t.includes('referral') || t.includes('outreach')) {
    const company = text.match(/at\s+(\S+)/i)?.[1] || text.match(/for\s+(\S+)/i)?.[1] || ''
    if (t.includes('referral')) return company ? `A referral path was identified at ${company}` : 'New referral opportunities found'
    return company ? `Outreach prepared for connections at ${company}` : 'New networking outreach prepared'
  }

  if (t.includes('score') && t.includes('jd')) {
    const company = text.match(/for\s+(\S+(?:\s+\S+)?)/i)?.[1] || ''
    return company ? `Job description scored for ${company}` : 'A new job description was scored'
  }

  if (t.includes('intel') || t.includes('research')) {
    const company = text.match(/for\s+(\S+)/i)?.[1] || text.match(/on\s+(\S+)/i)?.[1] || ''
    return company ? `Company intel updated for ${company}` : 'New company research completed'
  }

  if (t.includes('interview') || t.includes('prep')) {
    const company = text.match(/for\s+(\S+)/i)?.[1] || ''
    return company ? `Interview prep ready for ${company}` : 'Interview preparation completed'
  }

  // Fallback: truncate the raw text
  return text.length > 100 ? text.slice(0, 100) + '...' : text
}

export function DirectiveBanner({ notifications, onDismiss, onDismissAll, onDiscuss }: DirectiveBannerProps) {
  if (notifications.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {notifications.length > 2 && (
        <div className="flex justify-end">
          <button onClick={onDismissAll} className="text-xs text-text-muted hover:text-text">
            Dismiss all
          </button>
        </div>
      )}
      {notifications.map(n => {
        const icon = AGENT_ICONS[n.agent] || AGENT_ICONS[n.from] || '📌'
        const message = humanize(n.text, n.agent)

        return (
          <div key={n.id} className="flex items-start gap-3 bg-success/5 border border-success/20 rounded-lg px-4 py-3">
            <span className="text-sm mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text">{message}</p>
              {n.result && (
                <p className="text-xs text-text-muted mt-1">{n.result.length > 150 ? n.result.slice(0, 150) + '...' : n.result}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onDiscuss && (
                <button
                  onClick={() => onDiscuss(`Tell me more about: ${message}`)}
                  className="text-xs text-accent hover:text-accent-hover font-medium"
                >
                  Discuss
                </button>
              )}
              <button onClick={() => onDismiss(n.id)} className="text-xs text-text-muted hover:text-text">
                ✕
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
