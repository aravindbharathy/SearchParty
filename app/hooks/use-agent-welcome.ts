'use client'

import { useEffect, useRef, useCallback } from 'react'

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
}

interface AgentDirective {
  id?: string
  assigned_to?: string
  assignee?: string
  from?: string
  text?: string
  status?: string
}

const SKILL_LABELS: Record<string, string> = {
  'company-research': 'researching company intel',
  'generate-targets': 'generating target companies',
  'score-jd': 'scoring a job description',
  'scan-roles': 'scanning for open roles',
  'resume-tailor': 'tailoring a resume',
  'cover-letter': 'writing a cover letter',
  'hiring-manager-msg': 'drafting a hiring manager message',
  'company-insight': 'writing a company insight brief',
  'connection-request': 'generating connection requests',
  'referral-request': 'preparing a referral request',
  'linkedin-audit': 'auditing LinkedIn profile',
  'interview-prep': 'building interview prep',
  'mock-interview': 'running a mock interview',
  'interview-debrief': 'analyzing interview debrief',
  'thank-you-note': 'writing a thank-you note',
  'salary-research': 'researching salary data',
  'negotiate': 'building negotiation strategy',
  'ats-check': 'running an ATS compatibility check',
  'recruiter-review': 'running a recruiter review',
  'weekly-retro': 'writing the weekly retrospective',
  'daily-briefing': 'preparing the daily briefing',
}

const FROM_LABELS: Record<string, string> = {
  coach: 'the coach',
  research: 'the research agent',
  resume: 'the resume agent',
  interview: 'the interview agent',
  networking: 'the networking agent',
  negotiation: 'the negotiation agent',
}

function describeDirective(d: AgentDirective): { task: string; from: string } {
  const skillMatch = d.text?.match(/Run skill:\s*([a-z-]+)/i)
  const task = skillMatch && SKILL_LABELS[skillMatch[1]]
    ? SKILL_LABELS[skillMatch[1]]
    : d.text?.slice(0, 60) || 'a task'
  const from = FROM_LABELS[d.from || ''] || d.from || 'the dashboard'
  return { task, from }
}

function getSeenKey(agentName: string): string {
  return `agent-welcome-seen-${agentName}`
}

function loadSeen(agentName: string): Set<string> {
  try {
    const saved = localStorage.getItem(getSeenKey(agentName))
    return saved ? new Set(JSON.parse(saved)) : new Set()
  } catch { return new Set() }
}

function saveSeen(agentName: string, seen: Set<string>): void {
  try { localStorage.setItem(getSeenKey(agentName), JSON.stringify([...seen])) } catch {}
}

/**
 * Shows a welcome message on first visit and polls the blackboard
 * for NEW directive activity targeting this agent.
 */
export function useAgentWelcome(
  agentName: string,
  welcomeText: string,
  chatMessages: ChatMessage[],
  setChatMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void,
  chatStorageKey?: string,
) {
  const hasCheckedRef = useRef(false)
  const seenRef = useRef<Set<string>>(loadSeen(agentName))

  // Initial welcome on first visit
  useEffect(() => {
    if (hasCheckedRef.current) return
    hasCheckedRef.current = true

    // Check localStorage directly — React state is [] at mount before restore effect runs
    const storageKey = chatStorageKey || `${agentName}-chat-messages`
    let hasSavedMessages = false
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        hasSavedMessages = Array.isArray(parsed) && parsed.length > 0
      }
    } catch {}

    if (hasSavedMessages || chatMessages.length > 0) {
      // Already have messages — seed seen set from blackboard so poll doesn't re-inject
      fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
        .then(r => r.ok ? r.json() : null)
        .then(state => {
          if (!state?.directives) return
          for (const d of state.directives as AgentDirective[]) {
            if ((d.assigned_to === agentName || d.assignee === agentName) && d.id) {
              seenRef.current.add(d.id)
            }
          }
          saveSeen(agentName, seenRef.current)
        })
        .catch(() => {})
      return
    }

    // First visit — show welcome + at most 1 recent directive status
    const check = async () => {
      const messages: ChatMessage[] = [{ role: 'agent', content: welcomeText }]
      try {
        const res = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
        if (res.ok) {
          const state = await res.json() as { directives?: AgentDirective[] }
          const directives = (state.directives || []).filter(d =>
            (d.assigned_to === agentName || d.assignee === agentName) && d.text
          )
          // Mark all as seen so poll doesn't re-inject them
          for (const d of directives) {
            if (d.id) seenRef.current.add(d.id)
          }
          saveSeen(agentName, seenRef.current)

          // Show at most 1 in-progress directive (most relevant to user)
          const inProgress = directives.find(d => d.status === 'in-progress')
          if (inProgress) {
            const { task, from } = describeDirective(inProgress)
            messages.push({ role: 'agent', content: `I'm currently ${task} — ${from} asked me to handle this.` })
          }
        }
      } catch {}
      setChatMessages(messages)
    }
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for NEW directives AND findings targeting this agent
  const pollDirectives = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
      if (!res.ok) return
      const state = await res.json() as {
        directives?: AgentDirective[]
        findings?: Record<string, { text?: string; for?: string; type?: string; timestamp?: string; progress?: string }>
      }

      // Check directives
      const directives = (state.directives || []).filter(d =>
        (d.assigned_to === agentName || d.assignee === agentName) && d.text && d.id
      )
      for (const d of directives) {
        if (seenRef.current.has(d.id!)) continue
        seenRef.current.add(d.id!)
        saveSeen(agentName, seenRef.current)

        const { task, from } = describeDirective(d)
        const status = d.status || ''
        if (status === 'in-progress') {
          setChatMessages(prev => [...prev, { role: 'agent', content: `Heads up — I'm ${task}. ${from} asked me to handle this.` }])
        } else if (status === 'done' || status === 'completed') {
          setChatMessages(prev => [...prev, { role: 'agent', content: `All done — I finished ${task}. Take a look when you're ready.` }])
        } else if (status === 'pending') {
          setChatMessages(prev => [...prev, { role: 'agent', content: `I have a new task queued: ${task} (from ${from}).` }])
        }
      }

      // Check findings (for batch progress updates — only recent ones)
      const fiveMinAgo = Date.now() - 5 * 60 * 1000
      for (const [key, finding] of Object.entries(state.findings || {})) {
        if (!finding?.text || (finding.for && finding.for !== agentName)) continue
        // Skip stale findings — only show findings from the last 5 minutes
        if (finding.timestamp && new Date(finding.timestamp).getTime() < fiveMinAgo) continue
        const findingId = `finding-${key}-${finding.timestamp || ''}`
        if (seenRef.current.has(findingId)) continue
        seenRef.current.add(findingId)
        saveSeen(agentName, seenRef.current)

        if (finding.type === 'progress' || finding.type === 'category-complete' || finding.type === 'batch-complete' || finding.type === 'batch-error') {
          setChatMessages(prev => [...prev, { role: 'agent', content: finding.text! }])
        }
      }
    } catch {}
  }, [agentName, setChatMessages])

  useEffect(() => {
    const interval = setInterval(pollDirectives, 10_000)
    return () => clearInterval(interval)
  }, [pollDirectives])
}
