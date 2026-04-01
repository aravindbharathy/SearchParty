'use client'

import { useEffect, useState } from 'react'
import { useBlackboard } from './hooks/use-blackboard'

interface ContextStatus {
  experienceLibrary: { filled: boolean; count: number }
  careerPlan: { filled: boolean; count: number }
  contextReady: boolean
}

export default function CommandCenter() {
  const { state } = useBlackboard()
  const [contextStatus, setContextStatus] = useState<ContextStatus | null>(null)

  useEffect(() => {
    fetch('/api/context/status')
      .then(r => r.json())
      .then(setContextStatus)
      .catch(() => {})
  }, [])

  // Show loading state briefly
  if (!contextStatus) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  // Empty context: show welcome
  if (!contextStatus.contextReady) {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <h1 className="text-3xl font-bold mb-4">Welcome to Job Search OS</h1>
        <p className="text-text-muted text-lg mb-8">
          Run <code className="px-2 py-1 bg-surface border border-border rounded text-accent font-mono text-sm">job-search setup</code> to get started.
        </p>

        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Getting Started</h2>
          <ol className="space-y-3 text-text-muted">
            <li className="flex gap-3">
              <span className="text-accent font-bold">1.</span>
              <span>Run <code className="px-1.5 py-0.5 bg-bg border border-border rounded text-sm font-mono">job-search setup</code> to fill in your experience and career goals</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent font-bold">2.</span>
              <span>Add your resume and job descriptions to the vault</span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent font-bold">3.</span>
              <span>Start finding roles and tracking applications</span>
            </li>
          </ol>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-sm text-text-muted mb-1">Experience Library</div>
            <div className="text-lg font-semibold">
              {contextStatus.experienceLibrary.filled ? (
                <span className="text-success">{contextStatus.experienceLibrary.count} entries</span>
              ) : (
                <span className="text-warning">Empty</span>
              )}
            </div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-sm text-text-muted mb-1">Career Plan</div>
            <div className="text-lg font-semibold">
              {contextStatus.careerPlan.filled ? (
                <span className="text-success">{contextStatus.careerPlan.count} goals</span>
              ) : (
                <span className="text-warning">Empty</span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Context exists: placeholder for Phase 2
  return (
    <div className="max-w-2xl mx-auto mt-16">
      <h1 className="text-3xl font-bold mb-4">Command Center</h1>
      <p className="text-text-muted text-lg">
        Command Center coming in Phase 2.
      </p>
    </div>
  )
}
