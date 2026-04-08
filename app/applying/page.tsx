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

  const { spawnAgent, status: agentStatus, error: agentError, reset: resetAgent } = useAgentEvents()

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
    }
  }, [agentStatus, loadApplications])

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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

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
      write_to: `output/resumes/tailored-${timestamp}.md`,
      text: builtPrompt,
    })
    setShowTailorModal(false)
    setTailorJdText('')
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
        <div className="mb-4 p-3 bg-success/5 border border-success/20 rounded-lg text-sm text-success">
          Resume generated! Check search/output/resumes/ for the file.
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
        </div>
      )}

      {/* Tailor Resume Modal */}
      {showTailorModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-lg">
            <h3 className="font-semibold mb-3">Tailor Resume</h3>
            <p className="text-text-muted text-sm mb-3">Paste the job description to generate a tailored resume.</p>
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
                onClick={() => { setShowTailorModal(false); setTailorJdText('') }}
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
              <h3 className="font-semibold text-lg">{selectedApp.company}</h3>
              <button
                onClick={() => setSelectedApp(null)}
                className="text-text-muted hover:text-text text-sm"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Role</div>
                <div className="text-sm">{selectedApp.role}</div>
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
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Applied</div>
                  <div className="text-sm">{selectedApp.applied_date || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Fit Score</div>
                  <div className="text-sm">{selectedApp.fit_score > 0 ? `${selectedApp.fit_score}/100` : 'Not scored'}</div>
                </div>
              </div>

              {selectedApp.resume_version && (
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Resume</div>
                  <div className="text-sm text-accent">{selectedApp.resume_version}</div>
                </div>
              )}

              <div>
                <div className="text-xs text-text-muted uppercase tracking-wide mb-1">JD Source</div>
                <div className="text-sm">{selectedApp.jd_source || 'N/A'}</div>
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

              {selectedApp.notes && (
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wide mb-1">Notes</div>
                  <div className="text-sm whitespace-pre-wrap">{selectedApp.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
