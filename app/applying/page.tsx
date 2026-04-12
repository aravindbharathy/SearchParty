'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
import { MarkdownView } from '../_components/markdown-view'
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

type TabKey = 'resumes' | 'cover-letters' | 'outreach'

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
    try { return (localStorage.getItem('applying-active-tab') as TabKey) || 'resumes' } catch { return 'resumes' }
  })

  // ─── Data state ──────────────────────────────────────────────────────────
  const [resumes, setResumes] = useState<Resume[]>([])
  const [structuredResumes, setStructuredResumes] = useState<ResumeData[]>([])
  const [coverLetters, setCoverLetters] = useState<PrepPackage[]>([])
  const [workProducts, setWorkProducts] = useState<PrepPackage[]>([])
  const [selectedDoc, setSelectedDoc] = useState<{ title: string; content: string } | null>(null)
  const [editingResume, setEditingResume] = useState<ResumeData | null>(null)

  // ─── Chat state ──────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('applying-chat-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [chatInput, setChatInput] = useState('')
  const hasSpawnedRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('applying-chat')
  const chatProcessing = agentStatus === 'running'

  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications('resume')

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

  const loadCoverLetters = useCallback(async () => {
    try {
      const dir = 'output/cover-letters'
      const res = await fetch(`/api/vault/scan?dir=${encodeURIComponent(dir)}`)
      if (res.ok) {
        const data = await res.json() as { files?: string[] }
        if (data.files) {
          const letters: PrepPackage[] = []
          for (const f of data.files) {
            try {
              const r = await fetch(`/api/vault/read-file?path=output/cover-letters/${f}`)
              if (r.ok) {
                const d = await r.json() as { content: string }
                const titleMatch = d.content.match(/^#\s+(.+)/m)
                letters.push({ filename: f, title: titleMatch?.[1] || f, content: d.content })
              }
            } catch {}
          }
          setCoverLetters(letters)
        }
      }
    } catch {}
  }, [])

  const loadWorkProducts = useCallback(async () => {
    try {
      const dir = 'output/outreach'
      const res = await fetch(`/api/vault/scan?dir=${encodeURIComponent(dir)}`)
      if (res.ok) {
        const data = await res.json() as { files?: string[] }
        if (data.files) {
          const products: PrepPackage[] = []
          for (const f of data.files) {
            try {
              const r = await fetch(`/api/vault/read-file?path=output/outreach/${f}`)
              if (r.ok) {
                const d = await r.json() as { content: string }
                const titleMatch = d.content.match(/^#\s+(.+)/m)
                products.push({ filename: f, title: titleMatch?.[1] || f, content: d.content })
              }
            } catch {}
          }
          setWorkProducts(products)
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadResumes()
    loadCoverLetters()
    loadWorkProducts()

    const interval = setInterval(() => {
      loadResumes()
      loadCoverLetters()
      loadWorkProducts()
    }, 30_000)
    return () => clearInterval(interval)
  }, [loadResumes, loadCoverLetters, loadWorkProducts])

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
    if (hasSpawnedRef.current) return
    hasSpawnedRef.current = true
    if (chatMessages.length > 0) return

    let cancelled = false
    const waitAndSpawn = async () => {
      for (let i = 0; i < 5; i++) {
        try {
          const res = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
          if (res.ok) break
        } catch {}
        await new Promise(r => setTimeout(r, 1000))
      }
      if (cancelled) return
      spawnAgent('resume', {
        skill: 'resume-chat',
        entry_name: 'resume-session',
        text: RESUME_DIRECTIVE,
      })
    }
    waitAndSpawn()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  }), [resumes, coverLetters, workProducts])

  // ─── Render ──────────────────────────────────────────────────────────────

  // Full-screen resume editor
  if (editingResume) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col">
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
            chatProcessing={chatProcessing}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
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
                    <select value={typeof window !== 'undefined' ? localStorage.getItem('default-resume-template') || 'clean' : 'clean'}
                      onChange={e => { localStorage.setItem('default-resume-template', e.target.value) }}
                      className="text-xs px-2 py-1 border border-border rounded bg-bg">
                      <option value="clean">Clean</option>
                      <option value="modern">Modern</option>
                      <option value="traditional">Traditional</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => sendChatMessage('Run this command first: cat .claude/skills/resume-tailor/SKILL.md — then help me tailor a resume. Ask me which company and role to target.')}
                  disabled={chatProcessing}
                  className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  Tailor New Resume
                </button>
              </div>

              <p className="text-[10px] text-text-muted bg-bg rounded px-3 py-2 mb-4">
                Add your own templates by dropping HTML/CSS files into <code className="bg-border/50 px-1 rounded">search/vault/resumes/templates/</code> — they&apos;ll appear in the template selector.
              </p>

              {/* Structured resumes (editable) */}
              {structuredResumes.map(sr => (
                <div key={sr.id} className="p-4 border border-border rounded-lg bg-surface mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{sr.target_company} — {sr.target_role}</p>
                      <p className="text-xs text-text-muted">v{sr.version} · {sr.keyword_coverage}% keywords · {sr.template} template</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingResume(sr)} className="text-xs px-3 py-1.5 bg-accent text-white rounded-md hover:bg-accent-hover">
                        Edit & Preview
                      </button>
                      <button onClick={() => {
                        const slug = `${sr.target_company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sr.target_role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
                        sendChatMessage(`Review the resume at search/output/resumes/${slug}-v${sr.version}.json — read the file first, then suggest specific improvements for the ${sr.target_company} ${sr.target_role} role.`)
                      }} disabled={chatProcessing}
                        className="text-xs text-accent hover:text-accent-hover disabled:opacity-50">Discuss</button>
                    </div>
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
                    <div key={resume.filename} className={`p-4 border rounded-lg transition-colors ${
                      selectedDoc?.title === resume.title ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'
                    }`}>
                      <button onClick={() => setSelectedDoc(selectedDoc?.title === resume.title ? null : { title: resume.title, content: resume.content })} className="w-full text-left">
                        <p className="font-medium text-sm">{resume.title}</p>
                        <p className="text-xs text-text-muted mt-0.5">{resume.filename}</p>
                      </button>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => sendChatMessage(`Read the resume file at search/output/resumes/${resume.filename} — then review it and suggest specific improvements.`)} disabled={chatProcessing}
                          className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">Discuss</button>
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
                    <div
                      key={letter.filename}
                      className={`p-4 border rounded-lg transition-colors ${
                        selectedDoc?.title === letter.title ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'
                      }`}
                    >
                      <button onClick={() => setSelectedDoc(selectedDoc?.title === letter.title ? null : letter)} className="w-full text-left">
                        <p className="font-medium text-sm">{letter.title}</p>
                        <p className="text-xs text-text-muted mt-0.5">{letter.filename}</p>
                      </button>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => sendChatMessage(`Review and improve this cover letter: ${letter.title}`)} disabled={chatProcessing}
                          className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">Discuss</button>
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
                    <div key={product.filename} className={`p-4 border rounded-lg transition-colors ${
                      selectedDoc?.title === product.title ? 'border-accent bg-accent/5' : 'border-border hover:bg-bg'
                    }`}>
                      <button onClick={() => setSelectedDoc(selectedDoc?.title === product.title ? null : product)} className="w-full text-left">
                        <p className="font-medium text-sm">{product.title}</p>
                        <p className="text-xs text-text-muted mt-0.5">{product.filename}</p>
                      </button>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                        <button onClick={() => sendChatMessage(`Review and improve this outreach: ${product.title}`)} disabled={chatProcessing}
                          className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">Discuss</button>
                        <button onClick={() => navigator.clipboard.writeText(product.content)}
                          className="text-xs text-text-muted hover:text-text">Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Document viewer */}
          {selectedDoc && (
            <div className="mt-4 bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{selectedDoc.title}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => sendChatMessage(`Read the content below and suggest improvements:\n\n${selectedDoc.content.slice(0, 2000)}`)} disabled={chatProcessing}
                    className="text-xs text-accent hover:text-accent-hover font-medium disabled:opacity-50">
                    Discuss with Agent
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(selectedDoc.content)} className="text-xs text-text-muted hover:text-text">
                    Copy All
                  </button>
                  <button onClick={() => setSelectedDoc(null)} className="text-xs text-text-muted hover:text-text">Close</button>
                </div>
              </div>
              <div className="bg-bg p-4 rounded-md border border-border overflow-auto max-h-[60vh]">
                <MarkdownView content={selectedDoc.content} />
              </div>
            </div>
          )}
        </div>
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
              <div className="bg-bg rounded-lg px-3.5 py-2.5 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Resume agent is thinking...</span>
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
