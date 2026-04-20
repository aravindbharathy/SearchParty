'use client'

import { useState, useEffect, useMemo } from 'react'

const SKILL_STEPS: Record<string, { label: string; steps: string[]; estimate: string }> = {
  'resume-tailor': {
    label: 'Tailoring resume',
    steps: ['Reading experience library', 'Analyzing JD requirements', 'Selecting relevant experience', 'Writing resume sections', 'Running recruiter review', 'Running ATS check'],
    estimate: '2-4 min',
  },
  'cover-letter': {
    label: 'Writing cover letter',
    steps: ['Reading JD and company intel', 'Mapping top experiences', 'Writing personalized letter', 'Reviewing against style guide'],
    estimate: '1-2 min',
  },
  'interview-prep': {
    label: 'Building prep package',
    steps: ['Researching company', 'Analyzing role requirements', 'Preparing likely questions', 'Building STAR answers', 'Creating study notes'],
    estimate: '2-4 min',
  },
  'score-jd': {
    label: 'Scoring JD',
    steps: ['Extracting JD requirements', 'Matching against experience', 'Calculating fit score', 'Checking legitimacy', 'Writing report'],
    estimate: '2-3 min',
  },
  'company-research': {
    label: 'Researching company',
    steps: ['Searching web for company info', 'Analyzing culture and values', 'Checking interview process', 'Gathering comp data', 'Writing intel file'],
    estimate: '2-3 min',
  },
  'salary-research': {
    label: 'Researching salary',
    steps: ['Searching Levels.fyi', 'Checking Glassdoor', 'Analyzing market data', 'Writing comp analysis'],
    estimate: '1-2 min',
  },
  'connection-request': {
    label: 'Generating outreach',
    steps: ['Reading target companies', 'Personalizing messages', 'Applying style guide'],
    estimate: '1-2 min',
  },
  'linkedin-audit': {
    label: 'Auditing LinkedIn profile',
    steps: ['Analyzing current profile', 'Comparing against target JDs', 'Writing recommendations'],
    estimate: '2-3 min',
  },
  'negotiate': {
    label: 'Building negotiation strategy',
    steps: ['Analyzing offer details', 'Researching market comp', 'Identifying leverage points', 'Drafting counter-offer language'],
    estimate: '2-3 min',
  },
}

function detectSkill(lastMessage: string): string | null {
  if (!lastMessage) return null
  const lower = lastMessage.toLowerCase()
  for (const skill of Object.keys(SKILL_STEPS)) {
    if (lower.includes(skill.replace(/-/g, ''))) return skill
    if (lower.includes(skill)) return skill
  }
  // Fuzzy matches
  if (lower.includes('resume-tailor') || lower.includes('tailor a resume')) return 'resume-tailor'
  if (lower.includes('cover-letter') || lower.includes('cover letter')) return 'cover-letter'
  if (lower.includes('interview-prep') || lower.includes('prep package')) return 'interview-prep'
  if (lower.includes('score-jd') || lower.includes('score this jd') || lower.includes('score the jd')) return 'score-jd'
  if (lower.includes('company-research') || lower.includes('research') && lower.includes('company')) return 'company-research'
  if (lower.includes('salary-research') || lower.includes('salary')) return 'salary-research'
  if (lower.includes('connection-request') || lower.includes('connection request')) return 'connection-request'
  if (lower.includes('linkedin-audit') || lower.includes('linkedin')) return 'linkedin-audit'
  if (lower.includes('negotiate') || lower.includes('negotiation')) return 'negotiate'
  return null
}

export function AgentProgress({ agentName, lastMessage, spawnId }: { agentName: string; lastMessage?: string; spawnId?: string | null }) {
  // Compute elapsed from spawn timestamp if available, otherwise from mount
  const startTime = useMemo(() => {
    if (spawnId) {
      const ts = parseInt(spawnId.split('_')[1] || '0', 10)
      if (ts > 0) return ts
    }
    return Date.now()
  }, [spawnId])

  const [stepIdx, setStepIdx] = useState(0)
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startTime) / 1000))

  const skill = detectSkill(lastMessage || '')
  const info = skill ? SKILL_STEPS[skill] : null

  useEffect(() => {
    setStepIdx(0)
    setElapsed(Math.floor((Date.now() - startTime) / 1000))
  }, [lastMessage, startTime])

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [startTime])

  // Derive step from elapsed time — ~15 seconds per step
  useEffect(() => {
    if (!info) return
    const step = Math.min(Math.floor(elapsed / 15), info.steps.length - 1)
    if (step !== stepIdx) setStepIdx(step)
  }, [elapsed, info, stepIdx])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`
  }

  if (info) {
    return (
      <div className="flex items-start gap-3 px-3.5 py-2.5 bg-bg rounded-lg">
        <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">{info.label}...</p>
            <span className="text-xs text-text-muted shrink-0">{formatTime(elapsed)} / ~{info.estimate}</span>
          </div>
          <p className="text-xs text-text-muted/70 mt-0.5">{info.steps[stepIdx]}</p>
          <div className="flex gap-0.5 mt-1.5">
            {info.steps.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= stepIdx ? 'bg-accent/40' : 'bg-border'}`} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 bg-bg rounded-lg">
      <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-text-muted">{agentName} is thinking...</span>
      <span className="text-xs text-text-muted ml-auto">{formatTime(elapsed)}</span>
    </div>
  )
}
