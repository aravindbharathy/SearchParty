'use client'

import { useEffect, useState, useCallback } from 'react'

interface Application {
  id: string
  company: string
  role: string
  status: string
  applied_date: string
  fit_score: number
  resume_version: string
  notes: string
  follow_ups: Array<{ due: string; type: string; status: string }>
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

export default function Dashboard() {
  const [applications, setApplications] = useState<Application[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [formCompany, setFormCompany] = useState('')
  const [formRole, setFormRole] = useState('')
  const [formStatus, setFormStatus] = useState('researching')

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

  const handleAddApplication = async () => {
    if (!formCompany.trim()) return
    await fetch('/api/pipeline/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: formCompany, role: formRole, status: formStatus }),
    })
    setFormCompany('')
    setFormRole('')
    setFormStatus('researching')
    setShowAddForm(false)
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
    loadApplications()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-sm text-text-muted">{applications.length} application{applications.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover"
        >
          + Add Application
        </button>
      </div>

      {/* Add form */}
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
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
              Add
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-text-muted text-sm hover:text-text">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(col => {
            const apps = applications.filter(a => a.status === col.key)
            return (
              <div key={col.key} className={`w-64 flex flex-col rounded-lg border ${col.color}`}>
                {/* Column header */}
                <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="text-xs text-text-muted bg-bg px-2 py-0.5 rounded-full">{apps.length}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {apps.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-4 italic">No applications</p>
                  )}
                  {apps.map(app => {
                    const pendingFU = app.follow_ups?.find(f => f.status === 'pending')
                    const isOverdue = pendingFU && pendingFU.due < today
                    const isDueToday = pendingFU && pendingFU.due === today

                    return (
                      <div key={app.id} className="bg-surface border border-border/50 rounded-lg p-3 shadow-sm">
                        <div className="flex items-start justify-between mb-1">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{app.company}</p>
                            <p className="text-xs text-text-muted truncate">{app.role}</p>
                          </div>
                          {app.fit_score > 0 && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${
                              app.fit_score >= 75 ? 'bg-success/10 text-success' : app.fit_score >= 60 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'
                            }`}>
                              {app.fit_score}
                            </span>
                          )}
                        </div>

                        {/* Follow-up indicator */}
                        {pendingFU && (
                          <div className={`text-[10px] mt-1 ${isOverdue ? 'text-danger font-medium' : isDueToday ? 'text-warning' : 'text-text-muted'}`}>
                            {isOverdue ? `Overdue: ${pendingFU.due}` : isDueToday ? 'Follow-up due today' : `F/U: ${pendingFU.due}`}
                          </div>
                        )}

                        {app.notes && <p className="text-[10px] text-text-muted mt-1 line-clamp-2">{app.notes}</p>}

                        {/* Actions */}
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
                          <select
                            value={app.status}
                            onChange={e => handleStatusChange(app.id, e.target.value)}
                            className="text-[10px] px-1.5 py-0.5 border border-border rounded bg-bg flex-1 min-w-0"
                          >
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <button onClick={() => handleDelete(app.id)} className="text-[10px] text-text-muted hover:text-danger px-1">
                            ✕
                          </button>
                        </div>
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
  )
}
