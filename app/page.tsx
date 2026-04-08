'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBlackboard } from './hooks/use-blackboard'

interface StatusResponse {
  contexts: Record<string, { filled: boolean; lastModified: string | null; label: string; description: string }>
  contextReady: boolean
}

export default function CommandCenter() {
  const { state } = useBlackboard()
  const router = useRouter()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    fetch('/api/context/status')
      .then(r => r.json())
      .then((data: StatusResponse) => {
        setStatus(data)
        if (!data.contextReady) {
          setRedirecting(true)
          router.push('/onboarding')
        }
      })
      .catch(() => {})
  }, [router])

  if (!status || redirecting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  // Context exists: show Command Center
  const filledCount = Object.values(status.contexts).filter(c => c.filled).length
  const totalCount = Object.keys(status.contexts).length

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-4">Command Center</h1>
      <p className="text-text-muted text-lg mb-8">
        Your job search at a glance. Full command center coming in Phase 2.
      </p>

      {/* Quick Status */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Context</div>
          <div className="text-2xl font-bold">{filledCount}/{totalCount}</div>
          <div className="text-xs text-text-muted">files filled</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Agents</div>
          <div className="text-2xl font-bold">
            {state?.agents ? Object.keys(state.agents).length : 0}
          </div>
          <div className="text-xs text-text-muted">registered</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Directives</div>
          <div className="text-2xl font-bold">
            {state?.directives?.length ?? 0}
          </div>
          <div className="text-xs text-text-muted">pending</div>
        </div>
      </div>

      {/* Context Status */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="font-semibold mb-3">Context Files</h2>
        <div className="space-y-2">
          {Object.entries(status.contexts).map(([name, ctx]) => (
            <div key={name} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span>{ctx.filled ? '\u2705' : '\u26AA'}</span>
                <span className="text-sm">{ctx.label}</span>
              </div>
              {ctx.lastModified && (
                <span className="text-xs text-text-muted">
                  {new Date(ctx.lastModified).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <a href="/context" className="text-sm text-accent hover:text-accent-hover">Edit Context</a>
          <a href="/vault" className="text-sm text-accent hover:text-accent-hover">Manage Vault</a>
        </div>
      </div>
    </div>
  )
}
