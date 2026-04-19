'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  ResumeData, ResumeSection, SectionType,
  ExperienceSection, EducationSection, SkillsSection,
  CertificationsSection, PublicationsSection, ProjectsSection,
  SummarySection, CustomSection,
} from '@/lib/resume-types'
import { defaultSection, genSectionId, SECTION_TYPE_LABELS } from '@/lib/resume-types'
import { MarkdownView } from './markdown-view'

interface ResumeEditorProps {
  resume: ResumeData
  onChange: (resume: ResumeData) => void
  onAskAgent: (message: string) => void
}

interface UserTemplate { name: string; filename: string }

const INPUT = 'px-2 py-1.5 border border-border rounded text-sm bg-bg'
const INPUT_SM = 'px-2 py-1 border border-border rounded text-sm bg-bg'

export function ResumeEditor({ resume, onChange, onAskAgent }: ResumeEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('')
  const [rightTab, setRightTab] = useState<'preview' | 'agent'>('preview')
  const [agentDraft, setAgentDraft] = useState('')
  const [agentResponse, setAgentResponse] = useState('')
  const [improving, setImproving] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [pdfHtml, setPdfHtml] = useState('')
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([])
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/resume/templates').then(r => r.json()).then((data: { templates: UserTemplate[] }) => {
      setUserTemplates(data.templates || [])
    }).catch(() => {})
  }, [])

  const renderPreview = useCallback(async () => {
    try {
      const res = await fetch('/api/resume/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resume),
      })
      if (res.ok) {
        const data = await res.json() as { html: string }
        setPreviewHtml(data.html)
      }
    } catch {}
  }, [resume])

  useEffect(() => {
    const timer = setTimeout(renderPreview, 300)
    return () => clearTimeout(timer)
  }, [renderPreview])

  // ─── State helpers ──────────────────────────────────────────────────────

  const update = (partial: Partial<ResumeData>) => {
    onChange({ ...resume, ...partial, updated_at: new Date().toISOString() })
  }

  const updateSection = (index: number, updated: ResumeSection) => {
    const s = [...resume.sections]
    s[index] = updated
    update({ sections: s })
  }

  const moveSection = (index: number, dir: -1 | 1) => {
    const s = [...resume.sections]
    const t = index + dir
    if (t < 0 || t >= s.length) return
    ;[s[index], s[t]] = [s[t], s[index]]
    update({ sections: s })
  }

  const removeSection = (index: number) => {
    update({ sections: resume.sections.filter((_, i) => i !== index) })
  }

  const addSection = (type: SectionType) => {
    update({ sections: [...resume.sections, defaultSection(type)] })
    setAddMenuOpen(false)
  }

  const stageImprovement = (prompt: string) => {
    setAgentDraft(prompt)
    setAgentResponse('')
    setRightTab('agent')
  }

  const sendToAgent = async () => {
    if (!agentDraft.trim() || improving) return
    setImproving(true)
    setAgentResponse('')
    try {
      const res = await fetch('/api/agent/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'resume',
          directive: {
            skill: 'inline-improve',
            text: `${agentDraft}\n\nRespond with ONLY the improved text. No explanation, no markdown formatting, no prefixes. Just the improved text itself.`,
          },
        }),
      })
      if (!res.ok) { setImproving(false); return }
      const data = await res.json() as { ok: boolean; spawn_id: string }
      if (!data.ok) { setImproving(false); return }
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const poll = await fetch(`/api/agent/spawn/${data.spawn_id}`)
        if (!poll.ok) continue
        const status = await poll.json() as { status: string; output?: string }
        if (status.status === 'completed' && status.output) { setAgentResponse(status.output.trim()); break }
        if (status.status === 'failed') { setAgentResponse('Failed to get improvement. Try again.'); break }
      }
    } catch { setAgentResponse('Error connecting to agent.') }
    setImproving(false)
  }

  const handleSave = async () => {
    const updated = { ...resume, updated_at: new Date().toISOString() }
    await fetch('/api/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
    onChange(updated)
  }

  const handleExportPDF = async () => {
    try {
      const res = await fetch('/api/resume/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resume) })
      if (res.ok) { const { html } = await res.json() as { html: string }; setPdfHtml(html); setShowPdfPreview(true) }
    } catch {}
  }

  const templateOptions = [
    { value: 'clean', label: 'Clean' },
    { value: 'modern', label: 'Modern' },
    { value: 'traditional', label: 'Traditional' },
    ...userTemplates.map(t => ({ value: t.name, label: t.name })),
  ]

  // ─── PDF Preview ────────────────────────────────────────────────────────

  if (showPdfPreview) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-semibold">PDF Preview — {resume.target_company} {resume.target_role}</h3>
          <div className="flex items-center gap-3">
            <button onClick={() => {
              const win = window.open('', '_blank')
              if (win) { win.document.write(pdfHtml); win.document.close(); setTimeout(() => win.print(), 500) }
            }} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">Download PDF</button>
            <button onClick={() => setShowPdfPreview(false)} className="text-sm text-text-muted hover:text-text">Back to Editor</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-gray-200 flex justify-center p-8">
          <div className="bg-white shadow-xl" style={{ width: '8.5in', minHeight: '11in' }}>
            <iframe srcDoc={pdfHtml} className="w-full border-0" style={{ height: '11in' }} title="PDF Preview" />
          </div>
        </div>
      </div>
    )
  }

  // ─── Main Editor ────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Left: Editor */}
      <div className="w-1/2 overflow-y-auto border-r border-border p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{resume.target_company} — {resume.target_role}</h3>
            <p className="text-xs text-text-muted">v{resume.version} · {resume.template} template</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={resume.template} onChange={e => update({ template: e.target.value })}
              className="text-xs px-2 py-1 border border-border rounded bg-bg">
              {templateOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button onClick={handleSave} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-bg">Save</button>
            <button onClick={handleExportPDF} className="text-xs px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-hover">Preview PDF</button>
          </div>
        </div>

        {/* Contact (always at top) */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Contact</h4>
          <div className="grid grid-cols-2 gap-2">
            <input value={resume.contact.name} onChange={e => update({ contact: { ...resume.contact, name: e.target.value } })}
              placeholder="Full Name" className={INPUT} />
            <input value={resume.contact.email} onChange={e => update({ contact: { ...resume.contact, email: e.target.value } })}
              placeholder="Email" className={INPUT} />
            <input value={resume.contact.phone} onChange={e => update({ contact: { ...resume.contact, phone: e.target.value } })}
              placeholder="Phone" className={INPUT} />
            <input value={resume.contact.location} onChange={e => update({ contact: { ...resume.contact, location: e.target.value } })}
              placeholder="Location" className={INPUT} />
            <input value={resume.contact.linkedin} onChange={e => update({ contact: { ...resume.contact, linkedin: e.target.value } })}
              placeholder="LinkedIn URL" className={`col-span-2 ${INPUT}`} />
          </div>
        </div>

        {/* Sections */}
        {resume.sections.map((section, idx) => (
          <SectionWrapper
            key={section.id}
            title={section.title}
            index={idx}
            total={resume.sections.length}
            onTitleChange={title => updateSection(idx, { ...section, title })}
            onMoveUp={() => moveSection(idx, -1)}
            onMoveDown={() => moveSection(idx, 1)}
            onRemove={() => removeSection(idx)}
          >
            <SectionEditor section={section} onChange={s => updateSection(idx, s)} onImprove={stageImprovement} company={resume.target_company} role={resume.target_role} />
          </SectionWrapper>
        ))}

        {/* Add Section */}
        <div className="relative">
          <button onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="w-full py-2 border border-dashed border-border rounded-lg text-sm text-text-muted hover:text-accent hover:border-accent transition-colors">
            + Add Section
          </button>
          {addMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-10 py-1">
              {(Object.entries(SECTION_TYPE_LABELS) as [SectionType, string][]).map(([type, label]) => (
                <button key={type} onClick={() => addSection(type)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-bg transition-colors">
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Preview / Agent */}
      <div className="w-1/2 flex flex-col">
        <div className="flex border-b border-border shrink-0">
          <button onClick={() => setRightTab('preview')}
            className={`flex-1 py-2.5 text-sm font-medium text-center relative ${rightTab === 'preview' ? 'text-text' : 'text-text-muted hover:text-text'}`}>
            Preview
            {rightTab === 'preview' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
          <button onClick={() => setRightTab('agent')}
            className={`flex-1 py-2.5 text-sm font-medium text-center relative ${rightTab === 'agent' ? 'text-text' : 'text-text-muted hover:text-text'}`}>
            Agent
            {agentDraft && rightTab !== 'agent' && <span className="ml-1 w-2 h-2 bg-accent rounded-full inline-block" />}
            {rightTab === 'agent' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
        </div>

        {rightTab === 'preview' && (
          <div className="flex-1 overflow-auto bg-gray-100 p-4">
            <div className="bg-white shadow-lg mx-auto" style={{ maxWidth: '8.5in', minHeight: '11in' }}>
              {previewHtml ? (
                <iframe srcDoc={previewHtml} className="w-full border-0" style={{ height: '11in' }} title="Resume Preview" />
              ) : (
                <div className="flex items-center justify-center h-96 text-text-muted text-sm">Preview loading...</div>
              )}
            </div>
          </div>
        )}

        {rightTab === 'agent' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 block">Your request</label>
                <textarea value={agentDraft} onChange={e => setAgentDraft(e.target.value)}
                  rows={6} placeholder="Describe what you want the agent to improve..."
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg resize-y" />
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={sendToAgent} disabled={!agentDraft.trim() || improving}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                    {improving ? 'Improving...' : 'Send to Agent'}
                  </button>
                  {improving && <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
                </div>
              </div>
              {agentResponse && (
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 block">Agent&apos;s suggestion</label>
                  <div className="bg-bg border border-border rounded-lg p-4">
                    <MarkdownView content={agentResponse} className="text-sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => navigator.clipboard.writeText(agentResponse)}
                      className="text-xs px-3 py-1.5 border border-border rounded hover:bg-bg">Copy to clipboard</button>
                    <p className="text-xs text-text-muted">Paste into the field you want to update</p>
                  </div>
                </div>
              )}
              {!agentDraft && !agentResponse && (
                <div className="text-center py-8 text-text-muted text-sm">
                  <p>Click &quot;Improve&quot; on any section to stage a request here.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section Wrapper ──────────────────────────────────────────────────────

function SectionWrapper({ title, index, total, onTitleChange, onMoveUp, onMoveDown, onRemove, children }: {
  title: string; index: number; total: number
  onTitleChange: (t: string) => void; onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-border rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2 bg-bg/50 border-b border-border/50 rounded-t-lg">
        <input value={title} onChange={e => onTitleChange(e.target.value)}
          className="text-xs font-semibold text-text-muted uppercase tracking-wide bg-transparent border-none outline-none flex-1 min-w-0" />
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} title="Move up"
            className="text-xs text-text-muted hover:text-text disabled:opacity-30 px-1">&#9650;</button>
          <button onClick={onMoveDown} disabled={index === total - 1} title="Move down"
            className="text-xs text-text-muted hover:text-text disabled:opacity-30 px-1">&#9660;</button>
          <button onClick={onRemove} title="Remove section"
            className="text-xs text-text-muted hover:text-danger px-1 ml-1">&#10005;</button>
        </div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ─── Section Editor Dispatch ──────────────────────────────────────────────

function SectionEditor({ section, onChange, onImprove, company, role }: {
  section: ResumeSection; onChange: (s: ResumeSection) => void; onImprove: (prompt: string) => void; company: string; role: string
}) {
  switch (section.type) {
    case 'summary': return <SummarySectionEditor s={section} onChange={onChange} onImprove={onImprove} company={company} role={role} />
    case 'experience': return <ExperienceSectionEditor s={section} onChange={onChange} onImprove={onImprove} />
    case 'education': return <EducationSectionEditor s={section} onChange={onChange} />
    case 'skills': return <SkillsSectionEditor s={section} onChange={onChange} />
    case 'certifications': return <CertificationsSectionEditor s={section} onChange={onChange} />
    case 'publications': return <PublicationsSectionEditor s={section} onChange={onChange} />
    case 'projects': return <ProjectsSectionEditor s={section} onChange={onChange} onImprove={onImprove} />
    case 'custom': return <CustomSectionEditor s={section} onChange={onChange} />
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────

function SummarySectionEditor({ s, onChange, onImprove, company, role }: {
  s: SummarySection; onChange: (s: ResumeSection) => void; onImprove: (p: string) => void; company: string; role: string
}) {
  return (
    <div>
      <div className="flex justify-end mb-1">
        <button onClick={() => onImprove(`Improve this resume summary for a ${role} role at ${company}. Make it more specific with metrics.\n\nCurrent:\n"${s.text}"`)}
          className="text-xs text-accent hover:text-accent-hover">Improve</button>
      </div>
      <textarea value={s.text} onChange={e => onChange({ ...s, text: e.target.value })}
        rows={3} className={`w-full ${INPUT} resize-y`} />
    </div>
  )
}

// ─── Experience ───────────────────────────────────────────────────────────

function ExperienceSectionEditor({ s, onChange, onImprove }: {
  s: ExperienceSection; onChange: (s: ResumeSection) => void; onImprove: (p: string) => void
}) {
  const updateEntry = (i: number, updated: ExperienceSection['entries'][0]) => {
    const entries = [...s.entries]; entries[i] = updated; onChange({ ...s, entries })
  }
  const addEntry = () => onChange({ ...s, entries: [...s.entries, { company: '', role: '', dates: '', location: '', bullets: [{ text: '' }] }] })
  const removeEntry = (i: number) => onChange({ ...s, entries: s.entries.filter((_, j) => j !== i) })

  return (
    <div className="space-y-3">
      {s.entries.map((exp, i) => (
        <div key={i} className="border border-border/50 rounded p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={exp.role} onChange={e => updateEntry(i, { ...exp, role: e.target.value })} placeholder="Role" className={`${INPUT_SM} font-medium`} />
            <input value={exp.company} onChange={e => updateEntry(i, { ...exp, company: e.target.value })} placeholder="Company" className={INPUT_SM} />
            <input value={exp.dates} onChange={e => updateEntry(i, { ...exp, dates: e.target.value })} placeholder="Dates" className={INPUT_SM} />
            <input value={exp.location || ''} onChange={e => updateEntry(i, { ...exp, location: e.target.value })} placeholder="Location" className={INPUT_SM} />
          </div>
          <div className="space-y-1">
            {exp.bullets.map((b, bi) => (
              <div key={bi} className="flex items-start gap-1">
                <span className="text-text-muted text-xs mt-2">&#8226;</span>
                <textarea value={b.text} onChange={e => {
                  const bullets = [...exp.bullets]; bullets[bi] = { ...b, text: e.target.value }; updateEntry(i, { ...exp, bullets })
                }} rows={1} className={`flex-1 ${INPUT_SM} resize-y`} style={{ minHeight: '2rem' }} />
                <button onClick={() => onImprove(`Improve this resume bullet for ${exp.role} at ${exp.company}. Add specific metrics.\n\nCurrent:\n"${b.text}"`)}
                  title="Improve" className="text-xs text-accent hover:text-accent-hover mt-1 shrink-0">Improve</button>
                <button onClick={() => { const bullets = exp.bullets.filter((_, j) => j !== bi); updateEntry(i, { ...exp, bullets }) }}
                  title="Remove" className="text-xs text-text-muted hover:text-danger mt-1 shrink-0">&#10005;</button>
              </div>
            ))}
            <button onClick={() => updateEntry(i, { ...exp, bullets: [...exp.bullets, { text: '' }] })}
              className="text-xs text-accent hover:text-accent-hover">+ Add bullet</button>
          </div>
          <button onClick={() => removeEntry(i)} className="text-xs text-text-muted hover:text-danger">Remove entry</button>
        </div>
      ))}
      <button onClick={addEntry} className="text-xs text-accent hover:text-accent-hover">+ Add experience</button>
    </div>
  )
}

// ─── Education ────────────────────────────────────────────────────────────

function EducationSectionEditor({ s, onChange }: { s: EducationSection; onChange: (s: ResumeSection) => void }) {
  const updateEntry = (i: number, updated: EducationSection['entries'][0]) => {
    const entries = [...s.entries]; entries[i] = updated; onChange({ ...s, entries })
  }
  const addEntry = () => onChange({ ...s, entries: [...s.entries, { institution: '', degree: '', field: '', year: '' }] })
  const removeEntry = (i: number) => onChange({ ...s, entries: s.entries.filter((_, j) => j !== i) })

  return (
    <div className="space-y-2">
      {s.entries.map((edu, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 border border-border/50 rounded p-2">
          <input value={edu.institution} onChange={e => updateEntry(i, { ...edu, institution: e.target.value })} placeholder="Institution" className={INPUT_SM} />
          <input value={edu.degree} onChange={e => updateEntry(i, { ...edu, degree: e.target.value })} placeholder="Degree" className={INPUT_SM} />
          <input value={edu.field} onChange={e => updateEntry(i, { ...edu, field: e.target.value })} placeholder="Field" className={INPUT_SM} />
          <div className="flex gap-2">
            <input value={edu.year} onChange={e => updateEntry(i, { ...edu, year: e.target.value })} placeholder="Year" className={`flex-1 ${INPUT_SM}`} />
            <button onClick={() => removeEntry(i)} className="text-xs text-text-muted hover:text-danger shrink-0">&#10005;</button>
          </div>
        </div>
      ))}
      <button onClick={addEntry} className="text-xs text-accent hover:text-accent-hover">+ Add education</button>
    </div>
  )
}

// ─── Skills ───────────────────────────────────────────────────────────────

function SkillsSectionEditor({ s, onChange }: { s: SkillsSection; onChange: (s: ResumeSection) => void }) {
  const updateGroup = (i: number, updated: SkillsSection['groups'][0]) => {
    const groups = [...s.groups]; groups[i] = updated; onChange({ ...s, groups })
  }
  const addGroup = () => onChange({ ...s, groups: [...s.groups, { label: 'New Category', items: [] }] })
  const removeGroup = (i: number) => onChange({ ...s, groups: s.groups.filter((_, j) => j !== i) })

  return (
    <div className="space-y-2">
      {s.groups.map((g, i) => (
        <div key={i} className="flex gap-2 items-start">
          <input value={g.label} onChange={e => updateGroup(i, { ...g, label: e.target.value })}
            className={`w-28 shrink-0 ${INPUT_SM} font-medium`} placeholder="Category" />
          <input value={g.items.join(', ')}
            onChange={e => updateGroup(i, { ...g, items: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            className={`flex-1 ${INPUT_SM}`} placeholder="Comma-separated skills" />
          <button onClick={() => removeGroup(i)} className="text-xs text-text-muted hover:text-danger mt-1 shrink-0">&#10005;</button>
        </div>
      ))}
      <button onClick={addGroup} className="text-xs text-accent hover:text-accent-hover">+ Add skill group</button>
    </div>
  )
}

// ─── Certifications ───────────────────────────────────────────────────────

function CertificationsSectionEditor({ s, onChange }: { s: CertificationsSection; onChange: (s: ResumeSection) => void }) {
  return (
    <div className="space-y-1">
      {s.items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input value={item} onChange={e => { const items = [...s.items]; items[i] = e.target.value; onChange({ ...s, items }) }}
            className={`flex-1 ${INPUT_SM}`} placeholder="Certification" />
          <button onClick={() => onChange({ ...s, items: s.items.filter((_, j) => j !== i) })}
            className="text-xs text-text-muted hover:text-danger shrink-0">&#10005;</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...s, items: [...s.items, ''] })} className="text-xs text-accent hover:text-accent-hover">+ Add certification</button>
    </div>
  )
}

// ─── Publications ─────────────────────────────────────────────────────────

function PublicationsSectionEditor({ s, onChange }: { s: PublicationsSection; onChange: (s: ResumeSection) => void }) {
  const updateEntry = (i: number, updated: PublicationsSection['entries'][0]) => {
    const entries = [...s.entries]; entries[i] = updated; onChange({ ...s, entries })
  }
  const addEntry = () => onChange({ ...s, entries: [...s.entries, { title: '', venue: '', date: '' }] })
  const removeEntry = (i: number) => onChange({ ...s, entries: s.entries.filter((_, j) => j !== i) })

  return (
    <div className="space-y-2">
      {s.entries.map((pub, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 border border-border/50 rounded p-2">
          <input value={pub.title} onChange={e => updateEntry(i, { ...pub, title: e.target.value })} placeholder="Title" className={`col-span-2 ${INPUT_SM}`} />
          <div className="flex gap-2">
            <input value={pub.date} onChange={e => updateEntry(i, { ...pub, date: e.target.value })} placeholder="Year" className={`flex-1 ${INPUT_SM}`} />
            <button onClick={() => removeEntry(i)} className="text-xs text-text-muted hover:text-danger shrink-0">&#10005;</button>
          </div>
          <input value={pub.venue} onChange={e => updateEntry(i, { ...pub, venue: e.target.value })} placeholder="Venue / Journal" className={`col-span-2 ${INPUT_SM}`} />
          <input value={pub.url || ''} onChange={e => updateEntry(i, { ...pub, url: e.target.value })} placeholder="URL (optional)" className={INPUT_SM} />
        </div>
      ))}
      <button onClick={addEntry} className="text-xs text-accent hover:text-accent-hover">+ Add publication</button>
    </div>
  )
}

// ─── Projects ─────────────────────────────────────────────────────────────

function ProjectsSectionEditor({ s, onChange, onImprove }: {
  s: ProjectsSection; onChange: (s: ResumeSection) => void; onImprove: (p: string) => void
}) {
  const updateEntry = (i: number, updated: ProjectsSection['entries'][0]) => {
    const entries = [...s.entries]; entries[i] = updated; onChange({ ...s, entries })
  }
  const addEntry = () => onChange({ ...s, entries: [...s.entries, { name: '', description: '', bullets: [{ text: '' }] }] })
  const removeEntry = (i: number) => onChange({ ...s, entries: s.entries.filter((_, j) => j !== i) })

  return (
    <div className="space-y-3">
      {s.entries.map((proj, i) => (
        <div key={i} className="border border-border/50 rounded p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={proj.name} onChange={e => updateEntry(i, { ...proj, name: e.target.value })} placeholder="Project name" className={`${INPUT_SM} font-medium`} />
            <input value={proj.technologies?.join(', ') || ''} onChange={e => updateEntry(i, { ...proj, technologies: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder="Technologies (comma-separated)" className={INPUT_SM} />
          </div>
          <textarea value={proj.description} onChange={e => updateEntry(i, { ...proj, description: e.target.value })}
            placeholder="Brief description" rows={2} className={`w-full ${INPUT_SM} resize-y`} />
          <div className="space-y-1">
            {proj.bullets.map((b, bi) => (
              <div key={bi} className="flex items-start gap-1">
                <span className="text-text-muted text-xs mt-2">&#8226;</span>
                <textarea value={b.text} onChange={e => {
                  const bullets = [...proj.bullets]; bullets[bi] = { ...b, text: e.target.value }; updateEntry(i, { ...proj, bullets })
                }} rows={1} className={`flex-1 ${INPUT_SM} resize-y`} style={{ minHeight: '2rem' }} />
                <button onClick={() => onImprove(`Improve this project bullet. Add metrics.\n\nCurrent:\n"${b.text}"`)}
                  className="text-xs text-accent hover:text-accent-hover mt-1 shrink-0">Improve</button>
                <button onClick={() => { const bullets = proj.bullets.filter((_, j) => j !== bi); updateEntry(i, { ...proj, bullets }) }}
                  className="text-xs text-text-muted hover:text-danger mt-1 shrink-0">&#10005;</button>
              </div>
            ))}
            <button onClick={() => updateEntry(i, { ...proj, bullets: [...proj.bullets, { text: '' }] })}
              className="text-xs text-accent hover:text-accent-hover">+ Add bullet</button>
          </div>
          <button onClick={() => removeEntry(i)} className="text-xs text-text-muted hover:text-danger">Remove project</button>
        </div>
      ))}
      <button onClick={addEntry} className="text-xs text-accent hover:text-accent-hover">+ Add project</button>
    </div>
  )
}

// ─── Custom ───────────────────────────────────────────────────────────────

function CustomSectionEditor({ s, onChange }: { s: CustomSection; onChange: (s: ResumeSection) => void }) {
  return (
    <textarea value={s.content} onChange={e => onChange({ ...s, content: e.target.value })}
      rows={4} placeholder="Free-text content (awards, volunteer work, languages, etc.)"
      className={`w-full ${INPUT} resize-y`} />
  )
}
