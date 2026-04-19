import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from './paths'

// ─── Schemas ────────────────────────────────────────────────────────────────

const LessonSchema = z.object({
  id: z.string(),
  text: z.string().default(''),
  category: z.enum(['interview', 'resume', 'networking', 'negotiation', 'general']),
  source: z.enum(['debrief', 'retro', 'manual']).default('manual'),
  company: z.string().default(''),
  date: z.string(),
}).passthrough().transform((data) => {
  const d = data as Record<string, unknown>
  // lesson_text | content → text
  if (!d.text && (d.lesson_text || d.content)) {
    d.text = (d.lesson_text || d.content) as string
  }
  delete d.lesson_text; delete d.content
  // type → category (if category missing)
  if (!d.category && d.type) { d.category = d.type as string }
  delete d.type
  // added_by | created_by → source
  if (!d.source && (d.added_by || d.created_by)) {
    d.source = (d.added_by || d.created_by) as string
  }
  delete d.added_by; delete d.created_by
  return d as typeof data
})

const DecisionSchema = z.object({
  id: z.string(),
  text: z.string().default(''),
  reasoning: z.string().default(''),
  source: z.enum(['retro', 'manual']).default('manual'),
  date: z.string(),
  status: z.enum(['active', 'archived']).default('active'),
}).passthrough().transform((data) => {
  const d = data as Record<string, unknown>
  // decision_text | content → text
  if (!d.text && (d.decision_text || d.content)) {
    d.text = (d.decision_text || d.content) as string
  }
  delete d.decision_text; delete d.content
  // reason | rationale → reasoning
  if (!d.reasoning && (d.reason || d.rationale)) {
    d.reasoning = (d.reason || d.rationale) as string
  }
  delete d.reason; delete d.rationale
  return d as typeof data
})

const ChecklistItemSchema = z.object({
  text: z.string(),
  checked: z.boolean().default(false),
})

const ChecklistSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(ChecklistItemSchema).default([]),
}).passthrough()

const PlaybookSchema = z.object({
  lessons: z.array(LessonSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  checklists: z.array(ChecklistSchema).default([]),
}).passthrough()

// ─── Types ──────────────────────────────────────────────────────────────────

export type Lesson = z.infer<typeof LessonSchema>
export type Decision = z.infer<typeof DecisionSchema>
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>
export type Checklist = z.infer<typeof ChecklistSchema>
export type Playbook = z.infer<typeof PlaybookSchema>

// ─── File I/O ───────────────────────────────────────────────────────────────

function playbookPath(): string {
  return join(getSearchDir(), 'playbook.yaml')
}

export function parsePlaybook(): Playbook {
  const fp = playbookPath()
  if (!existsSync(fp)) return { lessons: [], decisions: [], checklists: [] }
  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false })
    return PlaybookSchema.parse(raw || {})
  } catch (err) {
    console.error('[playbook] parse error:', err instanceof Error ? err.message : err)
    return { lessons: [], decisions: [], checklists: [] }
  }
}

function writePlaybook(data: Playbook): void {
  const fp = playbookPath()
  writeFileSync(fp, YAML.stringify(PlaybookSchema.parse(data)))
}

// ─── ID Generators ──────────────────────────────────────────────────────────

function nextId(prefix: string, items: { id: string }[]): string {
  const max = items.reduce((m, item) => {
    const match = item.id.match(new RegExp(`^${prefix}-(\\d+)$`))
    return match ? Math.max(m, parseInt(match[1], 10)) : m
  }, 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function addLesson(input: { text: string; category: Lesson['category']; source?: Lesson['source']; company?: string }): Lesson {
  const pb = parsePlaybook()
  const lesson: Lesson = {
    id: nextId('les', pb.lessons),
    text: input.text,
    category: input.category,
    source: input.source || 'manual',
    company: input.company || '',
    date: new Date().toISOString().split('T')[0],
  }
  pb.lessons.push(lesson)
  writePlaybook(pb)
  return lesson
}

export function addDecision(input: { text: string; reasoning?: string; source?: Decision['source'] }): Decision {
  const pb = parsePlaybook()
  const decision: Decision = {
    id: nextId('dec', pb.decisions),
    text: input.text,
    reasoning: input.reasoning || '',
    source: input.source || 'manual',
    date: new Date().toISOString().split('T')[0],
    status: 'active',
  }
  pb.decisions.push(decision)
  writePlaybook(pb)
  return decision
}

export function updateDecisionStatus(id: string, status: Decision['status']): Decision {
  const pb = parsePlaybook()
  const idx = pb.decisions.findIndex(d => d.id === id)
  if (idx === -1) throw new Error(`Decision not found: ${id}`)
  pb.decisions[idx].status = status
  writePlaybook(pb)
  return pb.decisions[idx]
}

export function upsertChecklist(input: { id?: string; title: string; items: ChecklistItem[] }): Checklist {
  const pb = parsePlaybook()
  if (input.id) {
    const idx = pb.checklists.findIndex(c => c.id === input.id)
    if (idx !== -1) {
      pb.checklists[idx].title = input.title
      pb.checklists[idx].items = input.items
      writePlaybook(pb)
      return pb.checklists[idx]
    }
  }
  const checklist: Checklist = {
    id: input.id || nextId('chk', pb.checklists),
    title: input.title,
    items: input.items,
  }
  pb.checklists.push(checklist)
  writePlaybook(pb)
  return checklist
}

export function deleteItem(type: 'lessons' | 'decisions' | 'checklists', id: string): boolean {
  const pb = parsePlaybook()
  const arr = pb[type] as { id: string }[]
  const idx = arr.findIndex(item => item.id === id)
  if (idx === -1) return false
  arr.splice(idx, 1)
  writePlaybook(pb)
  return true
}
