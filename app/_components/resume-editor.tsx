'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ResumeData, ResumeExperience, ResumeBullet } from '@/lib/resume-types'

interface ResumeEditorProps {
  resume: ResumeData
  onChange: (resume: ResumeData) => void
  onAskAgent: (message: string) => void
  chatProcessing: boolean
}

export function ResumeEditor({ resume, onChange, onAskAgent, chatProcessing }: ResumeEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('')
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  // Render preview whenever resume changes
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
    const timer = setTimeout(renderPreview, 300) // debounce
    return () => clearTimeout(timer)
  }, [renderPreview])

  const update = (partial: Partial<ResumeData>) => {
    onChange({ ...resume, ...partial, updated_at: new Date().toISOString() })
  }

  const updateExperience = (idx: number, exp: ResumeExperience) => {
    const exps = [...resume.experiences]
    exps[idx] = exp
    update({ experiences: exps })
  }

  const updateBullet = (expIdx: number, bulletIdx: number, text: string) => {
    const exps = [...resume.experiences]
    const bullets = [...exps[expIdx].bullets]
    bullets[bulletIdx] = { ...bullets[bulletIdx], text }
    exps[expIdx] = { ...exps[expIdx], bullets }
    update({ experiences: exps })
  }

  const addBullet = (expIdx: number) => {
    const exps = [...resume.experiences]
    exps[expIdx] = { ...exps[expIdx], bullets: [...exps[expIdx].bullets, { text: '' }] }
    update({ experiences: exps })
  }

  const removeBullet = (expIdx: number, bulletIdx: number) => {
    const exps = [...resume.experiences]
    exps[expIdx] = { ...exps[expIdx], bullets: exps[expIdx].bullets.filter((_, i) => i !== bulletIdx) }
    update({ experiences: exps })
  }

  const handleExportPDF = async () => {
    try {
      const res = await fetch('/api/resume/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resume),
      })
      if (res.ok) {
        const { html } = await res.json() as { html: string }
        const win = window.open('', '_blank')
        if (win) {
          win.document.write(html)
          win.document.close()
          setTimeout(() => win.print(), 500)
        }
      }
    } catch {}
  }

  const handleSave = async () => {
    await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resume),
    })
  }

  return (
    <div className="flex h-full">
      {/* Left: Editor */}
      <div className="w-1/2 overflow-y-auto border-r border-border p-4 space-y-4">
        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{resume.target_company} — {resume.target_role}</h3>
            <p className="text-xs text-text-muted">v{resume.version} · {resume.keyword_coverage}% keyword match</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={resume.template} onChange={e => update({ template: e.target.value as ResumeData['template'] })}
              className="text-xs px-2 py-1 border border-border rounded bg-bg">
              <option value="clean">Clean</option>
              <option value="modern">Modern</option>
              <option value="traditional">Traditional</option>
            </select>
            <button onClick={handleSave} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-bg">Save</button>
            <button onClick={handleExportPDF} className="text-xs px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-hover">Export PDF</button>
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Contact</h4>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={resume.contact.name} onChange={e => update({ contact: { ...resume.contact, name: e.target.value } })}
              placeholder="Full Name" className="px-2 py-1.5 border border-border rounded text-sm bg-bg" />
            <input value={resume.contact.email} onChange={e => update({ contact: { ...resume.contact, email: e.target.value } })}
              placeholder="Email" className="px-2 py-1.5 border border-border rounded text-sm bg-bg" />
            <input value={resume.contact.phone} onChange={e => update({ contact: { ...resume.contact, phone: e.target.value } })}
              placeholder="Phone" className="px-2 py-1.5 border border-border rounded text-sm bg-bg" />
            <input value={resume.contact.location} onChange={e => update({ contact: { ...resume.contact, location: e.target.value } })}
              placeholder="Location" className="px-2 py-1.5 border border-border rounded text-sm bg-bg" />
            <input value={resume.contact.linkedin} onChange={e => update({ contact: { ...resume.contact, linkedin: e.target.value } })}
              placeholder="LinkedIn URL" className="col-span-2 px-2 py-1.5 border border-border rounded text-sm bg-bg" />
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Summary</h4>
            <button onClick={() => onAskAgent(`Improve the summary for my ${resume.target_company} ${resume.target_role} resume. Current: "${resume.summary}"`)}
              disabled={chatProcessing} className="text-xs text-accent hover:text-accent-hover disabled:opacity-50">
              Improve with agent
            </button>
          </div>
          <textarea value={resume.summary} onChange={e => update({ summary: e.target.value })}
            rows={3} className="w-full px-2 py-1.5 border border-border rounded text-sm bg-bg resize-y" />
        </div>

        {/* Experience */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Experience</h4>
          {resume.experiences.map((exp, expIdx) => (
            <div key={expIdx} className={`border rounded-lg p-3 ${activeSection === `exp-${expIdx}` ? 'border-accent' : 'border-border'}`}
              onClick={() => setActiveSection(`exp-${expIdx}`)}>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input value={exp.role} onChange={e => updateExperience(expIdx, { ...exp, role: e.target.value })}
                  placeholder="Role" className="px-2 py-1 border border-border rounded text-sm bg-bg font-medium" />
                <input value={exp.company} onChange={e => updateExperience(expIdx, { ...exp, company: e.target.value })}
                  placeholder="Company" className="px-2 py-1 border border-border rounded text-sm bg-bg" />
                <input value={exp.dates} onChange={e => updateExperience(expIdx, { ...exp, dates: e.target.value })}
                  placeholder="Dates" className="px-2 py-1 border border-border rounded text-sm bg-bg" />
                <input value={exp.location || ''} onChange={e => updateExperience(expIdx, { ...exp, location: e.target.value })}
                  placeholder="Location" className="px-2 py-1 border border-border rounded text-sm bg-bg" />
              </div>
              <div className="space-y-1">
                {exp.bullets.map((bullet, bIdx) => (
                  <div key={bIdx} className="flex items-start gap-1">
                    <span className="text-text-muted text-xs mt-2">•</span>
                    <textarea value={bullet.text} onChange={e => updateBullet(expIdx, bIdx, e.target.value)}
                      rows={1} className="flex-1 px-2 py-1 border border-border rounded text-sm bg-bg resize-y"
                      style={{ minHeight: '2rem' }} />
                    <button onClick={() => onAskAgent(`Make this bullet stronger with metrics: "${bullet.text}"`)}
                      disabled={chatProcessing} title="Improve with agent"
                      className="text-xs text-accent hover:text-accent-hover mt-1 disabled:opacity-50 shrink-0">
                      ✨
                    </button>
                    <button onClick={() => removeBullet(expIdx, bIdx)} title="Remove"
                      className="text-xs text-text-muted hover:text-danger mt-1 shrink-0">✕</button>
                  </div>
                ))}
                <button onClick={() => addBullet(expIdx)} className="text-xs text-accent hover:text-accent-hover">+ Add bullet</button>
              </div>
            </div>
          ))}
        </div>

        {/* Skills */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Skills</h4>
          <div>
            <label className="text-xs text-text-muted">Technical (comma-separated)</label>
            <input value={resume.skills.technical.join(', ')}
              onChange={e => update({ skills: { ...resume.skills, technical: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-bg" />
          </div>
          <div>
            <label className="text-xs text-text-muted">Leadership (comma-separated)</label>
            <input value={resume.skills.leadership.join(', ')}
              onChange={e => update({ skills: { ...resume.skills, leadership: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
              className="w-full px-2 py-1.5 border border-border rounded text-sm bg-bg" />
          </div>
        </div>

        {/* Education */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Education</h4>
          {resume.education.map((edu, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <input value={edu.institution} onChange={e => {
                const eds = [...resume.education]; eds[i] = { ...eds[i], institution: e.target.value }; update({ education: eds })
              }} placeholder="Institution" className="px-2 py-1 border border-border rounded text-sm bg-bg" />
              <input value={edu.degree} onChange={e => {
                const eds = [...resume.education]; eds[i] = { ...eds[i], degree: e.target.value }; update({ education: eds })
              }} placeholder="Degree" className="px-2 py-1 border border-border rounded text-sm bg-bg" />
              <input value={edu.field} onChange={e => {
                const eds = [...resume.education]; eds[i] = { ...eds[i], field: e.target.value }; update({ education: eds })
              }} placeholder="Field" className="px-2 py-1 border border-border rounded text-sm bg-bg" />
              <input value={edu.year} onChange={e => {
                const eds = [...resume.education]; eds[i] = { ...eds[i], year: e.target.value }; update({ education: eds })
              }} placeholder="Year" className="px-2 py-1 border border-border rounded text-sm bg-bg" />
            </div>
          ))}
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="w-1/2 bg-gray-100 overflow-auto">
        <div className="p-4">
          <div className="bg-white shadow-lg mx-auto" style={{ maxWidth: '8.5in', minHeight: '11in' }}>
            {previewHtml ? (
              <iframe
                ref={previewRef}
                srcDoc={previewHtml}
                className="w-full border-0"
                style={{ height: '11in' }}
                title="Resume Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm py-20">
                Preview will appear here...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
