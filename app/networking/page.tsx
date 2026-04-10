'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { MarkdownView } from '../_components/markdown-view'
import { useAgentEvents } from '../hooks/use-agent-events'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Outreach {
  date: string
  type: string
  status: string
  message_summary: string
}

interface FollowUp {
  due: string
  type: string
  outreach_ref: string
  status: string
}

interface Contact {
  id: string
  name: string
  company: string
  role: string
  relationship: 'cold' | 'connected' | 'warm' | 'referred' | 'close' | 'mentor'
  linkedin_url: string
  outreach: Outreach[]
  follow_ups: FollowUp[]
  notes: string
  how_you_know?: string
  how_we_met?: string
  their_team?: string
  team?: string
  can_help_with?: string | string[]
  their_interests?: string | string[]
  interests?: string | string[]
  mutual_connections?: string | string[]
  last_interaction?: string | Record<string, unknown>
  email?: string
  linkedin?: string
  [key: string]: unknown
}

interface NetworkingStats {
  totalContacts: number
  totalOutreach: number
  totalReplies: number
  replyRate: number
  referrals: number
  pendingFollowUps: number
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
}

type TabKey = 'contacts' | 'messages' | 'linkedin'
type SortKey = 'name' | 'company' | 'relationship'

// ─── Constants ──────────────────────────────────────────────────────────────

const RELATIONSHIP_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  cold: { label: 'Cold', bg: 'bg-text-muted/10', text: 'text-text-muted' },
  connected: { label: 'Connected', bg: 'bg-accent/10', text: 'text-accent' },
  warm: { label: 'Warm', bg: 'bg-warning/10', text: 'text-warning' },
  referred: { label: 'Referred', bg: 'bg-success/10', text: 'text-success' },
  close: { label: 'Close', bg: 'bg-success/20', text: 'text-success' },
  mentor: { label: 'Mentor', bg: 'bg-accent/20', text: 'text-accent' },
}

const RELATIONSHIP_ORDER: Record<string, number> = {
  mentor: 0, close: 1, referred: 2, warm: 3, connected: 4, cold: 5,
}

const NETWORKING_DIRECTIVE = `You are the user's networking specialist. Read search/context/connection-tracker.yaml and search/context/target-companies.yaml. Be ready to help with: generating outreach messages, crafting referral requests, auditing LinkedIn, and managing contacts. Greet the user briefly and ask what they'd like help with today.`

const INPUT_CLASS = 'px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'

const RELATIONSHIP_OPTIONS = Object.entries(RELATIONSHIP_BADGES).map(([key, badge]) => ({ value: key, label: badge.label }))

// ─── Helpers ────────────────────────────────────────────────────────────────

function displayValue(val: unknown): string {
  if (!val) return ''
  if (Array.isArray(val)) return val.join(', ')
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s
  return s.slice(0, len) + '...'
}

/** Parse individual messages from agent markdown output */
function parseMessagesFromOutput(output: string): Array<{ recipient: string; company: string; text: string }> {
  const messages: Array<{ recipient: string; company: string; text: string }> = []
  // Split on ## headers or numbered list items like "## 1." or "### For Name"
  const blocks = output.split(/(?=^##\s|\n##\s)/m).filter(b => b.trim())

  for (const block of blocks) {
    // Try to extract recipient name from header
    const headerMatch = block.match(/^##\s*(?:\d+\.\s*)?(?:For\s+)?(.+?)(?:\s*[-\u2013\u2014]\s*(.+?))?$/m)
    if (!headerMatch) continue

    const recipient = headerMatch[1]?.trim().replace(/\*+/g, '') || 'Unknown'
    const company = headerMatch[2]?.trim().replace(/\*+/g, '') || ''

    // Get the message text (everything after the header, stripped of sub-headers)
    const textPart = block.replace(/^##.*$/m, '').trim()
    if (!textPart) continue

    messages.push({ recipient, company, text: textPart })
  }

  return messages
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function NetworkingPage() {
  // Data state
  const [contacts, setContacts] = useState<Contact[]>([])
  const [stats, setStats] = useState<NetworkingStats | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'contacts'
    try { return (localStorage.getItem('net-active-tab') as TabKey) || 'contacts' } catch { return 'contacts' }
  })
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // Contact search/sort/expand
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('company')
  const [expandedContact, setExpandedContact] = useState<string | null>(null)
  const [savedContactField, setSavedContactField] = useState<string | null>(null)

  // Add contact form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newRelationship, setNewRelationship] = useState<string>('cold')
  const [newHowYouKnow, setNewHowYouKnow] = useState('')
  const [newTheirTeam, setNewTheirTeam] = useState('')
  const [newCanHelpWith, setNewCanHelpWith] = useState('')
  const [newTheirInterests, setNewTheirInterests] = useState('')
  const [newLinkedinUrl, setNewLinkedinUrl] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newNotes, setNewNotes] = useState('')

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('networking-chat-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [chatInput, setChatInput] = useState('')
  const hasSpawnedRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // Messages tab state — loaded from API + agent output
  const [parsedMessages, setParsedMessages] = useState<Array<{ id?: string; recipient: string; company: string; role?: string; text: string; charCount?: number; personalization?: string; sent?: boolean }>>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('net-parsed-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // LinkedIn documents state — multiple files (audit, positioning, etc.)
  const [linkedinDocs, setLinkedinDocs] = useState<Array<{ filename: string; title: string; content: string }>>([])
  const [selectedDocIdx, setSelectedDocIdx] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)

  // Clipboard feedback
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [messageSearch, setMessageSearch] = useState('')
  const [activeBatch, setActiveBatch] = useState<string | null>(null)
  const auditRequestedRef = useRef(false)

  // Agent hook
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('networking-chat')

  // Derived from agent hook — survives tab switches
  const chatProcessing = agentStatus === 'running'

  // ─── Data Loading ───────────────────────────────────────────────────────

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/networking/contacts')
      if (res.ok) {
        const data = await res.json() as { contacts: Contact[] }
        setContacts(data.contacts)
      }
    } catch { /* ignore */ }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/networking/stats')
      if (res.ok) {
        const data = await res.json() as NetworkingStats
        setStats(data)
      }
    } catch { /* ignore */ }
  }, [])

  const loadAuditFile = useCallback(async () => {
    setAuditLoading(true)
    try {
      const res = await fetch('/api/networking/audit')
      if (res.ok) {
        const data = await res.json() as { documents: Array<{ filename: string; title: string; content: string }> }
        if (data.documents?.length > 0) {
          setLinkedinDocs(data.documents)
        }
      }
    } catch { /* ignore */ }
    finally { setAuditLoading(false) }
  }, [])

  useEffect(() => {
    loadContacts()
    loadStats()
    loadSavedMessages()
    loadAuditFile()
    // Fetch user's LinkedIn URL from experience library
    fetch('/api/context/experience-library').then(r => r.json()).then(data => {
      const linkedin = data?.contact?.linkedin
      if (linkedin) {
        try { localStorage.setItem('user-linkedin-url', linkedin) } catch {}
      }
    }).catch(() => {})

    // Poll for changes from auto-dispatched agents or other sources
    const interval = setInterval(() => {
      loadContacts()
      loadSavedMessages()
      loadAuditFile()
    }, 30_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadContacts, loadStats, loadAuditFile])

  const loadSavedMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/networking/messages')
      if (res.ok) {
        const data = await res.json() as { messages: Array<{ id: string; recipient: string; company: string; role?: string; text: string; charCount: number; personalization?: string }> }
        if (data.messages.length > 0) {
          setParsedMessages(prev => {
            // Merge: keep any existing sent status, add new ones
            const existing = new Map(prev.map(m => [m.id, m]))
            const merged = data.messages.map(m => ({
              ...m,
              sent: existing.get(m.id)?.sent || false,
            }))
            return merged
          })
        }
      }
    } catch {}
  }, [])

  // ─── Persistence ────────────────────────────────────────────────────────

  useEffect(() => { try { localStorage.setItem('net-active-tab', activeTab) } catch {} }, [activeTab])
  useEffect(() => {
    if (chatMessages.length > 0) {
      try { localStorage.setItem('networking-chat-messages', JSON.stringify(chatMessages)) } catch {}
    }
  }, [chatMessages])
  useEffect(() => { try { localStorage.setItem('net-parsed-messages', JSON.stringify(parsedMessages)) } catch {} }, [parsedMessages])

  // ─── Chat Logic ─────────────────────────────────────────────────────────

  const scrollChatToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollChatToBottom()
  }, [chatMessages.length, scrollChatToBottom])

  // Spawn agent on first load — wait for blackboard to be ready
  useEffect(() => {
    if (hasSpawnedRef.current) return
    hasSpawnedRef.current = true
    if (chatMessages.length > 0) return // restored from localStorage

    let cancelled = false
    const waitAndSpawn = async () => {
      for (let i = 0; i < 5; i++) {
        try {
          const res = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
          if (res.ok) break
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 1000))
      }
      if (cancelled) return
      spawnAgent('networking', {
        skill: 'networking-specialist',
        entry_name: 'networking-session',
        text: NETWORKING_DIRECTIVE,
      })
    }
    waitAndSpawn()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watch agent completions
  useEffect(() => {
    if (agentStatus === 'completed' && agentOutput) {
      setChatMessages(prev => [...prev, { role: 'agent', content: agentOutput }])


      // Check if the output contains messages to parse
      if (agentOutput.includes('##') && (agentOutput.toLowerCase().includes('connection') || agentOutput.toLowerCase().includes('message') || agentOutput.toLowerCase().includes('outreach'))) {
        const parsed = parseMessagesFromOutput(agentOutput)
        if (parsed.length > 0) {
          setParsedMessages(prev => [...prev, ...parsed.map(m => ({ ...m, sent: false }))])
        }
      }

      // When audit completes, reload the actual audit file (not the agent summary)
      if (auditRequestedRef.current) {
        auditRequestedRef.current = false
      }

      agentReset()
      loadContacts()
      loadStats()
      loadSavedMessages()
      loadAuditFile()
    }
    if (agentStatus === 'failed') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Something went wrong. Please try again.' }])

      agentReset()
    }
    if (agentStatus === 'timeout') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Request timed out. Please try again.' }])

      agentReset()
    }
  }, [agentStatus, agentOutput, agentReset, loadContacts, loadStats, loadAuditFile, loadSavedMessages])

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatProcessing) return
    setChatMessages(prev => [...prev, { role: 'user', content: text.trim() }])
    setChatInput('')


    try {
      await spawnAgent('networking', {
        skill: 'networking-specialist',
        entry_name: 'networking-followup',
        text: text.trim(),
      })
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to reach agent. Please try again.' }])

    }
  }, [agentStatus, spawnAgent])

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChatMessage(chatInput)
    }
  }

  // ─── Contact CRUD ───────────────────────────────────────────────────────

  const handleContactFieldUpdate = async (contactId: string, field: string, value: string) => {
    try {
      await fetch('/api/networking/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, field, value }),
      })
      loadContacts()
      loadStats()
      setSavedContactField(`${contactId}-${field}`)
      setTimeout(() => setSavedContactField(null), 1500)
    } catch {}
  }

  const handleAddContact = async () => {
    if (!newName.trim() || !newCompany.trim()) return
    try {
      const res = await fetch('/api/networking/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName, company: newCompany, role: newRole, relationship: newRelationship,
          how_you_know: newHowYouKnow, their_team: newTheirTeam, can_help_with: newCanHelpWith,
          their_interests: newTheirInterests, linkedin_url: newLinkedinUrl, email: newEmail, notes: newNotes,
        }),
      })
      if (res.ok) {
        setNewName(''); setNewCompany(''); setNewRole(''); setNewRelationship('cold')
        setNewHowYouKnow(''); setNewTheirTeam(''); setNewCanHelpWith('')
        setNewTheirInterests(''); setNewLinkedinUrl(''); setNewEmail(''); setNewNotes('')
        setShowAddForm(false)
        loadContacts(); loadStats()
      }
    } catch {}
  }

  const handleUpdateFollowUpStatus = async (contactId: string, followUpIdx: number, status: 'dismissed' | 'skipped') => {
    const contact = contacts.find(c => c.id === contactId)
    if (!contact) return
    const updatedFollowUps = [...contact.follow_ups]
    updatedFollowUps[followUpIdx] = { ...updatedFollowUps[followUpIdx], status }
    try {
      await fetch('/api/networking/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, field: 'follow_ups', value: updatedFollowUps }),
      })
      loadContacts(); loadStats()
    } catch {}
  }

  // ─── Action Buttons ─────────────────────────────────────────────────────

  const handleGenerateMessages = () => {
    setActiveTab('messages')
    sendChatMessage('Generate personalized connection requests for my contacts. Read search/context/target-companies.yaml, search/context/connection-tracker.yaml, and search/context/experience-library.yaml for context. Generate messages for at least 5 contacts, each under 300 characters. Format each with a ## header containing the person\'s name and company.')
  }

  const handleRunAudit = () => {
    setActiveTab('linkedin')
    auditRequestedRef.current = true
    sendChatMessage('Audit my LinkedIn profile against my target roles. Read search/context/career-plan.yaml, search/context/experience-library.yaml, and top JDs from search/vault/job-descriptions/ for the analysis. Provide before/after suggestions for each profile section.')
  }

  const handleRequestReferral = (contact: Contact) => {
    sendChatMessage(`Generate a 3-message referral request sequence for "${contact.name}" at "${contact.company}". Their role is ${contact.role}. Read search/context/connection-tracker.yaml for prior interaction history.`)
  }

  const handleCopyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }

  const handleMarkSent = (idx: number) => {
    setParsedMessages(prev => prev.map((m, i) => i === idx ? { ...m, sent: true } : m))
  }

  // ─── Filtered & Sorted Contacts ─────────────────────────────────────────

  const sortedContacts = useMemo(() => {
    const filtered = contacts.filter(c => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.relationship.toLowerCase().includes(q) ||
        displayValue(c.can_help_with).toLowerCase().includes(q)
      )
    })
    return filtered.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'company') return a.company.localeCompare(b.company)
      if (sortBy === 'relationship') return (RELATIONSHIP_ORDER[a.relationship] ?? 5) - (RELATIONSHIP_ORDER[b.relationship] ?? 5)
      return 0
    })
  }, [contacts, searchQuery, sortBy])

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ─── Left Panel (65%) ─────────────────────────────────────────── */}
      <div className="w-[65%] flex flex-col overflow-hidden border-r border-border">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 flex-shrink-0">
          <h1 className="text-2xl font-bold mb-1">Networking</h1>
          <p className="text-text-muted text-sm mb-4">Manage connections, generate outreach, and track follow-ups.</p>

          {/* Stats Bar - Compact */}
          <div className="flex gap-3 mb-4">
            {[
              { label: 'Contacts', value: stats?.totalContacts ?? 0 },
              { label: 'Outreach', value: stats?.totalOutreach ?? 0 },
              { label: 'Reply Rate', value: `${stats?.replyRate ?? 0}%` },
              { label: 'Referrals', value: stats?.referrals ?? 0 },
              { label: 'Pending F/Us', value: stats?.pendingFollowUps ?? 0 },
            ].map(s => (
              <div key={s.label} className="flex-1 bg-surface border border-border rounded-lg px-3 py-2">
                <div className="text-xs text-text-muted">{s.label}</div>
                <div className="text-lg font-bold">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Tab Bar - Underline style */}
          <div className="flex gap-6 border-b border-border">
            {([
              { key: 'contacts' as TabKey, label: 'Contacts' },
              { key: 'messages' as TabKey, label: 'Messages' },
              { key: 'linkedin' as TabKey, label: 'LinkedIn' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-2.5 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-text'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ─── Contacts Tab ──────────────────────────────────────── */}
          {activeTab === 'contacts' && (
            <div>
              {/* Search + Sort + Add */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, company, role, relationship..."
                    className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="px-3 py-2 border border-border rounded-lg bg-bg text-text text-sm"
                >
                  <option value="company">Sort: Company</option>
                  <option value="relationship">Sort: Relationship</option>
                  <option value="name">Sort: Name</option>
                </select>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
                >
                  + Add Contact
                </button>
              </div>

              {/* Add Contact Form */}
              {showAddForm && (
                <div className="bg-surface border border-border rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-sm mb-3">Add New Contact</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className={INPUT_CLASS} />
                    <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company *" className={INPUT_CLASS} />
                    <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Role" className={INPUT_CLASS} />
                    <select value={newRelationship} onChange={e => setNewRelationship(e.target.value)} className={INPUT_CLASS}>
                      {RELATIONSHIP_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <input value={newHowYouKnow} onChange={e => setNewHowYouKnow(e.target.value)} placeholder="How you know them" className={INPUT_CLASS} />
                    <input value={newTheirTeam} onChange={e => setNewTheirTeam(e.target.value)} placeholder="Their team" className={INPUT_CLASS} />
                    <input value={newCanHelpWith} onChange={e => setNewCanHelpWith(e.target.value)} placeholder="Can help with (e.g., referral, intel)" className={INPUT_CLASS} />
                    <input value={newTheirInterests} onChange={e => setNewTheirInterests(e.target.value)} placeholder="Their interests" className={INPUT_CLASS} />
                    <input value={newLinkedinUrl} onChange={e => setNewLinkedinUrl(e.target.value)} placeholder="LinkedIn URL" className={INPUT_CLASS} />
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" className={INPUT_CLASS} />
                    <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Notes" rows={2}
                      className={`col-span-2 ${INPUT_CLASS} resize-y`} />
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={handleAddContact} disabled={!newName.trim() || !newCompany.trim()}
                      className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      Add
                    </button>
                    <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-text-muted text-sm hover:text-text">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Contact Cards Grid */}
              {sortedContacts.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-8 text-center">
                  <p className="text-text-muted text-lg mb-2">
                    {searchQuery ? 'No contacts match your search.' : 'No contacts yet.'}
                  </p>
                  {!searchQuery && (
                    <p className="text-text-muted text-sm">
                      Add contacts manually or use the agent to generate outreach.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {sortedContacts.map(contact => {
                      const badge = RELATIONSHIP_BADGES[contact.relationship] || RELATIONSHIP_BADGES.cold
                      const isExpanded = expandedContact === contact.id
                      const hasPendingFU = contact.follow_ups.some(fu => fu.status === 'pending' && fu.due <= todayStr)
                      const canHelp = displayValue(contact.can_help_with)

                      return (
                        <div key={contact.id} className={`border rounded-lg transition-all ${
                          isExpanded ? 'col-span-1 md:col-span-2 xl:col-span-3 border-accent/30 shadow-md' : 'border-border hover:shadow-sm hover:border-border/80'
                        }`}>
                          <button
                            onClick={() => setExpandedContact(isExpanded ? null : contact.id)}
                            className="w-full text-left p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{contact.name}</span>
                                  {hasPendingFU && <span className="w-2 h-2 bg-warning rounded-full flex-shrink-0" title="Follow-up due" />}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-xs text-text-muted">{contact.company}</span>
                                  <span className="text-text-muted/40">&#183;</span>
                                  <span className={`text-xs px-1.5 py-0 rounded-full ${badge.bg} ${badge.text}`}>{badge.label}</span>
                                </div>
                                {contact.role && (
                                  <p className="text-xs text-text-muted mt-1">{truncate(contact.role, 40)}</p>
                                )}
                                {canHelp && (
                                  <p className="text-xs text-text-muted/70 mt-0.5">Can help: {truncate(canHelp, 30)}</p>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Expanded Detail */}
                          {isExpanded && (
                            <div className="border-t border-border p-4 bg-bg/50 space-y-3">
                              {/* Editable Fields */}
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {[
                                  { label: 'Name', field: 'name', value: contact.name },
                                  { label: 'Company', field: 'company', value: contact.company },
                                  { label: 'Role', field: 'role', value: contact.role, placeholder: 'Role' },
                                  { label: 'How you know', field: 'how_you_know', value: String(contact.how_you_know || contact.how_we_met || ''), placeholder: 'e.g., former colleague' },
                                  { label: 'Team', field: 'their_team', value: String(contact.their_team || contact.team || ''), placeholder: 'e.g., Platform Eng' },
                                  { label: 'Can help with', field: 'can_help_with', value: displayValue(contact.can_help_with), placeholder: 'e.g., referral, intel' },
                                  { label: 'Interests', field: 'their_interests', value: displayValue(contact.their_interests || contact.interests), placeholder: 'e.g., distributed systems' },
                                  { label: 'Mutual connections', field: 'mutual_connections', value: displayValue(contact.mutual_connections), placeholder: 'Mutual connections' },
                                  { label: 'Last interaction', field: 'last_interaction', value: displayValue(contact.last_interaction), placeholder: 'Last interaction' },
                                ].map(f => (
                                  <div key={f.field}>
                                    <div className="text-xs text-text-muted mb-0.5">
                                      {f.label} {savedContactField === `${contact.id}-${f.field}` && <span className="text-success">Saved</span>}
                                    </div>
                                    <input
                                      defaultValue={f.value}
                                      onBlur={e => { if (e.target.value !== f.value) handleContactFieldUpdate(contact.id, f.field, e.target.value) }}
                                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                      placeholder={f.placeholder}
                                      className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* Relationship selector */}
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div>
                                  <div className="text-xs text-text-muted mb-0.5">Relationship {savedContactField === `${contact.id}-relationship` && <span className="text-success">Saved</span>}</div>
                                  <select
                                    defaultValue={contact.relationship}
                                    onChange={e => handleContactFieldUpdate(contact.id, 'relationship', e.target.value)}
                                    className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                                  >
                                    {RELATIONSHIP_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <div className="text-xs text-text-muted mb-0.5">Email {savedContactField === `${contact.id}-email` && <span className="text-success">Saved</span>}</div>
                                  <input
                                    defaultValue={String(contact.email || '')}
                                    onBlur={e => { if (e.target.value !== String(contact.email || '')) handleContactFieldUpdate(contact.id, 'email', e.target.value) }}
                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                    placeholder="Email"
                                    className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                                  />
                                </div>
                                <div>
                                  <div className="text-xs text-text-muted mb-0.5">
                                    LinkedIn {savedContactField === `${contact.id}-linkedin_url` && <span className="text-success">Saved</span>}
                                    {(contact.linkedin_url || contact.linkedin) && (
                                      <a href={String(contact.linkedin_url || contact.linkedin)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-2">Open</a>
                                    )}
                                  </div>
                                  <input
                                    defaultValue={String(contact.linkedin_url || contact.linkedin || '')}
                                    onBlur={e => { if (e.target.value !== String(contact.linkedin_url || contact.linkedin || '')) handleContactFieldUpdate(contact.id, 'linkedin_url', e.target.value) }}
                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                    placeholder="https://linkedin.com/in/..."
                                    className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                                  />
                                </div>
                              </div>

                              {/* Notes */}
                              <div>
                                <div className="text-xs text-text-muted mb-0.5">Notes {savedContactField === `${contact.id}-notes` && <span className="text-success">Saved</span>}</div>
                                <textarea
                                  defaultValue={contact.notes}
                                  onBlur={e => { if (e.target.value !== contact.notes) handleContactFieldUpdate(contact.id, 'notes', e.target.value) }}
                                  placeholder="Add notes..."
                                  rows={2}
                                  className="text-sm bg-transparent border border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors resize-y"
                                />
                              </div>

                              {/* Outreach Timeline */}
                              {contact.outreach.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-text-muted mb-2">Outreach Timeline</h4>
                                  <div className="space-y-1">
                                    {contact.outreach.map((o, i) => (
                                      <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="text-text-muted w-20">{o.date}</span>
                                        <span className={`px-1.5 py-0.5 rounded ${
                                          o.status === 'replied' ? 'bg-success/10 text-success'
                                          : o.status === 'no-response' ? 'bg-danger/10 text-danger'
                                          : 'bg-accent/10 text-accent'
                                        }`}>{o.status}</span>
                                        <span className="text-text-muted capitalize">{o.type.replace(/-/g, ' ')}</span>
                                        {o.message_summary && <span className="text-text-muted truncate">- {o.message_summary}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Pending Follow-ups */}
                              {contact.follow_ups.filter(fu => fu.status === 'pending').length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-text-muted mb-2">Pending Follow-ups</h4>
                                  <div className="space-y-1">
                                    {contact.follow_ups.map((fu, i) => {
                                      if (fu.status !== 'pending') return null
                                      const isOverdue = fu.due < todayStr
                                      return (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                          <div className="flex items-center gap-2">
                                            <span className={isOverdue ? 'text-danger font-medium' : 'text-text-muted'}>{fu.due}</span>
                                            <span className="text-text-muted capitalize">{fu.type.replace(/-/g, ' ')}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <button onClick={() => handleUpdateFollowUpStatus(contact.id, i, 'dismissed')}
                                              className="text-text-muted hover:text-text px-1.5 py-0.5 rounded border border-border">
                                              Dismiss
                                            </button>
                                            <button onClick={() => handleUpdateFollowUpStatus(contact.id, i, 'skipped')}
                                              className="text-text-muted hover:text-text px-1.5 py-0.5 rounded border border-border">
                                              Skip
                                            </button>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center gap-2 pt-2">
                                <button
                                  onClick={() => handleRequestReferral(contact)}
                                  disabled={chatProcessing}
                                  className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  Request Referral
                                </button>
                                {(contact.linkedin_url || contact.linkedin) && (
                                  <a
                                    href={String(contact.linkedin_url || contact.linkedin)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 border border-border text-text rounded text-xs hover:bg-bg transition-colors"
                                  >
                                    LinkedIn
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Messages Tab ──────────────────────────────────────── */}
          {activeTab === 'messages' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-text-muted">Outreach Messages</h2>
                  {parsedMessages.length > 0 && (
                    <span className="text-xs text-text-muted">
                      {parsedMessages.filter(m => !m.sent).length} draft · {parsedMessages.filter(m => m.sent).length} sent
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {parsedMessages.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!confirm('Clear all draft messages?')) return
                        await fetch('/api/networking/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) })
                        loadSavedMessages()
                      }}
                      className="px-3 py-1.5 border border-danger/30 text-danger rounded-lg text-xs hover:bg-danger/10 transition-colors"
                    >
                      Clear Drafts
                    </button>
                  )}
                  <button
                    onClick={handleGenerateMessages}
                    disabled={chatProcessing}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {chatProcessing ? 'Generating...' : parsedMessages.length > 0 ? 'Generate More' : 'Generate Messages'}
                  </button>
                </div>
              </div>

              {/* Search messages */}
              {parsedMessages.length > 0 && (
                <div className="mb-3">
                  <input
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    placeholder="Search by company or message text..."
                    className="w-full px-3 py-2 border border-border rounded-lg bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
              )}

              {parsedMessages.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-8 text-center">
                  <p className="text-text-muted text-lg mb-2">No messages generated yet.</p>
                  <p className="text-text-muted text-sm">
                    Click &quot;Generate Messages&quot; to create personalized connection requests,
                    or ask the agent directly for specific outreach.
                  </p>
                </div>
              ) : (() => {
                const batches = [...new Set(parsedMessages.map(m => (m as Record<string, unknown>).batch as string || 'default'))]
                const currentBatch = activeBatch && batches.includes(activeBatch) ? activeBatch : batches[0]

                const filteredMessages = parsedMessages.filter(msg => {
                  if (messageSearch.trim()) {
                    const q = messageSearch.toLowerCase()
                    return (msg.company || '').toLowerCase().includes(q)
                      || (msg.recipient || '').toLowerCase().includes(q)
                      || (msg.text || '').toLowerCase().includes(q)
                      || (msg.role || '').toLowerCase().includes(q)
                  }
                  return ((msg as Record<string, unknown>).batch as string || 'default') === currentBatch
                })

                return (
                  <div>
                    {/* Batch filter pills */}
                    {batches.length > 1 && !messageSearch.trim() && (
                      <div className="flex gap-2 mb-3 overflow-x-auto">
                        {batches.map(batch => (
                          <button
                            key={batch}
                            onClick={() => setActiveBatch(batch)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                              currentBatch === batch
                                ? 'bg-accent/10 text-accent border border-accent/30'
                                : 'bg-bg text-text-muted border border-border hover:text-text'
                            }`}
                          >
                            {batch === 'default' ? 'Batch 1' : batch.replace(/linkedin-connection-requests-?/g, '').replace(/-/g, ' ') || batch}
                            <span className="ml-1 text-text-muted">
                              ({parsedMessages.filter(m => ((m as Record<string, unknown>).batch as string || 'default') === batch).length})
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3">
                    {filteredMessages.map((msg, idx) => (
                    <div key={idx} className={`border rounded-lg p-4 transition-all ${
                      msg.sent ? 'border-success/20 bg-success/5 opacity-60' : 'border-border bg-surface'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium text-sm">{msg.recipient}</span>
                          {msg.company && <span className="text-text-muted text-xs ml-2">{msg.company}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-muted">{msg.text.length} chars</span>
                          {msg.sent && <span className="text-xs text-success font-medium">Sent</span>}
                        </div>
                      </div>
                      <div className="bg-bg/80 border border-border/50 rounded-md p-3 mb-3">
                        <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!msg.sent ? (
                          <>
                            <button
                              onClick={() => handleCopyMessage(msg.text, idx)}
                              className="px-3 py-1.5 border border-border text-text rounded text-xs font-medium hover:bg-bg transition-colors"
                            >
                              {copiedIdx === idx ? 'Copied!' : 'Copy'}
                            </button>
                            <button
                              onClick={() => sendChatMessage(`Revise this message for ${msg.company}. Make it more personal. Original: "${msg.text}"`)}
                              className="px-3 py-1.5 border border-border text-text-muted rounded text-xs hover:bg-bg hover:text-text transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                if (msg.id) {
                                  await fetch('/api/networking/messages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id, field: 'status', value: 'sent' }) })
                                }
                                handleMarkSent(idx)
                              }}
                              className="px-3 py-1.5 bg-success/10 text-success border border-success/20 rounded text-xs font-medium hover:bg-success/20 transition-colors"
                            >
                              Mark Sent
                            </button>
                            <button
                              onClick={async () => {
                                if (msg.id) {
                                  await fetch('/api/networking/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id }) })
                                }
                                setParsedMessages(prev => prev.filter((_, i) => i !== idx))
                              }}
                              className="px-3 py-1.5 text-text-muted rounded text-xs hover:text-danger transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-text-muted">Sent {msg.sent ? '✓' : ''}</span>
                        )}
                      </div>
                    </div>
                  ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ─── LinkedIn Tab ──────────────────────────────────────── */}
          {activeTab === 'linkedin' && (() => {
            const userLinkedIn = typeof window !== 'undefined' ? localStorage.getItem('user-linkedin-url') : null
            const selectedDoc = linkedinDocs[selectedDocIdx] || null
            return (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-text-muted">LinkedIn</h2>
                    {userLinkedIn && (
                      <a href={userLinkedIn} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-accent hover:text-accent-hover">View Profile ↗</a>
                    )}
                  </div>
                  <button
                    onClick={handleRunAudit}
                    disabled={chatProcessing}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {chatProcessing ? 'Auditing...' : 'Run Audit'}
                  </button>
                </div>

                {auditLoading ? (
                  <div className="bg-surface border border-border rounded-lg p-8 text-center">
                    <p className="text-text-muted">Loading...</p>
                  </div>
                ) : linkedinDocs.length === 0 ? (
                  <div className="bg-surface border border-border rounded-lg p-8 text-center">
                    <p className="text-text-muted text-lg mb-2">No LinkedIn documents yet.</p>
                    <p className="text-text-muted text-sm">
                      Click &quot;Run Audit&quot; to get profile improvement suggestions.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Document selector */}
                    {linkedinDocs.length > 1 && (
                      <div className="flex gap-2 mb-4">
                        {linkedinDocs.map((doc, i) => (
                          <button
                            key={doc.filename}
                            onClick={() => setSelectedDocIdx(i)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              selectedDocIdx === i
                                ? 'bg-accent/10 text-accent border border-accent/30'
                                : 'bg-bg text-text-muted border border-border hover:text-text'
                            }`}
                          >
                            {doc.title}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedDoc && (
                      <div className="bg-surface border border-border rounded-lg p-5">
                        <MarkdownView content={selectedDoc.content} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ─── Right Panel: Agent Chat (35%) ────────────────────────────── */}
      <div className="w-[35%] flex flex-col bg-surface">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${chatProcessing ? 'bg-warning animate-pulse' : 'bg-accent'}`} />
            <span className="text-sm font-semibold text-text">Networking Agent</span>
          </div>
          <button
            onClick={() => {
              setChatMessages([])
              localStorage.removeItem('networking-chat-messages')
              hasSpawnedRef.current = false
            }}
            className="text-xs text-text-muted hover:text-text px-2 py-1 rounded border border-border hover:bg-bg transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Chat Messages */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.length === 0 && !chatProcessing && (
            <p className="text-sm text-text-muted text-center mt-8">Starting networking agent...</p>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-lg px-3.5 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-accent/10 text-text'
                  : 'bg-bg text-text'
              }`}>
                {msg.role === 'agent' ? (
                  <MarkdownView content={msg.content} />
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
                <span className="text-sm text-text-muted">Agent is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="border-t border-border p-3 flex items-center gap-2">
          <input
            ref={chatInputRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Ask the networking agent..."
            disabled={chatProcessing}
            className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          />
          <button
            onClick={() => sendChatMessage(chatInput)}
            disabled={!chatInput.trim() || chatProcessing}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
