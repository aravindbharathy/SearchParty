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
  status: string
  priority: string
  notes: string
}

export default function FindingPage() {
  const [jdText, setJdText] = useState('')
  const [scoredJDs, setScoredJDs] = useState<ScoredJD[]>([])
  const [companies, setCompanies] = useState<TargetCompany[]>([])
  const [vaultJDs, setVaultJDs] = useState<string[]>([])
  const [selectedJD, setSelectedJD] = useState<ScoredJD | null>(null)
  const [jdContent, setJdContent] = useState('')
  const { spawnAgent, status, error, reset } = useAgentEvents()

  const loadScoredJDs = useCallback(async () => {
    try {
      const res = await fetch('/api/finding/scored-jds')
      if (res.ok) {
        const data = await res.json() as { scoredJDs: ScoredJD[] }
        setScoredJDs(data.scoredJDs)
      }
    } catch {}
  }, [])

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/context/target-companies')
      if (res.ok) {
        const data = await res.json()
        setCompanies(data?.companies || [])
      }
    } catch {}
  }, [])

  const loadVaultJDs = useCallback(async () => {
    try {
      const res = await fetch('/api/finding/vault-jds')
      if (res.ok) {
        const data = await res.json() as { files: string[] }
        setVaultJDs(data.files)
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadScoredJDs()
    loadCompanies()
    loadVaultJDs()
  }, [loadScoredJDs, loadCompanies, loadVaultJDs])

  // Reload scored JDs when agent completes
  useEffect(() => {
    if (status === 'completed') {
      loadScoredJDs()
    }
  }, [status, loadScoredJDs])

  const handleScoreJD = async () => {
    if (!jdText.trim()) return
    reset()
    await spawnAgent('research', {
      skill: 'score-jd',
      text: `Run /score-jd with the following job description:\n\n${jdText}`,
    })
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

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Finding Roles</h1>
      <p className="text-text-muted mb-8">Score job descriptions, track targets, and discover opportunities.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Score JD + Scored list */}
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
                <span className="text-sm text-success">Score complete — check results below</span>
              )}
              {status === 'failed' && (
                <span className="text-sm text-danger">{error || 'Scoring failed'}</span>
              )}
              {status === 'timeout' && (
                <span className="text-sm text-danger">Scoring timed out. Try again.</span>
              )}
            </div>
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
                        <span className="text-text-muted text-sm"> — {jd.role}</span>
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
                  {selectedJD.company} — {selectedJD.role}
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
            <h2 className="font-semibold mb-3">Target Companies</h2>
            {companies.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-text-muted text-sm mb-3">No target companies yet.</p>
                <p className="text-text-muted text-xs">Complete setup or run <code className="bg-bg px-1 py-0.5 rounded text-accent">/setup companies</code></p>
              </div>
            ) : (
              <div className="space-y-2">
                {companies.map((company) => (
                  <div
                    key={company.slug}
                    className="p-3 rounded-md border border-border hover:bg-bg transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{company.name}</span>
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
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-text-muted capitalize">{company.status}</span>
                    </div>
                    {company.notes && (
                      <p className="text-xs text-text-muted mt-1">{company.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-xs text-text-muted">
              Company fit scores and detailed research will be available in Phase 3 with <code className="bg-bg px-1 py-0.5 rounded">/company-research</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
