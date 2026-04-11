'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
import { MarkdownView } from '../_components/markdown-view'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScoredJD {
  filename: string
  company: string
  role: string
  score: number
  recommendation: string
  path: string
  url: string
  date: string
  jd_file: string
}

interface TargetCompany {
  name: string
  slug: string
  fit_score: number
  status: string
  priority: string
  notes: string
}

interface CompanyIntel {
  company: string
  slug: string
  industry: string
  hq: string
  size: string
  stage: string
  website: string
  careers_url: string
  culture: {
    values: string[]
    engineering_culture: string
    remote_policy: string
  }
  interview: {
    stages: { name: string; duration: string; format: string; notes?: string }[]
    timeline: string
    tips: string[]
  }
  comp: {
    currency: string
    bands: { level: string; base: string; equity: string; total: string }[]
    notes: string
  }
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
}

type TabKey = 'open-roles' | 'score' | 'scored-jds' | 'companies' | 'intel'

interface OpenRole {
  id: string
  company: string
  company_slug: string
  title: string
  url: string
  location: string
  posted_date: string
  discovered_date: string
  source: string
  fit_estimate: number
  status: 'new' | 'scored' | 'applied' | 'dismissed'
  score?: number
  jd_file?: string
  notes?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RESEARCH_DIRECTIVE = `You are the user's research specialist. Read search/context/career-plan.yaml, search/context/experience-library.yaml, and search/context/target-companies.yaml for context.

IMPORTANT: If career-plan.yaml is empty or missing key fields (level, functions, industries), you MUST do BOTH of these steps:

Step 1 — Tell the user: "Your career plan isn't set up yet. Head to the Job Search Coach to complete your profile first — I need your target role, industries, and preferences to find the right companies."

Step 2 — You MUST post a user-action directive. This is NOT optional. Do this IMMEDIATELY:
   First, read_blackboard to get the current directives array.
   Then, write_to_blackboard with path "directives" and value being the existing array PLUS this new entry:
   {"id":"dir-${Date.now()}","type":"user_action","text":"Your career plan is needed before company research can begin","button_label":"Complete Career Plan","route":"/coach","chat_message":"I need to complete my career plan. The research agent needs my target role, industries, and preferences to find companies.","assigned_to":"coach","from":"research","priority":"high","status":"pending","posted_at":"${new Date().toISOString()}"}

If context is available, greet the user briefly and ask what they'd like help with today. You can help with: scoring job descriptions, researching companies, generating target company lists, scanning for open roles, and analyzing job fit.`

const SCORE_APPLY_THRESHOLD = 75
const SCORE_REFERRAL_THRESHOLD = 60

// ─── Component ──────────────────────────────────────────────────────────────

export default function FindingPage() {
  // ─── Tab state (persisted) ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'score'
    try { return (localStorage.getItem('finding-active-tab') as TabKey) || 'companies' } catch { return 'companies' }
  })

  // ─── Data state ──────────────────────────────────────────────────────────
  const [scoredJDs, setScoredJDs] = useState<ScoredJD[]>([])
  const [companies, setCompanies] = useState<TargetCompany[]>([])
  const [vaultJDs, setVaultJDs] = useState<string[]>([])
  const [intelSlugs, setIntelSlugs] = useState<Set<string>>(new Set())

  // Open roles state
  const [openRoles, setOpenRoles] = useState<OpenRole[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [scanStale, setScanStale] = useState(true)
  const [roleFilter, setRoleFilter] = useState<'all' | 'new' | 'scored'>('new')

  // Score JD form
  const [jdText, setJdText] = useState('')
  const [jdCompany, setJdCompany] = useState('')
  const [jdRole, setJdRole] = useState('')
  const [jdUrl, setJdUrl] = useState('')

  // Scored JDs search/sort
  const [jdSearch, setJdSearch] = useState('')
  const [jdSort, setJdSort] = useState<'score' | 'date'>('score')

  // Selected JD detail
  const [selectedJD, setSelectedJD] = useState<ScoredJD | null>(null)
  const [jdContent, setJdContent] = useState('')

  // Company search
  const [companySearch, setCompanySearch] = useState('')
  const [researchInput, setResearchInput] = useState('')

  // Intel viewer
  const [selectedIntelSlug, setSelectedIntelSlug] = useState<string | null>(null)
  const [intelData, setIntelData] = useState<CompanyIntel | null>(null)
  const [intelRaw, setIntelRaw] = useState<string | null>(null)
  const [intelLoading, setIntelLoading] = useState(false)

  // Pipeline feedback
  const [pipelineMsg, setPipelineMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Track last action type for conditional data refresh + button disabling
  const lastActionRef = useRef<'score' | 'research' | 'targets' | 'chat' | 'init'>('init')

  // ─── Chat state (persisted) ──────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('finding-chat-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [chatInput, setChatInput] = useState('')
  const hasSpawnedRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Agent hook — single persistent session for all research actions
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('finding-chat')

  // Derived from agent hook — survives tab switches
  const chatProcessing = agentStatus === 'running'
  const actionProcessing = chatProcessing && lastActionRef.current !== 'init' && lastActionRef.current !== 'chat'

  // Directive notifications for research agent
  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('research')

  // ─── Auto-detect company from JD text ────────────────────────────────────
  const detectedCompany = useMemo(() => {
    if (!jdText.trim()) return null
    const lower = jdText.toLowerCase()
    return companies.find((c) => lower.includes(c.name.toLowerCase())) || null
  }, [jdText, companies])

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadScoredJDs = useCallback(async () => {
    try {
      const res = await fetch('/api/finding/scored-jds')
      if (res.ok) {
        const data = await res.json() as { scoredJDs: ScoredJD[] }
        setScoredJDs(data.scoredJDs)
      }
    } catch { /* ignore */ }
  }, [])

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/context/target-companies')
      if (res.ok) {
        const data = await res.json()
        setCompanies(data?.companies || [])
      }
    } catch { /* ignore */ }
  }, [])

  const loadIntelStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/finding/intel-status')
      if (res.ok) {
        const data = await res.json() as { slugs: string[] }
        const sorted = data.slugs.sort().join(',')
        setIntelSlugs(prev => {
          const prevSorted = [...prev].sort().join(',')
          return prevSorted === sorted ? prev : new Set(data.slugs)
        })
      }
    } catch { /* ignore */ }
  }, [])

  const loadOpenRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/finding/open-roles')
      if (res.ok) {
        const data = await res.json() as { roles: OpenRole[]; last_scan: string | null; scan_stale: boolean }
        setOpenRoles(data.roles)
        setLastScan(data.last_scan)
        setScanStale(data.scan_stale)
      }
    } catch { /* ignore */ }
  }, [])

  const loadVaultJDs = useCallback(async () => {
    try {
      const res = await fetch('/api/finding/vault-jds')
      if (res.ok) {
        const data = await res.json() as { files: string[] }
        setVaultJDs(data.files)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadScoredJDs()
    loadCompanies()
    loadIntelStatus()
    loadVaultJDs()
    loadOpenRoles()

    // Poll for changes from auto-dispatched agents
    const interval = setInterval(() => {
      loadScoredJDs()
      loadCompanies()
      loadIntelStatus()
      loadOpenRoles()
    }, 30_000)
    return () => clearInterval(interval)
  }, [loadScoredJDs, loadCompanies, loadIntelStatus, loadVaultJDs, loadOpenRoles])

  // ─── Persistence ─────────────────────────────────────────────────────────

  useEffect(() => { try { localStorage.setItem('finding-active-tab', activeTab) } catch {} }, [activeTab])
  useEffect(() => {
    if (chatMessages.length > 0) {
      try { localStorage.setItem('finding-chat-messages', JSON.stringify(chatMessages)) } catch {}
    }
  }, [chatMessages])

  // ─── Chat logic ──────────────────────────────────────────────────────────

  const scrollChatToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => { scrollChatToBottom() }, [chatMessages.length, scrollChatToBottom])

  // Spawn agent on first load — wait for blackboard to be ready
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
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 1000))
      }
      if (cancelled) return
      spawnAgent('research', {
        skill: 'research-chat',
        entry_name: 'research-session',
        text: RESEARCH_DIRECTIVE,
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

      agentReset()
      // Conditional refresh based on what action was taken
      const action = lastActionRef.current
      if (action === 'score') { loadScoredJDs(); loadOpenRoles() }
      if (action === 'targets') { loadCompanies(); loadIntelStatus() }
      if (action === 'research') loadIntelStatus()
      lastActionRef.current = 'chat'
    }
    if (agentStatus === 'failed') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Something went wrong. Please try again.' }])

      agentReset()
    }
    if (agentStatus === 'timeout') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Request timed out. Please try again.' }])

      agentReset()
    }
  }, [agentStatus, agentOutput, agentReset, loadScoredJDs, loadCompanies, loadIntelStatus])

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatProcessing) return
    setChatMessages(prev => [...prev, { role: 'user', content: text.trim() }])
    setChatInput('')


    try {
      const result = await spawnAgent('research', {
        skill: 'research-chat',
        entry_name: 'research-followup',
        text: text.trim(),
      })
      if (result === null) {
        setChatMessages(prev => [...prev, { role: 'agent', content: 'The agent is still processing. Please wait a moment.' }])
  
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to reach agent. Please try again.' }])

    }
  }, [agentStatus, spawnAgent])

  const handleScanRoles = useCallback(() => {
    lastActionRef.current = 'score'
    setActiveTab('open-roles')
    sendChatMessage(
      'Run this command first: cat .claude/skills/scan-roles/SKILL.md — then follow the instructions in that file to scan for open roles at all high-priority target companies. This is a full scan.'
    )
  }, [sendChatMessage])

  // Pick up pending action from user-action bar navigation
  usePendingAction(sendChatMessage, setActiveTab as (tab: string) => void)

  // ─── Action handlers (send through chat) ─────────────────────────────────

  const handleScoreJD = () => {
    if (!jdText.trim()) return
    lastActionRef.current = 'score'
    const company = jdCompany.trim() || detectedCompany?.name || ''
    const role = jdRole.trim() || ''

    // Save JD to vault
    fetch('/api/vault/save-jd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: company || 'unknown', role: role || 'unknown', url: jdUrl.trim(), text: jdText.trim() }),
    }).catch(() => {})

    setActiveTab('scored-jds')
    sendChatMessage(
      `Score this job description against my profile. Read search/context/experience-library.yaml and search/context/career-plan.yaml for context. Write the scored result to search/entries/ with frontmatter containing Company, Role, URL, Date, and JD File fields.\n\nCompany: ${company}\nRole: ${role}\n${jdUrl.trim() ? `URL: ${jdUrl.trim()}\n` : ''}\nJob Description:\n${jdText.trim()}`
    )

    // Clear form
    setJdText('')
    setJdCompany('')
    setJdRole('')
    setJdUrl('')
  }

  const handleResearchCompany = (companyName: string) => {
    lastActionRef.current = 'research'
    setActiveTab('intel')
    sendChatMessage(
      `Research "${companyName}" and produce structured company intel. Write to search/intel/${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.yaml with structure: company, slug, industry, hq, size, stage, website, careers_url, culture (values, engineering_culture, remote_policy), interview (stages, timeline, tips), comp (currency, bands, notes). Read search/context/career-plan.yaml for context.`
    )
  }

  const handleGenerateTargets = () => {
    lastActionRef.current = 'targets'
    setActiveTab('companies')
    sendChatMessage(
      'Run this command first: cat .claude/skills/generate-targets/SKILL.md — then follow the instructions in that file to generate a ranked list of target companies. If my career plan is empty, tell me to complete it with the Job Search Coach first — do NOT ask me for the details directly.'
    )
  }

  const handleScoreVaultJD = (filename: string) => {
    lastActionRef.current = 'score'
    setActiveTab('scored-jds')
    sendChatMessage(
      `Score the job description from file search/vault/job-descriptions/${filename} against my profile. Read search/context/experience-library.yaml and search/context/career-plan.yaml for context. Write the scored result to search/entries/.`
    )
  }

  const prefillScoreJDForCompany = (companyName: string) => {
    setActiveTab('score')
    setJdCompany(companyName)
    setJdRole('')
    setJdUrl('')
    setJdText('')
  }

  // ─── JD detail ───────────────────────────────────────────────────────────

  const viewScoredJD = async (jd: ScoredJD) => {
    setSelectedJD(jd)
    try {
      const res = await fetch(`/api/finding/scored-jds/${encodeURIComponent(jd.filename)}`)
      if (res.ok) {
        const data = await res.json() as { content: string }
        setJdContent(data.content)
      }
    } catch {
      setJdContent('Failed to load JD analysis.')
    }
  }

  const deleteScoredJD = async (filename: string) => {
    if (!confirm('Delete this scored JD?')) return
    try {
      const res = await fetch('/api/finding/scored-jds', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      if (res.ok) {
        setScoredJDs(prev => prev.filter(jd => jd.filename !== filename))
        if (selectedJD?.filename === filename) {
          setSelectedJD(null)
          setJdContent('')
        }
      }
    } catch { /* ignore */ }
  }

  const addToPipeline = async (company: string, role: string, fitScore: number, jdFile?: string) => {
    setPipelineMsg(null)
    try {
      const res = await fetch('/api/pipeline/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, role, status: 'researching', fit_score: fitScore, jd_source: jdFile || 'scored' }),
      })
      if (res.ok) {
        setPipelineMsg({ type: 'success', text: `Added ${company} - ${role} to pipeline` })
        setTimeout(() => setPipelineMsg(null), 4000)
      } else {
        const data = await res.json().catch(() => ({}))
        setPipelineMsg({ type: 'error', text: (data as { error?: string }).error || 'Failed to add' })
      }
    } catch {
      setPipelineMsg({ type: 'error', text: 'Failed to add to pipeline' })
    }
  }

  // ─── Intel viewer ────────────────────────────────────────────────────────

  const viewIntel = async (slug: string) => {
    setActiveTab('intel')
    setSelectedIntelSlug(slug)
    setIntelLoading(true)
    setIntelData(null)
    setIntelRaw(null)
    try {
      const res = await fetch(`/api/finding/intel/${encodeURIComponent(slug)}`)
      if (res.ok) {
        const data = await res.json() as { intel: CompanyIntel; raw: string }
        setIntelData(data.intel)
        setIntelRaw(data.raw)
      }
    } catch { /* ignore */ }
    setIntelLoading(false)
  }

  // ─── Computed ────────────────────────────────────────────────────────────

  const filteredScoredJDs = useMemo(() => {
    let list = [...scoredJDs]
    if (jdSearch.trim()) {
      const q = jdSearch.toLowerCase()
      list = list.filter(jd => jd.company.toLowerCase().includes(q) || jd.role.toLowerCase().includes(q))
    }
    if (jdSort === 'score') list.sort((a, b) => b.score - a.score)
    else list.sort((a, b) => b.filename.localeCompare(a.filename))
    return list
  }, [scoredJDs, jdSearch, jdSort])

  const filteredCompanies = useMemo(() => {
    let list = [...companies]
    if (companySearch.trim()) {
      const q = companySearch.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.notes?.toLowerCase().includes(q))
    }
    // Sort: high priority first, then by fit score
    const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    list.sort((a, b) => (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2) || (b.fit_score || 0) - (a.fit_score || 0))
    return list
  }, [companies, companySearch])

  // ─── Stats ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let applyCount = 0, referralCount = 0, totalScore = 0
    for (const j of scoredJDs) {
      totalScore += j.score
      if (j.score >= SCORE_APPLY_THRESHOLD) applyCount++
      else if (j.score >= SCORE_REFERRAL_THRESHOLD) referralCount++
    }
    const avgScore = scoredJDs.length > 0 ? Math.round(totalScore / scoredJDs.length) : 0
    return { applyCount, referralCount, avgScore }
  }, [scoredJDs])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* ─── Left Panel: Tabs (65%) ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        {/* Stats bar */}
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold mb-3">Finding Roles</h1>
          <div className="flex gap-3">
            {[
              { label: 'New Roles', value: openRoles.filter(r => r.status === 'new').length },
              { label: 'Scored JDs', value: scoredJDs.length },
              { label: 'Apply', value: stats.applyCount },
              { label: 'Avg Score', value: stats.avgScore || '—' },
              { label: 'Companies', value: companies.length },
              { label: 'Researched', value: intelSlugs.size },
            ].map(s => (
              <div key={s.label} className="flex-1 bg-surface border border-border rounded-lg px-3 py-2">
                <div className="text-xs text-text-muted">{s.label}</div>
                <div className="text-lg font-bold">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-6 border-b border-border px-5">
          {([
            { key: 'companies' as TabKey, label: `Companies${companies.length > 0 ? ` (${companies.length})` : ''}` },
            { key: 'open-roles' as TabKey, label: `Open Roles${openRoles.filter(r => r.status === 'new').length > 0 ? ` (${openRoles.filter(r => r.status === 'new').length})` : ''}` },
            { key: 'score' as TabKey, label: 'Score JD' },
            { key: 'scored-jds' as TabKey, label: `Scored JDs${scoredJDs.length > 0 ? ` (${scoredJDs.length})` : ''}` },
            { key: 'intel' as TabKey, label: 'Intel' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.key ? 'text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Directive notifications */}
          <DirectiveBanner
            notifications={notifications}
            onDismiss={dismissNotification}
            onDismissAll={dismissAllNotifications}
            onDiscuss={sendChatMessage}
          />
          {/* ─── Open Roles Tab ───────────────────────────────────── */}
          {activeTab === 'open-roles' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {(['new', 'scored', 'all'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setRoleFilter(f)}
                        className={`text-xs px-3 py-1.5 rounded-md capitalize ${roleFilter === f ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text hover:bg-bg'}`}
                      >
                        {f} {f === 'new' ? `(${openRoles.filter(r => r.status === 'new').length})` : f === 'scored' ? `(${openRoles.filter(r => r.status === 'scored').length})` : `(${openRoles.length})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {lastScan && (
                    <span className="text-xs text-text-muted">
                      Last scan: {new Date(lastScan).toLocaleDateString()} {new Date(lastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {scanStale && !chatProcessing && (
                    <span className="text-xs text-warning font-medium">Stale</span>
                  )}
                  <button
                    onClick={() => handleScanRoles()}
                    disabled={chatProcessing}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {chatProcessing ? 'Scanning...' : 'Scan for Roles'}
                  </button>
                </div>
              </div>

              {chatProcessing && activeTab === 'open-roles' && (
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-4 flex items-center gap-3">
                  <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="text-sm font-medium">Scanning target companies for open roles...</p>
                    <p className="text-xs text-text-muted">The research agent is checking career pages at your high-priority companies. This may take a few minutes.</p>
                  </div>
                </div>
              )}

              {openRoles.length === 0 && !chatProcessing ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No open roles discovered yet.</p>
                  <p className="text-text-muted text-sm mb-4">Click &quot;Scan for Roles&quot; to search your target companies for matching positions.</p>
                  <button
                    onClick={() => handleScanRoles()}
                    disabled={chatProcessing}
                    className="text-sm text-accent hover:text-accent-hover font-medium"
                  >
                    Run First Scan
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {openRoles
                    .filter(r => roleFilter === 'all' ? r.status !== 'dismissed' : r.status === roleFilter)
                    .sort((a, b) => b.fit_estimate - a.fit_estimate)
                    .map(role => (
                    <div key={role.id} className={`p-4 rounded-lg border transition-colors ${
                      role.status === 'new' ? 'border-accent/30 bg-accent/5' : 'border-border'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {role.status === 'new' && <span className="w-2 h-2 bg-accent rounded-full" />}
                          <span className="font-medium text-sm">{role.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            role.fit_estimate >= SCORE_APPLY_THRESHOLD ? 'bg-success/10 text-success'
                              : role.fit_estimate >= SCORE_REFERRAL_THRESHOLD ? 'bg-warning/10 text-warning'
                                : 'bg-text-muted/10 text-text-muted'
                          }`}>
                            {role.fit_estimate}% fit
                          </span>
                          {role.score && (
                            <span className="text-xs text-accent font-medium">Scored: {role.score}/100</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
                        <span>{role.company}</span>
                        {role.location && <><span>·</span><span>{role.location}</span></>}
                        {role.posted_date && <><span>·</span><span>Posted: {role.posted_date}</span></>}
                        <span>·</span>
                        <span>Found: {role.discovered_date}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {role.url && (
                          <a href={role.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover font-medium">
                            View Posting ↗
                          </a>
                        )}
                        <button
                          onClick={async () => {
                            setActiveTab('score')
                            setJdCompany(role.company)
                            setJdRole(role.title)
                            setJdUrl(role.url)
                            // Load JD text from saved file if available
                            if (role.jd_file) {
                              try {
                                const res = await fetch(`/api/vault/read-file?path=${encodeURIComponent(role.jd_file)}`)
                                if (res.ok) {
                                  const data = await res.json() as { content: string }
                                  if (data.content) setJdText(data.content)
                                }
                              } catch { /* user can paste manually */ }
                            }
                          }}
                          className="text-xs text-text-muted hover:text-accent font-medium"
                        >
                          Score JD
                        </button>
                        <button
                          onClick={() => sendChatMessage(`Research the role "${role.title}" at ${role.company}. Check if this is a good fit based on my experience and career plan. The job posting is at: ${role.url}`)}
                          disabled={chatProcessing}
                          className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50"
                        >
                          Ask Agent
                        </button>
                        {role.status === 'new' && (
                          <button
                            onClick={async () => {
                              await fetch('/api/finding/open-roles', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'dismiss', role_id: role.id }),
                              })
                              loadOpenRoles()
                            }}
                            className="text-xs text-text-muted hover:text-danger font-medium ml-auto"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Score JD Tab ──────────────────────────────────────── */}
          {activeTab === 'score' && (
            <div className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Company name</label>
                  <input
                    value={jdCompany}
                    onChange={e => setJdCompany(e.target.value)}
                    placeholder={detectedCompany?.name || 'e.g. Stripe'}
                    className="w-full px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Role title</label>
                  <input
                    value={jdRole}
                    onChange={e => setJdRole(e.target.value)}
                    placeholder="e.g. Staff Engineer"
                    className="w-full px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Job posting URL <span className="font-normal">(optional)</span></label>
                <input
                  value={jdUrl}
                  onChange={e => setJdUrl(e.target.value)}
                  placeholder="https://jobs.stripe.com/..."
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Job description</label>
                <textarea
                  value={jdText}
                  onChange={e => setJdText(e.target.value)}
                  placeholder="Paste the full job description here..."
                  className="w-full h-48 p-3 border border-border rounded-md bg-bg text-text text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              {!jdCompany && detectedCompany && (
                <div className="text-xs text-accent flex items-center gap-1">
                  <span>Detected:</span>
                  <button onClick={() => setJdCompany(detectedCompany.name)} className="font-medium underline hover:no-underline">
                    {detectedCompany.name}
                  </button>
                </div>
              )}

              <button
                onClick={handleScoreJD}
                disabled={!jdText.trim() || actionProcessing}
                className="px-5 py-2.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actionProcessing ? 'Scoring...' : 'Score JD'}
              </button>

              {/* Vault JDs */}
              {vaultJDs.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border">
                  <h3 className="text-sm font-semibold mb-2">Unscored JDs from Vault</h3>
                  <p className="text-xs text-text-muted mb-3">Files in vault/job-descriptions/</p>
                  <div className="space-y-1">
                    {vaultJDs.map(file => (
                      <div key={file} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-bg border border-transparent hover:border-border">
                        <span className="text-sm truncate">{file}</span>
                        <button
                          onClick={() => handleScoreVaultJD(file)}
                          disabled={actionProcessing}
                          className="text-xs text-accent hover:text-accent-hover font-medium cursor-pointer shrink-0 ml-2"
                        >
                          Score
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Scored JDs Tab ────────────────────────────────────── */}
          {activeTab === 'scored-jds' && (
            <div>
              {/* Pipeline feedback */}
              {pipelineMsg && (
                <div className={`mb-3 text-sm ${pipelineMsg.type === 'success' ? 'text-success' : 'text-danger'}`}>
                  {pipelineMsg.text}
                </div>
              )}

              {scoredJDs.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                  <input
                    value={jdSearch}
                    onChange={e => setJdSearch(e.target.value)}
                    placeholder="Search by company or role..."
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <div className="flex gap-1">
                    {(['score', 'date'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setJdSort(s)}
                        className={`text-xs px-3 py-1.5 rounded-md ${jdSort === s ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text hover:bg-bg'}`}
                      >
                        {s === 'score' ? 'By Score' : 'By Date'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {scoredJDs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No scored JDs yet.</p>
                  <p className="text-text-muted text-sm mb-4">Score a job description to see how well it matches your profile.</p>
                  <button onClick={() => setActiveTab('score')}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
                    Score a JD
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredScoredJDs.map(jd => (
                    <div
                      key={jd.filename}
                      className={`p-3 rounded-lg border transition-colors ${
                        selectedJD?.filename === jd.filename ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'
                      }`}
                    >
                      <button onClick={() => viewScoredJD(jd)} className="w-full text-left">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{jd.company}</span>
                              {jd.url && (
                                <a href={jd.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-accent hover:text-accent-hover text-xs">
                                  Open ↗
                                </a>
                              )}
                            </div>
                            <div className="text-text-muted text-xs mt-0.5">{jd.role}{jd.date ? ` · ${jd.date}` : ''}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              jd.score >= SCORE_APPLY_THRESHOLD ? 'bg-success/10 text-success' : jd.score >= SCORE_REFERRAL_THRESHOLD ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                            }`}>
                              {jd.score}/100
                            </span>
                            <span className={`text-xs ${
                              jd.recommendation === 'Apply' ? 'text-success' : jd.recommendation === 'Referral Only' ? 'text-warning' : 'text-danger'
                            }`}>
                              {jd.recommendation}
                            </span>
                          </div>
                        </div>
                      </button>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); addToPipeline(jd.company, jd.role, jd.score, jd.jd_file) }}
                          className="text-xs px-2.5 py-1 bg-accent/10 text-accent rounded-md hover:bg-accent/20 transition-colors"
                        >
                          Add to Pipeline
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteScoredJD(jd.filename) }}
                          className="text-xs px-2.5 py-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* JD Detail View */}
              {selectedJD && jdContent && (
                <div className="mt-4 bg-surface border border-border rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{selectedJD.company} — {selectedJD.role}</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={() => sendChatMessage(`Let's discuss this JD score for ${selectedJD.company} — ${selectedJD.role}. What are the key gaps and how can I address them?`)}
                        disabled={chatProcessing}
                        className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">
                        Discuss
                      </button>
                      <button
                        onClick={() => addToPipeline(selectedJD.company, selectedJD.role, selectedJD.score, selectedJD.jd_file)}
                        className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover"
                      >
                        Add to Pipeline
                      </button>
                      <button
                        onClick={() => { setSelectedJD(null); setJdContent('') }}
                        className="text-xs text-text-muted hover:text-text"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="bg-bg p-4 rounded-md border border-border overflow-auto max-h-[60vh]">
                    <MarkdownView content={jdContent} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Companies Tab ─────────────────────────────────────── */}
          {activeTab === 'companies' && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <input
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  placeholder="Search companies..."
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  onClick={handleGenerateTargets}
                  disabled={actionProcessing}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {actionProcessing ? 'Generating...' : 'Generate Targets'}
                </button>
              </div>

              {companies.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No target companies yet.</p>
                  <p className="text-text-muted text-sm mb-4">Generate from your career plan or add manually.</p>
                  <button
                    onClick={handleGenerateTargets}
                    disabled={actionProcessing}
                    className="text-sm text-accent hover:text-accent-hover font-medium"
                  >
                    Generate Target List
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCompanies.map(company => {
                    const hasIntel = intelSlugs.has(company.slug)
                    return (
                      <div key={company.slug} className="p-3 rounded-lg border border-border hover:bg-bg transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{company.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            company.priority === 'high' ? 'bg-danger/10 text-danger'
                              : company.priority === 'medium' ? 'bg-warning/10 text-warning'
                                : 'bg-bg text-text-muted'
                          }`}>
                            {company.priority}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          {company.fit_score > 0 && (
                            <span className="text-xs text-accent font-medium">Fit: {company.fit_score}%</span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${hasIntel ? 'bg-success/10 text-success' : 'bg-text-muted/10 text-text-muted'}`}>
                            {hasIntel ? 'Researched' : 'No intel'}
                          </span>
                        </div>
                        {company.notes && <p className="text-xs text-text-muted mb-2 line-clamp-2">{company.notes}</p>}
                        <div className="flex items-center gap-2">
                          {hasIntel ? (
                            <button onClick={() => viewIntel(company.slug)} className="text-xs text-accent hover:text-accent-hover font-medium cursor-pointer">
                              View Intel
                            </button>
                          ) : (
                            <button onClick={() => handleResearchCompany(company.name)} disabled={actionProcessing} className="text-xs text-accent hover:text-accent-hover font-medium cursor-pointer disabled:opacity-50">
                              Get Intel
                            </button>
                          )}
                          <span className="text-border">·</span>
                          <button onClick={() => prefillScoreJDForCompany(company.name)} className="text-xs text-text-muted hover:text-accent cursor-pointer">
                            Score JD
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Intel Tab ─────────────────────────────────────────── */}
          {activeTab === 'intel' && (
            <div>
              {/* Company selector */}
              <div className="flex items-center gap-3 mb-4">
                <select
                  value={selectedIntelSlug || ''}
                  onChange={e => { if (e.target.value) viewIntel(e.target.value) }}
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option value="">Select a company...</option>
                  {companies.filter(c => intelSlugs.has(c.slug)).map(c => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
                <input
                  value={researchInput}
                  onChange={e => setResearchInput(e.target.value)}
                  placeholder="Research new company..."
                  className="px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 w-48"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && researchInput.trim()) {
                      handleResearchCompany(researchInput.trim())
                      setResearchInput('')
                    }
                  }}
                />
              </div>

              {intelLoading ? (
                <div className="text-center py-8">
                  <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
                  <span className="text-text-muted">Loading intel...</span>
                </div>
              ) : intelData ? (
                <div className="space-y-5">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">{intelData.company}</h2>
                      <p className="text-sm text-text-muted">
                        {[intelData.industry, intelData.hq, intelData.size].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {intelData.website && (
                        <a href={intelData.website} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                          Website ↗
                        </a>
                      )}
                      {intelData.careers_url && (
                        <a href={intelData.careers_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                          Careers ↗
                        </a>
                      )}
                      <button onClick={() => prefillScoreJDForCompany(intelData.company)} className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover">
                        Score JD
                      </button>
                    </div>
                  </div>

                  {/* Culture */}
                  {intelData.culture && (
                    <div className="bg-surface border border-border rounded-lg p-4">
                      <h3 className="font-semibold text-sm mb-2">Culture</h3>
                      {intelData.culture.engineering_culture && <p className="text-sm text-text-muted mb-2">{intelData.culture.engineering_culture}</p>}
                      {intelData.culture.remote_policy && <p className="text-sm text-text-muted mb-2">Remote: {intelData.culture.remote_policy}</p>}
                      {intelData.culture.values?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {intelData.culture.values.map((v, i) => (
                            <span key={i} className="text-xs bg-bg px-2 py-0.5 rounded-full border border-border">{v}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interview */}
                  {intelData.interview && (
                    <div className="bg-surface border border-border rounded-lg p-4">
                      <h3 className="font-semibold text-sm mb-2">Interview Process</h3>
                      {intelData.interview.timeline && <p className="text-xs text-text-muted mb-3">Timeline: {intelData.interview.timeline}</p>}
                      <div className="space-y-1.5">
                        {intelData.interview.stages?.map((s, i) => (
                          <div key={i} className="text-sm flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-medium shrink-0">{i + 1}</span>
                            <span className="font-medium">{s.name}</span>
                            <span className="text-text-muted text-xs">({s.duration}, {s.format})</span>
                          </div>
                        ))}
                      </div>
                      {intelData.interview.tips?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <h4 className="text-xs font-semibold text-text-muted mb-1">Tips</h4>
                          <ul className="text-xs text-text-muted space-y-0.5">
                            {intelData.interview.tips.map((t, i) => <li key={i}>• {t}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Compensation */}
                  {intelData.comp?.bands?.length > 0 && (
                    <div className="bg-surface border border-border rounded-lg p-4">
                      <h3 className="font-semibold text-sm mb-2">Compensation</h3>
                      <div className="space-y-1.5">
                        {intelData.comp.bands.map((b, i) => (
                          <div key={i} className="text-sm flex items-center justify-between">
                            <span className="font-medium">{b.level}</span>
                            <span className="text-text-muted text-xs">Base: {b.base} · Total: {b.total}</span>
                          </div>
                        ))}
                      </div>
                      {intelData.comp.notes && <p className="text-xs text-text-muted mt-2">{intelData.comp.notes}</p>}
                    </div>
                  )}
                </div>
              ) : !selectedIntelSlug ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No company selected.</p>
                  <p className="text-text-muted text-sm mb-4">
                    {intelSlugs.size > 0 ? `Select from ${intelSlugs.size} researched companies above, or research a new one.` : 'No companies researched yet. Research a company to get structured intel on culture, interview process, and compensation.'}
                  </p>
                  <button onClick={() => setActiveTab('companies')}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
                    Go to Companies
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-text-muted mb-4">No intel available for this company yet.</p>
                  <button
                    onClick={() => { if (selectedIntelSlug) handleResearchCompany(selectedIntelSlug) }}
                    disabled={actionProcessing}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                  >
                    Research This Company
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Right Panel: Agent Chat (35%) ────────────────────────────── */}
      <div className="w-[35%] flex flex-col bg-surface">
        {/* Chat Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${chatProcessing ? 'bg-accent animate-pulse' : 'bg-success'}`} />
            <span className="text-sm font-semibold">Research Agent</span>
          </div>
          <a href="/command-center" className="text-xs text-text-muted hover:text-text">
            Manage
          </a>
        </div>

        {/* Chat Messages */}
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
                <span className="text-sm text-text-muted">Research agent is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="border-t border-border p-3 flex items-center gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput) } }}
            placeholder="Ask the research agent..."
            disabled={chatProcessing}
            className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          />
          <button
            onClick={() => sendChatMessage(chatInput)}
            disabled={!chatInput.trim() || chatProcessing}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
