'use client'

import { useEffect, useState, useCallback } from 'react'

import type { ContextStatusResponse } from '../types/context'

// ─── Inline Forms ───────────────────────────────────────────────────────────

function CareerPlanForm({ onSave }: { onSave: () => void }) {
  const [level, setLevel] = useState('')
  const [functions, setFunctions] = useState('')
  const [industries, setIndustries] = useState('')
  const [locations, setLocations] = useState('')
  const [compFloor, setCompFloor] = useState('')
  const [dealBreakers, setDealBreakers] = useState('')
  const [weaknesses, setWeaknesses] = useState<Array<{ weakness: string; mitigation: string }>>([])
  const [resumeFormat, setResumeFormat] = useState('')
  const [summaryLength, setSummaryLength] = useState('')
  const [resumeTone, setResumeTone] = useState('')
  const [avoidWords, setAvoidWords] = useState<string[]>([])
  const [newAvoidWord, setNewAvoidWord] = useState('')
  const [existingData, setExistingData] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/context/career-plan')
      .then(r => r.json())
      .then(data => {
        setExistingData(data)
        if (data.target?.level) setLevel(data.target.level)
        if (data.target?.functions?.length) setFunctions(data.target.functions.join(', '))
        if (data.target?.industries?.length) setIndustries(data.target.industries.join(', '))
        if (data.target?.locations?.length) setLocations(data.target.locations.join(', '))
        if (data.target?.comp_floor) setCompFloor(String(data.target.comp_floor))
        if (data.deal_breakers?.length) setDealBreakers(data.deal_breakers.join(', '))
        if (data.addressing_weaknesses?.length) setWeaknesses(data.addressing_weaknesses)
        if (data.resume_preferences) {
          const rp = data.resume_preferences
          if (rp.format) setResumeFormat(rp.format)
          if (rp.summary_length) setSummaryLength(rp.summary_length)
          if (rp.tone) setResumeTone(rp.tone)
          if (rp.avoid_words?.length) setAvoidWords(rp.avoid_words)
        }
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/context/career-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...existingData,
          target: {
            ...(existingData.target as Record<string, unknown> || {}),
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
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Save failed')
        return
      }
      onSave()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Target Level</label>
        <input
          type="text"
          value={level}
          onChange={e => setLevel(e.target.value)}
          placeholder="e.g. Staff Engineer, Senior SWE"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Functions <span className="text-text-muted">(comma-separated)</span></label>
        <input
          type="text"
          value={functions}
          onChange={e => setFunctions(e.target.value)}
          placeholder="e.g. backend, platform, infrastructure"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Industries <span className="text-text-muted">(comma-separated)</span></label>
        <input
          type="text"
          value={industries}
          onChange={e => setIndustries(e.target.value)}
          placeholder="e.g. fintech, developer-tools, health-tech"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Preferred Locations <span className="text-text-muted">(comma-separated)</span></label>
        <input
          type="text"
          value={locations}
          onChange={e => setLocations(e.target.value)}
          placeholder="e.g. SF Bay Area, Remote, NYC"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Minimum Total Comp ($)</label>
        <input
          type="number"
          value={compFloor}
          onChange={e => setCompFloor(e.target.value)}
          placeholder="e.g. 250000"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Deal Breakers <span className="text-text-muted">(comma-separated)</span></label>
        <input
          type="text"
          value={dealBreakers}
          onChange={e => setDealBreakers(e.target.value)}
          placeholder="e.g. No visa sponsorship, < 50% remote"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>

      {/* Addressing Weaknesses */}
      <div>
        <label className="block text-sm font-medium mb-1">Addressing Weaknesses</label>
        {weaknesses.map((w, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              type="text"
              value={w.weakness}
              onChange={e => setWeaknesses(prev => prev.map((wk, idx) => idx === i ? { ...wk, weakness: e.target.value } : wk))}
              placeholder="Weakness"
              className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm"
            />
            <input
              type="text"
              value={w.mitigation}
              onChange={e => setWeaknesses(prev => prev.map((wk, idx) => idx === i ? { ...wk, mitigation: e.target.value } : wk))}
              placeholder="Mitigation"
              className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm"
            />
            <button onClick={() => setWeaknesses(prev => prev.filter((_, idx) => idx !== i))} className="px-2 py-2 text-text-muted hover:text-danger text-sm" title="Remove">x</button>
          </div>
        ))}
        <button onClick={() => setWeaknesses(prev => [...prev, { weakness: '', mitigation: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Weakness</button>
      </div>

      {/* Resume Preferences */}
      <div>
        <label className="block text-sm font-medium mb-2">Resume Preferences</label>
        <div className="space-y-2">
          <input
            type="text"
            value={resumeFormat}
            onChange={e => setResumeFormat(e.target.value)}
            placeholder="Format (e.g. one-page, two-column)"
            className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
          />
          <input
            type="text"
            value={summaryLength}
            onChange={e => setSummaryLength(e.target.value)}
            placeholder="Summary length (e.g. 2-3 sentences)"
            className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
          />
          <input
            type="text"
            value={resumeTone}
            onChange={e => setResumeTone(e.target.value)}
            placeholder="Tone (e.g. professional, concise)"
            className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
          />
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
              <input
                type="text"
                value={newAvoidWord}
                onChange={e => setNewAvoidWord(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newAvoidWord.trim()) {
                    e.preventDefault()
                    setAvoidWords(prev => [...prev, newAvoidWord.trim()])
                    setNewAvoidWord('')
                  }
                }}
                placeholder="Add word to avoid"
                className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm"
              />
              <button
                onClick={() => { if (newAvoidWord.trim()) { setAvoidWords(prev => [...prev, newAvoidWord.trim()]); setNewAvoidWord('') } }}
                className="px-3 py-2 text-sm text-accent hover:text-accent-hover"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving || !level}
        className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Career Plan'}
      </button>
    </div>
  )
}

function QAMasterForm({ onSave }: { onSave: () => void }) {
  const [salary, setSalary] = useState('')
  const [whyLeaving, setWhyLeaving] = useState('')
  const [weakness, setWeakness] = useState('')
  const [visa, setVisa] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/context/qa-master')
      .then(r => r.json())
      .then(data => {
        if (data.salary_expectations) setSalary(data.salary_expectations)
        if (data.why_leaving) setWhyLeaving(data.why_leaving)
        if (data.greatest_weakness) setWeakness(data.greatest_weakness)
        if (data.visa_status) setVisa(data.visa_status)
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/context/qa-master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salary_expectations: salary,
          why_leaving: whyLeaving,
          greatest_weakness: weakness,
          visa_status: visa,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Save failed')
        return
      }
      onSave()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Salary Expectations</label>
        <input
          type="text"
          value={salary}
          onChange={e => setSalary(e.target.value)}
          placeholder="e.g. $250K-300K total comp"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Why are you leaving?</label>
        <textarea
          value={whyLeaving}
          onChange={e => setWhyLeaving(e.target.value)}
          placeholder="Positive framing of why you're looking for a new role..."
          rows={3}
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Greatest Weakness</label>
        <textarea
          value={weakness}
          onChange={e => setWeakness(e.target.value)}
          placeholder="A genuine weakness with how you're addressing it..."
          rows={3}
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Visa / Work Authorization</label>
        <input
          type="text"
          value={visa}
          onChange={e => setVisa(e.target.value)}
          placeholder="e.g. US Citizen, H1B, Green Card"
          className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
        />
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving || (!salary && !whyLeaving && !weakness)}
        className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Q&A'}
      </button>
    </div>
  )
}

function ConnectionsForm({ onSave }: { onSave: () => void }) {
  const [contacts, setContacts] = useState<Array<{ name: string; company: string; role: string; relationship: string; linkedin_url: string; notes: string }>>([
    { name: '', company: '', role: '', relationship: 'cold', linkedin_url: '', notes: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/context/connection-tracker')
      .then(r => r.json())
      .then(data => {
        if (data.contacts?.length > 0) {
          setContacts(data.contacts.map((c: Record<string, string>) => ({
            name: c.name || '',
            company: c.company || '',
            role: c.role || '',
            relationship: c.relationship || 'cold',
            linkedin_url: c.linkedin_url || '',
            notes: c.notes || '',
          })))
        }
      })
      .catch(() => {})
  }, [])

  const updateContact = (i: number, field: string, value: string) => {
    setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  const addContact = () => {
    setContacts(prev => [...prev, { name: '', company: '', role: '', relationship: 'cold', linkedin_url: '', notes: '' }])
  }

  const removeContact = (i: number) => {
    setContacts(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const validContacts = contacts.filter(c => c.name.trim())
    try {
      const res = await fetch('/api/context/connection-tracker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validContacts.map((c, i) => ({
            id: `conn-${String(i + 1).padStart(3, '0')}`,
            name: c.name,
            company: c.company,
            role: c.role,
            relationship: c.relationship,
            linkedin_url: c.linkedin_url,
            notes: c.notes,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Save failed')
        return
      }
      onSave()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {contacts.map((contact, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={contact.name}
                onChange={e => updateContact(i, 'name', e.target.value)}
                placeholder="Name"
                className="px-3 py-2 bg-bg border border-border rounded text-sm"
              />
              <input
                type="text"
                value={contact.company}
                onChange={e => updateContact(i, 'company', e.target.value)}
                placeholder="Company"
                className="px-3 py-2 bg-bg border border-border rounded text-sm"
              />
              <input
                type="text"
                value={contact.role}
                onChange={e => updateContact(i, 'role', e.target.value)}
                placeholder="Role"
                className="px-3 py-2 bg-bg border border-border rounded text-sm"
              />
              <select
                value={contact.relationship}
                onChange={e => updateContact(i, 'relationship', e.target.value)}
                className="px-3 py-2 bg-bg border border-border rounded text-sm"
              >
                <option value="cold">Cold</option>
                <option value="connected">Connected</option>
                <option value="warm">Warm</option>
                <option value="referred">Referred</option>
              </select>
            </div>
            <input
              type="text"
              value={contact.linkedin_url}
              onChange={e => updateContact(i, 'linkedin_url', e.target.value)}
              placeholder="LinkedIn URL"
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
            />
            <textarea
              value={contact.notes}
              onChange={e => updateContact(i, 'notes', e.target.value)}
              placeholder="Notes"
              rows={2}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm"
            />
          </div>
          <button
            onClick={() => removeContact(i)}
            className="px-2 py-2 text-text-muted hover:text-danger text-sm"
            title="Remove"
          >
            x
          </button>
        </div>
      ))}
      <button
        onClick={addContact}
        className="text-sm text-accent hover:text-accent-hover"
      >
        + Add Contact
      </button>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div>
        <button
          onClick={handleSave}
          disabled={saving || !contacts.some(c => c.name.trim())}
          className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Connections'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const CARD_ORDER: Array<{
  key: string
  mode: 'cli' | 'form' | 'auto'
  cliCommand?: string
  FormComponent?: React.ComponentType<{ onSave: () => void }>
}> = [
  { key: 'experience-library', mode: 'cli', cliCommand: '/setup experience' },
  { key: 'career-plan', mode: 'form', FormComponent: CareerPlanForm },
  { key: 'qa-master', mode: 'form', FormComponent: QAMasterForm },
  { key: 'target-companies', mode: 'cli', cliCommand: '/setup companies' },
  { key: 'connection-tracker', mode: 'form', FormComponent: ConnectionsForm },
  { key: 'interview-history', mode: 'auto' },
]

export default function OnboardingPage() {
  const [status, setStatus] = useState<ContextStatusResponse | null>(null)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [resumeDetected, setResumeDetected] = useState(false)
  const [resumeProcessing, setResumeProcessing] = useState(false)
  const [resumeSuccess, setResumeSuccess] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/context/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    // Vault scan to detect resumes
    fetch('/api/vault/scan')
      .then(r => r.json())
      .then(data => {
        if (data.subfolders?.resumes?.count > 0) {
          setResumeDetected(true)
        }
      })
      .catch(() => {})
  }, [fetchStatus])

  const handleProcessResume = async () => {
    setResumeProcessing(true)
    setResumeError(null)
    try {
      // Build prompt server-side (agent in -p mode can't read files —
      // the build-prompt API reads actual resume content from vault/resumes/)
      let builtPrompt = ''
      try {
        const promptRes = await fetch('/api/agent/build-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill: 'setup-experience' }),
        })
        if (promptRes.ok) {
          const data = await promptRes.json() as { prompt: string }
          builtPrompt = data.prompt
        }
      } catch {}

      if (!builtPrompt) {
        setResumeError('Failed to build prompt — could not read resume files from vault.')
        setResumeProcessing(false)
        return
      }

      // Spawn agent with write_to directive — agent outputs YAML, process manager writes it
      const res = await fetch('/api/agent/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'research',
          directive: {
            skill: 'setup-experience',
            write_to: 'context/experience-library.yaml',
            text: builtPrompt,
          },
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setResumeError(body.error || 'Processing failed')
        return
      }

      // Poll for completion
      const data = await res.json()
      const spawnId = data.spawn_id
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/agent/spawn/${spawnId}`)
          if (!statusRes.ok) return
          const statusData = await statusRes.json()
          if (statusData.status === 'completed') {
            clearInterval(pollInterval)
            setResumeProcessing(false)
            setResumeSuccess(true)
            fetchStatus()
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval)
            setResumeProcessing(false)
            setResumeError(statusData.output || 'Processing failed')
          }
        } catch {}
      }, 3000)

      // Safety timeout
      setTimeout(() => {
        clearInterval(pollInterval)
        if (resumeProcessing) {
          setResumeProcessing(false)
          setResumeError('Processing timed out — try running /setup experience in terminal')
        }
      }, 300000)
      // Don't reset processing here — the poll interval handles it
      return
    } catch {
      setResumeError('Network error')
      setResumeProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-danger">Failed to load context status.</p>
      </div>
    )
  }

  const contexts = status.contexts
  const filledCount = Object.values(contexts).filter(c => c.filled).length
  const totalCount = Object.keys(contexts).length
  const progressPct = Math.round((filledCount / totalCount) * 100)
  const canStart = contexts['experience-library']?.filled && contexts['career-plan']?.filled

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Get Started</h1>
      <p className="text-text-muted mb-6">
        Fill in your context to power your AI job search. Start with your experience library, then add your career plan.
      </p>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium">{filledCount}/{totalCount} complete</span>
          <span className="text-text-muted">{progressPct}%</span>
        </div>
        <div className="w-full h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {CARD_ORDER.map((card) => {
          const ctx = contexts[card.key]
          if (!ctx) return null
          const isExpanded = expandedCard === card.key
          const isFilled = ctx.filled

          return (
            <div
              key={card.key}
              className={`border rounded-lg overflow-hidden transition-colors ${
                card.key === 'experience-library' && !isFilled
                  ? 'border-accent bg-surface shadow-sm'
                  : 'border-border bg-surface'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {isFilled ? '\u2705' : '\u26AA'}
                  </span>
                  <div>
                    <h3 className="font-semibold">{ctx.label}</h3>
                    <p className="text-sm text-text-muted">{ctx.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isFilled && ctx.lastModified && (
                    <span className="text-xs text-text-muted">
                      Updated {new Date(ctx.lastModified).toLocaleDateString()}
                    </span>
                  )}
                  {card.mode === 'form' && (
                    <button
                      onClick={() => setExpandedCard(isExpanded ? null : card.key)}
                      className="px-3 py-1.5 text-sm border border-border rounded hover:bg-bg transition-colors"
                    >
                      {isExpanded ? 'Close' : isFilled ? 'Edit' : 'Fill In'}
                    </button>
                  )}
                </div>
              </div>

              {/* CLI Prompt */}
              {card.mode === 'cli' && !isFilled && (
                <div className="px-5 pb-4 border-t border-border/50 pt-3">
                  {card.key === 'experience-library' ? (
                    <div className="space-y-3">
                      {resumeDetected && !resumeSuccess ? (
                        <>
                          <p className="text-sm font-medium text-accent">Resume detected — click to parse it into your experience library</p>
                          <button
                            onClick={handleProcessResume}
                            disabled={resumeProcessing}
                            className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                          >
                            {resumeProcessing ? 'Parsing resume...' : 'Parse Resume'}
                          </button>
                          {resumeError && <p className="text-danger text-sm">{resumeError}</p>}
                        </>
                      ) : resumeSuccess ? (
                        <p className="text-sm font-medium text-green-600">Experience library updated! Refresh to see status.</p>
                      ) : (
                        <p className="text-sm text-text-muted">
                          Drop your resume in <code className="px-1.5 py-0.5 bg-bg border border-border rounded text-xs font-mono">search/vault/resumes/</code> and refresh this page.
                        </p>
                      )}
                      <p className="text-xs text-text-muted border-t border-border/50 pt-2">
                        Or run <code className="px-1.5 py-0.5 bg-bg border border-border rounded text-xs font-mono">/setup experience</code> in your terminal for a conversational walkthrough
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-text-muted">Run in Claude Code:</p>
                      <code className="block px-3 py-2 bg-sidebar-bg text-sidebar-text rounded text-sm font-mono">
                        {card.cliCommand}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {/* Auto-populated notice */}
              {card.mode === 'auto' && (
                <div className="px-5 pb-4 border-t border-border/50 pt-3">
                  <p className="text-sm text-text-muted">
                    Auto-populated after you complete interviews and run debriefs.
                  </p>
                </div>
              )}

              {/* Inline Form */}
              {card.mode === 'form' && isExpanded && card.FormComponent && (
                <div className="px-5 pb-5 border-t border-border/50">
                  <card.FormComponent onSave={() => {
                    setExpandedCard(null)
                    fetchStatus()
                  }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Get Started Button */}
      <div className="mt-8 text-center">
        {canStart ? (
          <a
            href="/"
            className="inline-block px-6 py-3 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            Go to Command Center
          </a>
        ) : (
          <p className="text-text-muted text-sm">
            Fill in at least your <strong>Experience Library</strong> and <strong>Career Plan</strong> to get started.
          </p>
        )}
      </div>
    </div>
  )
}
