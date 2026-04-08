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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 bg-bg border border-border rounded-full text-xs font-medium">
      {children}
    </span>
  )
}

// ─── Context Preview Components ────────────────────────────────────────────

function ExperienceLibraryPreview({ data }: { data: Record<string, unknown> }) {
  const contact = (data.contact || {}) as Record<string, string>
  const experiences = (data.experiences as Array<Record<string, unknown>>) || []
  const education = (data.education as Array<Record<string, unknown>>) || []
  const skills = (data.skills || {}) as Record<string, unknown>
  const technical = (skills.technical as Array<Record<string, unknown>>) || []
  const leadership = (skills.leadership as unknown[]) || []

  if (!contact.name && experiences.length === 0 && technical.length === 0) {
    return <p className="text-sm text-text-muted italic">No data yet. Edit to add your experience.</p>
  }

  const contactParts = [contact.name, contact.email, contact.location].filter(Boolean)
  const roleEntries = experiences.slice(0, 4).map(e => {
    const company = e.company as string
    const role = e.role as string
    return `${company}${role ? ` (${role})` : ''}`
  })
  const topSkills = technical.slice(0, 3).map(s => {
    const name = s.name as string
    const prof = s.proficiency as string
    const years = s.years as number
    return `${name}${prof ? ` (${prof}` : ''}${years ? `, ${years}yr)` : prof ? ')' : ''}`
  })

  return (
    <div className="space-y-1.5 text-sm text-text-muted">
      {contactParts.length > 0 && (
        <p><span className="font-medium text-text">{contactParts.join(' \u00B7 ')}</span></p>
      )}
      <p>
        <Badge>{experiences.length} work experience{experiences.length !== 1 ? 's' : ''}</Badge>
        {' '}
        <Badge>{education.length} degree{education.length !== 1 ? 's' : ''}</Badge>
        {' '}
        <Badge>{technical.length} technical skill{technical.length !== 1 ? 's' : ''}</Badge>
        {' '}
        <Badge>{leadership.length} leadership skill{leadership.length !== 1 ? 's' : ''}</Badge>
      </p>
      {roleEntries.length > 0 && (
        <p>Roles: <span className="font-medium text-text">{roleEntries.join(' \u00B7 ')}</span></p>
      )}
      {topSkills.length > 0 && (
        <p>Top skills: <span className="font-medium text-text">{topSkills.join(' \u00B7 ')}</span></p>
      )}
    </div>
  )
}

function CareerPlanPreview({ data }: { data: Record<string, unknown> }) {
  const target = (data.target || {}) as Record<string, unknown>
  const level = target.level as string
  const functions = (target.functions as string[]) || []
  const industries = (target.industries as string[]) || []
  const locations = (target.locations as string[]) || []
  const compFloor = target.comp_floor as number
  const dealBreakers = (data.deal_breakers as string[]) || []
  const resumePrefs = (data.resume_preferences || {}) as Record<string, unknown>
  const resumeFormat = resumePrefs.format as string

  if (!level && functions.length === 0 && industries.length === 0) {
    return <p className="text-sm text-text-muted italic">No data yet. Edit to set your career plan.</p>
  }

  const targetParts = [level, ...functions, ...industries].filter(Boolean)

  return (
    <div className="space-y-1.5 text-sm text-text-muted">
      {targetParts.length > 0 && (
        <p>Target: <span className="font-medium text-text">{targetParts.join(' \u00B7 ')}</span></p>
      )}
      <p>
        {locations.length > 0 && <>Locations: <span className="font-medium text-text">{locations.join(' \u00B7 ')}</span></>}
        {compFloor > 0 && <>{locations.length > 0 ? ' \u00B7 ' : ''}Min comp: <span className="font-medium text-text">${compFloor.toLocaleString()}</span></>}
      </p>
      <p>Deal breakers: {dealBreakers.length > 0 ? <span className="font-medium text-text">{dealBreakers.join(', ')}</span> : <span className="italic">(none set)</span>}</p>
      {resumeFormat && <p>Resume: <span className="font-medium text-text">{resumeFormat}</span></p>}
    </div>
  )
}

function QAMasterPreview({ data }: { data: Record<string, unknown> }) {
  const salary = data.salary_expectations as string
  const whyLeaving = data.why_leaving as string
  const weakness = data.greatest_weakness as string
  const visa = data.visa_status as string
  const customQA = (data.custom_qa as Array<Record<string, unknown>>) || []

  const allEmpty = !salary && !whyLeaving && !weakness && !visa && customQA.length === 0
  if (allEmpty) {
    return <p className="text-sm text-text-muted italic">No data yet. Edit to set your Q&amp;A answers.</p>
  }

  const items = [
    { label: 'Salary expectations', set: !!salary },
    { label: 'Why leaving', set: !!whyLeaving },
    { label: 'Greatest weakness', set: !!weakness },
    { label: 'Visa', set: !!visa },
  ]

  return (
    <div className="space-y-1.5 text-sm text-text-muted">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map(item => (
          <span key={item.label}>
            {item.label}: {item.set
              ? <span className="font-medium text-text">(set)</span>
              : <span className="italic">(empty)</span>
            }
          </span>
        ))}
      </div>
      <p>Custom Q&amp;As: <Badge>{customQA.length}</Badge></p>
    </div>
  )
}

function TargetCompaniesPreview({ data }: { data: Record<string, unknown> }) {
  const companies = (data.companies as Array<Record<string, unknown>>) || []

  if (companies.length === 0) {
    return <p className="text-sm text-text-muted italic">No companies tracked yet. Edit to add target companies.</p>
  }

  const sorted = [...companies].sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
    return (order[(a.priority as string) || 'low'] || 2) - (order[(b.priority as string) || 'low'] || 2)
  })
  const top = sorted.slice(0, 3).map(c => `${c.name} (${c.priority})`)

  return (
    <div className="space-y-1.5 text-sm text-text-muted">
      <p><Badge>{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} tracked</Badge></p>
      <p>Top: <span className="font-medium text-text">{top.join(' \u00B7 ')}</span></p>
    </div>
  )
}

function ConnectionTrackerPreview({ data }: { data: Record<string, unknown> }) {
  const contacts = (data.contacts as Array<Record<string, unknown>>) || []

  if (contacts.length === 0) {
    return <p className="text-sm text-text-muted italic">No contacts yet. Edit to add networking connections.</p>
  }

  const companies = new Set(contacts.map(c => c.company as string).filter(Boolean))
  const byRelationship: Record<string, number> = {}
  for (const c of contacts) {
    const rel = (c.relationship as string) || 'cold'
    byRelationship[rel] = (byRelationship[rel] || 0) + 1
  }
  const relOrder = ['cold', 'connected', 'warm', 'referred']
  const relParts = relOrder
    .filter(r => byRelationship[r])
    .map(r => `${byRelationship[r]} ${r}`)

  return (
    <div className="space-y-1.5 text-sm text-text-muted">
      <p>
        <Badge>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</Badge>
        {' '}across{' '}
        <Badge>{companies.size} compan{companies.size !== 1 ? 'ies' : 'y'}</Badge>
      </p>
      {relParts.length > 0 && (
        <p><span className="font-medium text-text">{relParts.join(' \u00B7 ')}</span></p>
      )}
    </div>
  )
}

function InterviewHistoryPreview({ data }: { data: Record<string, unknown> }) {
  const interviews = (data.interviews as Array<Record<string, unknown>>) || []
  const patterns = (data.patterns || {}) as Record<string, unknown>

  if (interviews.length === 0) {
    return (
      <div className="space-y-1.5 text-sm text-text-muted">
        <p><Badge>0 interviews recorded</Badge></p>
        <p className="italic">Patterns will emerge after 3+ debriefs</p>
      </div>
    )
  }

  const strongAreas = (patterns.strong_areas as string[]) || []
  const weakAreas = (patterns.weak_areas as string[]) || []

  return (
    <div className="space-y-1.5 text-sm text-text-muted">
      <p><Badge>{interviews.length} interview{interviews.length !== 1 ? 's' : ''} recorded</Badge></p>
      {strongAreas.length > 0 && (
        <p>Strong: <span className="font-medium text-text">{strongAreas.join(', ')}</span></p>
      )}
      {weakAreas.length > 0 && (
        <p>Weak: <span className="font-medium text-text">{weakAreas.join(', ')}</span></p>
      )}
    </div>
  )
}

function ContextPreview({ name, data }: { name: string; data: Record<string, unknown> }) {
  switch (name) {
    case 'experience-library':
      return <ExperienceLibraryPreview data={data} />
    case 'career-plan':
      return <CareerPlanPreview data={data} />
    case 'qa-master':
      return <QAMasterPreview data={data} />
    case 'target-companies':
      return <TargetCompaniesPreview data={data} />
    case 'connection-tracker':
      return <ConnectionTrackerPreview data={data} />
    case 'interview-history':
      return <InterviewHistoryPreview data={data} />
    default:
      return null
  }
}

// ─── Inline Edit Forms ─────────────────────────────────────────────────────

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

function ExperienceLibraryEditor({ data, onSave }: { data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void }) {
  const contact = (data.contact || {}) as Record<string, string>
  const [name, setName] = useState(contact.name || '')
  const [email, setEmail] = useState(contact.email || '')
  const [phone, setPhone] = useState(contact.phone || '')
  const [linkedin, setLinkedin] = useState(contact.linkedin || '')
  const [location, setLocation] = useState(contact.location || '')
  const [summary, setSummary] = useState((data.summary as string) || '')

  const existingExperiences = (data.experiences as Array<Record<string, unknown>>) || []
  const [experiences, setExperiences] = useState(
    existingExperiences.map(e => ({
      id: (e.id as string) || '',
      company: (e.company as string) || '',
      role: (e.role as string) || '',
      dates: (e.dates as string) || '',
      projects: (e.projects as Array<Record<string, unknown>>) || [],
    }))
  )

  const existingEducation = (data.education as Array<Record<string, unknown>>) || []
  const [education, setEducation] = useState(
    existingEducation.map(ed => ({
      institution: (ed.institution as string) || '',
      degree: (ed.degree as string) || '',
      field: (ed.field as string) || '',
      year: (ed.year as string) || '',
    }))
  )

  const skills = (data.skills || {}) as Record<string, unknown>
  const existingTechnical = (skills.technical as Array<Record<string, unknown>>) || []
  const existingLeadership = (skills.leadership as unknown[]) || []
  const [technicalSkills, setTechnicalSkills] = useState(
    existingTechnical.map(s => ({
      name: (s.name as string) || '',
      proficiency: (s.proficiency as string) || 'intermediate',
      years: (s.years as number) || 0,
    }))
  )
  const [leadershipSkills, setLeadershipSkills] = useState(
    existingLeadership.map(s => {
      if (typeof s === 'string') return { name: s, proficiency: 'intermediate', years: 0 }
      const sk = s as Record<string, unknown>
      return { name: (sk.name as string) || '', proficiency: (sk.proficiency as string) || 'intermediate', years: (sk.years as number) || 0 }
    })
  )

  const updateExperience = (i: number, field: string, value: string) => {
    setExperiences(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }

  const updateEducation = (i: number, field: string, value: string) => {
    setEducation(prev => prev.map((ed, idx) => idx === i ? { ...ed, [field]: value } : ed))
  }

  const updateTechnical = (i: number, field: string, value: string | number) => {
    setTechnicalSkills(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  const updateLeadership = (i: number, field: string, value: string | number) => {
    setLeadershipSkills(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  const handleSubmit = () => {
    onSave({
      ...data,
      contact: { name, email, phone, linkedin, location },
      summary,
      experiences: experiences.filter(e => e.company.trim()).map((e, i) => ({
        ...e,
        id: e.id || `exp-${String(i + 1).padStart(3, '0')}`,
      })),
      education: education.filter(ed => ed.institution.trim()),
      skills: {
        technical: technicalSkills.filter(s => s.name.trim()),
        leadership: leadershipSkills.filter(s => s.name.trim()),
      },
    })
  }

  return (
    <div className="space-y-4">
      {/* Contact Info */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Contact Information</h4>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <input type="text" value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="LinkedIn URL" className="w-full mt-2 px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>

      {/* Summary */}
      <div>
        <label className="block text-sm font-semibold mb-1">Summary</label>
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder="Professional summary..." className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
      </div>

      {/* Experiences */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Work Experience</h4>
        {experiences.map((exp, i) => (
          <div key={i} className="mb-3 p-3 border border-border/50 rounded space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={exp.company} onChange={e => updateExperience(i, 'company', e.target.value)} placeholder="Company" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <input type="text" value={exp.role} onChange={e => updateExperience(i, 'role', e.target.value)} placeholder="Role" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            </div>
            <input type="text" value={exp.dates} onChange={e => updateExperience(i, 'dates', e.target.value)} placeholder="Dates (e.g. Jan 2020 - Dec 2022)" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
            <div className="flex justify-end">
              <button onClick={() => setExperiences(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
            </div>
          </div>
        ))}
        <button onClick={() => setExperiences(prev => [...prev, { id: '', company: '', role: '', dates: '', projects: [] }])} className="text-sm text-accent hover:text-accent-hover">+ Add Experience</button>
      </div>

      {/* Education */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Education</h4>
        {education.map((ed, i) => (
          <div key={i} className="mb-3 p-3 border border-border/50 rounded space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={ed.institution} onChange={e => updateEducation(i, 'institution', e.target.value)} placeholder="Institution" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <input type="text" value={ed.degree} onChange={e => updateEducation(i, 'degree', e.target.value)} placeholder="Degree" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <input type="text" value={ed.field} onChange={e => updateEducation(i, 'field', e.target.value)} placeholder="Field of Study" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <input type="text" value={ed.year} onChange={e => updateEducation(i, 'year', e.target.value)} placeholder="Year" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            </div>
            <div className="flex justify-end">
              <button onClick={() => setEducation(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
            </div>
          </div>
        ))}
        <button onClick={() => setEducation(prev => [...prev, { institution: '', degree: '', field: '', year: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Education</button>
      </div>

      {/* Technical Skills */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Technical Skills</h4>
        {technicalSkills.map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            <input type="text" value={s.name} onChange={e => updateTechnical(i, 'name', e.target.value)} placeholder="Skill name" className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm" />
            <select value={s.proficiency} onChange={e => updateTechnical(i, 'proficiency', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
            <input type="number" value={s.years || ''} onChange={e => updateTechnical(i, 'years', Number(e.target.value) || 0)} placeholder="Yrs" className="w-16 px-3 py-2 bg-bg border border-border rounded text-sm" />
            <button onClick={() => setTechnicalSkills(prev => prev.filter((_, idx) => idx !== i))} className="px-2 py-2 text-text-muted hover:text-danger text-sm">x</button>
          </div>
        ))}
        <button onClick={() => setTechnicalSkills(prev => [...prev, { name: '', proficiency: 'intermediate', years: 0 }])} className="text-sm text-accent hover:text-accent-hover">+ Add Skill</button>
      </div>

      {/* Leadership Skills */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Leadership Skills</h4>
        {leadershipSkills.map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            <input type="text" value={s.name} onChange={e => updateLeadership(i, 'name', e.target.value)} placeholder="Skill name" className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm" />
            <select value={s.proficiency} onChange={e => updateLeadership(i, 'proficiency', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
            <input type="number" value={s.years || ''} onChange={e => updateLeadership(i, 'years', Number(e.target.value) || 0)} placeholder="Yrs" className="w-16 px-3 py-2 bg-bg border border-border rounded text-sm" />
            <button onClick={() => setLeadershipSkills(prev => prev.filter((_, idx) => idx !== i))} className="px-2 py-2 text-text-muted hover:text-danger text-sm">x</button>
          </div>
        ))}
        <button onClick={() => setLeadershipSkills(prev => [...prev, { name: '', proficiency: 'intermediate', years: 0 }])} className="text-sm text-accent hover:text-accent-hover">+ Add Skill</button>
      </div>

      <button onClick={handleSubmit} className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover">Save</button>
    </div>
  )
}

function TargetCompaniesEditor({ data, onSave }: { data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void }) {
  const existingCompanies = (data.companies as Array<Record<string, unknown>>) || []
  const [companies, setCompanies] = useState(
    existingCompanies.length > 0
      ? existingCompanies.map(c => ({
          name: (c.name as string) || '',
          slug: (c.slug as string) || '',
          fit_score: (c.fit_score as number) || 0,
          status: (c.status as string) || 'researching',
          priority: (c.priority as string) || 'medium',
          notes: (c.notes as string) || '',
        }))
      : [{ name: '', slug: '', fit_score: 0, status: 'researching', priority: 'medium', notes: '' }]
  )

  const updateCompany = (i: number, field: string, value: string | number) => {
    setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  const handleSubmit = () => {
    const validCompanies = companies.filter(c => c.name.trim())
    onSave({
      ...data,
      companies: validCompanies.map(c => ({
        ...c,
        slug: c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      })),
    })
  }

  return (
    <div className="space-y-3">
      {companies.map((company, i) => (
        <div key={i} className="p-3 border border-border/50 rounded space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={company.name} onChange={e => updateCompany(i, 'name', e.target.value)} placeholder="Company Name" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            <select value={company.priority} onChange={e => updateCompany(i, 'priority', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
            <select value={company.status} onChange={e => updateCompany(i, 'status', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="researching">Researching</option>
              <option value="targeting">Targeting</option>
              <option value="applied">Applied</option>
              <option value="archived">Archived</option>
            </select>
            <input type="number" value={company.fit_score || ''} onChange={e => updateCompany(i, 'fit_score', Number(e.target.value) || 0)} placeholder="Fit Score (0-100)" min={0} max={100} className="px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
          <textarea value={company.notes} onChange={e => updateCompany(i, 'notes', e.target.value)} placeholder="Notes" rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          <div className="flex justify-end">
            <button onClick={() => setCompanies(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
          </div>
        </div>
      ))}
      <button onClick={() => setCompanies(prev => [...prev, { name: '', slug: '', fit_score: 0, status: 'researching', priority: 'medium', notes: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Company</button>
      <div>
        <button onClick={handleSubmit} className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover">Save</button>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const AUTO_POPULATED = new Set(['interview-history'])

export default function ContextPage() {
  const [status, setStatus] = useState<ContextStatusResponse | null>(null)
  const [contextData, setContextData] = useState<Record<string, Record<string, unknown>>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadingPreviews, setLoadingPreviews] = useState(true)

  const contextNames = [
    'experience-library',
    'career-plan',
    'qa-master',
    'target-companies',
    'connection-tracker',
    'interview-history',
  ]

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/context/status')
      setStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  const fetchAllContextData = useCallback(async () => {
    setLoadingPreviews(true)
    try {
      const results = await Promise.all(
        contextNames.map(async (name) => {
          try {
            const res = await fetch(`/api/context/${name}`)
            if (!res.ok) return [name, {}] as const
            const data = await res.json()
            return [name, data] as const
          } catch {
            return [name, {}] as const
          }
        })
      )
      const dataMap: Record<string, Record<string, unknown>> = {}
      for (const [name, data] of results) {
        dataMap[name] = data as Record<string, unknown>
      }
      setContextData(dataMap)
    } catch { /* ignore */ }
    setLoadingPreviews(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchAllContextData()
  }, [fetchStatus, fetchAllContextData])

  const startEditing = async (name: string) => {
    // Use already-fetched data if available
    if (contextData[name]) {
      setEditData(contextData[name])
      setEditing(name)
      setSaveError(null)
      return
    }
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
      // Refresh both status and data
      fetchStatus()
      fetchAllContextData()
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
          const isAuto = AUTO_POPULATED.has(name)
          const hasPreviewData = !!contextData[name]

          return (
            <div key={name} className="border border-border bg-surface rounded-lg overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <FreshnessIndicator level={freshness} filled={ctx.filled} />
                  <div>
                    <h3 className="font-semibold">{ctx.label}</h3>
                    <p className="text-sm text-text-muted">{ctx.description}</p>
                    {isAuto && (
                      <p className="text-xs text-text-muted mt-1">
                        Auto-populated by /interview-debrief -- no manual setup needed
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
                  {isAuto ? null : (
                    <button
                      onClick={() => isEditing ? setEditing(null) : startEditing(name)}
                      className="px-3 py-1.5 text-sm border border-border rounded hover:bg-bg transition-colors"
                    >
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  )}
                </div>
              </div>

              {/* Content Preview */}
              {hasPreviewData && !loadingPreviews && (
                <div className="px-5 pb-4 border-t border-border/30 pt-3">
                  <ContextPreview name={name} data={contextData[name]} />
                </div>
              )}
              {loadingPreviews && (
                <div className="px-5 pb-4 border-t border-border/30 pt-3">
                  <p className="text-sm text-text-muted">Loading preview...</p>
                </div>
              )}

              {/* Edit Form */}
              {isEditing && editData && (
                <div className="px-5 pb-5 border-t border-border/50 pt-4">
                  {saveError && <p className="text-danger text-sm mb-3">{saveError}</p>}
                  {saving && <p className="text-text-muted text-sm mb-3">Saving...</p>}
                  {name === 'experience-library' && (
                    <ExperienceLibraryEditor data={editData} onSave={d => handleSave(name, d)} />
                  )}
                  {name === 'career-plan' && (
                    <CareerPlanEditor data={editData} onSave={d => handleSave(name, d)} />
                  )}
                  {name === 'qa-master' && (
                    <QAMasterEditor data={editData} onSave={d => handleSave(name, d)} />
                  )}
                  {name === 'target-companies' && (
                    <TargetCompaniesEditor data={editData} onSave={d => handleSave(name, d)} />
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
