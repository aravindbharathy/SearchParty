'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { AgentChat } from '../_components/agent-chat'
import { MarkdownView } from '../_components/markdown-view'

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

export default function FindingPage() {
  const [jdText, setJdText] = useState('')
  const [jdCompany, setJdCompany] = useState('')
  const [jdRole, setJdRole] = useState('')
  const [jdUrl, setJdUrl] = useState('')
  const [scoredJDs, setScoredJDs] = useState<ScoredJD[]>([])
  const [companies, setCompanies] = useState<TargetCompany[]>([])
  const [vaultJDs, setVaultJDs] = useState<string[]>([])
  const [selectedJD, setSelectedJD] = useState<ScoredJD | null>(null)
  const [jdContent, setJdContent] = useState('')
  const { spawnAgent, status, error, output, reset } = useAgentEvents('finding')
  const [latestOutput, setLatestOutput] = useState<string | null>(null)

  // Company research state
  const [researchCompany, setResearchCompany] = useState('')
  const [researchStatus, setResearchStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [generateTargetsStatus, setGenerateTargetsStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')

  // Intel modal state
  const [selectedIntelSlug, setSelectedIntelSlug] = useState<string | null>(null)
  const [intelData, setIntelData] = useState<CompanyIntel | null>(null)
  const [intelLoading, setIntelLoading] = useState(false)

  // Track which companies have intel
  const [intelSlugs, setIntelSlugs] = useState<Set<string>>(new Set())

  // FIX 1: Add-to-pipeline state
  const [pipelineMsg, setPipelineMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // FIX 7: Scored JDs filter/sort state
  const [jdSearch, setJdSearch] = useState('')
  const [jdSort, setJdSort] = useState<'score' | 'date'>('score')

  // FIX 4: Auto-detect company from JD text
  const detectedCompany = useMemo(() => {
    if (!jdText.trim()) return null
    const lower = jdText.toLowerCase()
    return companies.find((c) => lower.includes(c.name.toLowerCase())) || null
  }, [jdText, companies])

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
        const comps: TargetCompany[] = data?.companies || []
        setCompanies(comps)

        // Check intel status for each company
        const slugs = new Set<string>()
        for (const c of comps) {
          if (!c.slug) continue
          try {
            const r = await fetch(`/api/finding/intel/${encodeURIComponent(c.slug)}`)
            if (r.ok) slugs.add(c.slug)
          } catch { /* ignore */ }
        }
        setIntelSlugs(slugs)
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
    loadVaultJDs()
  }, [loadScoredJDs, loadCompanies, loadVaultJDs])

  useEffect(() => {
    if (status === 'completed') {
      loadScoredJDs()
      loadCompanies()
      if (output) setLatestOutput(output)
    }
  }, [status, output, loadScoredJDs, loadCompanies])

  const handleScoreJD = async () => {
    if (!jdText.trim()) return
    reset()

    // Use provided company/role or auto-detected
    const company = jdCompany.trim() || detectedCompany?.name || ''
    const role = jdRole.trim() || ''

    // Build a slug for the entry filename: company-role-date
    const slug = [company, role].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'

    // Save the raw JD to vault/job-descriptions/ so it can be reused (tailor resume, etc.)
    let jdPath = ''
    try {
      const saveRes = await fetch('/api/vault/save-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company || 'unknown',
          role: role || 'unknown',
          url: jdUrl.trim(),
          text: jdText.trim(),
        }),
      })
      if (saveRes.ok) {
        const saveData = await saveRes.json() as { path: string }
        jdPath = saveData.path
      }
    } catch { /* ignore — scoring still works without saving JD */ }

    await spawnAgent('research', {
      skill: 'score-jd',
      entry_name: slug,
      metadata: { company, role, url: jdUrl.trim(), jd_file: jdPath },
      text: `Score this job description against my profile. Read my experience library and career plan from search/context/ for the analysis.\n\nCompany: ${company}\nRole: ${role}\n\nJob Description:\n${jdText}`,
    })
  }

  const handleResearchCompany = async () => {
    if (!researchCompany.trim()) return
    setResearchStatus('running')

    const companySlug = researchCompany.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    try {
      await spawnAgent('research', {
        skill: 'company-research',
        entry_name: companySlug,
        metadata: { company: researchCompany.trim() },
        write_to: `intel/${companySlug}.yaml`,
        text: `Research "${researchCompany.trim()}" and produce structured company intel. Read search/context/career-plan.yaml and search/context/target-companies.yaml for candidate context.`,
      })
      setResearchStatus('done')
      setResearchCompany('')
      setTimeout(() => { loadCompanies(); setResearchStatus('idle') }, 2000)
    } catch {
      setResearchStatus('error')
    }
  }

  const handleGenerateTargets = async () => {
    setGenerateTargetsStatus('running')

    try {
      await spawnAgent('research', {
        skill: 'generate-targets',
        write_to: 'context/target-companies.yaml',
        text: `Generate a ranked list of target companies for my job search. Read search/context/career-plan.yaml for my target level, functions, industries, and compensation floor.`,
      })
      setGenerateTargetsStatus('done')
      setTimeout(() => { loadCompanies(); setGenerateTargetsStatus('idle') }, 2000)
    } catch {
      setGenerateTargetsStatus('error')
    }
  }

  const viewCompanyIntel = async (slug: string) => {
    setSelectedIntelSlug(slug)
    setIntelLoading(true)
    try {
      const res = await fetch(`/api/finding/intel/${encodeURIComponent(slug)}`)
      if (res.ok) {
        const data = await res.json() as { intel: CompanyIntel }
        setIntelData(data.intel)
      } else {
        setIntelData(null)
      }
    } catch {
      setIntelData(null)
    }
    setIntelLoading(false)
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
        setScoredJDs((prev) => prev.filter((jd) => jd.filename !== filename))
        if (selectedJD?.filename === filename) {
          setSelectedJD(null)
          setJdContent('')
        }
      }
    } catch { /* ignore */ }
  }

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

  // FIX 1: Add scored JD to pipeline
  const addToPipeline = async (company: string, role: string, fitScore: number, jdFile?: string) => {
    setPipelineMsg(null)
    try {
      const res = await fetch('/api/pipeline/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          role,
          status: 'researching',
          fit_score: fitScore,
          jd_source: jdFile || 'scored',
        }),
      })
      if (res.ok) {
        setPipelineMsg({ type: 'success', text: `Added ${company} - ${role} to pipeline` })
        setTimeout(() => setPipelineMsg(null), 4000)
      } else {
        const data = await res.json().catch(() => ({}))
        setPipelineMsg({ type: 'error', text: (data as { error?: string }).error || 'Failed to add to pipeline' })
      }
    } catch {
      setPipelineMsg({ type: 'error', text: 'Failed to add to pipeline' })
    }
  }

  // FIX 1: Parse company/role from latest output
  const parseScoreResult = (text: string): { company: string; role: string; score: number } | null => {
    const companyMatch = text.match(/(?:company|employer|organization)[:\s]+([^\n]+)/i)
    const roleMatch = text.match(/(?:role|position|title)[:\s]+([^\n]+)/i)
    const scoreMatch = text.match(/(?:overall|fit|total)\s*(?:score|rating)?[:\s]+(\d+)/i)
    if (!companyMatch && !roleMatch) return null
    return {
      company: companyMatch?.[1]?.trim() || 'Unknown',
      role: roleMatch?.[1]?.trim() || 'Unknown',
      score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
    }
  }

  // FIX 4: Pre-fill JD textarea for a company
  const prefillScoreJDForCompany = (companyName: string) => {
    setSelectedIntelSlug(null)
    setIntelData(null)
    setJdCompany(companyName)
    setJdRole('')
    setJdUrl('')
    setJdText('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // FIX 7: Filtered & sorted scored JDs
  const filteredScoredJDs = useMemo(() => {
    let list = [...scoredJDs]
    if (jdSearch.trim()) {
      const q = jdSearch.toLowerCase()
      list = list.filter(
        (jd) => jd.company.toLowerCase().includes(q) || jd.role.toLowerCase().includes(q),
      )
    }
    if (jdSort === 'score') {
      list.sort((a, b) => b.score - a.score)
    } else {
      // By date: filenames typically have timestamps; reverse alphabetical ~ newest first
      list.sort((a, b) => b.filename.localeCompare(a.filename))
    }
    return list
  }, [scoredJDs, jdSearch, jdSort])

  const getIntelStatus = (company: TargetCompany): { label: string; color: string } => {
    if (intelSlugs.has(company.slug)) {
      return { label: 'Researched', color: 'bg-success/10 text-success' }
    }
    return { label: 'No intel', color: 'bg-text-muted/10 text-text-muted' }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Finding Roles</h1>
      <p className="text-text-muted mb-8">Score job descriptions, research companies, and discover opportunities.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Score JD + Research + Scored list */}
        <div className="lg:col-span-2 space-y-6">
          {/* Score JD Action */}
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="font-semibold mb-3">Score a Job Description</h2>

            {/* Company + Role row */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Company name</label>
                <input
                  value={jdCompany}
                  onChange={(e) => setJdCompany(e.target.value)}
                  placeholder={detectedCompany?.name || 'e.g. Stripe'}
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Role title</label>
                <input
                  value={jdRole}
                  onChange={(e) => setJdRole(e.target.value)}
                  placeholder="e.g. Staff Engineer"
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>

            {/* Job URL (optional) */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-text-muted mb-1">Job posting URL <span className="text-text-muted font-normal">(optional)</span></label>
              <input
                value={jdUrl}
                onChange={(e) => setJdUrl(e.target.value)}
                placeholder="https://jobs.stripe.com/..."
                className="w-full px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            {/* JD text */}
            <div className="mb-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Job description</label>
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste the full job description here..."
                className="w-full h-40 p-3 border border-border rounded-md bg-bg text-text text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            {/* Auto-detect company from JD text */}
            {!jdCompany && detectedCompany && (
              <div className="mb-2 text-xs text-accent flex items-center gap-1">
                <span>Detected target company:</span>
                <button
                  onClick={() => setJdCompany(detectedCompany.name)}
                  className="font-medium underline hover:no-underline"
                >
                  {detectedCompany.name}
                </button>
                <span className="text-text-muted">— click to use</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleScoreJD}
                disabled={!jdText.trim() || status === 'running'}
                className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === 'running' ? 'Scoring...' : 'Score JD'}
              </button>
              {status === 'running' && (
                <span className="text-sm text-text-muted flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Research agent scoring JD...
                </span>
              )}
              {status === 'completed' && (
                <span className="text-sm text-success">Score complete -- see results below</span>
              )}
              {status === 'failed' && (
                <span className="text-sm text-danger">{error || 'Scoring failed'}</span>
              )}
              {status === 'timeout' && (
                <span className="text-sm text-danger">Scoring timed out. Try again.</span>
              )}
            </div>

            {latestOutput && status === 'completed' && (() => {
              const parsed = parseScoreResult(latestOutput)
              return (
                <div className="mt-4 p-4 bg-bg border border-border rounded-md">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Score Result</h3>
                    <button
                      onClick={() => setLatestOutput(null)}
                      className="text-xs text-text-muted hover:text-text"
                    >
                      Dismiss
                    </button>
                  </div>
                  <AgentChat
                    agentName="research"
                    initialOutput={latestOutput}
                    skill="score-jd"
                    onClose={() => setLatestOutput(null)}
                    metadata={{ company: jdCompany || 'unknown' }}
                  />
                  {/* FIX 1: Add to Pipeline button on inline result */}
                  <button
                    onClick={() => {
                      if (parsed) {
                        addToPipeline(parsed.company, parsed.role, parsed.score)
                      }
                    }}
                    className="mt-3 px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    Add to Pipeline{parsed ? ` (${parsed.company})` : ''}
                  </button>
                  {pipelineMsg && (
                    <span className={`ml-3 text-sm ${pipelineMsg.type === 'success' ? 'text-success' : 'text-danger'}`}>
                      {pipelineMsg.text}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Research Company Action */}
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="font-semibold mb-3">Research a Company</h2>
            <p className="text-text-muted text-xs mb-3">Get structured intel: interview format, comp bands, culture, and tips.</p>
            <div className="flex items-center gap-3">
              <input
                value={researchCompany}
                onChange={(e) => setResearchCompany(e.target.value)}
                placeholder="Enter company name..."
                className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                onKeyDown={(e) => { if (e.key === 'Enter') handleResearchCompany() }}
              />
              <button
                onClick={handleResearchCompany}
                disabled={!researchCompany.trim() || researchStatus === 'running'}
                className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {researchStatus === 'running' ? 'Researching...' : 'Research'}
              </button>
            </div>
            {researchStatus === 'running' && (
              <p className="text-sm text-text-muted mt-2 flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                Research agent gathering intel...
              </p>
            )}
            {researchStatus === 'done' && (
              <p className="text-sm text-success mt-2">Research complete. Intel file created.</p>
            )}
            {researchStatus === 'error' && (
              <p className="text-sm text-danger mt-2">Research failed. Try again.</p>
            )}
          </div>

          {/* Scored JDs List */}
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Scored JDs</h2>
              {scoredJDs.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setJdSort('score')}
                    className={`text-xs px-2 py-1 rounded ${jdSort === 'score' ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text'}`}
                  >
                    By Score
                  </button>
                  <button
                    onClick={() => setJdSort('date')}
                    className={`text-xs px-2 py-1 rounded ${jdSort === 'date' ? 'bg-accent/10 text-accent font-medium' : 'text-text-muted hover:text-text'}`}
                  >
                    By Date
                  </button>
                </div>
              )}
            </div>
            {/* FIX 7: Search input */}
            {scoredJDs.length > 0 && (
              <input
                value={jdSearch}
                onChange={(e) => setJdSearch(e.target.value)}
                placeholder="Filter by company or role..."
                className="w-full px-3 py-2 mb-3 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            )}
            {/* FIX 1: Pipeline message */}
            {pipelineMsg && (
              <div className={`mb-3 text-sm ${pipelineMsg.type === 'success' ? 'text-success' : 'text-danger'}`}>
                {pipelineMsg.text}
              </div>
            )}
            {scoredJDs.length === 0 ? (
              <p className="text-text-muted text-sm">No scored JDs yet. Paste a job description above to get started.</p>
            ) : filteredScoredJDs.length === 0 ? (
              <p className="text-text-muted text-sm">No scored JDs match your filter.</p>
            ) : (
              <div className="space-y-2">
                {filteredScoredJDs.map((jd) => (
                  <div
                    key={jd.filename}
                    className={`p-3 rounded-md border transition-colors ${
                      selectedJD?.filename === jd.filename
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:bg-bg'
                    }`}
                  >
                    <button
                      onClick={() => viewScoredJD(jd)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate">{jd.company}</span>
                            {jd.url && (
                              <a
                                href={jd.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-accent hover:text-accent-hover flex-shrink-0"
                                title="Open job posting"
                              >
                                ↗
                              </a>
                            )}
                          </div>
                          <div className="text-text-muted text-xs">{jd.role}{jd.date ? ` · ${jd.date}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            jd.score >= 75
                              ? 'bg-success/10 text-success'
                              : jd.score >= 60
                                ? 'bg-warning/10 text-warning'
                                : 'bg-danger/10 text-danger'
                          }`}>
                            {jd.score}/100
                          </span>
                          <span className={`text-xs ${
                            jd.recommendation === 'Apply'
                              ? 'text-success'
                              : jd.recommendation === 'Referral Only'
                                ? 'text-warning'
                                : 'text-danger'
                          }`}>
                            Recommendation: {jd.recommendation}
                          </span>
                        </div>
                      </div>
                    </button>
                    {/* FIX 1: Add to Pipeline per scored JD card */}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          addToPipeline(jd.company, jd.role, jd.score, jd.jd_file)
                        }}
                        className="text-xs px-2 py-1 bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors"
                      >
                        Add to Pipeline
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteScoredJD(jd.filename)
                        }}
                        className="text-xs px-2 py-1 bg-danger/10 text-danger rounded hover:bg-danger/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* JD Detail View */}
          {selectedJD && (
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">
                  {selectedJD.company} -- {selectedJD.role}
                </h2>
                <div className="flex items-center gap-2">
                  {/* FIX 1: Add to Pipeline from detail view */}
                  <button
                    onClick={() => addToPipeline(selectedJD.company, selectedJD.role, selectedJD.score, selectedJD.jd_file)}
                    className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover transition-colors"
                  >
                    Add to Pipeline
                  </button>
                  <button
                    onClick={() => { setSelectedJD(null); setJdContent('') }}
                    className="text-text-muted text-sm hover:text-text"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="bg-bg p-4 rounded-md border border-border overflow-auto max-h-96">
                <MarkdownView content={jdContent} />
              </div>
            </div>
          )}

          {/* Vault JDs */}
          {vaultJDs.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-5">
              <h2 className="font-semibold mb-3">New JDs from Vault</h2>
              <p className="text-text-muted text-xs mb-3">Files detected in vault/job-descriptions/</p>
              <div className="space-y-1">
                {vaultJDs.map((file) => (
                  <div key={file} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg">
                    <span className="text-sm">{file}</span>
                    <span className="text-xs text-text-muted">Unscored</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Target Companies */}
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Target Companies</h2>
              <button
                onClick={handleGenerateTargets}
                disabled={generateTargetsStatus === 'running'}
                className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generateTargetsStatus === 'running' ? 'Generating...' : 'Generate Targets'}
              </button>
            </div>
            {generateTargetsStatus === 'running' && (
              <p className="text-xs text-text-muted mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                Research agent generating target list...
              </p>
            )}
            {generateTargetsStatus === 'done' && (
              <p className="text-xs text-success mb-3">Target list generated.</p>
            )}
            {companies.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-text-muted text-sm mb-3">No target companies yet.</p>
                <p className="text-text-muted text-xs">Click &quot;Generate Targets&quot; to auto-generate from your career plan.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {companies.map((company) => {
                  const intel = getIntelStatus(company)
                  return (
                    <button
                      key={company.slug}
                      onClick={() => intelSlugs.has(company.slug) ? viewCompanyIntel(company.slug) : undefined}
                      className={`w-full text-left p-3 rounded-md border border-border hover:bg-bg transition-colors ${
                        intelSlugs.has(company.slug) ? 'cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{company.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${intel.color}`}>
                            {intel.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            company.priority === 'high'
                              ? 'bg-danger/10 text-danger'
                              : company.priority === 'medium'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-bg text-text-muted'
                          }`}>
                            {company.priority}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-text-muted capitalize">{company.status}</span>
                        {company.fit_score > 0 && (
                          <span className="text-xs text-accent font-medium">{company.fit_score}/100</span>
                        )}
                      </div>
                      {company.notes && (
                        <p className="text-xs text-text-muted mt-1">{company.notes}</p>
                      )}
                      {/* FIX 4: Score JD link per company */}
                      <div
                        className="mt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => prefillScoreJDForCompany(company.name)}
                          className="text-xs text-accent hover:text-accent-hover hover:underline"
                        >
                          Score JD
                        </button>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Intel Detail Modal */}
      {selectedIntelSlug && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedIntelSlug(null); setIntelData(null) }}>
          <div
            className="bg-surface border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {intelLoading ? (
              <p className="text-text-muted">Loading intel...</p>
            ) : intelData ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{intelData.company}</h2>
                    <p className="text-sm text-text-muted">{intelData.industry} | {intelData.hq} | {intelData.size}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedIntelSlug(null); setIntelData(null) }}
                    className="text-text-muted hover:text-text text-sm"
                  >
                    Close
                  </button>
                </div>

                {/* Culture */}
                <div className="mb-4">
                  <h3 className="font-semibold text-sm mb-2">Culture</h3>
                  <p className="text-sm text-text-muted mb-1">{intelData.culture?.engineering_culture}</p>
                  <p className="text-sm text-text-muted">Remote: {intelData.culture?.remote_policy}</p>
                  {intelData.culture?.values?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {intelData.culture.values.map((v, i) => (
                        <span key={i} className="text-xs bg-bg px-2 py-0.5 rounded-full">{v}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Interview */}
                <div className="mb-4">
                  <h3 className="font-semibold text-sm mb-2">Interview Process</h3>
                  <p className="text-xs text-text-muted mb-2">Timeline: {intelData.interview?.timeline}</p>
                  <div className="space-y-1">
                    {intelData.interview?.stages?.map((s, i) => (
                      <div key={i} className="text-sm flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center font-medium">{i + 1}</span>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-text-muted text-xs">({s.duration}, {s.format})</span>
                      </div>
                    ))}
                  </div>
                  {intelData.interview?.tips?.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-text-muted mb-1">Tips</h4>
                      <ul className="text-xs text-text-muted space-y-1">
                        {intelData.interview.tips.map((t, i) => (
                          <li key={i}>- {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Compensation */}
                <div className="mb-4">
                  <h3 className="font-semibold text-sm mb-2">Compensation</h3>
                  <div className="space-y-1">
                    {intelData.comp?.bands?.map((b, i) => (
                      <div key={i} className="text-sm flex items-center justify-between">
                        <span className="font-medium">{b.level}</span>
                        <span className="text-text-muted text-xs">Base: {b.base} | Total: {b.total}</span>
                      </div>
                    ))}
                  </div>
                  {intelData.comp?.notes && (
                    <p className="text-xs text-text-muted mt-2">{intelData.comp.notes}</p>
                  )}
                </div>

                {/* FIX 4: Score a JD for this company */}
                <div className="pt-3 border-t border-border">
                  <button
                    onClick={() => prefillScoreJDForCompany(intelData.company)}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    Score a JD for {intelData.company}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-text-muted">No intel available for this company.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
