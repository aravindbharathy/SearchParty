'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ResumeData, ResumeExperience } from '@/lib/resume-types'
import { MarkdownView } from './markdown-view'

interface ResumeEditorProps {
  resume: ResumeData
  onChange: (resume: ResumeData) => void
  onAskAgent: (message: string) => void
}

interface UserTemplate {
  name: string
  filename: string
}

export function ResumeEditor({ resume, onChange, onAskAgent }: ResumeEditorProps) {
  const [previewHtml, setPreviewHtml] = useState('')
  const [rightTab, setRightTab] = useState<'preview' | 'agent'>('preview')
  const [agentDraft, setAgentDraft] = useState('')
  const [agentResponse, setAgentResponse] = useState('')
  const [improving, setImproving] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [pdfHtml, setPdfHtml] = useState('')
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([])

  // Load user templates
  useEffect(() => {
    fetch('/api/resume/templates').then(r => r.json()).then((data: { templates: UserTemplate[] }) => {
      setUserTemplates(data.templates || [])
    }).catch(() => {})
  }, [])

  // Render preview
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

  // Stage an improvement request in the Agent tab
  const stageImprovement = (prompt: string) => {
    setAgentDraft(prompt)
    setAgentResponse('')
    setRightTab('agent')
  }

  // Send the staged request to the agent
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
            text: `${agentDraft}\n\nRespond with ONLY the improved text. No explanation, no markdown formatting, no prefixes like "Here's the improved version:". Just the improved text itself, ready to paste directly into the resume.`,
          },
        }),
      })
      if (!res.ok) { setImproving(false); return }
      const data = await res.json() as { ok: boolean; spawn_id: string }
      if (!data.ok) { setImproving(false); return }

      // Poll for completion
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const poll = await fetch(`/api/agent/spawn/${data.spawn_id}`)
        if (!poll.ok) continue
        const status = await poll.json() as { status: string; output?: string }
        if (status.status === 'completed' && status.output) {
          setAgentResponse(status.output.trim())
          break
        }
        if (status.status === 'failed') {
          setAgentResponse('Failed to get improvement. Try again.')
          break
        }
      }
    } catch {
      setAgentResponse('Error connecting to agent.')
    }
    setImproving(false)
  }

  const handleSave = async () => {
    const updated = { ...resume, updated_at: new Date().toISOString() }
    await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    onChange(updated)
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

  // All template options: built-in + user-uploaded
  const templateOptions = [
    { value: 'clean', label: 'Clean' },
    { value: 'modern', label: 'Modern' },
    { value: 'traditional', label: 'Traditional' },
    ...userTemplates.map(t => ({ value: t.name, label: t.name })),
  ]

  // PDF preview
  if (showPdfPreview) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-semibold">PDF Preview — {resume.target_company} {resume.target_role}</h3>
          <div className="flex items-center gap-3">
            <button onClick={() => {
              const win = window.open('', '_blank')
              if (win) { win.document.write(pdfHtml); win.document.close(); setTimeout(() => win.print(), 500) }
            }} className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover">
              Download PDF
            </button>
            <button onClick={() => setShowPdfPreview(false)} className="text-sm text-text-muted hover:text-text">
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
            <p className="text-xs text-text-muted">v{resume.version} · {resume.template} template</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={resume.template} onChange={e => update({ template: e.target.value as ResumeData['template'] })}
              className="text-xs px-2 py-1 border border-border rounded bg-bg">
              {templateOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button onClick={handleSave} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-bg">Save</button>
            <button onClick={handleExportPDF} className="text-xs px-3 py-1.5 bg-accent text-white rounded hover:bg-accent-hover">Preview PDF</button>
          </div>
        </div>

        {/* Tip about custom templates */}
        {userTemplates.length === 0 && (
          <p className="text-[10px] text-text-muted bg-bg rounded px-3 py-2">
            Tip: Add your own resume templates by dropping HTML or CSS files into <code className="bg-border/50 px-1 rounded">search/vault/uploads/templates/</code>. The filename becomes the template name.
          </p>
        )}

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
            <button onClick={() => stageImprovement(`Improve this resume summary for a ${resume.target_role} role at ${resume.target_company}. Make it more specific with metrics and outcomes.\n\nCurrent summary:\n"${resume.summary}"`)}
              className="text-xs text-accent hover:text-accent-hover">✨ Improve</button>
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
                {exp.bullets.map((bullet, bIdx) => (
                  <div key={bIdx} className="flex items-start gap-1">
                    <span className="text-text-muted text-xs mt-2">•</span>
                    <textarea value={bullet.text}
                      onChange={e => updateBullet(expIdx, bIdx, e.target.value)}
                      rows={1} className="flex-1 px-2 py-1 border border-border rounded text-sm bg-bg resize-y"
                      style={{ minHeight: '2rem' }} />
                    <button
                      onClick={() => stageImprovement(`Improve this resume bullet for the ${exp.role} role at ${exp.company}. Make it more impactful with specific metrics.\n\nCurrent bullet:\n"${bullet.text}"`)}
                      title="Improve with AI"
                      className="text-xs text-accent hover:text-accent-hover mt-1 shrink-0">✨</button>
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

      {/* Right: Preview / Agent tabs */}
      <div className="w-1/2 flex flex-col">
        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0">
          <button onClick={() => setRightTab('preview')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors relative ${rightTab === 'preview' ? 'text-text' : 'text-text-muted hover:text-text'}`}>
            Preview
            {rightTab === 'preview' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
          <button onClick={() => setRightTab('agent')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors relative ${rightTab === 'agent' ? 'text-text' : 'text-text-muted hover:text-text'}`}>
            Agent
            {agentDraft && rightTab !== 'agent' && <span className="ml-1 w-2 h-2 bg-accent rounded-full inline-block" />}
            {rightTab === 'agent' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
        </div>

        {/* Preview tab */}
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

        {/* Agent tab */}
        {rightTab === 'agent' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Draft message */}
              <div>
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 block">Your request</label>
                <textarea
                  value={agentDraft}
                  onChange={e => setAgentDraft(e.target.value)}
                  rows={6}
                  placeholder="Describe what you want the agent to improve..."
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg resize-y"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={sendToAgent} disabled={!agentDraft.trim() || improving}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
                    {improving ? 'Improving...' : 'Send to Agent'}
                  </button>
                  {improving && <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
                </div>
              </div>

              {/* Agent response */}
              {agentResponse && (
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 block">Agent&apos;s suggestion</label>
                  <div className="bg-bg border border-border rounded-lg p-4">
                    <MarkdownView content={agentResponse} className="text-sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => navigator.clipboard.writeText(agentResponse)}
                      className="text-xs px-3 py-1.5 border border-border rounded hover:bg-bg">
                      Copy to clipboard
                    </button>
                    <p className="text-xs text-text-muted">Paste into the field you want to update</p>
                  </div>
                </div>
              )}

              {!agentDraft && !agentResponse && (
                <div className="text-center py-8 text-text-muted text-sm">
                  <p>Click ✨ on any section to stage an improvement request here.</p>
                  <p className="text-xs mt-2">You can edit the request before sending to the agent.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
