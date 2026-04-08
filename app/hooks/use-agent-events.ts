'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export interface AgentEvent {
  event: 'agent_complete' | 'agent_failed' | 'agent_started'
  spawn_id: string
  agent: string
  skill: string
  output_path?: string
  status: 'running' | 'completed' | 'failed'
}

interface SpawnState {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'timeout'
  spawnId: string | null
  result: AgentEvent | null
  error: string | null
  output: string | null
}

const SPAWN_TIMEOUT_MS = 300_000 // 5 minutes — Claude can take 2-4 min on complex JDs

export function useAgentEvents() {
  const [spawnState, setSpawnState] = useState<SpawnState>({
    status: 'idle',
    spawnId: null,
    result: null,
    error: null,
    output: null,
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retriedRef = useRef(false)
  const spawnInProgressRef = useRef(false)
  const lastRequestRef = useRef<{ agent: string; directive: Record<string, unknown> } | null>(null)

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    spawnInProgressRef.current = false
  }, [])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const pollStatus = useCallback((spawnId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agent/spawn/${spawnId}`)
        if (!res.ok) return
        const data = await res.json() as { status: string; output?: string }

        if (data.status === 'completed') {
          cleanup()
          setSpawnState((prev) => ({
            ...prev,
            status: 'completed',
            output: data.output || null,
            result: {
              event: 'agent_complete',
              spawn_id: spawnId,
              agent: lastRequestRef.current?.agent || '',
              skill: '',
              status: 'completed',
            },
          }))
        } else if (data.status === 'failed') {
          cleanup()

          // Retry once on failure (stale session or real error) — never more than once
          if (!retriedRef.current && lastRequestRef.current) {
            retriedRef.current = true
            setTimeout(() => {
              if (lastRequestRef.current) {
                spawnAgent(lastRequestRef.current.agent, lastRequestRef.current.directive)
              }
            }, 500)
            return
          }

          // Show the actual error to the user
          const isStale = data.output?.includes('Process lost') || data.output?.includes('dashboard was restarted')
          setSpawnState((prev) => ({
            ...prev,
            status: 'failed',
            error: isStale ? 'Session expired. Please try again.' : (data.output || 'Agent process failed. Try again.'),
            output: null,
          }))
        }
      } catch {
        // Polling error — continue
      }
    }, 2000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup])

  const spawnAgent = useCallback(async (
    agent: string,
    directive: Record<string, unknown>,
  ) => {
    // Guard against concurrent spawns
    if (spawnInProgressRef.current) return null
    spawnInProgressRef.current = true

    cleanup()
    lastRequestRef.current = { agent, directive }

    setSpawnState({
      status: 'running',
      spawnId: null,
      result: null,
      error: null,
      output: null,
    })

    try {
      const res = await fetch('/api/agent/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, directive }),
      })

      const data = await res.json() as { ok: boolean; spawn_id: string; error?: string }

      if (!data.ok) {
        setSpawnState({
          status: 'failed',
          spawnId: data.spawn_id,
          result: null,
          error: data.error || 'Spawn failed',
          output: null,
        })
        return data.spawn_id
      }

      setSpawnState((prev) => ({
        ...prev,
        spawnId: data.spawn_id,
      }))

      // Start polling for status
      pollStatus(data.spawn_id)

      // Set timeout
      timeoutRef.current = setTimeout(() => {
        cleanup()
        setSpawnState((prev) => ({
          ...prev,
          status: 'timeout',
          error: 'Agent timed out after 5 minutes',
        }))
      }, SPAWN_TIMEOUT_MS)

      return data.spawn_id
    } catch (err) {
      setSpawnState({
        status: 'failed',
        spawnId: null,
        result: null,
        error: err instanceof Error ? err.message : 'Network error',
        output: null,
      })
      return null
    }
  }, [cleanup, pollStatus])

  const reset = useCallback(() => {
    cleanup()
    retriedRef.current = false
    lastRequestRef.current = null
    setSpawnState({
      status: 'idle',
      spawnId: null,
      result: null,
      error: null,
      output: null,
    })
  }, [cleanup])

  return {
    spawnAgent,
    reset,
    ...spawnState,
  }
}
