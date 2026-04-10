'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { UserActionBar } from './user-action-bar'
import { useBlackboard } from '../hooks/use-blackboard'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { connected } = useBlackboard()
  const [urgencyCount, setUrgencyCount] = useState(0)
  const [networkingCount, setNetworkingCount] = useState(0)

  const fetchCounts = useCallback(() => {
    // Fetch pipeline urgency (includes networking follow-ups now)
    fetch('/api/pipeline/urgency')
      .then((r) => r.json())
      .then((data: { overdue?: unknown[]; today?: unknown[] }) => {
        const overdue = Array.isArray(data.overdue) ? data.overdue.length : 0
        const today = Array.isArray(data.today) ? data.today.length : 0
        setUrgencyCount(overdue + today)
      })
      .catch(() => {})

    // Fetch networking stats for badge
    fetch('/api/networking/stats')
      .then((r) => r.json())
      .then((data: { pendingFollowUps?: number }) => {
        setNetworkingCount(data.pendingFollowUps ?? 0)
      })
      .catch(() => {})
  }, [])

  // Fetch on navigation
  useEffect(() => {
    fetchCounts()
  }, [pathname, fetchCounts])

  // 60-second polling interval for sidebar badge
  useEffect(() => {
    const interval = setInterval(fetchCounts, 60_000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  // Auto-dispatch: poll blackboard for pending directives and spawn assigned agents
  useEffect(() => {
    const dispatch = () => {
      fetch('/api/agent/dispatch', { method: 'POST' }).catch(() => {})
    }
    // Check on mount and every 30 seconds
    dispatch()
    const interval = setInterval(dispatch, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        connected={connected}
        urgencyCount={urgencyCount}
        networkingCount={networkingCount}
        activePage={pathname}
      />
      <main className="flex-1 p-6 overflow-y-auto">
        <UserActionBar />
        {children}
      </main>
    </div>
  )
}
