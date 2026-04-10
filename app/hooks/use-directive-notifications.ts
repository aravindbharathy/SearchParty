'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

export interface DirectiveNotification {
  id: string
  agent: string
  from: string
  text: string
  result?: string
  completedAt: string
}

const STORAGE_KEY = 'dismissed-directive-notifications'

/**
 * Polls the blackboard for completed directives relevant to a specific agent.
 * Returns notifications that haven't been dismissed.
 */
export function useDirectiveNotifications(agentFilter?: string) {
  const [notifications, setNotifications] = useState<DirectiveNotification[]>([])
  const dismissedRef = useRef<Set<string>>(new Set())

  // Load dismissed IDs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) dismissedRef.current = new Set(JSON.parse(saved))
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
          assignee?: string
          from?: string
          status?: string
          result?: string
          completed_at?: string
          posted_at?: string
        }>
        findings?: Record<string, {
          type?: string
          text?: string
          from?: string
          for?: string
          timestamp?: string
        }>
      }

      const newNotifications: DirectiveNotification[] = []

      // Check completed directives
      for (const d of state.directives ?? []) {
        if (d.status !== 'done' && d.status !== 'completed') continue
        if (dismissedRef.current.has(d.id)) continue
        const assignedAgent = d.assigned_to || d.assignee || ''
        if (agentFilter && assignedAgent !== agentFilter) continue

        newNotifications.push({
          id: d.id,
          agent: assignedAgent,
          from: d.from || 'unknown',
          text: d.text,
          result: d.result,
          completedAt: d.completed_at || d.posted_at || '',
        })
      }

      // Check findings tagged for this agent (from other agents' work)
      if (agentFilter) {
        for (const [key, f] of Object.entries(state.findings ?? {})) {
          if (f.for !== agentFilter && f.for !== 'all') continue
          if (dismissedRef.current.has(key)) continue

          newNotifications.push({
            id: key,
            agent: agentFilter,
            from: f.from || 'unknown',
            text: f.text || '',
            completedAt: f.timestamp || '',
          })
        }
      }

      setNotifications(newNotifications)
    } catch { /* ignore */ }
  }, [agentFilter])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 15_000) // check every 15s
    return () => clearInterval(interval)
  }, [poll])

  const dismiss = useCallback((id: string) => {
    dismissedRef.current.add(id)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissedRef.current]))
    } catch {}
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    for (const n of notifications) {
      dismissedRef.current.add(n.id)
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissedRef.current]))
    } catch {}
    setNotifications([])
  }, [notifications])

  return { notifications, dismiss, dismissAll }
}
