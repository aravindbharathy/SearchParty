'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useAgentWelcome } from '../hooks/use-agent-welcome'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
import { AgentProgress } from '../_components/agent-progress'
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
  role_id: string
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

type TabKey = 'open-roles' | 'score' | 'scored-jds' | 'companies'

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
  source_type?: 'targeted' | 'discovered'
  fit_estimate: number
  status: 'new' | 'scored' | 'resume-ready' | 'applied' | 'dismissed' | 'closed'
  score?: number
  jd_file?: string
  resume_file?: string
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

/** Strip YAML frontmatter and the redundant "# JD Score" heading that duplicates the overlay header */
function stripFrontmatter(content: string): string {
  let s = content
  // Remove YAML frontmatter block (---\n...\n---)
  s = s.replace(/^---\n[\s\S]*?\n---\n*/, '')
  // Remove the "# JD Score: Company — Role" heading (already shown in overlay header)
  s = s.replace(/^#\s+JD Score:.*\n*/m, '')
  return s.trim()
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FindingPage() {
  // ─── Tab state (persisted) ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'companies'
    try {
      const saved = localStorage.getItem('finding-active-tab') as TabKey
      if (saved) return saved
    } catch {}
    return 'companies'
  })

  // ─── Data state ──────────────────────────────────────────────────────────
  const [scoredJDs, setScoredJDs] = useState<ScoredJD[]>([])
  const [companies, setCompanies] = useState<TargetCompany[]>([])
  const [vaultJDs, setVaultJDs] = useState<string[]>([])
  const [pipelineCompanies, setPipelineCompanies] = useState<Set<string>>(new Set())
  const [intelSlugs, setIntelSlugs] = useState<Set<string>>(new Set())

  // Open roles state
  const [openRoles, setOpenRoles] = useState<OpenRole[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [scanStale, setScanStale] = useState(true)
  const [roleFilter, setRoleFilter] = useState<'all' | 'new' | 'scored' | 'applied' | 'dismissed' | 'discovered'>('new')

  // Score JD form
  const [jdPreviewMode, setJdPreviewMode] = useState(false)
  const [jdText, setJdText] = useState('')
  const [jdCompany, setJdCompany] = useState('')
  const [jdRole, setJdRole] = useState('')
  const [jdUrl, setJdUrl] = useState('')
  const [jdRoleId, setJdRoleId] = useState('')

  // Scored JDs search/sort
  const [jdSearch, setJdSearch] = useState('')
  const [jdSort, setJdSort] = useState<'score' | 'date'>('score')

  // Selected JD detail
  const [selectedJD, setSelectedJD] = useState<ScoredJD | null>(null)
  const [jdContent, setJdContent] = useState('')

  // Company search
  const [companySearch, setCompanySearch] = useState('')
  const [roleCompanyFilter, setRoleCompanyFilter] = useState('')
  const [verifyingRoles, setVerifyingRoles] = useState(false)
  const [scoringAll, setScoringAll] = useState(false)
  const [discovering, setDiscovering] = useState(false)

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('finding-chat-messages')
      if (saved) setChatMessages(JSON.parse(saved))
    } catch {}
  }, [])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Agent hook — single persistent session for all research actions
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset, spawnId: agentSpawnId } = useAgentEvents('finding-chat')

  // Derived from agent hook — survives tab switches
  const chatProcessing = agentStatus === 'running'
  const actionProcessing = chatProcessing && lastActionRef.current !== 'init' && lastActionRef.current !== 'chat'

  // Directive notifications for research agent
  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('research')

  useAgentWelcome('research', 'I\'m your research specialist. I can help you score job descriptions, research companies, generate target lists, and scan for open roles.\n\nWhat would you like to do?', chatMessages, setChatMessages, 'finding-chat-messages')

  // ─── Discover Beyond Targets handler ────────────────────────────────────
  const handleDiscover = useCallback(async () => {
    setDiscovering(true)
    setActiveTab('open-roles')
    try {
      const res = await fetch('/api/finding/open-roles/discover', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; queries?: number; error?: string }
      if (data.ok) {
        setChatMessages(prev => [...prev, {
          role: 'agent',
          content: `Searching for roles beyond your target companies (${data.queries} queries across Greenhouse, Ashby, Lever). This uses WebSearch to find roles at companies not on your list. Progress updates will appear here.`,
        }])
      } else {
        setChatMessages(prev => [...prev, { role: 'agent', content: data.error || 'Failed to start discovery.' }])
        setDiscovering(false)
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to start discovery.' }])
      setDiscovering(false)
    }
  }, [setChatMessages])

  // Poll for discover completion
  useEffect(() => {
    if (!discovering) return
    const poll = setInterval(async () => {
      loadOpenRoles()
      try {
        const bbRes = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
        if (bbRes.ok) {
          const state = await bbRes.json() as { findings?: Record<string, { type?: string; text?: string }> }
          const progress = state.findings?.['scan-progress']
          if (progress?.type === 'category-complete' && progress.text?.includes('Broad discovery:')) {
            setDiscovering(false)
            loadOpenRoles()
          }
        }
      } catch {}
    }, 10_000)
    return () => clearInterval(poll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovering])

  // ─── Score All handler ──────────────────────────────────────────────────
  const handleScoreAll = useCallback(async () => {
    setScoringAll(true)
    try {
      const res = await fetch('/api/finding/open-roles/score-all', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; scoring?: number; message?: string }
      if (data.ok) {
        setChatMessages(prev => [...prev, {
          role: 'agent',
          content: data.scoring
            ? `Scoring ${data.scoring} open roles against your profile. This will take a few minutes — progress updates will appear here.`
            : data.message || 'No unscored roles to process.',
        }])
        if (!data.scoring) setScoringAll(false)
      } else {
        setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to start scoring.' }])
        setScoringAll(false)
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to start scoring.' }])
      setScoringAll(false)
    }
  }, [setChatMessages])

  // Poll for score-all completion
  useEffect(() => {
    if (!scoringAll) return
    const poll = setInterval(async () => {
      loadOpenRoles()
      try {
        const bbRes = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
        if (bbRes.ok) {
          const state = await bbRes.json() as { findings?: Record<string, { type?: string; text?: string }> }
          const progress = state.findings?.['scan-progress']
          if (progress?.type === 'category-complete' && progress.text?.match(/^Scored \d+\/\d+ roles/)) {
            setScoringAll(false)
            loadOpenRoles()
            loadScoredJDs()
          }
        }
      } catch {}
    }, 10_000)
    return () => clearInterval(poll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringAll])

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

  const loadPipelineApps = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/applications')
      if (res.ok) {
        const data = await res.json() as { applications: { company: string; role: string }[] }
        const keys = new Set(data.applications.map(a => `${a.company.toLowerCase()}|${a.role.toLowerCase()}`))
        setPipelineCompanies(keys)
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadScoredJDs()
    loadCompanies()
    loadIntelStatus()
    loadVaultJDs()
    loadOpenRoles()
    loadPipelineApps()

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

  // Check for prefill from pipeline (Score JD flow)
  useEffect(() => {
    try {
      const prefill = localStorage.getItem('prefill-score-jd')
      if (prefill) {
        const { company, role } = JSON.parse(prefill)
        if (company) setJdCompany(company)
        if (role) setJdRole(role)
        localStorage.removeItem('prefill-score-jd')
      }
    } catch {}
  }, [])
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

  const [scanning, setScanning] = useState(false)

  // Restore scanning state from localStorage after mount
  // Restore scanning state — but verify the scan we started is still running
  useEffect(() => {
    try {
      if (localStorage.getItem('finding-scanning') !== 'true') return
      const startedAt = parseInt(localStorage.getItem('finding-scanning-started') || '0', 10)
      // If we don't know when the scan started, or it's been more than 2 hours, it's stale
      if (!startedAt || Date.now() - startedAt > 2 * 60 * 60 * 1000) {
        localStorage.removeItem('finding-scanning')
        localStorage.removeItem('finding-scanning-started')
        return
      }
      // Check blackboard — only restore if scan hasn't completed
      fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
        .then(r => r.ok ? r.json() : null)
        .then(state => {
          const findings = state?.findings || {}
          if (findings['scan-complete']?.type === 'batch-complete') {
            localStorage.removeItem('finding-scanning')
            localStorage.removeItem('finding-scanning-started')
          } else {
            setScanning(true)
          }
        })
        .catch(() => {
          localStorage.removeItem('finding-scanning')
          localStorage.removeItem('finding-scanning-started')
        })
    } catch {}
  }, [])

  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleBatchScan = useCallback(async (scope: string) => {
    setScanning(true)
    setActiveTab('open-roles')
    // Clear stale scan markers from previous scan
    try {
      await Promise.all([
        fetch('http://localhost:8790/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'findings.scan-complete', value: null, log_entry: 'Clear scan marker' }), signal: AbortSignal.timeout(2000) }),
        fetch('http://localhost:8790/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'findings.scan-progress', value: null, log_entry: 'Clear scan progress' }), signal: AbortSignal.timeout(2000) }),
      ])
    } catch {}
    try {
      const res = await fetch('/api/agent/batch-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      })
      const data = await res.json() as { ok?: boolean; companies?: number; batches?: number; error?: string }
      if (data.ok) {
        const label = scope === 'top-fit' ? 'top-fit companies' : scope.startsWith('company:') ? scope.slice(8) : 'all companies'
        setChatMessages(prev => [...prev, {
          role: 'agent',
          content: `Starting scan pipeline for ${label} (${data.companies} companies).\n\nPhases: Scan ATS APIs → Triage against your profile → Agent scan (remaining) → Verify links → Score top JDs → Tailor resumes.\nProgress updates will appear here.`,
        }])
        // Polling is handled by the useEffect that watches `scanning` state
      } else {
        setChatMessages(prev => [...prev, { role: 'agent', content: data.error || 'Failed to start scan.' }])
        setScanning(false)
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to start scan.' }])
      setScanning(false)
    }
  }, [setChatMessages, loadOpenRoles])

  // Persist scanning state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('finding-scanning', scanning ? 'true' : 'false')
      if (scanning) localStorage.setItem('finding-scanning-started', String(Date.now()))
      else localStorage.removeItem('finding-scanning-started')
    } catch {}
  }, [scanning])

  // When scanning becomes true (from button click or localStorage restore), start polling for completion
  useEffect(() => {
    if (!scanning) {
      if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null }
      if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null }
      return
    }
    if (scanPollRef.current) return // already polling
    scanPollRef.current = setInterval(async () => {
      loadOpenRoles()
      try {
        const bbRes = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
        if (bbRes.ok) {
          const state = await bbRes.json() as { findings?: Record<string, { type?: string }> }
          const findings = state.findings || {}
          if (findings['scan-complete']?.type === 'batch-complete') {
            setScanning(false)
            loadOpenRoles()
            if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null }
          }
        }
      } catch {}
    }, 10_000)
    // Safety timeout — clear scanning after 30 minutes
    scanTimeoutRef.current = setTimeout(() => {
      setScanning(false)
      loadOpenRoles()
    }, 30 * 60 * 1000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  // Cleanup scan poll + timeout on unmount
  useEffect(() => {
    return () => {
      if (scanPollRef.current) clearInterval(scanPollRef.current)
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current)
    }
  }, [])

  // Pick up pending action from user-action bar navigation
  usePendingAction(sendChatMessage, setActiveTab as (tab: string) => void)

  // ─── Action handlers (send through chat) ─────────────────────────────────

  const handleScoreJD = () => {
    if (!jdText.trim() && !jdUrl.trim()) return
    lastActionRef.current = 'score'
    const company = jdCompany.trim() || detectedCompany?.name || ''
    const role = jdRole.trim() || ''
    const hasJdText = jdText.trim() && !jdText.startsWith('[JD not saved')

    // Save JD to vault if we have actual text
    if (hasJdText) {
      fetch('/api/vault/save-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: company || 'unknown', role: role || 'unknown', url: jdUrl.trim(), text: jdText.trim() }),
      }).catch(() => {})
    }

    setActiveTab('scored-jds')

    const roleIdLine = jdRoleId ? `Role ID: ${jdRoleId}\n` : ''
    if (hasJdText) {
      sendChatMessage(
        `Run this command first: cat .claude/skills/score-jd/SKILL.md — then follow its instructions to score this JD:\n\nCompany: ${company}\nRole: ${role}\n${roleIdLine}${jdUrl.trim() ? `URL: ${jdUrl.trim()}\n` : ''}\nJob Description:\n${jdText.trim()}`
      )
    } else if (jdUrl.trim()) {
      sendChatMessage(
        `Run this command first: cat .claude/skills/score-jd/SKILL.md — then follow its instructions. The JD text is not available locally. Use WebFetch to retrieve the job description from this URL, then score it:\n\nCompany: ${company}\nRole: ${role}\n${roleIdLine}URL: ${jdUrl.trim()}`
      )
    }

    setJdText('')
    setJdCompany('')
    setJdRoleId('')
    setJdRole('')
    setJdUrl('')
  }

  const handleResearchCompany = (companyName: string) => {
    lastActionRef.current = 'research'
    sendChatMessage(
      `Run this command first: cat .claude/skills/company-research/SKILL.md — then follow its instructions to research "${companyName}".`
    )
  }

  const handleGenerateTargets = () => {
    lastActionRef.current = 'targets'
    setActiveTab('companies')
    sendChatMessage(
      'Run this command first: cat .claude/skills/generate-targets/SKILL.md — then follow the instructions in that file to generate a ranked list of target companies. If my career plan is empty, tell me to complete it with the Job Search Coach first — do NOT ask me for the details directly.'
    )
  }

  const [batchSearching, setBatchSearching] = useState(false)
  const batchSearchPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const batchSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleBatchGenerateTargets = async () => {
    setBatchSearching(true)
    try {
      const res = await fetch('/api/agent/batch-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { ok?: boolean; total?: number; categories?: string[]; error?: string }
      if (data.ok) {
        setChatMessages(prev => [...prev, {
          role: 'agent',
          content: `Starting company search across ${data.total} categories:\n${(data.categories || []).map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\nI'll search each category one at a time. Progress updates will appear here as each completes.`,
        }])
        // Polling handled by the useEffect below
      } else {
        setChatMessages(prev => [...prev, { role: 'agent', content: data.error || 'Failed to start search.' }])
        setBatchSearching(false)
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to start search.' }])
      setBatchSearching(false)
    }
  }

  // Poll for batch-targets completion
  useEffect(() => {
    if (!batchSearching) {
      if (batchSearchPollRef.current) { clearInterval(batchSearchPollRef.current); batchSearchPollRef.current = null }
      if (batchSearchTimeoutRef.current) { clearTimeout(batchSearchTimeoutRef.current); batchSearchTimeoutRef.current = null }
      return
    }
    if (batchSearchPollRef.current) return
    batchSearchPollRef.current = setInterval(async () => {
      loadCompanies()
      try {
        const bbRes = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
        if (bbRes.ok) {
          const state = await bbRes.json() as { findings?: Record<string, { type?: string }> }
          const findings = state.findings || {}
          if (findings['batch-targets-complete']?.type === 'batch-complete') {
            setBatchSearching(false)
            loadCompanies()
          }
        }
      } catch {}
    }, 10_000)
    batchSearchTimeoutRef.current = setTimeout(() => {
      setBatchSearching(false)
      loadCompanies()
    }, 20 * 60 * 1000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSearching])

  // Cleanup batch search timers on unmount
  useEffect(() => {
    return () => {
      if (batchSearchPollRef.current) clearInterval(batchSearchPollRef.current)
      if (batchSearchTimeoutRef.current) clearTimeout(batchSearchTimeoutRef.current)
    }
  }, [])

  const handleScoreVaultJD = (filename: string) => {
    lastActionRef.current = 'score'
    setActiveTab('scored-jds')
    sendChatMessage(
      `Run this command first: cat .claude/skills/score-jd/SKILL.md — then follow its instructions to score the JD at search/vault/uploads/jds/${filename}.`
    )
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

  const addToPipeline = async (company: string, role: string, fitScore: number, jdFile?: string, jdUrl?: string, roleId?: string) => {
    setPipelineMsg(null)
    try {
      // Find the matching open role — by role_id first, then fuzzy match
      const matchingRole = roleId
        ? openRoles.find(r => r.id === roleId)
        : openRoles.find(r =>
            r.company.toLowerCase() === company.toLowerCase() &&
            r.title.toLowerCase().includes(role.toLowerCase().slice(0, 20))
          )

      const appRes = await fetch('/api/pipeline/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          role,
          role_id: matchingRole?.id || '',
          status: 'researching',
          fit_score: fitScore,
          jd_source: jdUrl ? 'url' : jdFile ? 'scored' : 'manual',
          jd_file: jdFile ? `entries/${jdFile}` : '',
          jd_url: jdUrl || '',
          resume_file: matchingRole?.resume_file || '',
        }),
      })
      const appData = await appRes.json().catch(() => ({})) as { application?: { id?: string } }
      const res = appRes
      if (res.ok) {
        // Update the open role: status → applied, backlink the application ID
        const appId = appData.application?.id
        fetch('/api/finding/open-roles/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: matchingRole?.id,
            company,
            title: role,
            status: 'applied',
            application_ids: appId ? [appId] : [],
          }),
        }).then(() => loadOpenRoles()).catch(() => {})

        setPipelineMsg({ type: 'success', text: `Added ${company} - ${role} to pipeline` })
        loadPipelineApps()
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

  const [intelMarkdown, setIntelMarkdown] = useState<string | null>(null)

  const closeIntel = () => { setSelectedIntelSlug(null); setIntelData(null); setIntelRaw(null); setIntelMarkdown(null) }

  const viewIntel = async (slug: string) => {
    setSelectedIntelSlug(slug)
    setIntelLoading(true)
    setIntelData(null)
    setIntelRaw(null)
    setIntelMarkdown(null)
    try {
      const res = await fetch(`/api/finding/intel/${encodeURIComponent(slug)}`)
      if (res.ok) {
        const data = await res.json() as { intel: CompanyIntel; raw: string; markdown?: string }
        setIntelData(data.intel)
        setIntelRaw(data.raw)
        if (data.markdown) setIntelMarkdown(data.markdown)
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
    // Deduplicate by slug (batch agents may add the same company from different categories)
    const seen = new Set<string>()
    let list = companies.filter(c => {
      const key = c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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

  const newRoleCount = useMemo(() => openRoles.filter(r => r.status === 'new').length, [openRoles])

  // Enrich open roles with scores from scored JDs
  const enrichedRoles = useMemo(() => {
    const scoreMap = new Map<string, { score: number; recommendation: string }>()
    for (const jd of scoredJDs) {
      const key = `${jd.company.toLowerCase()}|${jd.role.toLowerCase()}`
      scoreMap.set(key, { score: jd.score, recommendation: jd.recommendation })
    }
    return openRoles.map(role => {
      if (role.score != null) return role
      const key = `${role.company.toLowerCase()}|${role.title.toLowerCase()}`
      const match = scoreMap.get(key)
      if (match) return { ...role, score: match.score }
      return role
    })
  }, [openRoles, scoredJDs])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ─── Left Panel: Tabs (65%) ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        {/* Stats bar */}
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold mb-3">Finding Roles</h1>
          <div className="flex gap-3">
            {[
              { label: 'New Roles', value: newRoleCount },
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
            { key: 'companies' as TabKey, label: `Target Companies${companies.length > 0 ? ` (${companies.length})` : ''}` },
            { key: 'open-roles' as TabKey, label: `Open Roles${newRoleCount > 0 ? ` (${newRoleCount})` : ''}` },
            { key: 'score' as TabKey, label: 'Score JD' },
            { key: 'scored-jds' as TabKey, label: `Scored JDs${scoredJDs.length > 0 ? ` (${scoredJDs.length})` : ''}` },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); if (tab.key !== 'open-roles') setRoleCompanyFilter('') }}
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
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={roleCompanyFilter}
                  onChange={e => setRoleCompanyFilter(e.target.value)}
                  placeholder="Filter by company, role, or location..."
                  className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                {roleCompanyFilter && (
                  <button onClick={() => setRoleCompanyFilter('')} className="text-xs text-text-muted hover:text-text shrink-0">Clear</button>
                )}
                <button
                    onClick={async () => {
                      setVerifyingRoles(true)
                      try {
                        const res = await fetch('/api/finding/open-roles/verify', { method: 'POST' })
                        const data = await res.json() as { verified?: number; closed?: number; unverifiable?: number }
                        const parts = [`${data.verified || 0} active`, `${data.closed || 0} closed`]
                        if (data.unverifiable) parts.push(`${data.unverifiable} could not be checked`)
                        setChatMessages(prev => [...prev, {
                          role: 'agent',
                          content: `Verified role links: ${parts.join(', ')}.`,
                        }])
                        loadOpenRoles()
                      } catch {
                        setChatMessages(prev => [...prev, { role: 'agent', content: 'Verification failed — could not reach the server.' }])
                      }
                      setVerifyingRoles(false)
                    }}
                    disabled={verifyingRoles || openRoles.length === 0}
                    className="px-3 py-2 border border-border text-text-muted rounded-md text-sm hover:bg-bg disabled:opacity-50 shrink-0"
                  >
                    {verifyingRoles ? 'Checking...' : 'Verify Links'}
                  </button>
                  <button
                    onClick={handleScoreAll}
                    disabled={scoringAll || scanning || chatProcessing || newRoleCount === 0}
                    className="px-3 py-2 border border-border text-text-muted rounded-md text-sm hover:bg-bg disabled:opacity-50 shrink-0"
                  >
                    {scoringAll ? 'Scoring...' : 'Score All'}
                  </button>
                  <button
                    onClick={() => handleBatchScan('top-fit')}
                    disabled={scanning || chatProcessing}
                    className="px-3 py-2 border border-accent/30 text-accent rounded-md text-sm hover:bg-accent/10 disabled:opacity-50 shrink-0"
                  >
                    Scan Tier 1
                  </button>
                  <button
                    onClick={() => handleBatchScan('full')}
                    disabled={scanning || chatProcessing}
                    className="px-3 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 shrink-0"
                  >
                    Scan All
                  </button>
                  <button
                    onClick={handleDiscover}
                    disabled={discovering || scanning || chatProcessing}
                    className="px-3 py-2 border border-accent/30 text-accent rounded-md text-sm hover:bg-accent/10 disabled:opacity-50 shrink-0"
                    title="Search across Greenhouse, Ashby, and Lever for matching roles at companies not on your target list"
                  >
                    {discovering ? 'Discovering...' : 'Discover Beyond Targets'}
                  </button>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex gap-1">
                    {([
                      { key: 'all' as const, label: 'All', count: openRoles.filter(r => r.status !== 'closed').length },
                      { key: 'new' as const, label: 'Open', count: newRoleCount },
                      { key: 'scored' as const, label: 'Scored', count: openRoles.filter(r => r.status === 'scored' || r.status === 'resume-ready').length },
                      { key: 'applied' as const, label: 'In Pipeline', count: openRoles.filter(r => r.status === 'applied' || pipelineCompanies.has(`${r.company.toLowerCase()}|${r.title.toLowerCase()}`)).length },
                      { key: 'discovered' as const, label: 'Discovered', count: openRoles.filter(r => r.source_type === 'discovered').length },
                      { key: 'dismissed' as const, label: 'Dismissed', count: openRoles.filter(r => r.status === 'dismissed').length },
                    ]).map(f => (
                      <button
                        key={f.key}
                        onClick={() => setRoleFilter(f.key)}
                        className={`text-xs px-3 py-1.5 rounded-md ${roleFilter === f.key ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text hover:bg-bg'}`}
                      >
                        {f.label} ({f.count})
                      </button>
                    ))}
                </div>
                {lastScan && (
                  <span className="text-[10px] text-text-muted ml-auto">
                    Last scan: {new Date(lastScan).toLocaleDateString()} {new Date(lastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {scanning && (
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-4 flex items-center gap-3">
                  <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="text-sm font-medium">Scanning for open roles...</p>
                    <p className="text-xs text-text-muted">Checking ATS APIs, triaging against your profile, then scanning remaining companies via agent. Progress updates appear in the chat.</p>
                  </div>
                </div>
              )}

              {openRoles.length === 0 && !chatProcessing && !scanning ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No open roles discovered yet.</p>
                  <p className="text-text-muted text-sm mb-4">Click &quot;Scan for Roles&quot; to search your target companies for matching positions.</p>
                  <button
                    onClick={() => handleBatchScan('full')}
                    className="text-sm text-accent hover:text-accent-hover font-medium"
                  >
                    Run First Scan
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {enrichedRoles
                    .filter(r => roleFilter === 'all' ? r.status !== 'closed'
                      : roleFilter === 'scored' ? (r.status === 'scored' || r.status === 'resume-ready')
                      : roleFilter === 'applied' ? (r.status === 'applied' || pipelineCompanies.has(`${r.company.toLowerCase()}|${r.title.toLowerCase()}`))
                      : roleFilter === 'discovered' ? r.source_type === 'discovered'
                      : r.status === roleFilter)
                    .filter(r => {
                      if (!roleCompanyFilter) return true
                      const q = roleCompanyFilter.toLowerCase()
                      return r.company?.toLowerCase().includes(q) ||
                        r.title?.toLowerCase().includes(q) ||
                        r.location?.toLowerCase().includes(q) ||
                        r.company_slug?.includes(q.replace(/[^a-z0-9]+/g, '-'))
                    })
                    .sort((a, b) => (b.score ?? b.fit_estimate) - (a.score ?? a.fit_estimate))
                    .map(role => (
                    <div key={role.id} className={`p-4 rounded-lg border transition-colors ${
                      role.status === 'scored' && role.score ? (
                        role.score >= 75 ? 'border-success/40 bg-success/5' : role.score >= 60 ? 'border-warning/40 bg-warning/5' : 'border-border'
                      ) : role.status === 'new' ? 'border-accent/30 bg-accent/5' : 'border-border'
                    }`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {role.status === 'new' && <span className="w-2 h-2 bg-accent rounded-full shrink-0" />}
                          <span className="font-semibold text-sm">{role.company}</span>
                          <span className="text-text-muted text-sm">—</span>
                          <span className="font-medium text-sm truncate">{role.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {role.resume_file && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">Resume</span>
                          )}
                          {role.score != null ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              role.score >= 75 ? 'bg-success/10 text-success'
                                : role.score >= 60 ? 'bg-warning/10 text-warning'
                                  : 'bg-text-muted/10 text-text-muted'
                            }`}>
                              {role.score}/100 · {role.score >= 75 ? 'Apply' : role.score >= 60 ? 'Consider' : role.score >= 40 ? 'Referral Only' : 'Skip'}
                            </span>
                          ) : (
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              role.fit_estimate >= 80 ? 'bg-success/10 text-success'
                                : role.fit_estimate >= 60 ? 'bg-warning/10 text-warning'
                                  : 'bg-text-muted/10 text-text-muted'
                            }`}>
                              Tier {role.fit_estimate >= 80 ? '1' : role.fit_estimate >= 60 ? '2' : role.fit_estimate >= 40 ? '3' : '4'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted mt-1 mb-2">
                        {role.location && <><span>{role.location}</span><span>·</span></>}
                        {role.posted_date && role.posted_date !== role.discovered_date && <><span>Posted: {role.posted_date}</span><span>·</span></>}
                        <span>Found: {role.discovered_date}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {role.url && (
                          <a href={role.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover font-medium">
                            View Posting ↗
                          </a>
                        )}
                        {role.status === 'scored' && role.score ? (
                          <>
                            <button
                              onClick={() => {
                                setActiveTab('scored-jds')
                                const match = scoredJDs.find(jd =>
                                  jd.company.toLowerCase() === role.company.toLowerCase() &&
                                  jd.role.toLowerCase().includes(role.title.toLowerCase().slice(0, 20))
                                )
                                if (match) viewScoredJD(match)
                              }}
                              className="text-xs text-accent hover:text-accent-hover font-medium"
                            >
                              View Analysis
                            </button>
                            <button
                              onClick={async () => {
                                setActiveTab('score')
                                setJdCompany(role.company)
                                setJdRole(role.title)
                                setJdUrl(role.url)
                                setJdRoleId(role.id)
                                setJdText('')
                                if (role.url) setJdText(`[JD not saved locally. Please fetch from: ${role.url}]`)
                              }}
                              className="text-xs text-text-muted hover:text-accent font-medium"
                            >
                              Re-score
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={async () => {
                              setActiveTab('score')
                              setJdCompany(role.company)
                              setJdRole(role.title)
                              setJdUrl(role.url)
                              setJdRoleId(role.id)
                              setJdText('')
                              let loaded = false
                              if (role.jd_file) {
                                try {
                                  const res = await fetch(`/api/vault/read-file?path=${encodeURIComponent(role.jd_file)}`)
                                  if (res.ok) {
                                    const data = await res.json() as { content: string }
                                    if (data.content?.trim()) { setJdText(data.content); loaded = true }
                                  }
                                } catch {}
                              }
                              if (!loaded && role.url) {
                                setJdText(`[JD not saved locally. Please fetch from: ${role.url}]`)
                              }
                            }}
                            className="text-xs text-text-muted hover:text-accent font-medium"
                          >
                            Score JD
                          </button>
                        )}
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
            <div className="space-y-4">
              {newRoleCount > 0 && (
                <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{newRoleCount} open roles haven&apos;t been scored yet.</p>
                    <p className="text-xs text-text-muted">Score them all at once against your profile.</p>
                  </div>
                  <button
                    onClick={handleScoreAll}
                    disabled={scoringAll || scanning || chatProcessing}
                    className="px-3 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 shrink-0"
                  >
                    {scoringAll ? 'Scoring...' : 'Score All Open Roles'}
                  </button>
                </div>
              )}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-text-muted">Job description</label>
                  {jdText.trim() && (
                    <div className="flex gap-1">
                      <button onClick={() => setJdPreviewMode(false)}
                        className={`text-[10px] px-2 py-0.5 rounded ${!jdPreviewMode ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text'}`}>
                        Edit
                      </button>
                      <button onClick={() => setJdPreviewMode(true)}
                        className={`text-[10px] px-2 py-0.5 rounded ${jdPreviewMode ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text'}`}>
                        Preview
                      </button>
                    </div>
                  )}
                </div>
                {jdPreviewMode && jdText.trim() ? (
                  <div className="w-full min-h-[24rem] max-h-[60vh] overflow-y-auto p-4 border border-border rounded-md bg-bg text-sm">
                    <MarkdownView content={jdText} className="text-sm" />
                  </div>
                ) : (
                  <textarea
                    value={jdText}
                    onChange={e => { setJdText(e.target.value); setJdPreviewMode(false) }}
                    placeholder="Paste the full job description here..."
                    className="w-full min-h-[24rem] max-h-[60vh] p-4 border border-border rounded-md bg-bg text-text text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/40 font-mono leading-relaxed"
                  />
                )}
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
                disabled={(!jdText.trim() && !jdUrl.trim()) || actionProcessing}
                className="px-5 py-2.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actionProcessing ? 'Scoring...' : 'Score JD'}
              </button>

              {/* Vault JDs */}
              {vaultJDs.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border">
                  <h3 className="text-sm font-semibold mb-2">Unscored JDs from Vault</h3>
                  <p className="text-xs text-text-muted mb-3">Files in vault/uploads/jds/</p>
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
                      className={`p-4 rounded-lg border transition-colors ${
                        jd.score >= SCORE_APPLY_THRESHOLD ? 'border-success/40 bg-success/5'
                          : jd.score >= SCORE_REFERRAL_THRESHOLD ? 'border-warning/40 bg-warning/5'
                            : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm">{jd.company}</span>
                          <span className="text-text-muted text-sm">—</span>
                          <span className="font-medium text-sm truncate">{jd.role}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {openRoles.some(r => r.resume_file && r.company.toLowerCase() === jd.company.toLowerCase()) && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">Resume</span>
                          )}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            jd.score >= SCORE_APPLY_THRESHOLD ? 'bg-success/10 text-success' : jd.score >= SCORE_REFERRAL_THRESHOLD ? 'bg-warning/10 text-warning' : 'bg-text-muted/10 text-text-muted'
                          }`}>
                            {jd.score}/100 · {jd.recommendation}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted mt-1 mb-2">
                        {jd.url && (
                          <a href={jd.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover font-medium">
                            Open ↗
                          </a>
                        )}
                        {jd.url && jd.date && <span>·</span>}
                        {jd.date && <span>{jd.date}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => viewScoredJD(jd)}
                          className="text-xs text-accent hover:text-accent-hover font-medium"
                        >
                          View Analysis
                        </button>
                        {pipelineCompanies.has(`${jd.company.toLowerCase()}|${jd.role.toLowerCase()}`) ? (
                          <span className="text-xs px-2.5 py-1 bg-success/10 text-success rounded-md">In Pipeline</span>
                        ) : (
                          <button
                            onClick={() => addToPipeline(jd.company, jd.role, jd.score, jd.filename, jd.url, jd.role_id)}
                            className="text-xs px-2.5 py-1 bg-accent/10 text-accent rounded-md hover:bg-accent/20 transition-colors"
                          >
                            Add to Pipeline
                          </button>
                        )}
                        <button
                          onClick={() => deleteScoredJD(jd.filename)}
                          className="text-xs text-text-muted hover:text-danger font-medium ml-auto"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* JD Detail Overlay */}
              {selectedJD && jdContent && (
                <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex" onClick={() => { setSelectedJD(null); setJdContent('') }}>
                  <div className="w-full max-w-3xl mx-auto bg-surface border-x border-border shadow-lg flex flex-col h-full" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                      <div>
                        <h3 className="font-semibold">{selectedJD.company} — {selectedJD.role}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            selectedJD.score >= 75 ? 'bg-success/10 text-success'
                              : selectedJD.score >= 60 ? 'bg-warning/10 text-warning'
                                : 'bg-text-muted/10 text-text-muted'
                          }`}>
                            {selectedJD.score}/100 · {selectedJD.recommendation}
                          </span>
                          {selectedJD.date && <span className="text-xs text-text-muted">{selectedJD.date}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedJD(null); setJdContent('') }}
                        className="p-1.5 rounded-md hover:bg-bg text-text-muted hover:text-text transition-colors"
                        aria-label="Close"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg/50 shrink-0">
                      {pipelineCompanies.has(`${selectedJD.company.toLowerCase()}|${selectedJD.role.toLowerCase()}`) ? (
                        <span className="px-3 py-1.5 bg-success/10 text-success rounded-md text-xs font-medium">In Pipeline</span>
                      ) : (
                        <button
                          onClick={() => addToPipeline(selectedJD.company, selectedJD.role, selectedJD.score, selectedJD.filename, selectedJD.url, selectedJD.role_id)}
                          className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover"
                        >
                          Add to Pipeline
                        </button>
                      )}
                      <button onClick={() => sendChatMessage(`Let's discuss this JD score for ${selectedJD.company} — ${selectedJD.role}. What are the key gaps and how can I address them?`)}
                        disabled={chatProcessing}
                        className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg disabled:opacity-50">
                        Discuss with Agent
                      </button>
                      {selectedJD.url && (
                        <a href={selectedJD.url} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">
                          View Posting ↗
                        </a>
                      )}
                      <button
                        onClick={() => { deleteScoredJD(selectedJD.filename); setSelectedJD(null); setJdContent('') }}
                        className="ml-auto px-3 py-1.5 text-xs text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-5">
                      <MarkdownView content={stripFrontmatter(jdContent)} />
                    </div>
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
                  onClick={handleBatchGenerateTargets}
                  disabled={actionProcessing || batchSearching}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {batchSearching ? 'Searching...' : actionProcessing ? 'Generating...' : companies.length > 0 ? 'Expand Search' : 'Generate Targets'}
                </button>
              </div>

              {batchSearching && (
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-4 flex items-start gap-3">
                  <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{companies.length > 0 ? 'Expanding your target list...' : 'Generating target companies...'}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {companies.length > 0
                        ? `Searching for companies not already in your ${companies.length}-company list. Existing companies are preserved. Typically 10-15 minutes.`
                        : 'This searches across multiple industry categories using web search — typically 10-15 minutes for all categories.'
                      } Progress updates appear in the chat as each category completes.
                    </p>
                  </div>
                </div>
              )}

              {companies.length === 0 && (chatProcessing || batchSearching) ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">Searching for companies...</p>
                  <p className="text-text-muted text-sm">Check the chat for live progress.</p>
                </div>
              ) : companies.length === 0 ? (
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
                  {filteredCompanies.map((company, idx) => {
                    const hasIntel = intelSlugs.has(company.slug)
                    return (
                      <div key={`${company.slug}-${idx}`} className="p-3 rounded-lg border border-border hover:bg-bg transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{company.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            company.fit_score >= 80 ? 'bg-success/10 text-success'
                              : company.fit_score >= 60 ? 'bg-warning/10 text-warning'
                                : company.fit_score >= 40 ? 'bg-text-muted/10 text-text-muted'
                                  : 'bg-bg text-text-muted'
                          }`}>
                            Tier {company.fit_score >= 80 ? '1' : company.fit_score >= 60 ? '2' : company.fit_score >= 40 ? '3' : '4'} · {company.fit_score}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
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
                          {(() => {
                            const slug = company.slug || company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                            const roleCount = openRoles.filter(r =>
                              r.status !== 'closed' && (r.company_slug === slug || r.company?.toLowerCase().includes(company.name.toLowerCase()))
                            ).length
                            return (
                              <>
                                {roleCount > 0 && (
                                  <button onClick={() => { setActiveTab('open-roles'); setRoleCompanyFilter(company.name); setRoleFilter('all') }}
                                    className="text-xs text-accent hover:text-accent-hover font-medium cursor-pointer">
                                    {roleCount} {roleCount === 1 ? 'Role' : 'Roles'}
                                  </button>
                                )}
                                {roleCount > 0 && <span className="text-border">·</span>}
                                <button onClick={() => {
                                  lastActionRef.current = 'score'
                                  sendChatMessage(`Run this command first: cat .claude/skills/scan-roles/SKILL.md — then scan for open roles ONLY at ${company.name}. Focus on roles matching my target function and level.`)
                                }} disabled={actionProcessing}
                                  className="text-xs text-text-muted hover:text-accent cursor-pointer disabled:opacity-50">
                                  Find Roles
                                </button>
                              </>
                            )
                          })()}
                          <span className="text-border">·</span>
                          <button onClick={async () => {
                            if (!confirm(`Remove ${company.name} from your target list?`)) return
                            const res = await fetch(`/api/finding/companies/${encodeURIComponent(company.slug)}`, { method: 'DELETE' })
                            if (res.ok) loadCompanies()
                          }} className="text-xs text-text-muted hover:text-danger cursor-pointer">
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* ─── Intel Overlay ──────────────────────────────────────── */}
        {selectedIntelSlug && (
          <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex" onClick={closeIntel}>
            <div className="w-full max-w-3xl mx-auto bg-surface border-x border-border shadow-lg flex flex-col h-full" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <div>
                  <h3 className="font-semibold">{intelData?.company || selectedIntelSlug}</h3>
                  {intelData && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {[intelData.industry, intelData.hq, intelData.size].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <button onClick={closeIntel} className="p-1.5 rounded-md hover:bg-bg text-text-muted hover:text-text transition-colors" aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg/50 shrink-0">
                {intelData?.website && (
                  <a href={intelData.website} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">
                    Website ↗
                  </a>
                )}
                {intelData?.careers_url && (
                  <a href={intelData.careers_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">
                    Careers ↗
                  </a>
                )}
                <button
                  onClick={() => { closeIntel(); handleResearchCompany(intelData?.company || selectedIntelSlug) }}
                  disabled={chatProcessing}
                  className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg disabled:opacity-50"
                >
                  Refresh Intel
                </button>
                {intelMarkdown && (
                  <button onClick={() => sendChatMessage(`Update the intel file for ${selectedIntelSlug}. Read search/intel/${selectedIntelSlug}.yaml and convert the markdown content into proper structured YAML format with fields: company, slug, industry, hq, size, stage, website, careers_url, culture, interview, comp.`)}
                    disabled={chatProcessing}
                    className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg disabled:opacity-50">
                    Restructure
                  </button>
                )}
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {intelLoading ? (
                  <div className="text-center py-8">
                    <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="text-text-muted">Loading intel...</span>
                  </div>
                ) : intelMarkdown ? (
                  <MarkdownView content={intelMarkdown} className="text-sm" />
                ) : intelData && Object.keys(intelData).length > 2 ? (
                  <div className="space-y-5">
                    {/* Culture */}
                    {intelData.culture && (
                      <div className="bg-bg border border-border rounded-lg p-4">
                        <h3 className="font-semibold text-sm mb-2">Culture</h3>
                        {intelData.culture.engineering_culture && <p className="text-sm text-text-muted mb-2">{intelData.culture.engineering_culture}</p>}
                        {intelData.culture.remote_policy && <p className="text-sm text-text-muted mb-2">Remote: {intelData.culture.remote_policy}</p>}
                        {intelData.culture.values?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {intelData.culture.values.map((v, i) => (
                              <span key={i} className="text-xs bg-surface px-2 py-0.5 rounded-full border border-border">{v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Interview */}
                    {intelData.interview && (
                      <div className="bg-bg border border-border rounded-lg p-4">
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
                      <div className="bg-bg border border-border rounded-lg p-4">
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
                ) : (
                  <div className="text-center py-12">
                    <p className="text-text-muted mb-4">No intel available for this company yet.</p>
                    <button
                      onClick={() => { closeIntel(); handleResearchCompany(selectedIntelSlug) }}
                      disabled={actionProcessing}
                      className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                    >
                      Research This Company
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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
              <div className="max-w-[90%]">
                <AgentProgress agentName="Research agent" lastMessage={chatMessages.filter(m => m.role === 'user').at(-1)?.content} spawnId={agentSpawnId} />
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
