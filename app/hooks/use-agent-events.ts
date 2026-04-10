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

export function useAgentEvents(persistKey?: string) {
  const storageKey = persistKey ? `agent-spawn-${persistKey}` : null

  const [spawnState, setSpawnState] = useState<SpawnState>(() => {
    // Restore from localStorage if a persistKey is given
    if (typeof window === 'undefined' || !storageKey) {
      return { status: 'idle', spawnId: null, result: null, error: null, output: null }
    }
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as SpawnState
        // If it was running when we left, we'll re-poll on mount
        if (parsed.status === 'running' && parsed.spawnId) return parsed
        // If completed/failed, restore the result
        if (parsed.status === 'completed' || parsed.status === 'failed') return parsed
      }
    } catch {}
    return { status: 'idle', spawnId: null, result: null, error: null, output: null }
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retriedRef = useRef(false)
  const spawnInProgressRef = useRef(false)
  const lastRequestRef = useRef<{ agent: string; directive: Record<string, unknown> } | null>(null)

  // Persist spawn state to localStorage when it changes
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(spawnState))
    } catch {}
  }, [spawnState, storageKey])

  // On mount: if restored state was "running", resume polling
  useEffect(() => {
    if (spawnState.status === 'running' && spawnState.spawnId && !pollRef.current) {
      pollStatus(spawnState.spawnId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

          const isStale = data.output?.includes('Process lost') || data.output?.includes('dashboard was restarted')

          // Stale sessions: always retry silently (don't show error)
          // Real failures: retry once
          if ((isStale || !retriedRef.current) && lastRequestRef.current) {
            if (!isStale) retriedRef.current = true  // only count real failures toward retry limit
            setTimeout(() => {
              if (lastRequestRef.current) {
                spawnAgent(lastRequestRef.current.agent, lastRequestRef.current.directive)
              }
            }, 500)
            return
          }

          setSpawnState((prev) => ({
            ...prev,
            status: 'failed',
            error: data.output || 'Agent process failed. Try again.',
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
        spawnInProgressRef.current = false
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
      spawnInProgressRef.current = false
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
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch {}
    }
  }, [cleanup, storageKey])

  return {
    spawnAgent,
    reset,
    ...spawnState,
  }
}
