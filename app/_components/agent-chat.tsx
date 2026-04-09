'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MarkdownView } from './markdown-view'
import { useAgentEvents } from '../hooks/use-agent-events'

interface Message {
  role: 'user' | 'agent'
  content: string
}

interface AgentChatProps {
  agentName: string
  initialOutput: string
  skill: string
  onClose?: () => void
  metadata?: Record<string, string>
}

export function AgentChat({ agentName, initialOutput, skill, onClose, metadata }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', content: initialOutput },
  ])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { spawnAgent, status, output, reset } = useAgentEvents()

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isProcessing, scrollToBottom])

  // Watch for agent completion
  useEffect(() => {
    if (status === 'completed' && output) {
      setMessages((prev) => [...prev, { role: 'agent', content: output }])
      setIsProcessing(false)
      reset()
    }
    if (status === 'failed') {
      setMessages((prev) => [
        ...prev,
        { role: 'agent', content: 'Something went wrong. Please try again.' },
      ])
      setIsProcessing(false)
      reset()
    }
    if (status === 'timeout') {
      setMessages((prev) => [
        ...prev,
        { role: 'agent', content: 'Request timed out. Please try again.' },
      ])
      setIsProcessing(false)
      reset()
    }
  }, [status, output, reset])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isProcessing) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setIsProcessing(true)

    try {
      await spawnAgent(agentName, {
        skill,
        entry_name: metadata?.company
          ? `${metadata.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-followup`
          : 'followup',
        metadata: metadata || {},
        text,
      })
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'agent', content: 'Failed to reach agent. Please try again.' },
      ])
      setIsProcessing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const displayName = agentName.charAt(0).toUpperCase() + agentName.slice(1)

  return (
    <div className="flex flex-col border border-border rounded-lg bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm font-semibold text-text">Agent: {displayName}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-text-muted hover:text-text px-2 py-1 rounded border border-border hover:bg-bg transition-colors"
          >
            Close
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[32rem]">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-accent/10 text-text'
                  : 'bg-bg text-text'
              }`}
            >
              {msg.role === 'agent' ? (
                <MarkdownView content={msg.content} />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-bg rounded-lg px-4 py-3 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-muted">Agent is thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 flex items-center gap-2 bg-surface">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isProcessing}
          className="flex-1 px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
