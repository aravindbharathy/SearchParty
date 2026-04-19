'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Lesson {
  id: string
  text: string
  category: string
  source: string
  company: string
  date: string
}

interface Decision {
  id: string
  text: string
  reasoning: string
  source: string
  date: string
  status: 'active' | 'archived'
}

interface ChecklistItem {
  text: string
  checked: boolean
}

interface Checklist {
  id: string
  title: string
  items: ChecklistItem[]
}

type TabKey = 'lessons' | 'strategy' | 'checklists'

const CATEGORIES = ['interview', 'resume', 'networking', 'negotiation', 'general'] as const

const CATEGORY_COLORS: Record<string, string> = {
  interview: 'bg-accent/10 text-accent border-accent/20',
  resume: 'bg-success/10 text-success border-success/20',
  networking: 'bg-warning/10 text-warning border-warning/20',
  negotiation: 'bg-danger/10 text-danger border-danger/20',
  general: 'bg-text-muted/10 text-text-muted border-text-muted/20',
}

const SOURCE_COLORS: Record<string, string> = {
  debrief: 'bg-accent/10 text-accent',
  retro: 'bg-warning/10 text-warning',
  manual: 'bg-text-muted/10 text-text-muted',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PlaybookPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'lessons'
    try { const s = localStorage.getItem('playbook-active-tab') as TabKey; if (s) return s } catch {}
    return 'lessons'
  })

  const [lessons, setLessons] = useState<Lesson[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  // Add forms
  const [showAddLesson, setShowAddLesson] = useState(false)
  const [lessonText, setLessonText] = useState('')
  const [lessonCategory, setLessonCategory] = useState<string>('general')
  const [lessonCompany, setLessonCompany] = useState('')

  const [showAddDecision, setShowAddDecision] = useState(false)
  const [decisionText, setDecisionText] = useState('')
  const [decisionReasoning, setDecisionReasoning] = useState('')

  const [showAddChecklist, setShowAddChecklist] = useState(false)
  const [checklistTitle, setChecklistTitle] = useState('')
  const [checklistItems, setChecklistItems] = useState<string[]>([''])

  useEffect(() => { try { localStorage.setItem('playbook-active-tab', activeTab) } catch {} }, [activeTab])

  const loadPlaybook = useCallback(async () => {
    try {
      const res = await fetch('/api/playbook')
      if (res.ok) {
        const data = await res.json()
        setLessons(data.lessons || [])
        setDecisions(data.decisions || [])
        setChecklists(data.checklists || [])
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadPlaybook() }, [loadPlaybook])

  // ─── Actions ──────────────────────────────────────────────────────────────

  const navigateToCoach = (message: string) => {
    try { localStorage.setItem('pending-agent-message', JSON.stringify({ message, route: '/coach' })) } catch {}
    router.push('/coach')
  }

  const handleAddLesson = async () => {
    if (!lessonText.trim()) return
    await fetch('/api/playbook/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lessonText, category: lessonCategory, company: lessonCompany }),
    })
    setLessonText(''); setLessonCompany(''); setShowAddLesson(false)
    loadPlaybook()
  }

  const handleAddDecision = async () => {
    if (!decisionText.trim()) return
    await fetch('/api/playbook/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: decisionText, reasoning: decisionReasoning }),
    })
    setDecisionText(''); setDecisionReasoning(''); setShowAddDecision(false)
    loadPlaybook()
  }

  const handleAddChecklist = async () => {
    if (!checklistTitle.trim()) return
    const items = checklistItems.filter(t => t.trim()).map(text => ({ text, checked: false }))
    if (items.length === 0) return
    await fetch('/api/playbook/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: checklistTitle, items }),
    })
    setChecklistTitle(''); setChecklistItems(['']); setShowAddChecklist(false)
    loadPlaybook()
  }

  const toggleDecisionStatus = async (id: string, current: string) => {
    await fetch(`/api/playbook/decisions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: current === 'active' ? 'archived' : 'active' }),
    })
    loadPlaybook()
  }

  const toggleChecklistItem = async (checklist: Checklist, itemIdx: number) => {
    const items = checklist.items.map((item, i) => i === itemIdx ? { ...item, checked: !item.checked } : item)
    await fetch('/api/playbook/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: checklist.id, title: checklist.title, items }),
    })
    loadPlaybook()
  }

  const resetChecklist = async (checklist: Checklist) => {
    const items = checklist.items.map(item => ({ ...item, checked: false }))
    await fetch('/api/playbook/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: checklist.id, title: checklist.title, items }),
    })
    loadPlaybook()
  }

  const handleDelete = async (type: string, id: string) => {
    if (!confirm('Delete this item?')) return
    await fetch(`/api/playbook/${type}/${id}`, { method: 'DELETE' })
    loadPlaybook()
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const filteredLessons = filterCategory ? lessons.filter(l => l.category === filterCategory) : lessons
  const sortedLessons = [...filteredLessons].sort((a, b) => b.date.localeCompare(a.date))
  const activeDecisions = decisions.filter(d => d.status === 'active')
  const archivedDecisions = decisions.filter(d => d.status === 'archived')

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-text-muted">Loading playbook...</p></div>
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Playbook</h1>
          <p className="text-text-muted text-sm">Lessons learned, active strategy, and reusable checklists.</p>
        </div>
        <button onClick={() => navigateToCoach('Read search/playbook.yaml and analyze my lessons and strategy. What patterns do you see? Any adjustments to recommend?')}
          className="px-4 py-2 border border-accent/30 text-accent rounded-md text-sm font-medium hover:bg-accent/10">
          Discuss with Coach
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border mb-6">
        {([
          { key: 'lessons' as TabKey, label: 'Lessons', count: lessons.length },
          { key: 'strategy' as TabKey, label: 'Strategy', count: activeDecisions.length },
          { key: 'checklists' as TabKey, label: 'Checklists', count: checklists.length },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`pb-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.key ? 'text-text' : 'text-text-muted hover:text-text'
            }`}>
            {tab.label} ({tab.count})
            {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
          </button>
        ))}
      </div>

      {/* ─── Lessons Tab ────────────────────────────────────── */}
      {activeTab === 'lessons' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFilterCategory(null)}
                className={`text-xs px-2.5 py-1 rounded-full border ${!filterCategory ? 'bg-accent/10 text-accent border-accent/20' : 'bg-bg text-text-muted border-border hover:text-text'}`}>
                All
              </button>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border capitalize ${filterCategory === cat ? CATEGORY_COLORS[cat] : 'bg-bg text-text-muted border-border hover:text-text'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddLesson(true)}
              className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover">
              + Add Lesson
            </button>
          </div>

          {showAddLesson && (
            <div className="mb-4 p-4 bg-surface border border-border rounded-lg">
              <textarea value={lessonText} onChange={e => setLessonText(e.target.value)}
                placeholder="What did you learn?"
                className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm resize-none h-20 mb-3" />
              <div className="flex items-center gap-3">
                <select value={lessonCategory} onChange={e => setLessonCategory(e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-md bg-bg text-sm">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={lessonCompany} onChange={e => setLessonCompany(e.target.value)}
                  placeholder="Company (optional)" className="px-3 py-1.5 border border-border rounded-md bg-bg text-sm flex-1" />
                <button onClick={handleAddLesson} disabled={!lessonText.trim()}
                  className="px-4 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
                <button onClick={() => setShowAddLesson(false)} className="text-sm text-text-muted hover:text-text">Cancel</button>
              </div>
            </div>
          )}

          {sortedLessons.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-muted text-lg mb-2">{filterCategory ? `No ${filterCategory} lessons yet` : 'No lessons yet'}</p>
              <p className="text-text-muted text-sm">Lessons are added from interview debriefs, weekly retros, or manually by you.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedLessons.map(lesson => (
                <div key={lesson.id} className="p-4 bg-surface border border-border rounded-lg">
                  <p className="text-sm mb-2">{lesson.text}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${CATEGORY_COLORS[lesson.category] || ''}`}>{lesson.category}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${SOURCE_COLORS[lesson.source] || ''}`}>{lesson.source}</span>
                    {lesson.company && <span className="text-[10px] text-text-muted">{lesson.company}</span>}
                    <span className="text-[10px] text-text-muted ml-auto">{lesson.date}</span>
                    <button onClick={() => navigateToCoach(`Let's discuss this lesson from my playbook: "${lesson.text}"${lesson.company ? ` (from ${lesson.company})` : ''}. How should I apply this going forward?`)}
                      className="text-[10px] text-accent hover:text-accent-hover font-medium">Discuss</button>
                    <button onClick={() => handleDelete('lessons', lesson.id)}
                      className="text-[10px] text-text-muted hover:text-danger">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Strategy Tab ───────────────────────────────────── */}
      {activeTab === 'strategy' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-muted">Active Decisions</h2>
            <button onClick={() => setShowAddDecision(true)}
              className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover">
              + Add Decision
            </button>
          </div>

          {showAddDecision && (
            <div className="mb-4 p-4 bg-surface border border-border rounded-lg">
              <textarea value={decisionText} onChange={e => setDecisionText(e.target.value)}
                placeholder="What's the decision?"
                className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm resize-none h-16 mb-2" />
              <textarea value={decisionReasoning} onChange={e => setDecisionReasoning(e.target.value)}
                placeholder="Why? (reasoning)"
                className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm resize-none h-16 mb-3" />
              <div className="flex items-center gap-3">
                <button onClick={handleAddDecision} disabled={!decisionText.trim()}
                  className="px-4 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
                <button onClick={() => setShowAddDecision(false)} className="text-sm text-text-muted hover:text-text">Cancel</button>
              </div>
            </div>
          )}

          {activeDecisions.length === 0 && !showAddDecision ? (
            <div className="text-center py-8">
              <p className="text-text-muted text-sm">No active strategy decisions. Add one or run a weekly retro.</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {activeDecisions.map(dec => (
                <div key={dec.id} className="p-4 bg-surface border border-accent/20 rounded-lg">
                  <p className="text-sm font-medium mb-1">{dec.text}</p>
                  {dec.reasoning && <p className="text-xs text-text-muted mb-2">{dec.reasoning}</p>}
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${SOURCE_COLORS[dec.source] || ''}`}>{dec.source}</span>
                    <span className="text-[10px] text-text-muted">{dec.date}</span>
                    <span className="ml-auto" />
                    <button onClick={() => navigateToCoach(`Review this strategy decision: "${dec.text}" (reasoning: ${dec.reasoning || 'none'}). Is it still the right approach?`)}
                      className="text-[10px] text-accent hover:text-accent-hover font-medium">Discuss</button>
                    <button onClick={() => toggleDecisionStatus(dec.id, dec.status)}
                      className="text-[10px] text-text-muted hover:text-text">Archive</button>
                    <button onClick={() => handleDelete('decisions', dec.id)}
                      className="text-[10px] text-text-muted hover:text-danger">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {archivedDecisions.length > 0 && (
            <div>
              <button onClick={() => setShowArchived(!showArchived)}
                className="text-xs text-text-muted hover:text-text mb-3 flex items-center gap-1">
                <span>{showArchived ? '▼' : '▶'}</span> Archived ({archivedDecisions.length})
              </button>
              {showArchived && (
                <div className="space-y-3">
                  {archivedDecisions.map(dec => (
                    <div key={dec.id} className="p-4 bg-bg border border-border rounded-lg opacity-60">
                      <p className="text-sm mb-1">{dec.text}</p>
                      {dec.reasoning && <p className="text-xs text-text-muted mb-2">{dec.reasoning}</p>}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted">{dec.date}</span>
                        <span className="ml-auto" />
                        <button onClick={() => toggleDecisionStatus(dec.id, dec.status)}
                          className="text-[10px] text-accent hover:text-accent-hover">Unarchive</button>
                        <button onClick={() => handleDelete('decisions', dec.id)}
                          className="text-[10px] text-text-muted hover:text-danger">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Checklists Tab ─────────────────────────────────── */}
      {activeTab === 'checklists' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-muted">Reusable Checklists</h2>
            <button onClick={() => setShowAddChecklist(true)}
              className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent-hover">
              + Add Checklist
            </button>
          </div>

          {showAddChecklist && (
            <div className="mb-4 p-4 bg-surface border border-border rounded-lg">
              <input value={checklistTitle} onChange={e => setChecklistTitle(e.target.value)}
                placeholder="Checklist title"
                className="w-full px-3 py-2 border border-border rounded-md bg-bg text-sm mb-3" />
              <div className="space-y-2 mb-3">
                {checklistItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={item} onChange={e => { const items = [...checklistItems]; items[i] = e.target.value; setChecklistItems(items) }}
                      placeholder={`Item ${i + 1}`}
                      className="flex-1 px-3 py-1.5 border border-border rounded-md bg-bg text-sm" />
                    {checklistItems.length > 1 && (
                      <button onClick={() => setChecklistItems(checklistItems.filter((_, j) => j !== i))}
                        className="text-xs text-text-muted hover:text-danger">Remove</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setChecklistItems([...checklistItems, ''])}
                  className="text-xs text-accent hover:text-accent-hover">+ Add item</button>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleAddChecklist} disabled={!checklistTitle.trim() || checklistItems.every(i => !i.trim())}
                  className="px-4 py-1.5 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
                <button onClick={() => { setShowAddChecklist(false); setChecklistTitle(''); setChecklistItems(['']) }}
                  className="text-sm text-text-muted hover:text-text">Cancel</button>
              </div>
            </div>
          )}

          {checklists.length === 0 && !showAddChecklist ? (
            <div className="text-center py-12">
              <p className="text-text-muted text-lg mb-2">No checklists yet</p>
              <p className="text-text-muted text-sm">Create reusable checklists for recurring activities like interview prep or application review.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checklists.map(cl => {
                const done = cl.items.filter(i => i.checked).length
                return (
                  <div key={cl.id} className="p-4 bg-surface border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-sm">{cl.title}</h3>
                      <span className="text-[10px] text-text-muted">{done}/{cl.items.length}</span>
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {cl.items.map((item, i) => (
                        <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={item.checked}
                            onChange={() => toggleChecklistItem(cl, i)}
                            className="rounded border-border accent-accent" />
                          <span className={item.checked ? 'line-through text-text-muted' : ''}>{item.text}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                      {done > 0 && (
                        <button onClick={() => resetChecklist(cl)}
                          className="text-[10px] text-text-muted hover:text-text">Reset</button>
                      )}
                      <span className="ml-auto" />
                      <button onClick={() => handleDelete('checklists', cl.id)}
                        className="text-[10px] text-text-muted hover:text-danger">Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
