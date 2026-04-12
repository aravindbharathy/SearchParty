'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MarkdownView } from './_components/markdown-view'

interface Application {
  id: string
  company: string
  role: string
  status: string
  applied_date: string
  fit_score: number
  resume_version: string
  jd_source: string
  notes: string
  follow_ups: Array<{ due: string; type: string; status: string }>
}

interface Artifact {
  type: 'resume' | 'cover-letter' | 'outreach' | 'jd-score' | 'intel' | 'prep' | 'salary' | 'negotiation'
  title: string
  filename: string
  content: string
  agent: string
  route: string
}

const COLUMNS = [
  { key: 'researching', label: 'Researching', color: 'border-text-muted/30 bg-text-muted/5' },
  { key: 'applied', label: 'Applied', color: 'border-accent/30 bg-accent/5' },
  { key: 'phone-screen', label: 'Phone Screen', color: 'border-warning/30 bg-warning/5' },
  { key: 'onsite', label: 'Onsite', color: 'border-warning/40 bg-warning/10' },
  { key: 'offer', label: 'Offer', color: 'border-success/30 bg-success/5' },
  { key: 'rejected', label: 'Rejected', color: 'border-danger/30 bg-danger/5' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'border-text-muted/20 bg-bg' },
]

const STATUS_OPTIONS = COLUMNS.map(c => ({ value: c.key, label: c.label }))

const ARTIFACT_ICONS: Record<string, string> = {
  resume: '📄', 'cover-letter': '✉️', outreach: '💬', 'jd-score': '📊',
  intel: '🔍', prep: '🎯', salary: '💰', negotiation: '🤝',
}

const ARTIFACT_LABELS: Record<string, string> = {
  resume: 'Resume', 'cover-letter': 'Cover Letter', outreach: 'Outreach',
  'jd-score': 'JD Score', intel: 'Company Intel', prep: 'Interview Prep',
  salary: 'Salary Research', negotiation: 'Negotiation Strategy',
}

export default function Dashboard() {
  const router = useRouter()
  const [applications, setApplications] = useState<Application[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [formCompany, setFormCompany] = useState('')
  const [formRole, setFormRole] = useState('')
  const [formStatus, setFormStatus] = useState('researching')

  // Detail panel
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [viewingArtifact, setViewingArtifact] = useState<Artifact | null>(null)

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
    const interval = setInterval(loadApplications, 15_000)
    return () => clearInterval(interval)
  }, [loadApplications])

  // Load artifacts for a selected application
  const loadArtifacts = useCallback(async (app: Application) => {
    setArtifactsLoading(true)
    const found: Artifact[] = []
    const slug = app.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')

    // Helper to try reading a file
    const tryRead = async (path: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/vault/read-file?path=${encodeURIComponent(path)}`)
        if (res.ok) {
          const data = await res.json() as { content: string }
          return data.content
        }
      } catch {}
      return null
    }

    // Search for resumes matching this company
    try {
      const res = await fetch('/api/pipeline/resumes')
      if (res.ok) {
        const data = await res.json() as { resumes: Array<{ filename: string; title: string; content: string }> }
        for (const r of data.resumes) {
          if (r.filename.toLowerCase().includes(slug)) {
            found.push({ type: 'resume', title: r.title, filename: r.filename, content: r.content, agent: 'resume', route: '/applying' })
          }
        }
      }
    } catch {}

    // Cover letters
    try {
      const content = await tryRead(`output/cover-letters/${slug}-cover.md`)
      if (content) {
        const title = content.match(/^#\s+(.+)/m)?.[1] || `Cover Letter — ${app.company}`
        found.push({ type: 'cover-letter', title, filename: `${slug}-cover.md`, content, agent: 'resume', route: '/applying' })
      }
    } catch {}

    // Outreach / hiring manager message
    try {
      const content = await tryRead(`output/work-products/${slug}-hiring-manager-msg.md`)
      if (content) {
        const title = content.match(/^#\s+(.+)/m)?.[1] || `Hiring Manager Message — ${app.company}`
        found.push({ type: 'outreach', title, filename: `${slug}-hiring-manager-msg.md`, content, agent: 'resume', route: '/applying' })
      }
    } catch {}

    // Company insight brief
    try {
      const content = await tryRead(`output/work-products/${slug}-insight-brief.md`)
      if (content) {
        const title = content.match(/^#\s+(.+)/m)?.[1] || `Insight Brief — ${app.company}`
        found.push({ type: 'outreach', title, filename: `${slug}-insight-brief.md`, content, agent: 'resume', route: '/applying' })
      }
    } catch {}

    // JD scores
    try {
      const res = await fetch('/api/finding/scored-jds')
      if (res.ok) {
        const data = await res.json() as { scoredJDs: Array<{ filename: string; company: string; role: string; score: number }> }
        for (const jd of data.scoredJDs) {
          if (jd.company.toLowerCase().includes(slug) || slug.includes(jd.company.toLowerCase().replace(/[^a-z0-9]+/g, '-'))) {
            try {
              const jdRes = await fetch(`/api/finding/scored-jds/${encodeURIComponent(jd.filename)}`)
              if (jdRes.ok) {
                const jdData = await jdRes.json() as { content: string }
                found.push({ type: 'jd-score', title: `JD Score: ${jd.company} ${jd.role} (${jd.score}/100)`, filename: jd.filename, content: jdData.content, agent: 'research', route: '/finding' })
              }
            } catch {}
          }
        }
      }
    } catch {}

    // Company intel
    try {
      const res = await fetch(`/api/finding/intel/${encodeURIComponent(slug)}`)
      if (res.ok) {
        const data = await res.json() as { raw: string; intel: { company: string } }
        found.push({ type: 'intel', title: `Intel: ${data.intel.company}`, filename: `${slug}.yaml`, content: data.raw, agent: 'research', route: '/finding' })
      }
    } catch {}

    // Interview prep
    try {
      const res = await fetch('/api/pipeline/prep-packages')
      if (res.ok) {
        const data = await res.json() as { packages: Array<{ filename: string; title: string; content: string }> }
        for (const pkg of data.packages) {
          if (pkg.filename.toLowerCase().includes(slug)) {
            found.push({ type: 'prep', title: pkg.title, filename: pkg.filename, content: pkg.content, agent: 'interview', route: '/interviewing' })
          }
        }
      }
    } catch {}

    // Salary research
    try {
      const content = await tryRead(`output/salary-research-${slug}.md`)
      if (content) {
        const title = content.match(/^#\s+(.+)/m)?.[1] || `Salary Research — ${app.company}`
        found.push({ type: 'salary', title, filename: `salary-research-${slug}.md`, content, agent: 'negotiation', route: '/closing' })
      }
    } catch {}

    // Negotiation strategy
    try {
      const content = await tryRead(`output/negotiation-${slug}.md`)
      if (content) {
        const title = content.match(/^#\s+(.+)/m)?.[1] || `Negotiation — ${app.company}`
        found.push({ type: 'negotiation', title, filename: `negotiation-${slug}.md`, content, agent: 'negotiation', route: '/closing' })
      }
    } catch {}

    setArtifacts(found)
    setArtifactsLoading(false)
  }, [])

  const handleSelectApp = (app: Application) => {
    if (selectedApp?.id === app.id) {
      setSelectedApp(null)
      setArtifacts([])
      setViewingArtifact(null)
    } else {
      setSelectedApp(app)
      setViewingArtifact(null)
      loadArtifacts(app)
    }
  }

  const handleAddApplication = async () => {
    if (!formCompany.trim()) return
    await fetch('/api/pipeline/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: formCompany, role: formRole, status: formStatus }),
    })
    setFormCompany(''); setFormRole(''); setFormStatus('researching'); setShowAddForm(false)
    loadApplications()
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch(`/api/pipeline/applications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'status', value: newStatus }),
    })
    loadApplications()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this application?')) return
    await fetch(`/api/pipeline/applications/${id}`, { method: 'DELETE' })
    if (selectedApp?.id === id) { setSelectedApp(null); setArtifacts([]) }
    loadApplications()
  }

  const navigateToAgent = (route: string, message: string) => {
    try {
      localStorage.setItem('pending-agent-message', JSON.stringify({
        message, tab: null, from: 'pipeline', timestamp: Date.now(),
      }))
    } catch {}
    router.push(route)
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Kanban */}
      <div className={`flex flex-col overflow-hidden ${selectedApp ? 'w-[60%] border-r border-border' : 'w-full'}`}>
        <div className="px-6 pt-5 pb-3 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold">Pipeline</h1>
            <p className="text-sm text-text-muted">{applications.length} application{applications.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
            + Add Application
          </button>
        </div>

        {showAddForm && (
          <div className="px-6 pb-3 shrink-0">
            <div className="bg-surface border border-border rounded-lg p-4 flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-text-muted mb-1">Company *</label>
                <input value={formCompany} onChange={e => setFormCompany(e.target.value)} placeholder="e.g. Stripe"
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-text-muted mb-1">Role</label>
                <input value={formRole} onChange={e => setFormRole(e.target.value)} placeholder="e.g. Staff Engineer"
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm" />
              </div>
              <div className="w-40">
                <label className="block text-xs text-text-muted mb-1">Status</label>
                <select value={formStatus} onChange={e => setFormStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm">
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button onClick={handleAddApplication} disabled={!formCompany.trim()}
                className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Add</button>
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-text-muted text-sm hover:text-text">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-x-auto px-6 pb-6">
          <div className="flex gap-4 h-full min-w-max">
            {COLUMNS.map(col => {
              const apps = applications.filter(a => a.status === col.key)
              return (
                <div key={col.key} className={`${selectedApp ? 'w-48' : 'w-64'} flex flex-col rounded-lg border ${col.color}`}>
                  <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="text-xs text-text-muted bg-bg px-2 py-0.5 rounded-full">{apps.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {apps.length === 0 && <p className="text-xs text-text-muted text-center py-4 italic">No applications</p>}
                    {apps.map(app => {
                      const pendingFU = app.follow_ups?.find(f => f.status === 'pending')
                      const isOverdue = pendingFU && pendingFU.due < today
                      const isDueToday = pendingFU && pendingFU.due === today
                      const isSelected = selectedApp?.id === app.id

                      return (
                        <div key={app.id} onClick={() => handleSelectApp(app)}
                          className={`bg-surface border rounded-lg p-3 shadow-sm cursor-pointer transition-colors ${
                            isSelected ? 'border-accent ring-1 ring-accent/30' : 'border-border/50 hover:border-accent/30'
                          }`}>
                          <div className="flex items-start justify-between mb-1">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{app.company}</p>
                              <p className="text-xs text-text-muted truncate">{app.role}</p>
                            </div>
                            {app.fit_score > 0 && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${
                                app.fit_score >= 75 ? 'bg-success/10 text-success' : app.fit_score >= 60 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                              }`}>{app.fit_score}</span>
                            )}
                          </div>
                          {pendingFU && (
                            <div className={`text-[10px] mt-1 ${isOverdue ? 'text-danger font-medium' : isDueToday ? 'text-warning' : 'text-text-muted'}`}>
                              {isOverdue ? `Overdue: ${pendingFU.due}` : isDueToday ? 'Follow-up due today' : `F/U: ${pendingFU.due}`}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedApp && (
        <div className="w-[40%] flex flex-col overflow-y-auto bg-surface">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-bold">{selectedApp.company}</h2>
                <p className="text-sm text-text-muted">{selectedApp.role}</p>
              </div>
              <button onClick={() => { setSelectedApp(null); setArtifacts([]); setViewingArtifact(null) }}
                className="text-xs text-text-muted hover:text-text">Close</button>
            </div>

            {/* Status + actions */}
            <div className="flex items-center gap-3 mb-3">
              <select value={selectedApp.status} onChange={e => handleStatusChange(selectedApp.id, e.target.value)}
                className="text-sm px-3 py-1.5 border border-border rounded-md bg-bg">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {selectedApp.fit_score > 0 && (
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  selectedApp.fit_score >= 75 ? 'bg-success/10 text-success' : selectedApp.fit_score >= 60 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                }`}>Fit: {selectedApp.fit_score}%</span>
              )}
              <button onClick={() => handleDelete(selectedApp.id)} className="text-xs text-text-muted hover:text-danger ml-auto">Remove</button>
            </div>

            {/* Quick agent actions */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigateToAgent('/applying', `Run this command first: cat .claude/skills/resume-tailor/SKILL.md — then tailor a resume for ${selectedApp.company} ${selectedApp.role}.`)}
                className="text-xs px-3 py-1.5 border border-accent/30 text-accent rounded-md hover:bg-accent/10">
                Tailor Resume
              </button>
              <button onClick={() => navigateToAgent('/applying', `Run this command first: cat .claude/skills/cover-letter/SKILL.md — then write a cover letter for ${selectedApp.company} ${selectedApp.role}.`)}
                className="text-xs px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg hover:text-text">
                Cover Letter
              </button>
              <button onClick={() => navigateToAgent('/networking', `Check my connections at ${selectedApp.company}. Who can help me get a referral for the ${selectedApp.role} role?`)}
                className="text-xs px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg hover:text-text">
                Find Referral
              </button>
              <button onClick={() => navigateToAgent('/interviewing', `Run this command first: cat .claude/skills/interview-prep/SKILL.md — then create a prep package for ${selectedApp.company} ${selectedApp.role}.`)}
                className="text-xs px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg hover:text-text">
                Interview Prep
              </button>
              <button onClick={() => navigateToAgent('/closing', `Run this command first: cat .claude/skills/salary-research/SKILL.md — then research salary for ${selectedApp.company} ${selectedApp.role}.`)}
                className="text-xs px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg hover:text-text">
                Salary Research
              </button>
            </div>
          </div>

          {/* Artifacts */}
          <div className="px-5 py-4 flex-1">
            <h3 className="text-sm font-semibold text-text-muted mb-3">Related Materials</h3>

            {artifactsLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-muted py-4">
                <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                Searching for artifacts...
              </div>
            ) : artifacts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-text-muted text-sm mb-2">No materials found for {selectedApp.company}.</p>
                <p className="text-text-muted text-xs">Use the buttons above to create resumes, cover letters, and prep packages.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {artifacts.map((artifact, i) => (
                  <div key={i} className={`border rounded-lg p-3 transition-colors ${
                    viewingArtifact === artifact ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'
                  }`}>
                    <button onClick={() => setViewingArtifact(viewingArtifact === artifact ? null : artifact)} className="w-full text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{ARTIFACT_ICONS[artifact.type] || '📎'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{artifact.title}</p>
                          <p className="text-xs text-text-muted">{ARTIFACT_LABELS[artifact.type]}</p>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                      <button onClick={() => navigateToAgent(artifact.route, `Let's discuss: ${artifact.title}`)}
                        className="text-xs text-accent hover:text-accent-hover font-medium">Discuss</button>
                      <button onClick={() => navigator.clipboard.writeText(artifact.content)}
                        className="text-xs text-text-muted hover:text-text">Copy</button>
                      <a href={artifact.route} className="text-xs text-text-muted hover:text-text ml-auto">
                        Open in {artifact.route.replace('/', '').replace(/-/g, ' ')} →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Artifact viewer */}
            {viewingArtifact && (
              <div className="mt-4 bg-bg border border-border rounded-lg p-4 overflow-auto max-h-[50vh]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">{viewingArtifact.title}</h4>
                  <button onClick={() => setViewingArtifact(null)} className="text-xs text-text-muted hover:text-text">Close</button>
                </div>
                <MarkdownView content={viewingArtifact.content} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
