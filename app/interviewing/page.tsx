'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
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

const INTERVIEW_DIRECTIVE = `You are the user's interview specialist. Read search/context/interview-history.yaml, search/context/experience-library.yaml, search/context/qa-master.yaml, and search/context/career-plan.yaml for context.

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
    try { return (localStorage.getItem('interviewing-active-tab') as TabKey) || 'upcoming' } catch { return 'upcoming' }
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

  // ─── Chat state ──────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('interviewing-chat-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [chatInput, setChatInput] = useState('')
  const hasSpawnedRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('interviewing-chat')
  const chatProcessing = agentStatus === 'running'

  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('interview')

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
    if (hasSpawnedRef.current) return
    hasSpawnedRef.current = true
    if (chatMessages.length > 0) return

    let cancelled = false
    const waitAndSpawn = async () => {
      for (let i = 0; i < 5; i++) {
        try {
          const res = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
          if (res.ok) break
        } catch {}
        await new Promise(r => setTimeout(r, 1000))
      }
      if (cancelled) return
      spawnAgent('interview', {
        skill: 'interview-chat',
        entry_name: 'interview-session',
        text: INTERVIEW_DIRECTIVE,
      })
    }
    waitAndSpawn()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div className="flex h-[calc(100vh-64px)]">
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
            { key: 'history' as TabKey, label: `History${history.length > 0 ? ` (${history.length})` : ''}` },
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Scheduled Interviews</h2>
                <button onClick={() => setShowAddForm(!showAddForm)} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
                  + Add Interview
                </button>
              </div>

              {showAddForm && (
                <div className="bg-surface border border-border rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
                  <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company *" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Role" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
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
                  {upcoming.map(interview => (
                    <div key={interview.id} className="p-4 border border-border rounded-lg bg-surface">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">{interview.company}</span>
                          <span className="text-text-muted text-sm ml-2">{interview.role}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          interview.prep_status === 'ready' ? 'bg-success/10 text-success' :
                          interview.prep_status === 'in-progress' ? 'bg-warning/10 text-warning' :
                          'bg-text-muted/10 text-text-muted'
                        }`}>
                          {interview.prep_status === 'ready' ? 'Prep Ready' : interview.prep_status === 'in-progress' ? 'Prepping...' : 'No Prep'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted mb-3">
                        <span>{interview.date}{interview.time ? ` at ${interview.time}` : ''}</span>
                        <span className="capitalize">{interview.round.replace('-', ' ')}</span>
                        <span className="capitalize">{interview.format}</span>
                        {interview.interviewer && <span>with {interview.interviewer}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handlePrepFor(interview)} disabled={chatProcessing} className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">
                          Prep for This
                        </button>
                        <button onClick={() => handleMock(interview.round)} disabled={chatProcessing} className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">
                          Mock Interview
                        </button>
                        <button onClick={async () => {
                          await fetch('/api/pipeline/interviews', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: interview.id, field: 'status', value: 'completed' }) })
                          loadInterviews()
                          handleDebrief()
                        }} className="text-xs text-text-muted hover:text-accent font-medium ml-auto">
                          Mark Complete + Debrief
                        </button>
                      </div>
                    </div>
                  ))}
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
                    <button key={pkg.filename} onClick={() => setSelectedPrep(selectedPrep?.filename === pkg.filename ? null : pkg)}
                      className={`text-left p-4 border rounded-lg transition-colors ${
                        selectedPrep?.filename === pkg.filename ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'
                      }`}>
                      <p className="font-medium text-sm">{pkg.title}</p>
                      <p className="text-xs text-text-muted mt-1">{pkg.filename}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedPrep && (
                <div className="mt-4 bg-surface border border-border rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{selectedPrep.title}</h3>
                    <button onClick={() => setSelectedPrep(null)} className="text-xs text-text-muted hover:text-text">Close</button>
                  </div>
                  <div className="bg-bg p-4 rounded-md border border-border overflow-auto max-h-[60vh]">
                    <MarkdownView content={selectedPrep.content} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── History Tab ───────────────────────────────────── */}
          {activeTab === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Interview History</h2>
                <button onClick={handleDebrief} disabled={chatProcessing}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                  Debrief an Interview
                </button>
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
      </div>

      {/* ─── Right Panel: Agent Chat (35%) ─────────────────────────── */}
      <div className="w-[35%] flex flex-col bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${chatProcessing ? 'bg-accent animate-pulse' : 'bg-success'}`} />
            <span className="text-sm font-semibold">Interview Agent</span>
          </div>
          <button onClick={() => {
            setChatMessages([])
            localStorage.removeItem('interviewing-chat-messages')
            localStorage.removeItem('agent-spawn-interviewing-chat')
            hasSpawnedRef.current = false
            fetch('/api/agent/rotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: 'interview' }) }).catch(() => {})
          }} className="text-xs text-text-muted hover:text-text">Reset</button>
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
              <div className="bg-bg rounded-lg px-3.5 py-2.5 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Interview agent is thinking...</span>
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
