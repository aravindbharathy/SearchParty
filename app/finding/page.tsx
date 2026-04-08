'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'

interface ScoredJD {
  filename: string
  company: string
  role: string
  score: number
  recommendation: string
  path: string
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
  const [scoredJDs, setScoredJDs] = useState<ScoredJD[]>([])
  const [companies, setCompanies] = useState<TargetCompany[]>([])
  const [vaultJDs, setVaultJDs] = useState<string[]>([])
  const [selectedJD, setSelectedJD] = useState<ScoredJD | null>(null)
  const [jdContent, setJdContent] = useState('')
  const { spawnAgent, status, error, output, reset } = useAgentEvents()
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

    let builtPrompt = ''
    try {
      const promptRes = await fetch('/api/agent/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: 'score-jd', params: { jdText: jdText.trim() } }),
      })
      if (promptRes.ok) {
        const data = await promptRes.json() as { prompt: string }
        builtPrompt = data.prompt
      }
    } catch { /* ignore */ }

    if (!builtPrompt) {
      builtPrompt = `Score this job description (context files unavailable):\n\n${jdText}`
    }

    await spawnAgent('research', {
      skill: 'score-jd',
      text: builtPrompt,
    })
  }

  const handleResearchCompany = async () => {
    if (!researchCompany.trim()) return
    setResearchStatus('running')

    try {
      const promptRes = await fetch('/api/agent/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: 'company-research', params: { companyName: researchCompany.trim() } }),
      })
      if (promptRes.ok) {
        const data = await promptRes.json() as { prompt: string }
        await spawnAgent('research', {
          skill: 'company-research',
          text: data.prompt,
        })
        setResearchStatus('done')
        setResearchCompany('')
        setTimeout(() => { loadCompanies(); setResearchStatus('idle') }, 2000)
      } else {
        setResearchStatus('error')
      }
    } catch {
      setResearchStatus('error')
    }
  }

  const handleGenerateTargets = async () => {
    setGenerateTargetsStatus('running')

    try {
      const promptRes = await fetch('/api/agent/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: 'generate-targets' }),
      })
      if (promptRes.ok) {
        const data = await promptRes.json() as { prompt: string }
        await spawnAgent('research', {
          skill: 'generate-targets',
          text: data.prompt,
        })
        setGenerateTargetsStatus('done')
        setTimeout(() => { loadCompanies(); setGenerateTargetsStatus('idle') }, 2000)
      } else {
        setGenerateTargetsStatus('error')
      }
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
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste a job description here..."
              className="w-full h-40 p-3 border border-border rounded-md bg-bg text-text text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex items-center gap-3 mt-3">
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

            {latestOutput && status === 'completed' && (
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
                <pre className="text-sm text-text whitespace-pre-wrap font-sans leading-relaxed">{latestOutput}</pre>
              </div>
            )}
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
            <h2 className="font-semibold mb-3">Scored JDs</h2>
            {scoredJDs.length === 0 ? (
              <p className="text-text-muted text-sm">No scored JDs yet. Paste a job description above to get started.</p>
            ) : (
              <div className="space-y-2">
                {scoredJDs.map((jd) => (
                  <button
                    key={jd.filename}
                    onClick={() => viewScoredJD(jd)}
                    className={`w-full text-left p-3 rounded-md border transition-colors ${
                      selectedJD?.filename === jd.filename
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:bg-bg'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{jd.company}</span>
                        <span className="text-text-muted text-sm"> -- {jd.role}</span>
                      </div>
                      <div className="flex items-center gap-2">
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
                          {jd.recommendation}
                        </span>
                      </div>
                    </div>
                  </button>
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
                <button
                  onClick={() => { setSelectedJD(null); setJdContent('') }}
                  className="text-text-muted text-sm hover:text-text"
                >
                  Close
                </button>
              </div>
              <div className="prose prose-sm max-w-none text-text">
                <pre className="whitespace-pre-wrap text-sm bg-bg p-4 rounded-md border border-border overflow-auto max-h-96">
                  {jdContent}
                </pre>
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
