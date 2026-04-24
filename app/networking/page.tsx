'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { MarkdownView } from '../_components/markdown-view'
import { AgentProgress } from '../_components/agent-progress'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useAgentWelcome } from '../hooks/use-agent-welcome'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'

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
  relationship: 'cold' | 'connected' | 'warm' | 'referred' | 'close' | 'mentor' | 'unknown'
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
  at_target_company?: string
  reviewed?: boolean
  source?: string
  [key: string]: unknown
}

type ContactFilter = 'all' | 'target-company' | 'needs-review' | 'warm' | 'has-roles'

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
  unknown: { label: 'Unreviewed', bg: 'bg-border', text: 'text-text-muted' },
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

const NETWORKING_DIRECTIVE = `You are the user's networking specialist. Read search/context/connection-tracker.yaml, search/context/target-companies.yaml, search/context/career-plan.yaml, and search/pipeline/open-roles.yaml for context. Open roles tells you which companies have active opportunities — prioritize outreach to contacts at those companies.

IMPORTANT: If career-plan.yaml is empty or target-companies.yaml has no companies, you MUST do BOTH of these steps:

Step 1 — Tell the user: "Your profile isn't complete yet. Head to the Job Search Coach to set up your career plan and target companies first — I need those to generate effective outreach."

Step 2 — You MUST post a user-action directive. This is NOT optional. Do this IMMEDIATELY:
   First, read_blackboard to get the current directives array.
   Then, write_to_blackboard with path "directives" and value being the existing array PLUS this new entry:
   {"id":"dir-${Date.now()}","type":"user_action","text":"Your career plan and target companies are needed for networking","button_label":"Complete Career Plan","route":"/coach","chat_message":"I need to complete my career plan and target companies. The networking agent needs these to generate outreach.","assigned_to":"coach","from":"networking","priority":"high","status":"pending","posted_at":"${new Date().toISOString()}"}

If context is available, greet the user briefly and ask what they'd like help with. You can help with: generating outreach messages, crafting referral requests, auditing LinkedIn, and managing contacts.`

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
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all')
  const [scoredRoles, setScoredRoles] = useState<Array<{ company: string; title: string; score: number }>>([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [importResult, setImportResult] = useState<{ total: number; at_target_companies: number; by_company: Record<string, Array<{ name: string; position: string }>> } | null>(null)
  const [importing, setImporting] = useState(false)

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'contacts'
    try { const s = localStorage.getItem('networking-active-tab') as TabKey; if (s) return s } catch {}
    return 'contacts'
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('networking-chat-messages')
      if (saved) setChatMessages(JSON.parse(saved))
    } catch {}
  }, [])
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // Messages tab state — loaded from API + agent output
  const [parsedMessages, setParsedMessages] = useState<Array<{ id?: string; recipient: string; company: string; role?: string; text: string; charCount?: number; personalization?: string; sent?: boolean }>>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('networking-parsed-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // LinkedIn documents state — multiple files (audit, positioning, etc.)
  const [linkedinDocs, setLinkedinDocs] = useState<Array<{ filename: string; title: string; content: string }>>([])
  const [selectedDocIdx, setSelectedDocIdx] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)

  // Clipboard feedback and message overlay
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [viewingMessage, setViewingMessage] = useState<{ recipient: string; company: string; text: string } | null>(null)
  const [messageSearch, setMessageSearch] = useState('')
  const [activeBatch, setActiveBatch] = useState<string | null>(null)
  const auditRequestedRef = useRef(false)

  // Agent hook
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset, spawnId: agentSpawnId } = useAgentEvents('networking-chat')

  // Derived from agent hook — survives tab switches
  const chatProcessing = agentStatus === 'running'

  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('networking')

  useAgentWelcome('networking', 'I\'m your networking specialist. I can help with LinkedIn outreach, referral requests, connection strategies, and profile optimization.\n\nWhat would you like to do?', chatMessages, setChatMessages, 'networking-chat-messages')

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

  const loadScoredRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/finding/scored-jds')
      if (res.ok) {
        const data = await res.json()
        setScoredRoles((data.scoredJDs || []).filter((jd: { score: number }) => jd.score >= 75))
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadContacts()
    loadStats()
    loadSavedMessages()
    loadAuditFile()
    loadScoredRoles()
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
        setParsedMessages(prev => {
          if (data.messages.length === 0) return []
          // Merge: keep any existing sent status, add new ones
          const existing = new Map(prev.map(m => [m.id, m]))
          return data.messages.map(m => ({
            ...m,
            sent: existing.get(m.id)?.sent || false,
          }))
        })
      }
    } catch {}
  }, [])

  // ─── Persistence ────────────────────────────────────────────────────────

  useEffect(() => { try { localStorage.setItem('networking-active-tab', activeTab) } catch {} }, [activeTab])
  useEffect(() => {
    if (chatMessages.length > 0) {
      try { localStorage.setItem('networking-chat-messages', JSON.stringify(chatMessages)) } catch {}
    }
  }, [chatMessages])
  useEffect(() => { try { localStorage.setItem('networking-parsed-messages', JSON.stringify(parsedMessages)) } catch {} }, [parsedMessages])

  // ─── Chat Logic ─────────────────────────────────────────────────────────

  const scrollChatToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollChatToBottom()
  }, [chatMessages.length, scrollChatToBottom])

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

  // Pick up pending action from user-action bar navigation
  usePendingAction(sendChatMessage, setActiveTab as (tab: string) => void)

  // ─── Action Buttons ─────────────────────────────────────────────────────

  const handleGenerateMessages = () => {
    setActiveTab('messages')
    sendChatMessage('Run this command first: cat .claude/skills/connection-request/SKILL.md — then follow its instructions to generate personalized connection requests.')
  }

  const handleRunAudit = () => {
    setActiveTab('linkedin')
    auditRequestedRef.current = true
    sendChatMessage('Run this command first: cat .claude/skills/linkedin-audit/SKILL.md — then follow its instructions to audit my LinkedIn profile.')
  }

  const handleRequestReferral = (contact: Contact) => {
    sendChatMessage(`Run this command first: cat .claude/skills/referral-request/SKILL.md — then follow its instructions to generate a referral request sequence for "${contact.name}" at "${contact.company}".`)
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

  // Map company names to scored roles for pipeline integration
  const companyRolesMap = useMemo(() => {
    const map = new Map<string, Array<{ title: string; score: number }>>()
    for (const role of scoredRoles) {
      const key = role.company.toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ title: role.title, score: role.score })
    }
    return map
  }, [scoredRoles])

  const getRolesForContact = (c: Contact): Array<{ title: string; score: number }> => {
    const cc = c.company.toLowerCase()
    if (companyRolesMap.has(cc)) return companyRolesMap.get(cc)!
    for (const [key, roles] of companyRolesMap) {
      const kw = key.split(/[\s/]+/)[0]
      if (kw.length >= 3 && (cc.includes(kw) || kw.includes(cc.split(/[\s/]+/)[0]))) return roles
    }
    return []
  }

  const contactHasRoles = (c: Contact) => getRolesForContact(c).length > 0

  const filterCounts = useMemo(() => ({
    all: contacts.length,
    'target-company': contacts.filter(c => c.at_target_company).length,
    'needs-review': contacts.filter(c => c.at_target_company && !c.reviewed).length,
    warm: contacts.filter(c => ['warm', 'close', 'mentor', 'referred'].includes(c.relationship)).length,
    'has-roles': contacts.filter(c => contactHasRoles(c)).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [contacts, companyRolesMap])

  const sortedContacts = useMemo(() => {
    let filtered = contacts

    // Apply contact filter
    if (contactFilter === 'target-company') filtered = filtered.filter(c => c.at_target_company)
    else if (contactFilter === 'needs-review') filtered = filtered.filter(c => c.at_target_company && !c.reviewed)
    else if (contactFilter === 'warm') filtered = filtered.filter(c => ['warm', 'close', 'mentor', 'referred'].includes(c.relationship))
    else if (contactFilter === 'has-roles') filtered = filtered.filter(c => contactHasRoles(c))

    // Apply search
    filtered = filtered.filter(c => {
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
  }, [contacts, searchQuery, sortBy, contactFilter])

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  // Group contacts by company for filtered views
  const groupedContacts = useMemo(() => {
    if (contactFilter === 'all' || contactFilter === 'warm') return null
    const groups = new Map<string, Contact[]>()
    for (const c of sortedContacts) {
      const key = c.at_target_company || c.company
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }
    return [...groups.entries()]
  }, [sortedContacts, contactFilter])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
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
          {/* Directive notifications */}
          <DirectiveBanner
            notifications={notifications}
            onDismiss={dismissNotification}
            onDismissAll={dismissAllNotifications}
            onDiscuss={sendChatMessage}
          />
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
                  onClick={() => setShowImportModal(true)}
                  className="px-4 py-2 border border-accent/30 text-accent rounded-lg text-sm font-medium hover:bg-accent/10 transition-colors whitespace-nowrap"
                  title="Import your LinkedIn connections from a CSV export"
                >
                  Import LinkedIn
                </button>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
                >
                  + Add Contact
                </button>
              </div>

              {/* Filter pills */}
              <div className="flex gap-1 mb-3">
                {([
                  { key: 'has-roles' as ContactFilter, label: 'Has Open Roles', count: filterCounts['has-roles'] },
                  { key: 'target-company' as ContactFilter, label: 'At Target Companies', count: filterCounts['target-company'] },
                  { key: 'needs-review' as ContactFilter, label: 'Needs Review', count: filterCounts['needs-review'] },
                  { key: 'warm' as ContactFilter, label: 'Warm Contacts', count: filterCounts.warm },
                  { key: 'all' as ContactFilter, label: 'All', count: filterCounts.all },
                ]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setContactFilter(f.key)}
                    className={`text-xs px-3 py-1.5 rounded-md ${contactFilter === f.key ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text hover:bg-bg'}`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
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
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">
                    {searchQuery ? 'No contacts match your search.' : 'No contacts yet.'}
                  </p>
                  {!searchQuery && (
                    <p className="text-text-muted text-sm mb-4">
                      Add contacts manually or use the agent to generate outreach.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {groupedContacts ? (
                    groupedContacts.map(([company, groupContacts]) => (
                      <div key={company} className="mb-5">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{company}</h3>
                          <span className="text-[10px] text-text-muted/60">({groupContacts.length})</span>
                          {groupContacts[0] && getRolesForContact(groupContacts[0]).length > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">
                              {getRolesForContact(groupContacts[0]).map(r => `${r.title} · ${r.score}`).join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {groupContacts.map(contact => {
                            const badge = RELATIONSHIP_BADGES[contact.relationship] || RELATIONSHIP_BADGES.cold
                            const isExpanded = expandedContact === contact.id
                            const hasPendingFU = contact.follow_ups.some(fu => fu.status === 'pending' && fu.due <= todayStr)
                            const canHelp = displayValue(contact.can_help_with)

                            return (
                        <div key={contact.id} className={`border rounded-lg transition-all ${
                          isExpanded ? 'col-span-1 md:col-span-2 xl:col-span-3 border-accent/30 shadow-md' : 'border-border hover:shadow-sm hover:border-border/80'
                        }`}>
                          <div
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('[data-review-btn]')) return
                              setExpandedContact(isExpanded ? null : contact.id)
                            }}
                            className="w-full text-left p-3 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{contact.name}</span>
                              <span className={`text-[10px] px-1.5 py-0 rounded-full shrink-0 ${badge.bg} ${badge.text}`}>{badge.label}</span>
                            </div>
                            {contact.role && <p className="text-xs text-text-muted mt-0.5">{truncate(contact.role, 50)}</p>}
                          </div>
                          {/* Inline review */}
                          {!contact.reviewed && contact.at_target_company && !isExpanded && (
                            <div className="px-3 pb-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <select
                                defaultValue="unknown"
                                onChange={(ev) => {
                                  const rel = ev.target.value
                                  setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, relationship: rel as Contact['relationship'], reviewed: true } : c))
                                  if (['warm','close','mentor'].includes(rel)) setExpandedContact(contact.id)
                                  fetch('/api/networking/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: contact.id, fields: { relationship: rel, reviewed: true } }) }).catch(() => {})
                                }}
                                className="text-[10px] px-1.5 py-1 border border-border rounded bg-bg text-text"
                              >
                                <option value="unknown">Relationship...</option>
                                {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              <input type="text" placeholder="How you know..." className="text-[10px] flex-1 px-2 py-1 border border-border rounded bg-bg text-text"
                                onBlur={(ev) => { const v = ev.target.value.trim(); if (!v) return; fetch('/api/networking/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: contact.id, fields: { how_you_know: v } }) }).catch(() => {}) }}
                                onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
                              />
                            </div>
                          )}
                        </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
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
                          <div
                            onClick={(e) => {
                              // Don't toggle expand if a review button was clicked
                              if ((e.target as HTMLElement).closest('[data-review-btn]')) return
                              setExpandedContact(isExpanded ? null : contact.id)
                            }}
                            className="w-full text-left p-3 cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{contact.name}</span>
                                  {hasPendingFU && <span className="w-2 h-2 bg-warning rounded-full flex-shrink-0" title="Follow-up due" />}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-xs text-text-muted truncate max-w-[140px]">{contact.company}</span>
                                  <span className={`text-[10px] px-1.5 py-0 rounded-full shrink-0 ${badge.bg} ${badge.text}`}>{badge.label}</span>
                                  {contact.at_target_company && (
                                    <span className="text-[9px] px-1.5 py-0 rounded-full bg-accent/10 text-accent font-medium shrink-0">Target</span>
                                  )}
                                  {contactHasRoles(contact) && (
                                    <span className="text-[9px] px-1.5 py-0 rounded-full bg-success/10 text-success font-medium shrink-0">
                                      {companyRolesMap.get(contact.company.toLowerCase())?.length} {companyRolesMap.get(contact.company.toLowerCase())?.length === 1 ? 'Role' : 'Roles'}
                                    </span>
                                  )}
                                </div>
                                {contact.role && (
                                  <p className="text-xs text-text-muted mt-1">{truncate(contact.role, 40)}</p>
                                )}
                                {canHelp && (
                                  <p className="text-xs text-text-muted/70 mt-0.5">Can help: {truncate(canHelp, 30)}</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Inline review — for unreviewed target company contacts */}
                          {!contact.reviewed && contact.at_target_company && !isExpanded && (
                            <div className="px-3 pb-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <select
                                defaultValue="unknown"
                                onChange={(e) => {
                                  const rel = e.target.value
                                  setContacts(prev => prev.map(c =>
                                    c.id === contact.id ? { ...c, relationship: rel as Contact['relationship'], reviewed: true } : c
                                  ))
                                  if (rel === 'warm' || rel === 'close' || rel === 'mentor') setExpandedContact(contact.id)
                                  fetch('/api/networking/contacts', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: contact.id, fields: { relationship: rel, reviewed: true } }),
                                  }).catch(() => {})
                                }}
                                className="text-[10px] px-1.5 py-1 border border-border rounded bg-bg text-text"
                              >
                                <option value="unknown">Relationship...</option>
                                {RELATIONSHIP_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="How you know them..."
                                className="text-[10px] flex-1 px-2 py-1 border border-border rounded bg-bg text-text"
                                onBlur={(e) => {
                                  const val = e.target.value.trim()
                                  if (!val) return
                                  setContacts(prev => prev.map(c =>
                                    c.id === contact.id ? { ...c, how_you_know: val } : c
                                  ))
                                  fetch('/api/networking/contacts', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: contact.id, fields: { how_you_know: val } }),
                                  }).catch(() => {})
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              />
                            </div>
                          )}

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

                              {/* Roles at this company */}
                              {contactHasRoles(contact) && (
                                <div className="bg-success-tint border border-success/20 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-success mb-1.5">Open Roles at {contact.company}</p>
                                  {companyRolesMap.get(contact.company.toLowerCase())?.map((role, i) => (
                                    <p key={i} className="text-xs text-text-muted">{role.title} — <span className="font-medium text-success">{role.score}/100</span></p>
                                  ))}
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center gap-2 pt-2">
                                {['warm', 'close', 'mentor', 'referred', 'connected'].includes(contact.relationship) ? (
                                  <button
                                    onClick={() => handleRequestReferral(contact)}
                                    disabled={chatProcessing}
                                    className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                                    title="Draft a 3-message referral sequence for this contact"
                                  >
                                    Request Referral
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => sendChatMessage(`Run this command first: cat .claude/skills/connection-request/SKILL.md — then generate a personalized connection request for: ${contact.name} at ${contact.company}. Their role: ${contact.role || 'unknown'}. This is a single contact, not a batch.`)}
                                    disabled={chatProcessing}
                                    className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                                    title="Draft a personalized connection request message"
                                  >
                                    Draft Connection Request
                                  </button>
                                )}
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
                  )}
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
                <div className="text-center py-12">
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
                    <div key={idx} className={`border rounded-lg p-4 ${
                      msg.sent ? 'border-success/20 bg-success/5 opacity-60' : 'border-border'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">{msg.recipient || 'Untitled'}</span>
                          {msg.company && <span className="text-text-muted text-xs ml-2">{msg.company}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-muted">{msg.text.length} chars</span>
                          {msg.sent && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/10 text-success">Sent</span>}
                        </div>
                      </div>
                      <p className="text-xs text-text-muted mt-1 line-clamp-2">{msg.text.slice(0, 120)}{msg.text.length > 120 ? '...' : ''}</p>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => setViewingMessage({ recipient: msg.recipient, company: msg.company, text: msg.text })}
                          className="text-xs text-accent hover:text-accent-hover font-medium">View</button>
                        {!msg.sent ? (
                          <>
                            <button onClick={() => handleCopyMessage(msg.text, idx)}
                              className="text-xs text-text-muted hover:text-text">{copiedIdx === idx ? 'Copied!' : 'Copy'}</button>
                            <button onClick={() => sendChatMessage(`Revise this message for ${msg.company}. Make it more personal. Original: "${msg.text}"`)}
                              className="text-xs text-text-muted hover:text-accent font-medium">Edit</button>
                            <button onClick={async () => {
                              if (msg.id) await fetch('/api/networking/messages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id, field: 'status', value: 'sent' }) })
                              handleMarkSent(idx)
                            }} className="text-xs text-success hover:text-success font-medium">Mark Sent</button>
                            <button onClick={async () => {
                              if (msg.id) await fetch('/api/networking/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id }) })
                              setParsedMessages(prev => prev.filter((_, i) => i !== idx))
                            }} className="text-xs text-text-muted hover:text-danger ml-auto">Delete</button>
                          </>
                        ) : (
                          <span className="text-xs text-text-muted">Sent ✓</span>
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
                    {userLinkedIn ? (
                      <div className="flex items-center gap-2">
                        <a href={userLinkedIn.startsWith('http') ? userLinkedIn : `https://${userLinkedIn}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-accent hover:text-accent-hover">View Profile ↗</a>
                        <button onClick={() => {
                          const url = prompt('LinkedIn profile URL:', userLinkedIn || '')
                          if (url !== null) {
                            localStorage.setItem('user-linkedin-url', url.trim())
                            window.location.reload()
                          }
                        }} className="text-xs text-text-muted hover:text-text">Edit</button>
                      </div>
                    ) : (
                      <button onClick={() => {
                        const url = prompt('Enter your LinkedIn profile URL:')
                        if (url) {
                          localStorage.setItem('user-linkedin-url', url.trim())
                          window.location.reload()
                        }
                      }} className="text-xs text-accent hover:text-accent-hover">Set Profile URL</button>
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
                  <div className="text-center py-12">
                    <p className="text-text-muted">Loading...</p>
                  </div>
                ) : linkedinDocs.length === 0 ? (
                  <div className="text-center py-12">
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

      {/* LinkedIn Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-center justify-center" onClick={() => { if (!importing) setShowImportModal(false) }}>
          <div className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">Import LinkedIn Connections</h2>

              {!importResult ? (
                <>
                  <div className="space-y-4 mb-6">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <div>
                        <p className="text-sm font-medium">Export your connections from LinkedIn</p>
                        <p className="text-xs text-text-muted mt-1">Go to <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">LinkedIn Settings → Data Privacy → Get a copy of your data</a></p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <div>
                        <p className="text-sm font-medium">Select &quot;Connections&quot; and request the archive</p>
                        <p className="text-xs text-text-muted mt-1">LinkedIn will email you a download link — usually within 10 minutes.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <div>
                        <p className="text-sm font-medium">Upload the Connections.csv file below</p>
                        <p className="text-xs text-text-muted mt-1">The file is named <code className="text-xs bg-bg px-1 py-0.5 rounded">Connections.csv</code> inside the downloaded archive.</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      id="linkedin-csv-upload"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setImporting(true)
                        try {
                          const text = await file.text()
                          const res = await fetch('/api/networking/import-connections', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ csv: text }),
                          })
                          const data = await res.json()
                          if (data.ok) {
                            setImportResult(data)
                            loadContacts()
                          } else {
                            setChatMessages(prev => [...prev, { role: 'agent', content: `Import failed: ${data.error}` }])
                            setShowImportModal(false)
                          }
                        } catch {
                          setChatMessages(prev => [...prev, { role: 'agent', content: 'Import failed — could not parse CSV.' }])
                          setShowImportModal(false)
                        }
                        setImporting(false)
                      }}
                    />
                    <label htmlFor="linkedin-csv-upload" className="cursor-pointer">
                      {importing ? (
                        <p className="text-sm text-text-muted">Importing...</p>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-accent">Click to upload Connections.csv</p>
                          <p className="text-xs text-text-muted mt-1">or drop it directly into <code className="bg-bg px-1 py-0.5 rounded">search/vault/uploads/</code></p>
                        </>
                      )}
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-success-tint border border-success/20 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-success">Imported {importResult.total} connections</p>
                    <p className="text-xs text-text-muted mt-1">{importResult.at_target_companies} at your target companies</p>
                  </div>

                  {importResult.at_target_companies > 0 && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold mb-2">Connections at Target Companies</h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {Object.entries(importResult.by_company).map(([company, people]) => (
                          <div key={company} className="bg-bg rounded-lg p-3">
                            <p className="text-xs font-semibold text-accent mb-1">{company} ({people.length})</p>
                            {people.slice(0, 5).map((p, i) => (
                              <p key={i} className="text-xs text-text-muted">{p.name} · {p.position}</p>
                            ))}
                            {people.length > 5 && <p className="text-xs text-text-muted">+{people.length - 5} more</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setContactFilter('needs-review')
                        setShowImportModal(false)
                        setImportResult(null)
                      }}
                      className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover"
                    >
                      Review Contacts
                    </button>
                    <button
                      onClick={() => { setShowImportModal(false); setImportResult(null) }}
                      className="px-4 py-2 border border-border rounded-lg text-sm text-text-muted hover:bg-bg"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {!importResult && (
                <div className="flex justify-end mt-4">
                  <button onClick={() => setShowImportModal(false)} className="text-sm text-text-muted hover:text-text">Cancel</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message Overlay */}
      {viewingMessage && (
        <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex" onClick={() => setViewingMessage(null)}>
          <div className="w-full max-w-3xl mx-auto bg-surface border-x border-border shadow-lg flex flex-col h-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="font-semibold">{viewingMessage.recipient || 'Message'}</h3>
                {viewingMessage.company && <p className="text-xs text-text-muted mt-0.5">{viewingMessage.company}</p>}
              </div>
              <button onClick={() => setViewingMessage(null)} className="p-1.5 rounded-md hover:bg-bg text-text-muted hover:text-text transition-colors" aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg/50 shrink-0">
              <button onClick={() => navigator.clipboard.writeText(viewingMessage.text)}
                className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">Copy All</button>
              <button onClick={() => { setViewingMessage(null); sendChatMessage(`Revise this message for ${viewingMessage.company}. Make it more personal. Original: "${viewingMessage.text}"`) }}
                className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">Edit with Agent</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{viewingMessage.text}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Right Panel: Agent Chat (35%) ────────────────────────────── */}
      <div className="w-[35%] flex flex-col bg-surface">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${chatProcessing ? 'bg-warning animate-pulse' : 'bg-accent'}`} />
            <span className="text-sm font-semibold text-text">Networking Agent</span>
          </div>
          <a href="/command-center" className="text-xs text-text-muted hover:text-text">
            Manage
          </a>
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
              <div className="max-w-[90%]">
                <AgentProgress agentName="Networking agent" lastMessage={chatMessages.filter(m => m.role === 'user').at(-1)?.content} spawnId={agentSpawnId} />
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
