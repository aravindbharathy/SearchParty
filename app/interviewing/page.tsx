'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useAgentWelcome } from '../hooks/use-agent-welcome'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
import { AgentProgress } from '../_components/agent-progress'
import { MarkdownView } from '../_components/markdown-view'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Interview {
  id: string
  company: string
  role: string
  round: string
  date: string
  time: string
  format: string
  interviewer: string
  prep_status: 'not-started' | 'in-progress' | 'ready'
  prep_file?: string
  notes: string
  status: 'upcoming' | 'completed' | 'cancelled'
}

interface HistoryEntry {
  company?: string
  role?: string
  round?: string
  date?: string
  type?: string
  overall_score?: number
  strengths?: string[]
  weaknesses?: string[]
}

interface Patterns {
  strong_areas: string[]
  weak_areas: string[]
  avg_score: number
  total_interviews: number
}

interface PrepPackage {
  filename: string
  title: string
  content: string
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
}

type TabKey = 'upcoming' | 'prep' | 'history' | 'mock'

// ─── Constants ──────────────────────────────────────────────────────────────

const INTERVIEW_DIRECTIVE = `You are the user's interview specialist. Read search/context/interview-history.yaml, search/context/experience-library.yaml, search/context/interview-answers.yaml, search/context/career-plan.yaml, and search/pipeline/open-roles.yaml for context. Open roles tells you which companies have active opportunities and their JD score reports — use score_file for interview prep focus areas.

IMPORTANT: If experience-library.yaml is empty (no experiences), DO NOT proceed with interview prep. Instead:
1. Tell them: "Your experience library isn't set up yet. I need your STAR stories and work history to prepare interview answers. Head to the Job Search Coach to complete your profile first."
2. Post a user-action directive (NOT a finding — a DIRECTIVE):
   Step A: read_blackboard. Step B: Get "directives" array. Step C: write_to_blackboard path "directives" = existing + {"id":"dir-ua-interview","type":"user_action","text":"Your experience is needed for interview prep","button_label":"Complete Background","route":"/coach","chat_message":"I need to complete my background for interview prep.","assigned_to":"coach","from":"interview","priority":"high","status":"pending","posted_at":"<ISO>"}

If context is available, greet the user briefly and ask what they'd like help with. You can help with: interview prep, mock interviews, debriefs, and thank-you notes.`

// ─── Component ──────────────────────────────────────────────────────────────

export default function InterviewingPage() {
  // ─── Tab state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'upcoming'
    try { const s = localStorage.getItem('interviewing-active-tab') as TabKey; if (s) return s } catch {}
    return 'upcoming'
  })

  // ─── Data state ──────────────────────────────────────────────────────────
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [patterns, setPatterns] = useState<Patterns>({ strong_areas: [], weak_areas: [], avg_score: 0, total_interviews: 0 })
  const [prepPackages, setPrepPackages] = useState<PrepPackage[]>([])
  const [selectedPrep, setSelectedPrep] = useState<PrepPackage | null>(null)

  // Add interview form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newRound, setNewRound] = useState('phone-screen')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newFormat, setNewFormat] = useState('video')
  const [newInterviewer, setNewInterviewer] = useState('')

  // Applications in interview stages (for scheduling prompt)
  const [unscheduledApps, setUnscheduledApps] = useState<Array<{ company: string; role: string; status: string }>>([])
  const [allApps, setAllApps] = useState<Array<{ company: string; role: string; status: string }>>([])

  // ─── Chat state ──────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('interviewing-chat-messages')
      if (saved) setChatMessages(JSON.parse(saved))
    } catch {}
  }, [])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('interviewing-chat')
  const chatProcessing = agentStatus === 'running'

  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('interview')

  useAgentWelcome('interview', 'I\'m your interview specialist. I can help with prep packages, mock interviews, debriefs, and thank-you notes.\n\nWhat would you like to prepare for?', chatMessages, setChatMessages, 'interviewing-chat-messages')

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadInterviews = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/interviews')
      if (res.ok) {
        const data = await res.json() as { interviews: Interview[] }
        setInterviews(data.interviews)
      }
    } catch {}
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/context/interview-history')
      if (res.ok) {
        const data = await res.json()
        setHistory(Array.isArray(data?.interviews) ? data.interviews : [])
        if (data?.patterns) setPatterns(data.patterns)
      }
    } catch {}
  }, [])

  const loadPrepPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/prep-packages')
      if (res.ok) {
        const data = await res.json() as { packages: PrepPackage[] }
        setPrepPackages(data.packages)
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadInterviews()
    loadHistory()
    loadPrepPackages()

    // Check for applications in interview stages without scheduled interviews
    const checkUnscheduled = async () => {
      try {
        const [appsRes, intRes] = await Promise.all([
          fetch('/api/pipeline/applications').then(r => r.ok ? r.json() : { applications: [] }),
          fetch('/api/pipeline/interviews').then(r => r.ok ? r.json() : { interviews: [] }),
        ])
        const apps = (appsRes.applications || []) as Array<{ company: string; role: string; status: string }>
        setAllApps(apps.filter(a => a.status !== 'rejected' && a.status !== 'withdrawn'))
        const ints = (intRes.interviews || []) as Array<{ company: string; status: string }>
        const scheduledCompanies = new Set(ints.filter(i => i.status === 'upcoming').map(i => i.company.toLowerCase()))
        const unscheduled = apps.filter(a =>
          (a.status === 'phone-screen' || a.status === 'onsite') &&
          !scheduledCompanies.has(a.company.toLowerCase())
        )
        setUnscheduledApps(unscheduled)
      } catch {}
    }
    checkUnscheduled()

    const interval = setInterval(() => {
      loadInterviews()
      loadHistory()
      loadPrepPackages()
    }, 30_000)
    return () => clearInterval(interval)
  }, [loadInterviews, loadHistory, loadPrepPackages])

  // ─── Persistence ─────────────────────────────────────────────────────────

  useEffect(() => { try { localStorage.setItem('interviewing-active-tab', activeTab) } catch {} }, [activeTab])
  useEffect(() => {
    if (chatMessages.length > 0) {
      try { localStorage.setItem('interviewing-chat-messages', JSON.stringify(chatMessages)) } catch {}
    }
  }, [chatMessages])

  // ─── Chat logic ──────────────────────────────────────────────────────────

  const scrollChatToBottom = useCallback(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [])

  useEffect(() => { scrollChatToBottom() }, [chatMessages.length, scrollChatToBottom])

  useEffect(() => {
    if (agentStatus === 'completed' && agentOutput) {
      setChatMessages(prev => [...prev, { role: 'agent', content: agentOutput }])
      agentReset()
      loadInterviews()
      loadHistory()
      loadPrepPackages()
    }
    if (agentStatus === 'failed') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Something went wrong. Please try again.' }])
      agentReset()
    }
    if (agentStatus === 'timeout') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Request timed out. Please try again.' }])
      agentReset()
    }
  }, [agentStatus, agentOutput, agentReset, loadInterviews, loadHistory, loadPrepPackages])

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatProcessing) return
    setChatMessages(prev => [...prev, { role: 'user', content: text.trim() }])
    setChatInput('')

    try {
      const result = await spawnAgent('interview', {
        skill: 'interview-chat',
        entry_name: 'interview-followup',
        text: text.trim(),
      })
      if (result === null) {
        setChatMessages(prev => [...prev, { role: 'agent', content: 'The agent is still processing. Please wait.' }])
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to reach agent.' }])
    }
  }, [agentStatus, spawnAgent])

  usePendingAction(sendChatMessage, setActiveTab as (tab: string) => void)

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleAddInterview = async () => {
    if (!newCompany.trim() || !newDate) return
    await fetch('/api/pipeline/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: newCompany, role: newRole, round: newRound, date: newDate, time: newTime, format: newFormat, interviewer: newInterviewer }),
    })
    setShowAddForm(false)
    setNewCompany(''); setNewRole(''); setNewRound('phone-screen'); setNewDate(''); setNewTime(''); setNewFormat('video'); setNewInterviewer('')
    loadInterviews()
  }

  const handlePrepFor = (interview: Interview) => {
    sendChatMessage(
      `Run this command first: cat .claude/skills/interview-prep/SKILL.md — then follow its instructions to create a prep package for my ${interview.round} interview at ${interview.company} for the ${interview.role} role.`
    )
  }

  const handleMock = (roundType: string) => {
    setActiveTab('mock')
    sendChatMessage(
      `Run this command first: cat .claude/skills/mock-interview/SKILL.md — then conduct a mock ${roundType} interview. Ask questions one at a time and score my answers.`
    )
  }

  const handleDebrief = () => {
    sendChatMessage(
      'Run this command first: cat .claude/skills/interview-debrief/SKILL.md — then help me debrief on a recent interview. I\'ll describe what happened.'
    )
  }

  // ─── Computed ────────────────────────────────────────────────────────────

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return interviews.filter(i => i.status === 'upcoming' && i.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  }, [interviews])

  const stats = useMemo(() => ({
    upcoming: upcoming.length,
    completed: history.length,
    avgScore: patterns.avg_score,
    prepReady: interviews.filter(i => i.prep_status === 'ready').length,
  }), [upcoming, history, patterns, interviews])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ─── Left Panel: Tabs (65%) ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold mb-3">Interviewing</h1>
          <div className="flex gap-3">
            {[
              { label: 'Upcoming', value: stats.upcoming },
              { label: 'Completed', value: stats.completed },
              { label: 'Avg Score', value: stats.avgScore > 0 ? `${stats.avgScore}/10` : '—' },
              { label: 'Prep Ready', value: stats.prepReady },
              { label: 'Strong', value: patterns.strong_areas.length > 0 ? patterns.strong_areas[0] : '—' },
              { label: 'Improve', value: patterns.weak_areas.length > 0 ? patterns.weak_areas[0] : '—' },
            ].map(s => (
              <div key={s.label} className="flex-1 bg-surface border border-border rounded-lg px-3 py-2">
                <div className="text-xs text-text-muted">{s.label}</div>
                <div className="text-base font-bold truncate">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-6 border-b border-border px-5">
          {([
            { key: 'upcoming' as TabKey, label: `Upcoming${upcoming.length > 0 ? ` (${upcoming.length})` : ''}` },
            { key: 'prep' as TabKey, label: `Prep${prepPackages.length > 0 ? ` (${prepPackages.length})` : ''}` },
            { key: 'history' as TabKey, label: `Debrief${history.length > 0 ? ` (${history.length})` : ''}` },
            { key: 'mock' as TabKey, label: 'Mock' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.key ? 'text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DirectiveBanner
            notifications={notifications}
            onDismiss={dismissNotification}
            onDismissAll={dismissAllNotifications}
            onDiscuss={sendChatMessage}
          />

          {/* ─── Upcoming Tab ──────────────────────────────────── */}
          {activeTab === 'upcoming' && (
            <div>
              {/* Unscheduled interview prompts */}
              {unscheduledApps.length > 0 && (
                <div className="mb-4 space-y-2">
                  {unscheduledApps.map((app, i) => (
                    <div key={i} className="bg-accent/5 border border-accent/20 rounded-lg px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{app.company} — {app.role}</p>
                        <p className="text-xs text-accent">{app.status === 'phone-screen' ? 'Phone screen' : 'Onsite'} stage — no interview scheduled yet</p>
                      </div>
                      <button onClick={() => {
                        setNewCompany(app.company)
                        setNewRole(app.role)
                        setNewRound(app.status === 'phone-screen' ? 'phone-screen' : 'onsite')
                        setShowAddForm(true)
                      }} className="text-xs px-3 py-1.5 bg-accent text-white rounded-md hover:bg-accent-hover shrink-0">
                        Schedule
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Scheduled Interviews</h2>
                <button onClick={() => setShowAddForm(!showAddForm)} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
                  + Add Interview
                </button>
              </div>

              {showAddForm && (
                <div className="bg-surface border border-border rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
                  {allApps.length > 0 ? (
                    <select value={`${newCompany}|||${newRole}`} onChange={e => {
                      const [c, r] = e.target.value.split('|||')
                      setNewCompany(c || ''); setNewRole(r || '')
                    }} className="col-span-2 px-3 py-2 border border-border rounded-md bg-bg text-sm">
                      <option value="|||">Select an application...</option>
                      {allApps.map((a, i) => (
                        <option key={i} value={`${a.company}|||${a.role}`}>{a.company} — {a.role} ({a.status})</option>
                      ))}
                      <option value="__custom|||">Other (type manually)</option>
                    </select>
                  ) : (
                    <>
                      <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company *" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                      <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Role" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                    </>
                  )}
                  {newCompany === '__custom' && (
                    <>
                      <input value="" onChange={e => setNewCompany(e.target.value)} placeholder="Company *" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                      <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Role" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                    </>
                  )}
                  <select value={newRound} onChange={e => setNewRound(e.target.value)} className="px-3 py-2 border border-border rounded-md bg-bg text-sm">
                    <option value="phone-screen">Phone Screen</option>
                    <option value="technical">Technical</option>
                    <option value="behavioral">Behavioral</option>
                    <option value="system-design">System Design</option>
                    <option value="onsite">Onsite</option>
                    <option value="hiring-manager">Hiring Manager</option>
                    <option value="cross-functional">Cross-Functional</option>
                  </select>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <input value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="Time (e.g., 2:00 PM)" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <select value={newFormat} onChange={e => setNewFormat(e.target.value)} className="px-3 py-2 border border-border rounded-md bg-bg text-sm">
                    <option value="video">Video</option>
                    <option value="phone">Phone</option>
                    <option value="in-person">In Person</option>
                  </select>
                  <input value={newInterviewer} onChange={e => setNewInterviewer(e.target.value)} placeholder="Interviewer name(s)" className="col-span-2 px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <div className="col-span-2 flex gap-2">
                    <button onClick={handleAddInterview} disabled={!newCompany.trim() || !newDate} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Add</button>
                    <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-text-muted text-sm hover:text-text">Cancel</button>
                  </div>
                </div>
              )}

              {upcoming.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No upcoming interviews.</p>
                  <p className="text-text-muted text-sm">Add an interview above, or they&apos;ll appear when you advance applications to interview stages.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(interview => {
                    const matchingPrep = prepPackages.find(p => p.filename.toLowerCase().includes(interview.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')))
                    const hasPrep = interview.prep_status === 'ready' || !!matchingPrep
                    return (
                    <div key={interview.id} className="p-4 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">{interview.company}</span>
                          <span className="text-text-muted text-sm ml-2">{interview.role}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          hasPrep ? 'bg-success/10 text-success' :
                          interview.prep_status === 'in-progress' ? 'bg-warning/10 text-warning' :
                          'bg-text-muted/10 text-text-muted'
                        }`}>
                          {hasPrep ? 'Prep Ready' : interview.prep_status === 'in-progress' ? 'Prepping...' : 'No Prep'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted mb-3">
                        <span>{interview.date}{interview.time ? ` at ${interview.time}` : ''}</span>
                        <span className="capitalize">{interview.round.replace('-', ' ')}</span>
                        <span className="capitalize">{interview.format}</span>
                        {interview.interviewer && <span>with {interview.interviewer}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {matchingPrep ? (
                          <button onClick={() => setSelectedPrep(matchingPrep)} className="text-xs text-accent hover:text-accent-hover font-medium">
                            View Prep
                          </button>
                        ) : (
                          <button onClick={() => handlePrepFor(interview)} disabled={chatProcessing} className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">
                            Prep for This
                          </button>
                        )}
                        <button onClick={() => handleMock(interview.round)} disabled={chatProcessing} className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">
                          Mock Interview
                        </button>
                        <button onClick={async () => {
                          await fetch('/api/pipeline/interviews', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: interview.id, field: 'status', value: 'completed' }) })
                          loadInterviews()
                          handleDebrief()
                        }} className="text-xs text-text-muted hover:text-accent font-medium">
                          Complete + Debrief
                        </button>
                        <button onClick={async () => {
                          const date = prompt('Update date (YYYY-MM-DD):', interview.date)
                          if (date === null) return
                          const time = prompt('Update time:', interview.time || '')
                          const interviewer = prompt('Interviewer name(s):', interview.interviewer || '')
                          const updates = [
                            { field: 'date', value: date.trim() || interview.date },
                            { field: 'time', value: time?.trim() || interview.time },
                            { field: 'interviewer', value: interviewer?.trim() || interview.interviewer },
                          ]
                          for (const u of updates) {
                            await fetch('/api/pipeline/interviews', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: interview.id, ...u }) })
                          }
                          loadInterviews()
                        }} className="text-xs text-text-muted hover:text-text ml-auto">
                          Edit
                        </button>
                        <button onClick={async () => {
                          if (!confirm(`Cancel interview at ${interview.company}?`)) return
                          await fetch('/api/pipeline/interviews', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: interview.id }) })
                          loadInterviews()
                        }} className="text-xs text-text-muted hover:text-danger">
                          Remove
                        </button>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}

          {/* ─── Prep Tab ──────────────────────────────────────── */}
          {activeTab === 'prep' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Prep Packages</h2>
                <button
                  onClick={() => sendChatMessage('Run this command first: cat .claude/skills/interview-prep/SKILL.md — then help me create a prep package. Ask me which company and interview round to prepare for.')}
                  disabled={chatProcessing}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  Create Prep Package
                </button>
              </div>
              {prepPackages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No prep packages yet.</p>
                  <p className="text-text-muted text-sm">Click &quot;Create Prep Package&quot; above, or use &quot;Prep for This&quot; on an upcoming interview.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {prepPackages.map(pkg => (
                    <div key={pkg.filename} className="p-4 border border-border rounded-lg">
                      <p className="font-medium text-sm">{pkg.title}</p>
                      <p className="text-xs text-text-muted mt-1">{pkg.filename}</p>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => setSelectedPrep(pkg)}
                          className="text-xs text-accent hover:text-accent-hover font-medium">View</button>
                        <button onClick={() => sendChatMessage(`Let's discuss this prep package: ${pkg.title}`)} disabled={chatProcessing}
                          className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">Discuss</button>
                        <button onClick={() => navigator.clipboard.writeText(pkg.content)}
                          className="text-xs text-text-muted hover:text-text">Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── History Tab ───────────────────────────────────── */}
          {activeTab === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Interview History</h2>
                <div className="flex items-center gap-2">
                  <label className="px-4 py-2 border border-border text-text-muted rounded-md text-sm font-medium hover:bg-bg hover:text-text cursor-pointer transition-colors">
                    Upload Transcript
                    <input type="file" accept=".txt,.md,.pdf,.docx" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const formData = new FormData()
                      formData.append('file', file)
                      formData.append('subfolder', 'uploads/transcripts')
                      try {
                        const res = await fetch('/api/vault/upload', { method: 'POST', body: formData })
                        if (res.ok) {
                          sendChatMessage(`Run this command first: cat .claude/skills/interview-debrief/SKILL.md — then debrief the interview using the transcript I just uploaded: search/vault/uploads/transcripts/${file.name}`)
                        }
                      } catch {}
                      e.target.value = ''
                    }} />
                  </label>
                  <button onClick={handleDebrief} disabled={chatProcessing}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                    Debrief an Interview
                  </button>
                </div>
              </div>
              {patterns.total_interviews > 0 && (
                <div className="bg-surface border border-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold mb-2">Patterns</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-text-muted">Strong:</span> <span className="text-success">{patterns.strong_areas.join(', ') || 'None yet'}</span></div>
                    <div><span className="text-text-muted">Improve:</span> <span className="text-warning">{patterns.weak_areas.join(', ') || 'None yet'}</span></div>
                    <div><span className="text-text-muted">Avg Score:</span> <span className="font-medium">{patterns.avg_score}/10</span></div>
                    <div><span className="text-text-muted">Total:</span> <span className="font-medium">{patterns.total_interviews} interviews</span></div>
                  </div>
                </div>
              )}

              {history.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No interview history yet.</p>
                  <p className="text-text-muted text-sm">Complete interviews and debrief to build your history and identify patterns.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((entry, i) => (
                    <div key={i} className="p-3 border border-border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">{entry.company}</span>
                          <span className="text-text-muted text-xs ml-2">{entry.role}</span>
                          {entry.round && <span className="text-text-muted text-xs ml-2 capitalize">({entry.round})</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.overall_score != null && (
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              entry.overall_score >= 7 ? 'bg-success/10 text-success' : entry.overall_score >= 5 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                            }`}>{entry.overall_score}/10</span>
                          )}
                          <span className="text-xs text-text-muted">{entry.date}</span>
                        </div>
                      </div>
                      {(entry.strengths?.length || entry.weaknesses?.length) ? (
                        <div className="flex gap-4 mt-2 text-xs">
                          {entry.strengths && entry.strengths.length > 0 && <span className="text-success">+ {entry.strengths.join(', ')}</span>}
                          {entry.weaknesses && entry.weaknesses.length > 0 && <span className="text-warning">- {entry.weaknesses.join(', ')}</span>}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Mock Tab ──────────────────────────────────────── */}
          {activeTab === 'mock' && (
            <div>
              <p className="text-text-muted text-sm mb-4">Choose a round type to start a mock interview. The agent will ask questions one at a time and score your answers.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: 'behavioral', label: 'Behavioral', desc: 'STAR stories, leadership, conflict resolution' },
                  { type: 'technical', label: 'Technical', desc: 'Role-specific technical questions and scenarios' },
                  { type: 'system-design', label: 'System Design', desc: 'Architecture, trade-offs, scaling decisions' },
                  { type: 'cross-functional', label: 'Cross-Functional', desc: 'Stakeholder management, collaboration' },
                ].map(opt => (
                  <button key={opt.type} onClick={() => handleMock(opt.type)} disabled={chatProcessing}
                    className="text-left p-4 border border-border rounded-lg hover:bg-bg hover:border-accent/30 transition-colors disabled:opacity-50">
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-text-muted mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <button onClick={handleDebrief} disabled={chatProcessing}
                  className="px-4 py-2 border border-border rounded-md text-sm text-text-muted hover:text-text hover:bg-bg disabled:opacity-50">
                  Debrief a Recent Interview
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Prep Package Overlay */}
        {selectedPrep && (
          <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex" onClick={() => setSelectedPrep(null)}>
            <div className="w-full max-w-3xl mx-auto bg-surface border-x border-border shadow-lg flex flex-col h-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <h3 className="font-semibold">{selectedPrep.title}</h3>
                <button onClick={() => setSelectedPrep(null)} className="p-1.5 rounded-md hover:bg-bg text-text-muted hover:text-text transition-colors" aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg/50 shrink-0">
                <button onClick={() => sendChatMessage(`Let's discuss this prep: ${selectedPrep.title}`)} disabled={chatProcessing}
                  className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg disabled:opacity-50">
                  Discuss with Agent
                </button>
                <button onClick={() => navigator.clipboard.writeText(selectedPrep.content)}
                  className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">
                  Copy All
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <MarkdownView content={selectedPrep.content} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Right Panel: Agent Chat (35%) ─────────────────────────── */}
      <div className="w-[35%] flex flex-col bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${chatProcessing ? 'bg-accent animate-pulse' : 'bg-success'}`} />
            <span className="text-sm font-semibold">Interview Agent</span>
          </div>
          <a href="/command-center" className="text-xs text-text-muted hover:text-text">Manage</a>
        </div>

        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-lg px-3.5 py-2.5 ${
                msg.role === 'user' ? 'bg-accent/10 text-text' : 'bg-bg text-text'
              }`}>
                {msg.role === 'agent' ? (
                  <MarkdownView content={msg.content} className="text-sm" />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {chatProcessing && (
            <div className="flex justify-start">
              <div className="max-w-[90%]">
                <AgentProgress agentName="Interview agent" lastMessage={chatMessages.filter(m => m.role === 'user').at(-1)?.content} />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput) } }}
            placeholder="Ask the interview agent..."
            disabled={chatProcessing}
            className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          />
          <button onClick={() => sendChatMessage(chatInput)} disabled={!chatInput.trim() || chatProcessing}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
