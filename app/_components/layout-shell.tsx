'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { useBlackboard } from '../hooks/use-blackboard'

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { connected } = useBlackboard()

  return (
    <div className="flex min-h-screen">
      <Sidebar
        connected={connected}
        urgencyCount={0}
        activePage={pathname}
      />
      <main className="flex-1 p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
