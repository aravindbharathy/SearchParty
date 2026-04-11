'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
import { MarkdownView } from '../_components/markdown-view'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Offer {
  id: string
  company: string
  role: string
  level: string
  base: number
  equity: string
  equity_annual: number
  bonus_target: string
  sign_on: number
  total_year1: number
  total_steady: number
  location: string
  remote: string
  deadline: string
  status: 'pending' | 'negotiating' | 'accepted' | 'declined' | 'expired'
  notes: string
  received_date: string
}

interface ResearchDoc {
  filename: string
  title: string
  content: string
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
}

type TabKey = 'offers' | 'salary-research' | 'negotiation'

// ─── Constants ──────────────────────────────────────────────────────────────

const NEGOTIATION_DIRECTIVE = `You are the user's negotiation specialist. Read search/context/career-plan.yaml, search/pipeline/offers.yaml, and any salary research files in search/output/ for context.

IMPORTANT: If career-plan.yaml is empty (no comp floor or target level), DO NOT proceed. Instead:
1. Tell them: "Your career plan isn't set up yet. I need your target comp and level to contextualize salary research. Head to the Job Search Coach to complete your profile first."
2. Post a user-action directive (NOT a finding — a DIRECTIVE):
   Step A: read_blackboard. Step B: Get "directives" array. Step C: write_to_blackboard path "directives" = existing + {"id":"dir-ua-negotiate","type":"user_action","text":"Your career plan is needed for salary research","button_label":"Complete Career Plan","route":"/coach","chat_message":"I need to complete my career plan for salary negotiation.","assigned_to":"coach","from":"negotiation","priority":"high","status":"pending","posted_at":"<ISO>"}

If context is available, greet the user briefly. You can help with: researching salaries for specific companies, analyzing offers, building negotiation strategies, comparing multiple offers, and drafting counter-offer language.`

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-warning/10 text-warning' },
  negotiating: { label: 'Negotiating', color: 'bg-accent/10 text-accent' },
  accepted: { label: 'Accepted', color: 'bg-success/10 text-success' },
  declined: { label: 'Declined', color: 'bg-text-muted/10 text-text-muted' },
  expired: { label: 'Expired', color: 'bg-danger/10 text-danger' },
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ClosingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'offers'
    try { return (localStorage.getItem('closing-active-tab') as TabKey) || 'offers' } catch { return 'offers' }
  })

  // Data
  const [offers, setOffers] = useState<Offer[]>([])
  const [salaryDocs, setSalaryDocs] = useState<ResearchDoc[]>([])
  const [negotiationDocs, setNegotiationDocs] = useState<ResearchDoc[]>([])
  const [selectedDoc, setSelectedDoc] = useState<ResearchDoc | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newBase, setNewBase] = useState('')
  const [newEquity, setNewEquity] = useState('')
  const [newDeadline, setNewDeadline] = useState('')

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('closing-chat-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [chatInput, setChatInput] = useState('')
  const hasSpawnedRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('closing-chat')
  const chatProcessing = agentStatus === 'running'
  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('negotiation')

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadOffers = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/offers')
      if (res.ok) {
        const data = await res.json() as { offers: Offer[] }
        setOffers(data.offers)
      }
    } catch {}
  }, [])

  const loadDocs = useCallback(async () => {
    try {
      // Load salary research and negotiation docs from output/
      const res = await fetch('/api/vault/read-file?path=output/')
      // Since we can't list output/ directly, search for files
      const salaryFiles: ResearchDoc[] = []
      const negoFiles: ResearchDoc[] = []

      // Try known patterns
      for (const prefix of ['salary-research', 'negotiation']) {
        try {
          const scanRes = await fetch(`/api/vault/scan?dir=output`)
          if (scanRes.ok) {
            const data = await scanRes.json() as { files?: string[] }
            for (const f of data.files || []) {
              if (!f.endsWith('.md')) continue
              try {
                const r = await fetch(`/api/vault/read-file?path=output/${f}`)
                if (r.ok) {
                  const d = await r.json() as { content: string }
                  const titleMatch = d.content.match(/^#\s+(.+)/m)
                  const doc = { filename: f, title: titleMatch?.[1] || f, content: d.content }
                  if (f.startsWith('salary-research')) salaryFiles.push(doc)
                  else if (f.startsWith('negotiation')) negoFiles.push(doc)
                }
              } catch {}
            }
          }
        } catch {}
        break // only need one scan
      }
      setSalaryDocs(salaryFiles)
      setNegotiationDocs(negoFiles)
    } catch {}
  }, [])

  useEffect(() => {
    loadOffers()
    loadDocs()
    const interval = setInterval(() => { loadOffers(); loadDocs() }, 30_000)
    return () => clearInterval(interval)
  }, [loadOffers, loadDocs])

  // Persistence
  useEffect(() => { try { localStorage.setItem('closing-active-tab', activeTab) } catch {} }, [activeTab])
  useEffect(() => {
    if (chatMessages.length > 0) {
      try { localStorage.setItem('closing-chat-messages', JSON.stringify(chatMessages)) } catch {}
    }
  }, [chatMessages])

  // Chat logic
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
        try { const r = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) }); if (r.ok) break } catch {}
        await new Promise(r => setTimeout(r, 1000))
      }
      if (cancelled) return
      spawnAgent('negotiation', { skill: 'negotiation-chat', entry_name: 'negotiation-session', text: NEGOTIATION_DIRECTIVE })
    }
    waitAndSpawn()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (agentStatus === 'completed' && agentOutput) {
      setChatMessages(prev => [...prev, { role: 'agent', content: agentOutput }])
      agentReset(); loadOffers(); loadDocs()
    }
    if (agentStatus === 'failed') { setChatMessages(prev => [...prev, { role: 'agent', content: 'Something went wrong.' }]); agentReset() }
    if (agentStatus === 'timeout') { setChatMessages(prev => [...prev, { role: 'agent', content: 'Request timed out.' }]); agentReset() }
  }, [agentStatus, agentOutput, agentReset, loadOffers, loadDocs])

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatProcessing) return
    setChatMessages(prev => [...prev, { role: 'user', content: text.trim() }])
    setChatInput('')
    try {
      const result = await spawnAgent('negotiation', { skill: 'negotiation-chat', entry_name: 'negotiation-followup', text: text.trim() })
      if (result === null) setChatMessages(prev => [...prev, { role: 'agent', content: 'Agent is still processing.' }])
    } catch { setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to reach agent.' }]) }
  }, [agentStatus, spawnAgent])

  usePendingAction(sendChatMessage, setActiveTab as (tab: string) => void)

  // Actions
  const handleAddOffer = async () => {
    if (!newCompany.trim()) return
    await fetch('/api/pipeline/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: newCompany, role: newRole, base: parseInt(newBase) || 0, equity: newEquity, deadline: newDeadline }),
    })
    setShowAddForm(false); setNewCompany(''); setNewRole(''); setNewBase(''); setNewEquity(''); setNewDeadline('')
    loadOffers()
  }

  const stats = useMemo(() => ({
    total: offers.length,
    pending: offers.filter(o => o.status === 'pending' || o.status === 'negotiating').length,
    highest: offers.length > 0 ? Math.max(...offers.map(o => o.total_year1 || o.base || 0)) : 0,
  }), [offers])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold mb-3">Closing</h1>
          <div className="flex gap-3">
            {[
              { label: 'Offers', value: stats.total },
              { label: 'Active', value: stats.pending },
              { label: 'Highest TC', value: stats.highest > 0 ? `$${(stats.highest / 1000).toFixed(0)}K` : '—' },
              { label: 'Research', value: salaryDocs.length },
              { label: 'Strategies', value: negotiationDocs.length },
            ].map(s => (
              <div key={s.label} className="flex-1 bg-surface border border-border rounded-lg px-3 py-2">
                <div className="text-xs text-text-muted">{s.label}</div>
                <div className="text-base font-bold">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-6 border-b border-border px-5">
          {([
            { key: 'offers' as TabKey, label: `Offers${offers.length > 0 ? ` (${offers.length})` : ''}` },
            { key: 'salary-research' as TabKey, label: `Salary Research${salaryDocs.length > 0 ? ` (${salaryDocs.length})` : ''}` },
            { key: 'negotiation' as TabKey, label: `Negotiation${negotiationDocs.length > 0 ? ` (${negotiationDocs.length})` : ''}` },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`pb-2.5 text-sm font-medium transition-colors relative ${activeTab === tab.key ? 'text-text' : 'text-text-muted hover:text-text'}`}>
              {tab.label}
              {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DirectiveBanner notifications={notifications} onDismiss={dismissNotification} onDismissAll={dismissAllNotifications} onDiscuss={sendChatMessage} />

          {/* ─── Offers Tab ────────────────────────────────────── */}
          {activeTab === 'offers' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Received Offers</h2>
                <button onClick={() => setShowAddForm(!showAddForm)} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
                  + Add Offer
                </button>
              </div>

              {showAddForm && (
                <div className="bg-surface border border-border rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
                  <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company *" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Role" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <input value={newBase} onChange={e => setNewBase(e.target.value)} placeholder="Base salary" type="number" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <input value={newEquity} onChange={e => setNewEquity(e.target.value)} placeholder="Equity (e.g., $200K/4yr RSU)" className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <input type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} className="px-3 py-2 border border-border rounded-md bg-bg text-sm" />
                  <div className="flex gap-2">
                    <button onClick={handleAddOffer} disabled={!newCompany.trim()} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Add</button>
                    <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-text-muted text-sm hover:text-text">Cancel</button>
                  </div>
                </div>
              )}

              {offers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No offers yet.</p>
                  <p className="text-text-muted text-sm">When you receive an offer, add it here to track and negotiate.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {offers.map(offer => {
                    const sl = STATUS_LABELS[offer.status] || STATUS_LABELS.pending
                    return (
                      <div key={offer.id} className="p-4 border border-border rounded-lg bg-surface">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-medium">{offer.company}</span>
                            <span className="text-text-muted text-sm ml-2">{offer.role}</span>
                            {offer.level && <span className="text-text-muted text-xs ml-2">({offer.level})</span>}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${sl.color}`}>{sl.label}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                          {offer.base > 0 && <div><span className="text-text-muted text-xs">Base</span><div className="font-medium">${offer.base.toLocaleString()}</div></div>}
                          {offer.equity && <div><span className="text-text-muted text-xs">Equity</span><div className="font-medium">{offer.equity}</div></div>}
                          {offer.total_year1 > 0 && <div><span className="text-text-muted text-xs">Year 1 TC</span><div className="font-bold text-accent">${offer.total_year1.toLocaleString()}</div></div>}
                        </div>
                        {offer.deadline && <p className="text-xs text-text-muted mb-2">Deadline: {offer.deadline}</p>}
                        <div className="flex items-center gap-2">
                          <button onClick={() => sendChatMessage(`Run this command first: cat .claude/skills/negotiate/SKILL.md — then analyze my offer from ${offer.company}: base $${offer.base}, equity ${offer.equity}. Build a negotiation strategy.`)}
                            disabled={chatProcessing} className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">
                            Build Strategy
                          </button>
                          <button onClick={() => sendChatMessage(`Run this command first: cat .claude/skills/salary-research/SKILL.md — then research salary data for ${offer.company} ${offer.role} ${offer.level || ''}.`)}
                            disabled={chatProcessing} className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">
                            Research Salary
                          </button>
                          <select value={offer.status} onChange={async (e) => {
                            await fetch('/api/pipeline/offers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: offer.id, field: 'status', value: e.target.value }) })
                            loadOffers()
                          }} className="ml-auto text-xs px-2 py-1 border border-border rounded bg-bg">
                            <option value="pending">Pending</option>
                            <option value="negotiating">Negotiating</option>
                            <option value="accepted">Accepted</option>
                            <option value="declined">Declined</option>
                            <option value="expired">Expired</option>
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Salary Research Tab ───────────────────────────── */}
          {activeTab === 'salary-research' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Salary Research</h2>
                <button onClick={() => sendChatMessage('Run this command first: cat .claude/skills/salary-research/SKILL.md — then help me research salary data. Ask me which company, role, and level to look up.')}
                  disabled={chatProcessing} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                  Research Salary
                </button>
              </div>
              {salaryDocs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No salary research yet.</p>
                  <p className="text-text-muted text-sm">Click &quot;Research Salary&quot; to get market comp data for a specific company and role.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {salaryDocs.map(doc => (
                    <div key={doc.filename} className={`p-4 border rounded-lg transition-colors ${selectedDoc?.filename === doc.filename ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'}`}>
                      <button onClick={() => setSelectedDoc(selectedDoc?.filename === doc.filename ? null : doc)} className="w-full text-left">
                        <p className="font-medium text-sm">{doc.title}</p>
                      </button>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => sendChatMessage(`Let's discuss this salary research: ${doc.title}`)} disabled={chatProcessing}
                          className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">Discuss</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Negotiation Tab ───────────────────────────────── */}
          {activeTab === 'negotiation' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Negotiation Strategies</h2>
                <button onClick={() => sendChatMessage('Run this command first: cat .claude/skills/negotiate/SKILL.md — then help me build a negotiation strategy. Ask me about the offer details.')}
                  disabled={chatProcessing} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                  Build Strategy
                </button>
              </div>
              {negotiationDocs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No negotiation strategies yet.</p>
                  <p className="text-text-muted text-sm">When you have an offer, the agent will build a strategy with specific counter-offer numbers and talking points.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {negotiationDocs.map(doc => (
                    <div key={doc.filename} className={`p-4 border rounded-lg transition-colors ${selectedDoc?.filename === doc.filename ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'}`}>
                      <button onClick={() => setSelectedDoc(selectedDoc?.filename === doc.filename ? null : doc)} className="w-full text-left">
                        <p className="font-medium text-sm">{doc.title}</p>
                      </button>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => sendChatMessage(`Let's discuss this strategy: ${doc.title}`)} disabled={chatProcessing}
                          className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">Discuss</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Document viewer */}
          {selectedDoc && (
            <div className="mt-4 bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{selectedDoc.title}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => sendChatMessage(`Let's discuss: ${selectedDoc.title}`)} disabled={chatProcessing}
                    className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">Discuss with Agent</button>
                  <button onClick={() => navigator.clipboard.writeText(selectedDoc.content)} className="text-xs text-text-muted hover:text-text">Copy</button>
                  <button onClick={() => setSelectedDoc(null)} className="text-xs text-text-muted hover:text-text">Close</button>
                </div>
              </div>
              <div className="bg-bg p-4 rounded-md border border-border overflow-auto max-h-[60vh]">
                <MarkdownView content={selectedDoc.content} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Chat Sidebar ─────────────────────────────────────────── */}
      <div className="w-[35%] flex flex-col bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${chatProcessing ? 'bg-accent animate-pulse' : 'bg-success'}`} />
            <span className="text-sm font-semibold">Negotiation Agent</span>
          </div>
          <a href="/command-center" className="text-xs text-text-muted hover:text-text">Manage</a>
        </div>

        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-lg px-3.5 py-2.5 ${msg.role === 'user' ? 'bg-accent/10 text-text' : 'bg-bg text-text'}`}>
                {msg.role === 'agent' ? <MarkdownView content={msg.content} className="text-sm" /> : <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
              </div>
            </div>
          ))}
          {chatProcessing && (
            <div className="flex justify-start">
              <div className="bg-bg rounded-lg px-3.5 py-2.5 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Negotiation agent is thinking...</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2">
          <input value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput) } }}
            placeholder="Ask the negotiation agent..." disabled={chatProcessing}
            className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50" />
          <button onClick={() => sendChatMessage(chatInput)} disabled={!chatInput.trim() || chatProcessing}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
