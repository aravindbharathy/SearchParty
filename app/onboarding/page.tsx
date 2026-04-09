'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { MarkdownView } from '../_components/markdown-view'
import { useAgentEvents } from '../hooks/use-agent-events'
import type { ContextStatusResponse } from '../types/context'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'coach' | 'user'
  content: string
}

type SectionKey =
  | 'experience-library'
  | 'career-plan'
  | 'qa-master'
  | 'target-companies'
  | 'connection-tracker'

const SECTION_ORDER: SectionKey[] = [
  'experience-library',
  'career-plan',
  'qa-master',
  'target-companies',
  'connection-tracker',
]

const SECTION_KEYWORDS: Record<SectionKey, string[]> = {
  'experience-library': ['experience', 'resume', 'work history', 'roles', 'experience library'],
  'career-plan': ['career plan', 'target level', 'functions', 'industries', 'locations', 'comp', 'deal breaker'],
  'qa-master': ['q&a', 'qa master', 'salary', 'why leaving', 'weakness', 'visa'],
  'target-companies': ['target companies', 'companies', 'company list'],
  'connection-tracker': ['connections', 'contacts', 'networking'],
}

const COACH_DIRECTIVE = `You are onboarding a new Search Party user. Walk them through setting up their job search profile step by step.

Start by greeting them and asking if they have a resume to upload. If yes, read it from search/vault/resumes/ and parse it into search/context/experience-library.yaml.

Then guide them through each section IN ORDER:
1. Experience Library — parse from resume or build from scratch. Push for metrics and specifics.
2. Career Plan — ask about target level, functions, industries, locations, comp floor, deal breakers.
3. Q&A Master — ask about salary expectations, why leaving, greatest weakness, visa status.
4. Target Companies — suggest companies based on career plan, or let user list them.
5. Connections — ask about existing contacts at target companies (optional, can skip).

For each section, WRITE the data to the corresponding YAML file in search/context/ using the Write tool.

Be conversational and encouraging. Ask one question at a time. When a section is complete, move to the next.

After all sections are done, summarize what was set up and recommend next steps (score a JD, research a company).`

// ─── Section detection ──────────────────────────────────────────────────────

function detectSection(text: string): SectionKey | null {
  const lower = text.toLowerCase()
  // Check in reverse order so we match the most specific section
  for (let i = SECTION_ORDER.length - 1; i >= 0; i--) {
    const key = SECTION_ORDER[i]
    if (SECTION_KEYWORDS[key].some((kw) => lower.includes(kw))) {
      return key
    }
  }
  return null
}

// ─── Progress Panel ─────────────────────────────────────────────────────────

const SECTION_META: Record<string, { icon: string; description: string }> = {
  'experience-library': { icon: '📋', description: 'Work history, skills, education' },
  'career-plan': { icon: '🎯', description: 'Target level, functions, industries, comp' },
  'qa-master': { icon: '💬', description: 'Salary, why leaving, weakness, visa' },
  'target-companies': { icon: '🏢', description: 'Companies you want to work at' },
  'connection-tracker': { icon: '🤝', description: 'Contacts at target companies' },
  'interview-history': { icon: '📝', description: 'Auto-populated after interviews' },
}

function ProgressPanel({
  status,
  currentSection,
}: {
  status: ContextStatusResponse | null
  currentSection: SectionKey | null
}) {
  if (!status) return null

  const contexts = status.contexts
  const setupSections = SECTION_ORDER.filter((k) => k in contexts)
  const filledCount = setupSections.filter((k) => contexts[k]?.filled).length

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-text">Setup Progress</h2>
        <p className="text-sm text-text-muted mt-1">
          Your context files power every AI feature
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {SECTION_ORDER.map((key) => {
          const ctx = contexts[key]
          if (!ctx) return null
          const meta = SECTION_META[key]
          const isCurrent = currentSection === key
          const isFilled = ctx.filled

          return (
            <div
              key={key}
              className={`rounded-lg border p-3.5 transition-all ${
                isCurrent
                  ? 'border-accent bg-accent/5 shadow-sm'
                  : isFilled
                    ? 'border-border bg-surface'
                    : 'border-border/60 bg-bg'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-base mt-0.5">
                  {isFilled ? '\u2705' : isCurrent ? '\uD83D\uDD35' : '\u26AA'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{meta.icon}</span>
                    <span className="text-sm font-medium text-text">{ctx.label}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{meta.description}</p>
                  {isFilled && ctx.lastModified && (
                    <p className="text-xs text-text-muted mt-1">
                      Updated {new Date(ctx.lastModified).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Interview History — always gray */}
        {contexts['interview-history'] && (
          <div className="rounded-lg border border-border/60 bg-bg p-3.5 opacity-60">
            <div className="flex items-start gap-2.5">
              <span className="text-base mt-0.5">{'\u26AA'}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{SECTION_META['interview-history'].icon}</span>
                  <span className="text-sm font-medium text-text">
                    {contexts['interview-history'].label}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Auto-populated after interviews
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-text">{filledCount}/5 complete</span>
          <span className="text-text-muted">{Math.round((filledCount / 5) * 100)}%</span>
        </div>
        <div className="w-full h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${(filledCount / 5) * 100}%` }}
          />
        </div>
        {filledCount >= 5 && (
          <a
            href="/"
            className="mt-4 block text-center px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            Go to Dashboard &rarr;
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Resume Drop Zone ───────────────────────────────────────────────────────

function ResumeDropZone({
  onUploaded,
}: {
  onUploaded: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList) => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', files[0])
      formData.append('subfolder', 'resumes')
      const res = await fetch('/api/vault/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Upload failed')
        return
      }
      onUploaded()
    } catch {
      setError('Network error during upload')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="px-4 py-3">
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {uploading ? (
          <p className="text-sm text-text-muted">Uploading...</p>
        ) : (
          <>
            <p className="text-sm font-medium text-text">Drop your resume here</p>
            <p className="text-xs text-text-muted mt-1">PDF, DOC, DOCX, or TXT</p>
          </>
        )}
      </div>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  )
}

// ─── Quick Action Buttons ───────────────────────────────────────────────────

function QuickActions({
  onSelect,
  options,
}: {
  onSelect: (text: string) => void
  options: string[]
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          className="px-3 py-1.5 text-xs font-medium border border-accent/30 text-accent rounded-full hover:bg-accent/10 transition-colors"
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentSection, setCurrentSection] = useState<SectionKey | null>('experience-library')
  const [contextStatus, setContextStatus] = useState<ContextStatusResponse | null>(null)
  const [showResumeZone, setShowResumeZone] = useState(true)
  const [hasStarted, setHasStarted] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents()

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isProcessing, scrollToBottom])

  // Fetch context status on mount and poll every 5s
  const fetchContextStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/context/status')
      if (res.ok) {
        const data = await res.json()
        setContextStatus(data)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchContextStatus()
    const interval = setInterval(fetchContextStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchContextStatus])

  // Spawn coach on mount
  useEffect(() => {
    if (hasStarted) return
    setHasStarted(true)
    setIsProcessing(true)
    spawnAgent('research', {
      skill: 'onboarding-coach',
      entry_name: 'onboarding-session',
      text: COACH_DIRECTIVE,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watch for agent completion
  useEffect(() => {
    if (agentStatus === 'completed' && agentOutput) {
      setMessages((prev) => [...prev, { role: 'coach', content: agentOutput }])
      setIsProcessing(false)

      // Detect which section the coach is now talking about
      const detected = detectSection(agentOutput)
      if (detected) {
        setCurrentSection(detected)
      }

      // Hide resume zone once coach moves past experience
      if (detected && detected !== 'experience-library') {
        setShowResumeZone(false)
      }

      agentReset()
      fetchContextStatus()
    }
    if (agentStatus === 'failed') {
      setMessages((prev) => [
        ...prev,
        { role: 'coach', content: 'Something went wrong. Please try sending your message again.' },
      ])
      setIsProcessing(false)
      agentReset()
    }
    if (agentStatus === 'timeout') {
      setMessages((prev) => [
        ...prev,
        { role: 'coach', content: 'The request timed out. Please try again.' },
      ])
      setIsProcessing(false)
      agentReset()
    }
  }, [agentStatus, agentOutput, agentReset, fetchContextStatus])

  // Send a message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return
      setMessages((prev) => [...prev, { role: 'user', content: text.trim() }])
      setInput('')
      setIsProcessing(true)

      try {
        await spawnAgent('research', {
          skill: 'onboarding-coach',
          entry_name: 'onboarding-followup',
          text: text.trim(),
        })
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'coach', content: 'Failed to reach the coach. Please try again.' },
        ])
        setIsProcessing(false)
      }
    },
    [isProcessing, spawnAgent],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleResumeUploaded = () => {
    sendMessage("I've uploaded my resume to vault/resumes/")
  }

  // Detect quick actions from the last coach message
  const lastCoachMsg = [...messages].reverse().find((m) => m.role === 'coach')
  const showResumeActions =
    lastCoachMsg &&
    currentSection === 'experience-library' &&
    /resume/i.test(lastCoachMsg.content) &&
    messages.length <= 2
  const showSkipButton = currentSection && !isProcessing && messages.length > 1

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── Left Panel: Coach Chat (60%) ─── */}
      <div className="flex-1 lg:w-[60%] flex flex-col bg-white dark:bg-surface min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-surface">
          <span className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-base">
            {'\uD83E\uDD16'}
          </span>
          <div>
            <h1 className="text-base font-semibold text-text">Onboarding Coach</h1>
            <p className="text-xs text-text-muted">Setting up your job search profile</p>
          </div>
        </div>

        {/* Resume drop zone */}
        {showResumeZone && <ResumeDropZone onUploaded={handleResumeUploaded} />}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-accent/10 text-text rounded-br-sm'
                    : 'bg-bg text-text rounded-bl-sm'
                }`}
              >
                {msg.role === 'coach' && (
                  <p className="text-xs font-medium text-text-muted mb-1.5">
                    {'\uD83E\uDD16'} Coach
                  </p>
                )}
                {msg.role === 'coach' ? (
                  <MarkdownView content={msg.content} />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Quick action buttons after coach's resume question */}
          {showResumeActions && !isProcessing && (
            <div className="flex justify-start">
              <div className="max-w-[85%]">
                <QuickActions
                  onSelect={sendMessage}
                  options={['Yes, use my resume', 'No, start from scratch']}
                />
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-bg rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Coach is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border px-4 py-3 bg-surface">
          {showSkipButton && (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => sendMessage('Skip this section')}
                className="text-xs text-text-muted hover:text-text transition-colors"
              >
                Skip this section &rarr;
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={isProcessing}
              className="flex-1 px-3.5 py-2.5 border border-border rounded-lg bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isProcessing}
              className="px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ─── Right Panel: Live Progress (40%) ─── */}
      <div className="lg:w-[40%] border-t lg:border-t-0 lg:border-l border-border bg-bg flex flex-col min-h-0">
        <ProgressPanel status={contextStatus} currentSection={currentSection} />
      </div>
    </div>
  )
}
