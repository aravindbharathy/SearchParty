'use client'

import { useEffect, useRef } from 'react'

interface PendingAction {
  message: string
  tab?: string
  from: string
  timestamp: number
}

/**
 * Hook for pages with agent chat sidebars. Checks for a pending action
 * message left by the UserActionBar when the user clicked an action prompt.
 *
 * If found (and recent — within 30 seconds), calls onMessage with the chat
 * message and optionally sets the active tab.
 *
 * Usage:
 *   usePendingAction(sendChatMessage, setActiveTab)
 */
export function usePendingAction(
  onMessage: (text: string) => void,
  onTab?: (tab: string) => void,
) {
  const processedRef = useRef(false)

  useEffect(() => {
    if (processedRef.current) return

    try {
      const raw = localStorage.getItem('pending-agent-message')
      if (!raw) return

      const action = JSON.parse(raw) as PendingAction

      // Only process if recent (within 30 seconds)
      if (Date.now() - action.timestamp > 30_000) {
        localStorage.removeItem('pending-agent-message')
        return
      }

      processedRef.current = true
      localStorage.removeItem('pending-agent-message')

      // Set tab first if specified
      if (action.tab && onTab) {
        onTab(action.tab)
      }

      // Send the message to the agent after a short delay (let the page mount)
      setTimeout(() => {
        onMessage(action.message)
      }, 1000)
    } catch {
      localStorage.removeItem('pending-agent-message')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
