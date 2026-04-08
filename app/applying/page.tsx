'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'

interface FollowUp {
  due: string
  type: string
  status: string
  message_summary: string
}

interface Application {
  id: string
  company: string
  role: string
  status: string
  applied_date: string
  jd_source: string
  resume_version: string
  fit_score: number
  follow_ups: FollowUp[]
  notes: string
}

const COLUMNS = [
  { key: 'researching', label: 'Researching', color: 'bg-text-muted/10' },
  { key: 'applied', label: 'Applied', color: 'bg-accent/10' },
  { key: 'phone-screen', label: 'Phone Screen', color: 'bg-warning/10' },
  { key: 'onsite', label: 'Onsite', color: 'bg-warning/20' },
  { key: 'offer', label: 'Offer', color: 'bg-success/10' },
  { key: 'rejected', label: 'Rejected', color: 'bg-danger/10' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'bg-text-muted/5' },
] as const

const STATUS_OPTIONS = COLUMNS.map((c) => ({ value: c.key, label: c.label }))

function daysInStage(appliedDate: string): number {
  if (!appliedDate) return 0
  const diff = Date.now() - new Date(appliedDate).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function nextPendingFollowUp(followUps: FollowUp[]): FollowUp | null {
  const pending = followUps.filter((f) => f.status === 'pending')
  if (pending.length === 0) return null
  pending.sort((a, b) => a.due.localeCompare(b.due))
  return pending[0]
}

function followUpIndicator(fu: FollowUp | null): { label: string; className: string } | null {
  if (!fu) return null
  const today = new Date().toISOString().split('T')[0]
  if (fu.due < today) return { label: `Overdue: ${fu.due}`, className: 'text-danger' }
  if (fu.due === today) return { label: `Due today`, className: 'text-warning' }
  return { label: `Follow-up: ${fu.due}`, className: 'text-text-muted' }
}

export default function ApplyingPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [formCompany, setFormCompany] = useState('')
  const [formRole, setFormRole] = useState('')
  const [formStatus, setFormStatus] = useState('researching')
  const [formJdSource, setFormJdSource] = useState('')
  const [tailorJdText, setTailorJdText] = useState('')
  const [showTailorModal, setShowTailorModal] = useState(false)
  const [savedField, setSavedField] = useState<string | null>(null)
  // FIX 2: Track which application a tailor is for
  const [tailorForApp, setTailorForApp] = useState<Application | null>(null)
  const [tailorAppDropdown, setTailorAppDropdown] = useState('')
  // FIX 9: Track output filename and content
  const [tailorOutputFile, setTailorOutputFile] = useState<string | null>(null)
  const [tailorReviewData, setTailorReviewData] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)

  const { spawnAgent, status: agentStatus, error: agentError, output: agentOutput, reset: resetAgent } = useAgentEvents()

  const loadApplications = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/applications')
      if (res.ok) {
        const data = await res.json() as { applications: Application[] }
        setApplications(data.applications)
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadApplications()
  }, [loadApplications])

  useEffect(() => {
    if (agentStatus === 'completed') {
      loadApplications()
      // Auto-update application's resume_version with the write_to path
      if (tailorForApp && tailorOutputFile) {
        fetch(`/api/pipeline/applications/${tailorForApp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'resume_version', value: tailorOutputFile }),
        }).then(() => loadApplications()).catch(() => {})
      }
      // Extract review results if present
      if (agentOutput) {
        const reviewMatch = agentOutput.match(/((?:recruiter review|ats check|ats score|compatibility)[\s\S]*)/i)
        if (reviewMatch) {
          setTailorReviewData(reviewMatch[1].trim())
        }
      }
    }
  }, [agentStatus, agentOutput, loadApplications, tailorForApp, tailorOutputFile])

  const handleAddApplication = async () => {
    if (!formCompany.trim() || !formRole.trim()) return

    try {
      const res = await fetch('/api/pipeline/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: formCompany,
          role: formRole,
          status: formStatus,
          jd_source: formJdSource || 'pasted',
        }),
      })
      if (res.ok) {
        setFormCompany('')
        setFormRole('')
        setFormStatus('researching')
        setFormJdSource('')
        setShowAddForm(false)
        loadApplications()
      }
    } catch {}
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/pipeline/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'status', value: newStatus }),
      })
      loadApplications()
      if (selectedApp?.id === id) {
        setSelectedApp((prev) => prev ? { ...prev, status: newStatus } : null)
      }
    } catch {}
  }

  const handleFollowUpAction = async (appId: string, followUps: FollowUp[], index: number, action: 'dismissed' | 'skipped' | 'sent') => {
    const updated = [...followUps]
    updated[index] = { ...updated[index], status: action }
    try {
      await fetch(`/api/pipeline/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'follow_ups', value: updated }),
      })
      loadApplications()
    } catch {}
  }

  const handleTailorResume = async () => {
    if (!tailorJdText.trim()) return
    resetAgent()
    setTailorOutputFile(null)
    setTailorReviewData(null)
    setCopySuccess(false)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

    // FIX 2: Resolve which application this tailor is for
    let linkedApp: Application | null = null
    if (tailorAppDropdown) {
      const app = applications.find((a) => a.id === tailorAppDropdown)
      linkedApp = app || null
      setTailorForApp(linkedApp)
    }

    // Build contextual filename: company-role-timestamp.md
    const companySlug = (linkedApp?.company || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const roleSlug = (linkedApp?.role || 'resume').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const outputPath = `output/resumes/${companySlug}-${roleSlug}-${timestamp}.md`
    setTailorOutputFile(outputPath)

    // Build prompt server-side (agent in -p mode can't read files —
    // the build-prompt API reads experience library + career plan from disk)
    let builtPrompt = ''
    try {
      const promptRes = await fetch('/api/agent/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: 'resume-tailor', params: { jdText: tailorJdText.trim() } }),
      })
      if (promptRes.ok) {
        const data = await promptRes.json() as { prompt: string }
        builtPrompt = data.prompt
      }
    } catch {}

    if (!builtPrompt) {
      builtPrompt = `Tailor a resume for this JD (context files unavailable):\n\n${tailorJdText}`
    }

    await spawnAgent('resume', {
      skill: 'resume-tailor',
      entry_name: `${companySlug}-${roleSlug}`,
      metadata: {
        company: linkedApp?.company || '',
        role: linkedApp?.role || '',
        jd_file: linkedApp?.jd_source || '',
      },
      write_to: outputPath,
      text: builtPrompt,
    })
    setShowTailorModal(false)
    setTailorJdText('')
  }

  // FIX 2: Tailor resume from detail panel — auto-loads JD from vault file
  const handleTailorFromDetail = async (app: Application) => {
    setTailorForApp(app)
    setTailorAppDropdown(app.id)
    setTailorJdText('') // Clear first
    setShowTailorModal(true)

    // Try to load JD text from vault file
    if (app.jd_source && app.jd_source.startsWith('vault/')) {
      try {
        const res = await fetch(`/api/vault/read-jd?path=${encodeURIComponent(app.jd_source)}`)
        if (res.ok) {
          const data = await res.json() as { text: string }
          setTailorJdText(data.text)
        }
      } catch { /* ignore — user can still paste manually */ }
    }
  }

  // Inline edit save handler for detail panel fields
  const handleFieldUpdate = async (field: string, value: string | number) => {
    if (!selectedApp) return
    try {
      await fetch(`/api/pipeline/applications/${selectedApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value }),
      })
      setSelectedApp((prev) => prev ? { ...prev, [field]: value } : null)
      loadApplications()
      setSavedField(field)
      setTimeout(() => setSavedField(null), 1500)
    } catch {}
  }

  // FIX 9: Copy resume content to clipboard
  const handleCopyResume = async () => {
    if (agentOutput) {
      try {
        await navigator.clipboard.writeText(agentOutput)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch { /* ignore */ }
    }
  }

  const appsByStatus = (statusKey: string) =>
    applications.filter((a) => a.status === statusKey)

  return (
    <div className="max-w-full mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Applying</h1>
          <p className="text-text-muted mt-1">Track your applications through the pipeline.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTailorModal(true)}
            className="px-4 py-2 bg-surface border border-border text-text rounded-md text-sm font-medium hover:bg-bg transition-colors"
          >
            Tailor Resume
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Add Application
          </button>
        </div>
      </div>

      {/* Agent status bar */}
      {agentStatus === 'running' && (
        <div className="mb-4 p-3 bg-accent/5 border border-accent/20 rounded-lg flex items-center gap-2 text-sm">
          <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Resume agent is tailoring your resume...</span>
        </div>
      )}
      {agentStatus === 'completed' && (
        <div className="mb-4 p-3 bg-success/5 border border-success/20 rounded-lg text-sm">
          <div className="text-success mb-1">Resume generated!</div>
          {/* FIX 9: Show output filename */}
          {tailorOutputFile && (
            <div className="text-text-muted text-xs mb-2">
              Saved to: <span className="font-mono text-text">{tailorOutputFile}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* FIX 9: Copy to clipboard */}
            {agentOutput && (
              <button
                onClick={handleCopyResume}
                className="text-xs px-2 py-1 bg-bg border border-border rounded hover:bg-surface transition-colors"
              >
                {copySuccess ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            )}
          </div>
          {/* FIX 9: Review results */}
          {tailorReviewData && (
            <div className="mt-3 p-3 bg-bg border border-border rounded-md">
              <h4 className="text-xs font-semibold text-text-muted mb-1">Review Results</h4>
              <pre className="text-xs text-text whitespace-pre-wrap font-sans">{tailorReviewData}</pre>
            </div>
          )}
        </div>
      )}
      {agentStatus === 'failed' && (
        <div className="mb-4 p-3 bg-danger/5 border border-danger/20 rounded-lg text-sm text-danger">
          {agentError || 'Resume generation failed.'}
        </div>
      )}

      {/* Add Application Form */}
      {showAddForm && (
        <div className="mb-6 bg-surface border border-border rounded-lg p-5">
          <h3 className="font-semibold mb-3">Add Application</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              value={formCompany}
              onChange={(e) => setFormCompany(e.target.value)}
              placeholder="Company"
              className="px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <input
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              placeholder="Role"
              className="px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <select
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              value={formJdSource}
              onChange={(e) => setFormJdSource(e.target.value)}
              placeholder="JD source (URL or 'pasted')"
              className="px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddApplication}
              disabled={!formCompany.trim() || !formRole.trim()}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-bg border border-border text-text-muted rounded-md text-sm hover:text-text transition-colors"
            >
              Cancel
            </button>
          </div>
          {/* FIX 8: Auto-follow-up notice */}
          <p className="text-xs text-text-muted mt-3">
            Follow-ups will be auto-scheduled at days 7, 14, and 21 after applying.
          </p>
        </div>
      )}

      {/* Tailor Resume Modal */}
      {showTailorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-lg">
            <h3 className="font-semibold mb-3">Tailor Resume</h3>
            <p className="text-text-muted text-sm mb-3">Paste the job description to generate a tailored resume.</p>
            {/* FIX 2: Application selector dropdown */}
            <div className="mb-3">
              <label className="text-xs text-text-muted block mb-1">Link to application (optional)</label>
              <select
                value={tailorAppDropdown}
                onChange={(e) => setTailorAppDropdown(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">-- None --</option>
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.company} - {app.role}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={tailorJdText}
              onChange={(e) => setTailorJdText(e.target.value)}
              placeholder="Paste job description here..."
              className="w-full h-48 p-3 border border-border rounded-md bg-bg text-text text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleTailorResume}
                disabled={!tailorJdText.trim()}
                className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                Generate Resume
              </button>
              <button
                onClick={() => { setShowTailorModal(false); setTailorJdText(''); setTailorAppDropdown(''); setTailorForApp(null) }}
                className="px-4 py-2 bg-bg border border-border text-text-muted rounded-md text-sm hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {applications.length === 0 && !showAddForm ? (
        <div className="text-center py-16">
          <p className="text-text-muted text-lg mb-2">No applications yet.</p>
          <p className="text-text-muted text-sm mb-4">Click &ldquo;Add Application&rdquo; to get started.</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Add Your First Application
          </button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colApps = appsByStatus(col.key)
            return (
              <div key={col.key} className="flex-shrink-0 w-64">
                <div className={`rounded-t-lg px-3 py-2 ${col.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="text-xs text-text-muted bg-surface rounded-full w-5 h-5 flex items-center justify-center">
                      {colApps.length}
                    </span>
                  </div>
                </div>
                <div className="bg-bg/50 border border-t-0 border-border rounded-b-lg p-2 min-h-[200px] space-y-2">
                  {colApps.map((app) => {
                    const nextFU = nextPendingFollowUp(app.follow_ups)
                    const fuIndicator = followUpIndicator(nextFU)

                    return (
                      <div
                        key={app.id}
                        onClick={() => setSelectedApp(app)}
                        className={`bg-surface border rounded-md p-3 cursor-pointer hover:shadow-sm transition-shadow ${
                          selectedApp?.id === app.id ? 'border-accent shadow-sm' : 'border-border'
                        }`}
                      >
                        <div className="font-medium text-sm">{app.company}</div>
                        <div className="text-xs text-text-muted">{app.role}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-text-muted">
                            {daysInStage(app.applied_date)}d
                          </span>
                          {app.fit_score > 0 && (
                            <span className={`text-xs font-medium ${
                              app.fit_score >= 75 ? 'text-success'
                                : app.fit_score >= 60 ? 'text-warning'
                                  : 'text-danger'
                            }`}>
                              {app.fit_score}
                            </span>
                          )}
                        </div>
                        {fuIndicator && (
                          <div className={`text-xs mt-1 ${fuIndicator.className}`}>
                            {fuIndicator.label}
                          </div>
                        )}
                        {app.resume_version && (
                          <div className="text-xs text-text-muted mt-1 truncate">
                            {app.resume_version}
                          </div>
                        )}
                        {/* Status dropdown */}
                        <select
                          value={app.status}
                          onChange={(e) => {
                            e.stopPropagation()
                            handleStatusChange(app.id, e.target.value)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 w-full text-xs px-2 py-1 border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent/40"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Panel */}
      {selectedApp && (
        <div className="fixed inset-y-0 right-0 w-96 bg-surface border-l border-border shadow-lg z-40 overflow-y-auto">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <input
                defaultValue={selectedApp.company}
                onBlur={(e) => { if (e.target.value !== selectedApp.company) handleFieldUpdate('company', e.target.value) }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="font-semibold text-lg bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full mr-2 px-1 py-0.5 rounded transition-colors"
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                {savedField === 'company' && <span className="text-xs text-success">Saved</span>}
                <button
                  onClick={() => setSelectedApp(null)}
                  className="text-text-muted hover:text-text text-sm"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Role {savedField === 'role' && <span className="text-success normal-case">- Saved</span>}</div>
                <input
                  defaultValue={selectedApp.role}
                  onBlur={(e) => { if (e.target.value !== selectedApp.role) handleFieldUpdate('role', e.target.value) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                />
              </div>

              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Status</div>
                <select
                  value={selectedApp.status}
                  onChange={(e) => handleStatusChange(selectedApp.id, e.target.value)}
                  className="text-sm px-2 py-1 border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Applied {savedField === 'applied_date' && <span className="text-success normal-case">- Saved</span>}</div>
                  <input
                    type="date"
                    defaultValue={selectedApp.applied_date || ''}
                    onBlur={(e) => { if (e.target.value !== (selectedApp.applied_date || '')) handleFieldUpdate('applied_date', e.target.value) }}
                    className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                  />
                </div>
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Fit Score {savedField === 'fit_score' && <span className="text-success normal-case">- Saved</span>}</div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{selectedApp.fit_score > 0 ? `${selectedApp.fit_score}/100` : 'Not scored'}</span>
                    <button
                      onClick={() => {
                        const val = prompt('Override fit score (0-100):', String(selectedApp.fit_score || ''))
                        if (val !== null && !isNaN(Number(val))) handleFieldUpdate('fit_score', Number(val))
                      }}
                      className="text-xs text-text-muted hover:text-accent ml-1"
                      title="Override fit score"
                    >
                      edit
                    </button>
                  </div>
                </div>
              </div>

              {/* FIX 2: Resume section with Tailor + View */}
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Resume</div>
                {selectedApp.resume_version ? (
                  <div>
                    <div className="text-sm text-accent mb-1">{selectedApp.resume_version}</div>
                    <a
                      href={`/vault?file=${encodeURIComponent(selectedApp.resume_version)}`}
                      className="text-xs text-accent hover:text-accent-hover hover:underline"
                    >
                      View Resume
                    </a>
                  </div>
                ) : (
                  <div className="text-sm text-text-muted">Not yet tailored</div>
                )}
                <button
                  onClick={() => handleTailorFromDetail(selectedApp)}
                  className="mt-2 px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover transition-colors"
                >
                  {selectedApp.resume_version ? 'Re-tailor Resume' : 'Tailor Resume'}
                </button>
              </div>

              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">JD Source {savedField === 'jd_source' && <span className="text-success normal-case">- Saved</span>}</div>
                <input
                  defaultValue={selectedApp.jd_source || ''}
                  onBlur={(e) => { if (e.target.value !== (selectedApp.jd_source || '')) handleFieldUpdate('jd_source', e.target.value) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  placeholder="URL or description"
                  className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                />
              </div>

              {/* Follow-ups */}
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Follow-ups</div>
                {selectedApp.follow_ups.length === 0 ? (
                  <p className="text-sm text-text-muted">No follow-ups</p>
                ) : (
                  <div className="space-y-2">
                    {selectedApp.follow_ups.map((fu, idx) => {
                      const today = new Date().toISOString().split('T')[0]
                      const isOverdue = fu.status === 'pending' && fu.due < today
                      const isToday = fu.status === 'pending' && fu.due === today

                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded border text-sm ${
                            fu.status !== 'pending'
                              ? 'border-border/50 bg-bg/50 opacity-60'
                              : isOverdue
                                ? 'border-danger/30 bg-danger/5'
                                : isToday
                                  ? 'border-warning/30 bg-warning/5'
                                  : 'border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium ${
                              isOverdue ? 'text-danger' : isToday ? 'text-warning' : ''
                            }`}>
                              {fu.due}
                            </span>
                            <span className="text-xs text-text-muted capitalize">{fu.status}</span>
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">{fu.message_summary}</div>
                          {fu.status === 'pending' && (
                            <div className="flex gap-1 mt-2">
                              <button
                                onClick={() => handleFollowUpAction(selectedApp.id, selectedApp.follow_ups, idx, 'sent')}
                                className="text-xs px-2 py-0.5 bg-success/10 text-success rounded hover:bg-success/20"
                              >
                                Sent
                              </button>
                              <button
                                onClick={() => handleFollowUpAction(selectedApp.id, selectedApp.follow_ups, idx, 'skipped')}
                                className="text-xs px-2 py-0.5 bg-bg text-text-muted rounded hover:bg-border"
                              >
                                Skip
                              </button>
                              <button
                                onClick={() => handleFollowUpAction(selectedApp.id, selectedApp.follow_ups, idx, 'dismissed')}
                                className="text-xs px-2 py-0.5 bg-bg text-text-muted rounded hover:bg-border"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Notes {savedField === 'notes' && <span className="text-success normal-case">- Saved</span>}</div>
                <textarea
                  defaultValue={selectedApp.notes || ''}
                  onBlur={(e) => { if (e.target.value !== (selectedApp.notes || '')) handleFieldUpdate('notes', e.target.value) }}
                  placeholder="Add notes..."
                  rows={3}
                  className="text-sm bg-transparent border border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-1 rounded transition-colors resize-y"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
