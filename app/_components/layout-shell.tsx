'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { useBlackboard } from '../hooks/use-blackboard'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { connected } = useBlackboard()
  const [urgencyCount, setUrgencyCount] = useState(0)

  useEffect(() => {
    fetch('/api/pipeline/urgency')
      .then((r) => r.json())
      .then((data: { overdue?: unknown[]; today?: unknown[] }) => {
        const overdue = Array.isArray(data.overdue) ? data.overdue.length : 0
        const today = Array.isArray(data.today) ? data.today.length : 0
        setUrgencyCount(overdue + today)
      })
      .catch(() => {})
  }, [pathname])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        connected={connected}
        urgencyCount={urgencyCount}
        activePage={pathname}
      />
      <main className="flex-1 p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
