'use client'

import { useEffect, useState, useCallback } from 'react'
import type { ContextStatusResponse } from '../types/context'

type FreshnessLevel = 'fresh' | 'stale' | 'old'

function getFreshness(lastModified: string | null): FreshnessLevel {
  if (!lastModified) return 'old'
  const age = Date.now() - new Date(lastModified).getTime()
  const days = age / (1000 * 60 * 60 * 24)
  if (days <= 7) return 'fresh'
  if (days <= 30) return 'stale'
  return 'old'
}

function FreshnessIndicator({ level, filled }: { level: FreshnessLevel; filled: boolean }) {
  if (!filled) return <span className="text-text-muted">--</span>
  switch (level) {
    case 'fresh':
      return <span title="Updated within 7 days">{'\u2705'}</span>
    case 'stale':
      return <span title="Updated 7-30 days ago">{'\u26A0\uFE0F'}</span>
    case 'old':
      return <span title="Updated over 30 days ago">{'\uD83D\uDD34'}</span>
  }
}

// CLI-required context files
const CLI_ONLY = new Set(['experience-library', 'target-companies'])
const AUTO_POPULATED = new Set(['interview-history'])

// Inline edit forms per context type
function CareerPlanEditor({ data, onSave }: { data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void }) {
  const target = (data.target || {}) as Record<string, unknown>
  const [level, setLevel] = useState((target.level as string) || '')
  const [functions, setFunctions] = useState(((target.functions as string[]) || []).join(', '))
  const [industries, setIndustries] = useState(((target.industries as string[]) || []).join(', '))
  const [locations, setLocations] = useState(((target.locations as string[]) || []).join(', '))
  const [compFloor, setCompFloor] = useState(String(target.comp_floor || ''))
  const [dealBreakers, setDealBreakers] = useState(((data.deal_breakers as string[]) || []).join(', '))
  const [weaknesses, setWeaknesses] = useState<Array<{ weakness: string; mitigation: string }>>(
    (data.addressing_weaknesses as Array<{ weakness: string; mitigation: string }>) || []
  )
  const resumePrefs = (data.resume_preferences || {}) as Record<string, unknown>
  const [resumeFormat, setResumeFormat] = useState((resumePrefs.format as string) || '')
  const [summaryLength, setSummaryLength] = useState((resumePrefs.summary_length as string) || '')
  const [resumeTone, setResumeTone] = useState((resumePrefs.tone as string) || '')
  const [avoidWords, setAvoidWords] = useState<string[]>((resumePrefs.avoid_words as string[]) || [])
  const [newAvoidWord, setNewAvoidWord] = useState('')

  const handleSubmit = () => {
    onSave({
      ...data,
      target: {
        ...(target as Record<string, unknown>),
        level,
        functions: functions.split(',').map(s => s.trim()).filter(Boolean),
        industries: industries.split(',').map(s => s.trim()).filter(Boolean),
        locations: locations.split(',').map(s => s.trim()).filter(Boolean),
        comp_floor: compFloor ? Number(compFloor) : 0,
      },
      deal_breakers: dealBreakers.split(',').map(s => s.trim()).filter(Boolean),
      addressing_weaknesses: weaknesses.filter(w => w.weakness.trim()),
      resume_preferences: {
        format: resumeFormat,
        summary_length: summaryLength,
        tone: resumeTone,
        avoid_words: avoidWords,
      },
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Target Level</label>
        <input type="text" value={level} onChange={e => setLevel(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Functions (comma-separated)</label>
        <input type="text" value={functions} onChange={e => setFunctions(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Industries (comma-separated)</label>
        <input type="text" value={industries} onChange={e => setIndustries(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Locations (comma-separated)</label>
        <input type="text" value={locations} onChange={e => setLocations(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Minimum Total Comp ($)</label>
        <input type="number" value={compFloor} onChange={e => setCompFloor(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Deal Breakers (comma-separated)</label>
        <input type="text" value={dealBreakers} onChange={e => setDealBreakers(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>

      {/* Addressing Weaknesses */}
      <div>
        <label className="block text-sm font-medium mb-1">Addressing Weaknesses</label>
        {weaknesses.map((w, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input type="text" value={w.weakness} onChange={e => setWeaknesses(prev => prev.map((wk, idx) => idx === i ? { ...wk, weakness: e.target.value } : wk))} placeholder="Weakness" className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm" />
            <input type="text" value={w.mitigation} onChange={e => setWeaknesses(prev => prev.map((wk, idx) => idx === i ? { ...wk, mitigation: e.target.value } : wk))} placeholder="Mitigation" className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm" />
            <button onClick={() => setWeaknesses(prev => prev.filter((_, idx) => idx !== i))} className="px-2 py-2 text-text-muted hover:text-danger text-sm">x</button>
          </div>
        ))}
        <button onClick={() => setWeaknesses(prev => [...prev, { weakness: '', mitigation: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Weakness</button>
      </div>

      {/* Resume Preferences */}
      <div>
        <label className="block text-sm font-medium mb-2">Resume Preferences</label>
        <div className="space-y-2">
          <input type="text" value={resumeFormat} onChange={e => setResumeFormat(e.target.value)} placeholder="Format (e.g. one-page, two-column)" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          <input type="text" value={summaryLength} onChange={e => setSummaryLength(e.target.value)} placeholder="Summary length (e.g. 2-3 sentences)" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          <input type="text" value={resumeTone} onChange={e => setResumeTone(e.target.value)} placeholder="Tone (e.g. professional, concise)" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          <div>
            <label className="block text-xs text-text-muted mb-1">Avoid Words</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {avoidWords.map((word, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg border border-border rounded text-xs">
                  {word}
                  <button onClick={() => setAvoidWords(prev => prev.filter((_, idx) => idx !== i))} className="text-text-muted hover:text-danger">x</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newAvoidWord} onChange={e => setNewAvoidWord(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newAvoidWord.trim()) { e.preventDefault(); setAvoidWords(prev => [...prev, newAvoidWord.trim()]); setNewAvoidWord('') } }} placeholder="Add word to avoid" className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm" />
              <button onClick={() => { if (newAvoidWord.trim()) { setAvoidWords(prev => [...prev, newAvoidWord.trim()]); setNewAvoidWord('') } }} className="px-3 py-2 text-sm text-accent hover:text-accent-hover">Add</button>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleSubmit} className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover">Save</button>
    </div>
  )
}

function QAMasterEditor({ data, onSave }: { data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void }) {
  const [salary, setSalary] = useState((data.salary_expectations as string) || '')
  const [whyLeaving, setWhyLeaving] = useState((data.why_leaving as string) || '')
  const [weakness, setWeakness] = useState((data.greatest_weakness as string) || '')
  const [visa, setVisa] = useState((data.visa_status as string) || '')

  const handleSubmit = () => {
    onSave({ ...data, salary_expectations: salary, why_leaving: whyLeaving, greatest_weakness: weakness, visa_status: visa })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Salary Expectations</label>
        <input type="text" value={salary} onChange={e => setSalary(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Why Leaving</label>
        <textarea value={whyLeaving} onChange={e => setWhyLeaving(e.target.value)} rows={3} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Greatest Weakness</label>
        <textarea value={weakness} onChange={e => setWeakness(e.target.value)} rows={3} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Visa Status</label>
        <input type="text" value={visa} onChange={e => setVisa(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>
      <button onClick={handleSubmit} className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover">Save</button>
    </div>
  )
}

function ConnectionEditor({ data, onSave }: { data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void }) {
  const existingContacts = (data.contacts as Array<Record<string, unknown>>) || []
  const [contacts, setContacts] = useState(
    existingContacts.length > 0
      ? existingContacts.map(c => ({
          name: (c.name as string) || '',
          company: (c.company as string) || '',
          role: (c.role as string) || '',
          relationship: (c.relationship as string) || 'cold',
          linkedin_url: (c.linkedin_url as string) || '',
          notes: (c.notes as string) || '',
        }))
      : [{ name: '', company: '', role: '', relationship: 'cold', linkedin_url: '', notes: '' }]
  )

  const updateContact = (i: number, field: string, value: string) => {
    setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  const handleSubmit = () => {
    const validContacts = contacts.filter(c => c.name.trim())
    onSave({
      ...data,
      contacts: validContacts.map((c, i) => ({
        id: `conn-${String(i + 1).padStart(3, '0')}`,
        name: c.name,
        company: c.company,
        role: c.role,
        relationship: c.relationship,
        linkedin_url: c.linkedin_url,
        notes: c.notes,
      })),
    })
  }

  return (
    <div className="space-y-3">
      {contacts.map((contact, i) => (
        <div key={i} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={contact.name} onChange={e => updateContact(i, 'name', e.target.value)} placeholder="Name" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            <input type="text" value={contact.company} onChange={e => updateContact(i, 'company', e.target.value)} placeholder="Company" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            <input type="text" value={contact.role} onChange={e => updateContact(i, 'role', e.target.value)} placeholder="Role" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            <select value={contact.relationship} onChange={e => updateContact(i, 'relationship', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="cold">Cold</option>
              <option value="connected">Connected</option>
              <option value="warm">Warm</option>
              <option value="referred">Referred</option>
            </select>
          </div>
          <input type="text" value={contact.linkedin_url} onChange={e => updateContact(i, 'linkedin_url', e.target.value)} placeholder="LinkedIn URL" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          <textarea value={contact.notes} onChange={e => updateContact(i, 'notes', e.target.value)} placeholder="Notes" rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          {i < contacts.length - 1 && <hr className="border-border/50" />}
        </div>
      ))}
      <button onClick={() => setContacts(prev => [...prev, { name: '', company: '', role: '', relationship: 'cold', linkedin_url: '', notes: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Contact</button>
      <div>
        <button onClick={handleSubmit} className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover">Save</button>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const CLI_COMMANDS: Record<string, string> = {
  'experience-library': '/setup experience',
  'target-companies': '/setup companies',
}

export default function ContextPage() {
  const [status, setStatus] = useState<ContextStatusResponse | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/context/status')
      setStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const startEditing = async (name: string) => {
    try {
      const res = await fetch(`/api/context/${name}`)
      const data = await res.json()
      setEditData(data)
      setEditing(name)
      setSaveError(null)
    } catch {
      setSaveError('Failed to load data')
    }
  }

  const handleSave = async (name: string, data: Record<string, unknown>) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/context/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json()
        setSaveError(body.error || 'Save failed')
        return
      }
      setEditing(null)
      setEditData(null)
      fetchStatus()
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  const contexts = status.contexts

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">Context Files</h1>
      <p className="text-text-muted mb-6">
        Your context files power every AI agent. Keep them updated for best results.
      </p>

      <div className="space-y-4">
        {Object.entries(contexts).map(([name, ctx]) => {
          const freshness = getFreshness(ctx.lastModified)
          const isEditing = editing === name
          const isCli = CLI_ONLY.has(name)
          const isAuto = AUTO_POPULATED.has(name)

          return (
            <div key={name} className="border border-border bg-surface rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <FreshnessIndicator level={freshness} filled={ctx.filled} />
                  <div>
                    <h3 className="font-semibold">{ctx.label}</h3>
                    <p className="text-sm text-text-muted">{ctx.description}</p>
                    {isAuto && (
                      <p className="text-xs text-text-muted mt-1">
                        Auto-populated by /interview-debrief — no manual setup needed
                      </p>
                    )}
                    {ctx.lastModified && (
                      <p className="text-xs text-text-muted mt-1">
                        Last modified: {new Date(ctx.lastModified).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  {(isCli || isAuto) ? (
                    isCli ? (
                      <span className="text-xs text-text-muted bg-bg px-2 py-1 rounded border border-border font-mono">
                        {CLI_COMMANDS[name]}
                      </span>
                    ) : null
                  ) : (
                    <button
                      onClick={() => isEditing ? setEditing(null) : startEditing(name)}
                      className="px-3 py-1.5 text-sm border border-border rounded hover:bg-bg transition-colors"
                    >
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  )}
                </div>
              </div>

              {isEditing && editData && (
                <div className="px-5 pb-5 border-t border-border/50 pt-4">
                  {saveError && <p className="text-danger text-sm mb-3">{saveError}</p>}
                  {saving && <p className="text-text-muted text-sm mb-3">Saving...</p>}
                  {name === 'career-plan' && (
                    <CareerPlanEditor data={editData} onSave={d => handleSave(name, d)} />
                  )}
                  {name === 'qa-master' && (
                    <QAMasterEditor data={editData} onSave={d => handleSave(name, d)} />
                  )}
                  {name === 'connection-tracker' && (
                    <ConnectionEditor data={editData} onSave={d => handleSave(name, d)} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
