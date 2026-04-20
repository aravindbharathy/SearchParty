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

  const defaultState: SpawnState = { status: 'idle', spawnId: null, result: null, error: null, output: null }
  const [spawnState, setSpawnState] = useState<SpawnState>(defaultState)

  // Restore from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as SpawnState
        if (parsed.status === 'running' && parsed.spawnId) {
          // Don't restore running state — check if actually still running first
          const spawnIdToCheck = parsed.spawnId
          const savedAgent = (() => { try { return JSON.parse(localStorage.getItem(storageKey + '-agent') || '""') } catch { return '' } })()
          fetch(`/api/agent/spawn/${spawnIdToCheck}`)
            .then(r => r.ok ? r.json() : r.status === 404 ? { status: 'gone' } : null)
            .then(async data => {
              if (!data || data.status === 'gone') {
                // Spawn gone — try session fallback to recover output
                if (savedAgent) {
                  try {
                    const sessionRes = await fetch(`/api/agent/session/${encodeURIComponent(savedAgent)}`)
                    if (sessionRes.ok) {
                      const sessionData = await sessionRes.json() as { output?: string; status?: string }
                      if (sessionData.output && sessionData.status !== 'running') {
                        setSpawnState(prev => ({ ...prev, status: 'completed', output: sessionData.output || null, spawnId: spawnIdToCheck }))
                        return
                      }
                    }
                  } catch {}
                }
                try { localStorage.removeItem(storageKey) } catch {}
                return
              }
              if (data.status === 'completed') {
                setSpawnState(prev => ({ ...prev, status: 'completed', output: data.output || null, spawnId: spawnIdToCheck }))
              } else if (data.status === 'failed') {
                setSpawnState(prev => ({ ...prev, status: 'failed', output: data.output || null, spawnId: spawnIdToCheck }))
              } else if (data.status === 'running' || data.status === 'queued') {
                setSpawnState(parsed)
              }
            })
            .catch(() => {
              try { localStorage.removeItem(storageKey) } catch {}
            })
        } else if (parsed.status === 'completed' || parsed.status === 'failed') {
          setSpawnState(parsed)
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
        if (!res.ok) {
          // 404 = spawn_id was superseded or cleaned up.
          // Try to recover the output from the agent's session.
          if (res.status === 404 && lastRequestRef.current) {
            try {
              const sessionRes = await fetch(`/api/agent/session/${encodeURIComponent(lastRequestRef.current.agent)}`)
              if (sessionRes.ok) {
                const sessionData = await sessionRes.json() as { output?: string; status?: string }
                if (sessionData.output && sessionData.status !== 'running') {
                  cleanup()
                  setSpawnState((prev) => ({ ...prev, status: 'completed', output: sessionData.output || null }))
                  return
                }
                // Agent is still running (queued message being processed) — keep polling
                if (sessionData.status === 'running') return
              }
            } catch (e) {
              console.warn('[useAgentEvents] session recovery failed:', e)
            }
            // Truly lost — mark completed with no output
            cleanup()
            setSpawnState((prev) => ({ ...prev, status: 'completed', output: null }))
          }
          return
        }
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

          if ((isStale || !retriedRef.current) && lastRequestRef.current) {
            if (!isStale) retriedRef.current = true
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
    if (storageKey) try { localStorage.setItem(storageKey + '-agent', JSON.stringify(agent)) } catch {}

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

      const data = await res.json() as { ok: boolean; spawn_id: string; error?: string; queued?: boolean }

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

      // If queued (agent is busy), show queued status and poll for when it starts
      if (data.queued) {
        setSpawnState((prev) => ({
          ...prev,
          status: 'running',
          spawnId: data.spawn_id,
          output: null,
        }))
        // Poll until the queued message actually starts and completes
        pollStatus(data.spawn_id)
        spawnInProgressRef.current = false
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
