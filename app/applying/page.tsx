'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useAgentWelcome } from '../hooks/use-agent-welcome'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
import { MarkdownView } from '../_components/markdown-view'
import { AgentProgress } from '../_components/agent-progress'
import { ResumeEditor } from '../_components/resume-editor'
import type { ResumeData } from '@/lib/resume-types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Resume {
  filename: string
  title: string
  company: string
  content: string
  size: number
}

interface PrepPackage {
  filename: string
  title: string
  content: string
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
}

interface TemplateFile {
  name: string
  filename: string
  ext: string
  isProcessed: boolean
  hasProcessedVersion: boolean
  size: number
}

type TabKey = 'resumes' | 'cover-letters' | 'outreach' | 'templates'

// ─── Constants ──────────────────────────────────────────────────────────────

const RESUME_DIRECTIVE = `You are the user's resume specialist. Read search/context/experience-library.yaml and search/context/career-plan.yaml for context.

IMPORTANT: If experience-library.yaml is empty (no experiences or skills), DO NOT proceed. Instead:
1. Tell them: "Your experience library isn't set up yet. I need your work history to create resumes. Head to the Job Search Coach to complete your profile first."
2. Post a user-action directive (NOT a finding — a DIRECTIVE):
   Step A: read_blackboard. Step B: Get "directives" array. Step C: write_to_blackboard path "directives" = existing + {"id":"dir-ua-resume","type":"user_action","text":"Your experience is needed to create resumes","button_label":"Complete Background","route":"/coach","chat_message":"I need to complete my background for resume tailoring.","assigned_to":"coach","from":"resume","priority":"high","status":"pending","posted_at":"<ISO>"}

If context is available, greet the user briefly and ask what they'd like help with. You can help with: tailoring resumes to specific JDs, writing cover letters, crafting hiring manager messages, writing company insight briefs, and reviewing application materials.`

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApplyingPage() {
  // ─── Tab state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'resumes'
    try {
      const saved = localStorage.getItem('applying-active-tab') as TabKey
      if (saved) return saved
    } catch {}
    return 'resumes'
  })

  // ─── Template preference ─────────────────────────────────────────────────
  const [defaultTemplate, setDefaultTemplate] = useState(() => {
    if (typeof window === 'undefined') return 'clean'
    try { return localStorage.getItem('default-resume-template') || 'clean' } catch { return 'clean' }
  })

  // ─── Data state ──────────────────────────────────────────────────────────
  const [resumes, setResumes] = useState<Resume[]>([])
  const [structuredResumes, setStructuredResumes] = useState<ResumeData[]>([])
  const [coverLetters, setCoverLetters] = useState<PrepPackage[]>([])
  const [workProducts, setWorkProducts] = useState<PrepPackage[]>([])
  const [selectedDoc, setSelectedDoc] = useState<{ title: string; content: string } | null>(null)
  const [editingResume, setEditingResume] = useState<ResumeData | null>(null)
  const [templates, setTemplates] = useState<TemplateFile[]>([])
  const [processingTemplates, setProcessingTemplates] = useState<Set<string>>(new Set())

  // ─── Chat state ──────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('applying-chat-messages')
      if (saved) setChatMessages(JSON.parse(saved))
    } catch {}
  }, [])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset, spawnId: agentSpawnId } = useAgentEvents('applying-chat')
  const chatProcessing = agentStatus === 'running'

  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('resume')

  useAgentWelcome('resume', 'I\'m your resume specialist. I can help with tailoring resumes, writing cover letters, crafting hiring manager messages, and reviewing application materials.\n\nWhat would you like to work on?', chatMessages, setChatMessages, 'applying-chat-messages')

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadResumes = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/resumes')
      if (res.ok) {
        const data = await res.json() as { resumes: Resume[] }
        setResumes(data.resumes)
      }
    } catch {}
    // Also load structured resumes (JSON format)
    try {
      const res = await fetch('/api/resume')
      if (res.ok) {
        const data = await res.json() as { resumes: ResumeData[] }
        setStructuredResumes(data.resumes)
      }
    } catch {}
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/resume/templates/scan')
      if (res.ok) {
        const data = await res.json() as { files: TemplateFile[] }
        setTemplates(data.files || [])
      }
    } catch {}
  }, [])

  const loadMarkdownDir = useCallback(async (dir: string): Promise<PrepPackage[]> => {
    try {
      const res = await fetch(`/api/vault/list-dir?dir=${encodeURIComponent(dir)}`)
      if (!res.ok) return []
      const data = await res.json() as { files?: string[] }
      if (!data.files?.length) return []
      const results = await Promise.all(data.files.map(async (f): Promise<PrepPackage | null> => {
        try {
          const r = await fetch(`/api/vault/read-file?path=${dir}/${f}`)
          if (!r.ok) return null
          const d = await r.json() as { content: string }
          return { filename: f, title: d.content.match(/^#\s+(.+)/m)?.[1] || f, content: d.content }
        } catch { return null }
      }))
      return results.filter((r): r is PrepPackage => r !== null)
    } catch { return [] }
  }, [])

  const loadCoverLetters = useCallback(async () => {
    setCoverLetters(await loadMarkdownDir('vault/generated/cover-letters'))
  }, [loadMarkdownDir])

  const loadWorkProducts = useCallback(async () => {
    setWorkProducts(await loadMarkdownDir('vault/generated/outreach'))
  }, [loadMarkdownDir])

  useEffect(() => {
    loadResumes()
    loadCoverLetters()
    loadWorkProducts()
    loadTemplates()

    const interval = setInterval(() => {
      loadResumes()
      loadCoverLetters()
      loadWorkProducts()
      loadTemplates()
    }, 30_000)
    return () => clearInterval(interval)
  }, [loadResumes, loadCoverLetters, loadWorkProducts, loadTemplates])

  // ─── Persistence ─────────────────────────────────────────────────────────

  useEffect(() => { try { localStorage.setItem('applying-active-tab', activeTab) } catch {} }, [activeTab])
  useEffect(() => {
    if (chatMessages.length > 0) {
      try { localStorage.setItem('applying-chat-messages', JSON.stringify(chatMessages)) } catch {}
    }
  }, [chatMessages])

  // ─── Chat logic ──────────────────────────────────────────────────────────

  const scrollChatToBottom = useCallback(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [])

  useEffect(() => { scrollChatToBottom() }, [chatMessages.length, scrollChatToBottom])

  useEffect(() => {
    if (agentStatus === 'completed' && agentOutput) {
      setChatMessages(prev => [...prev, { role: 'agent', content: agentOutput }])
      agentReset()
      loadResumes()
      loadCoverLetters()
      loadWorkProducts()
    }
    if (agentStatus === 'failed') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Something went wrong. Please try again.' }])
      agentReset()
    }
    if (agentStatus === 'timeout') {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Request timed out. Please try again.' }])
      agentReset()
    }
  }, [agentStatus, agentOutput, agentReset, loadResumes, loadCoverLetters, loadWorkProducts])

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatProcessing) return
    setChatMessages(prev => [...prev, { role: 'user', content: text.trim() }])
    setChatInput('')

    try {
      const result = await spawnAgent('resume', {
        skill: 'resume-chat',
        entry_name: 'resume-followup',
        text: text.trim(),
      })
      if (result === null) {
        setChatMessages(prev => [...prev, { role: 'agent', content: 'The agent is still processing. Please wait.' }])
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: 'Failed to reach agent.' }])
    }
  }, [agentStatus, spawnAgent])

  usePendingAction(sendChatMessage, setActiveTab as (tab: string) => void)

  // ─── Stats ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    resumes: resumes.length + structuredResumes.length,
    coverLetters: coverLetters.length,
    workProducts: workProducts.length,
  }), [resumes, structuredResumes, coverLetters, workProducts])

  // ─── Render ──────────────────────────────────────────────────────────────

  // Full-screen resume editor
  if (editingResume) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setEditingResume(null)} className="text-sm text-text-muted hover:text-text">
              ← Back to Applying
            </button>
            <h2 className="text-lg font-bold">Resume Editor</h2>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ResumeEditor
            resume={editingResume}
            onChange={setEditingResume}
            onAskAgent={sendChatMessage}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* ─── Left Panel: Tabs (65%) ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold mb-3">Applying</h1>
          <div className="flex gap-3">
            {[
              { label: 'Resumes', value: stats.resumes },
              { label: 'Cover Letters', value: stats.coverLetters },
              { label: 'Outreach', value: stats.workProducts },
            ].map(s => (
              <div key={s.label} className="flex-1 bg-surface border border-border rounded-lg px-3 py-2">
                <div className="text-xs text-text-muted">{s.label}</div>
                <div className="text-lg font-bold">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-6 border-b border-border px-5">
          {([
            { key: 'resumes' as TabKey, label: `Resumes${resumes.length > 0 ? ` (${resumes.length})` : ''}` },
            { key: 'cover-letters' as TabKey, label: `Cover Letters${coverLetters.length > 0 ? ` (${coverLetters.length})` : ''}` },
            { key: 'outreach' as TabKey, label: `Outreach${workProducts.length > 0 ? ` (${workProducts.length})` : ''}` },
            { key: 'templates' as TabKey, label: `Templates${templates.length > 0 ? ` (${templates.length})` : ''}` },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.key ? 'text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DirectiveBanner
            notifications={notifications}
            onDismiss={dismissNotification}
            onDismissAll={dismissAllNotifications}
            onDiscuss={sendChatMessage}
          />

          {/* ─── Resumes Tab ───────────────────────────────────── */}
          {activeTab === 'resumes' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-text-muted">Tailored Resumes</h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-muted">Default template:</span>
                    <select value={defaultTemplate}
                      onChange={e => { setDefaultTemplate(e.target.value); localStorage.setItem('default-resume-template', e.target.value) }}
                      className="text-xs px-2 py-1 border border-border rounded bg-bg">
                      <option value="clean">Clean</option>
                      <option value="modern">Modern</option>
                      <option value="traditional">Traditional</option>
                      {templates.filter(t => t.isProcessed && (t.ext === 'css' || t.ext === 'html')).map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => {
                    sendChatMessage(`Run this command first: cat .claude/skills/resume-tailor/SKILL.md — then help me tailor a resume. Use the "${defaultTemplate}" template for the resume. Ask me which company and role to target.`)
                  }}
                  disabled={chatProcessing}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  Tailor New Resume
                </button>
              </div>

              <p className="text-[10px] text-text-muted bg-bg rounded px-3 py-2 mb-4">
                Upload your resume template (DOCX or PDF) in the Templates tab — we&apos;ll convert it to match the editor&apos;s format.
              </p>

              {/* Structured resumes (editable) */}
              {structuredResumes.map(sr => (
                <div key={sr.id} className="p-4 border border-border rounded-lg">
                  <p className="font-medium text-sm">{sr.target_company} — {sr.target_role}</p>
                  <p className="text-xs text-text-muted mt-0.5">v{sr.version} · {sr.template} template · edited {new Date(sr.updated_at).toLocaleDateString()}</p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                    <button onClick={() => setEditingResume(sr)}
                      className="text-xs text-accent hover:text-accent-hover font-medium">Edit & Preview</button>
                    <button onClick={() => {
                      const slug = `${sr.target_company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sr.target_role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
                      sendChatMessage(`Review the resume at search/vault/generated/resumes/${slug}-v${sr.version}.json — read the file first, then suggest specific improvements for the ${sr.target_company} ${sr.target_role} role.`)
                    }} disabled={chatProcessing}
                      className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">Discuss</button>
                  </div>
                </div>
              ))}

              {resumes.length === 0 && structuredResumes.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No tailored resumes yet.</p>
                  <p className="text-text-muted text-sm mb-4">Click &quot;Tailor New Resume&quot; or ask the agent to create one for a specific company.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resumes.map(resume => (
                    <div key={resume.filename} className="p-4 border border-border rounded-lg">
                      <p className="font-medium text-sm">{resume.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{resume.filename}</p>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => setSelectedDoc({ title: resume.title, content: resume.content })}
                          className="text-xs text-accent hover:text-accent-hover font-medium">View</button>
                        <button onClick={() => sendChatMessage(`Read the resume file at search/vault/generated/resumes/${resume.filename} — then review it and suggest specific improvements.`)} disabled={chatProcessing}
                          className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">Discuss</button>
                        <button onClick={() => navigator.clipboard.writeText(resume.content)}
                          className="text-xs text-text-muted hover:text-text">Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Cover Letters Tab ─────────────────────────────── */}
          {activeTab === 'cover-letters' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Cover Letters</h2>
                <button
                  onClick={() => sendChatMessage('Run this command first: cat .claude/skills/cover-letter/SKILL.md — then follow its instructions to write a cover letter. Ask me which company and role to target.')}
                  disabled={chatProcessing}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  Write Cover Letter
                </button>
              </div>

              {coverLetters.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No cover letters yet.</p>
                  <p className="text-text-muted text-sm">Ask the resume agent to write one for a specific company.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {coverLetters.map(letter => (
                    <div key={letter.filename} className="p-4 border border-border rounded-lg">
                      <p className="font-medium text-sm">{letter.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{letter.filename}</p>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => setSelectedDoc(letter)}
                          className="text-xs text-accent hover:text-accent-hover font-medium">View</button>
                        <button onClick={() => sendChatMessage(`Review and improve this cover letter: ${letter.title}`)} disabled={chatProcessing}
                          className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">Discuss</button>
                        <button onClick={() => navigator.clipboard.writeText(letter.content)}
                          className="text-xs text-text-muted hover:text-text">Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Outreach Tab ─────────────────────────────── */}
          {activeTab === 'outreach' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Outreach</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => sendChatMessage('Run this command first: cat .claude/skills/hiring-manager-msg/SKILL.md — then follow its instructions. Ask me which company and role to target.')}
                    disabled={chatProcessing}
                    className="px-4 py-2 border border-accent text-accent rounded-md text-sm font-medium hover:bg-accent/10 disabled:opacity-50"
                  >
                    Hiring Manager Message
                  </button>
                  <button
                    onClick={() => sendChatMessage('Run this command first: cat .claude/skills/company-insight/SKILL.md — then follow its instructions. Ask me which company to target.')}
                    disabled={chatProcessing}
                    className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                  >
                    Company Insight Brief
                  </button>
                </div>
              </div>

              {workProducts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No outreach materials yet.</p>
                  <p className="text-text-muted text-sm">Create a <strong>hiring manager message</strong> to reach out directly, or a <strong>company insight brief</strong> showing you&apos;ve done your homework on their product.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {workProducts.map(product => (
                    <div key={product.filename} className="p-4 border border-border rounded-lg">
                      <p className="font-medium text-sm">{product.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{product.filename}</p>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => setSelectedDoc(product)}
                          className="text-xs text-accent hover:text-accent-hover font-medium">View</button>
                        <button onClick={() => sendChatMessage(`Review and improve this outreach: ${product.title}`)} disabled={chatProcessing}
                          className="text-xs text-text-muted hover:text-accent font-medium disabled:opacity-50">Discuss</button>
                        <button onClick={() => navigator.clipboard.writeText(product.content)}
                          className="text-xs text-text-muted hover:text-text">Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Templates Tab ─────────────────────────────── */}
          {activeTab === 'templates' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text-muted">Resume Templates</h2>
                <button
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.docx,.pdf,.doc,.html,.css'
                    input.multiple = true
                    input.onchange = async () => {
                      if (!input.files) return
                      for (const file of Array.from(input.files)) {
                        const form = new FormData()
                        form.append('file', file)
                        form.append('subfolder', 'uploads/templates')
                        await fetch('/api/vault/upload', { method: 'POST', body: form })
                      }
                      loadTemplates()
                    }
                    input.click()
                  }}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover"
                >
                  Upload Template
                </button>
              </div>

              <p className="text-[10px] text-text-muted bg-bg rounded px-3 py-2 mb-4">
                Upload resume templates in DOCX or PDF format. Click &quot;Process&quot; to convert them to HTML/CSS so they can be used in the resume editor. You can also upload HTML/CSS templates directly.
              </p>

              {templates.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-text-muted text-lg mb-2">No templates yet.</p>
                  <p className="text-text-muted text-sm mb-4">Upload a DOCX, PDF, or HTML/CSS template file to get started.</p>
                  <p className="text-text-muted text-xs">You can also drop files into <code className="bg-border/50 px-1 rounded">search/vault/uploads/templates/</code></p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map(tpl => (
                    <div key={tpl.filename} className="p-4 border border-border rounded-lg bg-surface flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{tpl.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-text-muted uppercase">{tpl.ext}</span>
                          <span className="text-xs text-text-muted">{(tpl.size / 1024).toFixed(1)} KB</span>
                          {tpl.isProcessed ? (
                            <span className="text-xs text-success font-medium">Ready to use</span>
                          ) : tpl.hasProcessedVersion ? (
                            <span className="text-xs text-success font-medium">Processed version available</span>
                          ) : (
                            <span className="text-xs text-warning font-medium">Needs processing</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!tpl.isProcessed && !tpl.hasProcessedVersion && (
                          <button
                            onClick={async () => {
                              setProcessingTemplates(prev => new Set(prev).add(tpl.name))
                              try {
                                const prompt =
                                  `Process this resume template file: search/vault/uploads/templates/${tpl.filename}\n\n` +
                                  `Read the file (if it's a PDF, look at its visual layout carefully). Then produce a CSS file that styles THIS EXACT HTML structure:\n\n` +
                                  '```html\n' +
                                  '<div class="resume">\n' +
                                  '  <header class="contact">\n' +
                                  '    <h1>Name</h1>\n' +
                                  '    <div class="contact-details"><span>email</span><span class="sep"> | </span><span>phone</span></div>\n' +
                                  '  </header>\n' +
                                  '  <section>\n' +
                                  '    <h2>Summary</h2>\n' +
                                  '    <p class="summary">text...</p>\n' +
                                  '  </section>\n' +
                                  '  <section>\n' +
                                  '    <h2>Experience</h2>\n' +
                                  '    <div class="entry">\n' +
                                  '      <div class="entry-header">\n' +
                                  '        <span class="entry-title"><strong>Role</strong>, Company (Location)</span>\n' +
                                  '        <span class="dates">Start - End</span>\n' +
                                  '      </div>\n' +
                                  '      <ul><li>Bullet</li></ul>\n' +
                                  '    </div>\n' +
                                  '  </section>\n' +
                                  '  <section>\n' +
                                  '    <h2>Education</h2>\n' +
                                  '    <div class="entry">\n' +
                                  '      <div class="entry-header">\n' +
                                  '        <span class="entry-title"><strong>Degree in Field</strong>, Institution</span>\n' +
                                  '        <span class="dates">Year</span>\n' +
                                  '      </div>\n' +
                                  '    </div>\n' +
                                  '  </section>\n' +
                                  '  <section>\n' +
                                  '    <h2>Skills</h2>\n' +
                                  '    <div class="skills-row"><strong>Technical:</strong> skill1, skill2</div>\n' +
                                  '  </section>\n' +
                                  '</div>\n' +
                                  '```\n\n' +
                                  `CRITICAL RULES for the CSS:\n` +
                                  `1. Use EXACTLY these selectors: .resume, .contact, h1, .contact-details, .contact-details .sep, h2, .summary, section, .entry, .entry-header, .entry-title, .dates, ul, li, .skills-row\n` +
                                  `2. .entry-header MUST be display:flex with justify-content:space-between so dates are right-aligned on the SAME LINE as role\n` +
                                  `3. .dates MUST have white-space:nowrap and flex-shrink:0\n` +
                                  `4. .entry-title MUST have flex:1\n` +
                                  `5. Keep it compact — font-size ~10pt body, ~9.5pt bullets, tight margins. A resume must fit on one page.\n` +
                                  `6. Include * { margin:0; padding:0; box-sizing:border-box; } reset\n` +
                                  `7. Match the fonts, colors, spacing from the uploaded template as closely as possible.\n\n` +
                                  `Save the result to: search/vault/uploads/templates/${tpl.name}.css`
                                const res = await fetch('/api/agent/spawn', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    agent: 'template-processor',
                                    directive: { text: prompt },
                                    oneOff: true,
                                    model: 'claude-sonnet-4-6',
                                  }),
                                })
                                const data = await res.json() as { ok: boolean; spawn_id: string }
                                if (data.ok) {
                                  // Poll for completion
                                  const poll = setInterval(async () => {
                                    try {
                                      const status = await fetch(`/api/agent/spawn/${data.spawn_id}`)
                                      const info = await status.json() as { status: string }
                                      if (info.status === 'completed' || info.status === 'failed') {
                                        clearInterval(poll)
                                        setProcessingTemplates(prev => { const next = new Set(prev); next.delete(tpl.name); return next })
                                        loadTemplates()
                                      }
                                    } catch {}
                                  }, 3000)
                                  // Safety timeout
                                  setTimeout(() => {
                                    clearInterval(poll)
                                    setProcessingTemplates(prev => { const next = new Set(prev); next.delete(tpl.name); return next })
                                    loadTemplates()
                                  }, 5 * 60 * 1000)
                                } else {
                                  setProcessingTemplates(prev => { const next = new Set(prev); next.delete(tpl.name); return next })
                                }
                              } catch {
                                setProcessingTemplates(prev => { const next = new Set(prev); next.delete(tpl.name); return next })
                              }
                            }}
                            disabled={processingTemplates.has(tpl.name)}
                            className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                          >
                            {processingTemplates.has(tpl.name) ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Processing...
                              </span>
                            ) : 'Process Template'}
                          </button>
                        )}
                        {tpl.isProcessed && (tpl.ext === 'html' || tpl.ext === 'css') && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/vault/read-file?path=vault/uploads/templates/${tpl.filename}`)
                                if (res.ok) {
                                  const data = await res.json() as { content: string }
                                  setSelectedDoc({ title: `Template: ${tpl.name}`, content: '```' + tpl.ext + '\n' + data.content + '\n```' })
                                }
                              } catch {}
                            }}
                            className="text-xs text-accent hover:text-accent-hover font-medium"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Built-in templates */}
              <div className="mt-6 pt-4 border-t border-border">
                <h3 className="text-xs font-semibold text-text-muted mb-3">Built-in Templates</h3>
                <div className="grid grid-cols-3 gap-3">
                  {['clean', 'modern', 'traditional'].map(name => (
                    <div key={name} className="p-3 border border-border rounded-lg bg-bg text-center">
                      <p className="text-sm font-medium capitalize">{name}</p>
                      <p className="text-xs text-text-muted mt-1">Built-in</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Document Overlay */}
        {selectedDoc && (
          <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex" onClick={() => setSelectedDoc(null)}>
            <div className="w-full max-w-3xl mx-auto bg-surface border-x border-border shadow-lg flex flex-col h-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <h3 className="font-semibold">{selectedDoc.title}</h3>
                <button onClick={() => setSelectedDoc(null)} className="p-1.5 rounded-md hover:bg-bg text-text-muted hover:text-text transition-colors" aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-5 py-3 border-b border-border bg-bg/50 shrink-0 space-y-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => sendChatMessage(`Read the content below and suggest improvements:\n\n${selectedDoc.content.slice(0, 2000)}`)} disabled={chatProcessing}
                    className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg disabled:opacity-50">
                    Discuss with Agent
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(selectedDoc.content)}
                    className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">
                    Copy All
                  </button>
                  <button onClick={() => {
                    const win = window.open('', '_blank')
                    if (win) {
                      const html = `<!DOCTYPE html><html><head><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:8.5in;margin:0 auto;padding:0.75in;font-size:11pt;line-height:1.5;color:#1a1a1a}h1{font-size:16pt;margin-bottom:4px}h2{font-size:13pt;margin-top:16px}p{margin:8px 0}a{color:#0051BA}</style></head><body>${document.querySelector('#doc-overlay-content')?.innerHTML || ''}</body></html>`
                      win.document.write(html)
                      win.document.close()
                      setTimeout(() => win.print(), 500)
                    }
                  }}
                    className="px-3 py-1.5 border border-border rounded-md text-xs font-medium text-text hover:bg-bg">
                    Download PDF
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Make it shorter', prompt: `Shorten this to under 300 words while keeping the strongest points:\n\n${selectedDoc.content.slice(0, 2000)}` },
                    { label: 'More specific metrics', prompt: `Add more specific metrics and quantified outcomes to this:\n\n${selectedDoc.content.slice(0, 2000)}` },
                    { label: 'Stronger opening', prompt: `Rewrite the opening paragraph to be more compelling and specific to the company:\n\n${selectedDoc.content.slice(0, 2000)}` },
                    { label: 'Match JD keywords', prompt: `Review this against the job description and add missing keywords:\n\n${selectedDoc.content.slice(0, 2000)}` },
                    { label: 'More conversational tone', prompt: `Rewrite this in a more natural, conversational tone while keeping it professional:\n\n${selectedDoc.content.slice(0, 2000)}` },
                  ].map(chip => (
                    <button key={chip.label} onClick={() => sendChatMessage(chip.prompt)} disabled={chatProcessing}
                      className="px-2.5 py-1 text-[11px] border border-accent/20 text-accent rounded-full hover:bg-accent/10 disabled:opacity-50 transition-colors">
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5" id="doc-overlay-content">
                <MarkdownView content={selectedDoc.content} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Right Panel: Agent Chat (35%) ─────────────────────────── */}
      <div className="w-[35%] flex flex-col bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${chatProcessing ? 'bg-accent animate-pulse' : 'bg-success'}`} />
            <span className="text-sm font-semibold">Resume Agent</span>
          </div>
          <a href="/command-center" className="text-xs text-text-muted hover:text-text">Manage</a>
        </div>

        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-lg px-3.5 py-2.5 ${
                msg.role === 'user' ? 'bg-accent/10 text-text' : 'bg-bg text-text'
              }`}>
                {msg.role === 'agent' ? (
                  <MarkdownView content={msg.content} className="text-sm" />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {chatProcessing && (
            <div className="flex justify-start">
              <div className="max-w-[90%]">
                <AgentProgress agentName="Resume agent" lastMessage={chatMessages.filter(m => m.role === 'user').at(-1)?.content} spawnId={agentSpawnId} />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput) } }}
            placeholder="Ask the resume agent..."
            disabled={chatProcessing}
            className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          />
          <button onClick={() => sendChatMessage(chatInput)} disabled={!chatInput.trim() || chatProcessing}
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
