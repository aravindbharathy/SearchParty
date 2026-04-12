'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ResumeData, ResumeExperience } from '@/lib/resume-types'

interface ResumeEditorProps {
  resume: ResumeData
  onChange: (resume: ResumeData) => void
  onAskAgent: (message: string) => void
  chatProcessing: boolean
}

/**
 * Call the agent to improve a specific piece of text.
 * Returns the improved text directly (not through the chat sidebar).
 */
async function improveWithAgent(prompt: string): Promise<string | null> {
  try {
    const res = await fetch('/api/agent/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'resume',
        directive: {
          skill: 'inline-improve',
          text: `${prompt}\n\nIMPORTANT: Respond with ONLY the improved text. No explanation, no markdown, no quotes, no "Here's the improved version:" prefix. Just the text itself.`,
        },
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { ok: boolean; spawn_id: string }
    if (!data.ok) return null

    // Poll for completion
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const poll = await fetch(`/api/agent/spawn/${data.spawn_id}`)
      if (!poll.ok) continue
      const status = await poll.json() as { status: string; output?: string }
      if (status.status === 'completed' && status.output) {
        // Clean up the response — remove any markdown formatting or prefixes
        let text = status.output.trim()
        text = text.replace(/^["']|["']$/g, '') // remove quotes
        text = text.replace(/^(Here'?s?|The improved|Updated|Revised)[^:]*:\s*/i, '') // remove prefixes
        text = text.replace(/^[-•]\s*/, '') // remove bullet prefix
        return text
      }
      if (status.status === 'failed') return null
    }
    return null
  } catch {
    return null
  }
}

export function ResumeEditor({ resume, onChange, onAskAgent, chatProcessing }: ResumeEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('')
  const [improvingField, setImprovingField] = useState<string | null>(null) // tracks which field is being improved
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [pdfHtml, setPdfHtml] = useState('')

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
    const timer = setTimeout(renderPreview, 300)
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

  // Inline AI improvement — updates the field directly
  const handleImprove = async (fieldKey: string, currentText: string, onUpdate: (text: string) => void, context?: string) => {
    setImprovingField(fieldKey)
    const prompt = context
      ? `Improve this resume bullet for a ${resume.target_role} role at ${resume.target_company}. Context: ${context}. Current text: "${currentText}"`
      : `Improve this resume summary for a ${resume.target_role} role at ${resume.target_company}. Make it more specific with metrics. Current text: "${currentText}"`

    const improved = await improveWithAgent(prompt)
    if (improved) {
      onUpdate(improved)
    }
    setImprovingField(null)
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
        setPdfHtml(html)
        setShowPdfPreview(true)
      }
    } catch {}
  }

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(pdfHtml)
      win.document.close()
      setTimeout(() => win.print(), 500)
    }
  }

  const handleSave = async () => {
    await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resume),
    })
  }

  // PDF preview overlay
  if (showPdfPreview) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-semibold">PDF Preview — {resume.target_company} {resume.target_role}</h3>
          <div className="flex items-center gap-3">
            <button onClick={handlePrint}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
              Download PDF
            </button>
            <button onClick={() => setShowPdfPreview(false)}
              className="text-sm text-text-muted hover:text-text">
              Back to Editor
            </button>
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

  return (
    <div className="flex h-full">
      {/* Left: Editor */}
      <div className="w-1/2 overflow-y-auto border-r border-border p-4 space-y-4">
        {/* Header */}
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
            <button onClick={handleExportPDF} className="text-xs px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-hover">Preview PDF</button>
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Contact</h4>
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
            <button onClick={() => handleImprove('summary', resume.summary, (text) => update({ summary: text }))}
              disabled={improvingField === 'summary'}
              className="text-xs text-accent hover:text-accent-hover disabled:opacity-50 flex items-center gap-1">
              {improvingField === 'summary' ? (
                <><span className="inline-block w-2 h-2 border border-accent border-t-transparent rounded-full animate-spin" /> Improving...</>
              ) : '✨ Improve'}
            </button>
          </div>
          <textarea value={resume.summary} onChange={e => update({ summary: e.target.value })}
            rows={3} className="w-full px-2 py-1.5 border border-border rounded text-sm bg-bg resize-y" />
        </div>

        {/* Experience */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Experience</h4>
          {resume.experiences.map((exp, expIdx) => (
            <div key={expIdx} className="border border-border rounded-lg p-3">
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
                {exp.bullets.map((bullet, bIdx) => {
                  const fieldKey = `exp-${expIdx}-bullet-${bIdx}`
                  const isImproving = improvingField === fieldKey
                  return (
                    <div key={bIdx} className="flex items-start gap-1">
                      <span className="text-text-muted text-xs mt-2">•</span>
                      <textarea value={bullet.text}
                        onChange={e => updateBullet(expIdx, bIdx, e.target.value)}
                        rows={1} className="flex-1 px-2 py-1 border border-border rounded text-sm bg-bg resize-y"
                        style={{ minHeight: '2rem' }} />
                      <button
                        onClick={() => handleImprove(fieldKey, bullet.text,
                          (text) => updateBullet(expIdx, bIdx, text),
                          `This is for the ${exp.role} role at ${exp.company}`
                        )}
                        disabled={isImproving}
                        title="Improve with AI"
                        className="text-xs text-accent hover:text-accent-hover mt-1 disabled:opacity-50 shrink-0">
                        {isImproving ? (
                          <span className="inline-block w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
                        ) : '✨'}
                      </button>
                      <button onClick={() => removeBullet(expIdx, bIdx)} title="Remove"
                        className="text-xs text-text-muted hover:text-danger mt-1 shrink-0">✕</button>
                    </div>
                  )
                })}
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

        {/* Full resume discussion */}
        <div className="pt-4 border-t border-border">
          <button onClick={() => onAskAgent(`Review the entire resume for ${resume.target_company} ${resume.target_role} and suggest improvements.`)}
            disabled={chatProcessing}
            className="text-sm text-accent hover:text-accent-hover disabled:opacity-50">
            Discuss full resume with agent →
          </button>
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="w-1/2 bg-gray-100 overflow-auto">
        <div className="p-4">
          <div className="bg-white shadow-lg mx-auto" style={{ maxWidth: '8.5in', minHeight: '11in' }}>
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                className="w-full border-0"
                style={{ height: '11in' }}
                title="Resume Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-96 text-text-muted text-sm">
                Preview will appear here...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
