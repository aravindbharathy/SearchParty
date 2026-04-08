/**
 * lib/parsers.ts — Pipeline YAML parsers with Zod validation.
 *
 * Handles applications, interviews, and offers pipeline files.
 * Provides CRUD operations and urgency/stats calculations.
 */

import { z } from 'zod'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from './paths'
import { readContext, ConnectionTrackerSchema } from './context'

// ─── Zod Schemas (D0) ──────────────────────────────────────────────────────

const FollowUpSchema = z.object({
  due: z.string().default(''),
  type: z.enum(['initial', 'post-apply', 'post-interview', 'negotiation']).default('post-apply'),
  status: z.enum(['pending', 'sent', 'skipped', 'dismissed', 'auto-resolved']).default('pending'),
  message_summary: z.string().default(''),
})

const ApplicationSchema = z.object({
  id: z.string().default(''),
  company: z.string().default(''),
  role: z.string().default(''),
  status: z.enum([
    'researching', 'applied', 'phone-screen', 'onsite', 'offer', 'rejected', 'withdrawn',
  ]).default('researching'),
  applied_date: z.string().default(''),
  jd_source: z.string().default(''),
  resume_version: z.string().default(''),
  fit_score: z.number().min(0).max(100).default(0),
  follow_ups: z.array(FollowUpSchema).default([]),
  notes: z.string().default(''),
})

const ApplicationsFileSchema = z.object({
  applications: z.array(ApplicationSchema).default([]),
})

const InterviewFollowUpSchema = z.object({
  due: z.string().default(''),
  type: z.string().default(''),
  status: z.enum(['pending', 'sent', 'skipped', 'dismissed', 'auto-resolved']).default('pending'),
})

const InterviewSchema = z.object({
  id: z.string().default(''),
  company: z.string().default(''),
  role: z.string().default(''),
  round: z.enum([
    'phone-screen', 'technical', 'system-design', 'behavioral', 'hiring-manager', 'team-match',
  ]).default('phone-screen'),
  date: z.string().default(''),
  time: z.string().default(''),
  interviewer: z.string().default('unknown'),
  prep_status: z.enum(['not-started', 'in-progress', 'ready']).default('not-started'),
  prep_package: z.string().default(''),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).default('scheduled'),
  debrief: z.string().default(''),
  score: z.number().min(0).max(100).default(0),
  follow_ups: z.array(InterviewFollowUpSchema).default([]),
})

const InterviewsFileSchema = z.object({
  interviews: z.array(InterviewSchema).default([]),
})

const CompSchema = z.object({
  base: z.number().default(0),
  equity: z.number().default(0),
  equity_type: z.enum(['RSU', 'ISO', 'options']).default('RSU'),
  vesting: z.string().default(''),
  bonus: z.number().default(0),
  sign_on: z.number().default(0),
})

const OfferSchema = z.object({
  id: z.string().default(''),
  company: z.string().default(''),
  role: z.string().default(''),
  date_received: z.string().default(''),
  status: z.enum(['received', 'negotiating', 'accepted', 'declined', 'expired']).default('received'),
  comp: CompSchema.default({
    base: 0, equity: 0, equity_type: 'RSU', vesting: '', bonus: 0, sign_on: 0,
  }),
  market_percentile: z.number().min(0).max(100).default(0),
  salary_research: z.string().default(''),
  negotiation: z.string().default(''),
  deadline: z.string().default(''),
})

const OffersFileSchema = z.object({
  offers: z.array(OfferSchema).default([]),
})

// ─── Exported Types ─────────────────────────────────────────────────────────

export type Application = z.infer<typeof ApplicationSchema>
export type FollowUp = z.infer<typeof FollowUpSchema>
export type Interview = z.infer<typeof InterviewSchema>
export type Offer = z.infer<typeof OfferSchema>

export interface NewApplication {
  company: string
  role: string
  status?: Application['status']
  jd_source?: string
  fit_score?: number
  notes?: string
}

export interface PipelineStats {
  total: number
  byStatus: Record<string, number>
  responseRate: number
  averageFitScore: number
}

export interface UrgencyItem {
  id: string
  company: string
  role: string
  type: 'overdue' | 'today' | 'upcoming'
  due: string
  followUpType: string
  status: string
}

export interface UrgencyItems {
  overdue: UrgencyItem[]
  today: UrgencyItem[]
  upcoming: UrgencyItem[]
}

// ─── Path Helpers ───────────────────────────────────────────────────────────

function pipelineDir(): string {
  const dir = join(getSearchDir(), 'pipeline')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function applicationsPath(): string {
  return join(pipelineDir(), 'applications.yaml')
}

function interviewsPath(): string {
  return join(pipelineDir(), 'interviews.yaml')
}

function offersPath(): string {
  return join(pipelineDir(), 'offers.yaml')
}

// ─── Parse Functions ────────────────────────────────────────────────────────

export async function parseApplications(): Promise<Application[]> {
  const fp = applicationsPath()
  if (!existsSync(fp)) return []

  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'))
    const parsed = ApplicationsFileSchema.parse(raw ?? {})
    return parsed.applications
  } catch {
    return []
  }
}

export async function parseInterviews(): Promise<Interview[]> {
  const fp = interviewsPath()
  if (!existsSync(fp)) return []

  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'))
    const parsed = InterviewsFileSchema.parse(raw ?? {})
    return parsed.interviews
  } catch {
    return []
  }
}

export async function parseOffers(): Promise<Offer[]> {
  const fp = offersPath()
  if (!existsSync(fp)) return []

  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'))
    const parsed = OffersFileSchema.parse(raw ?? {})
    return parsed.offers
  } catch {
    return []
  }
}

// ─── Write Helpers ──────────────────────────────────────────────────────────

async function writeApplications(apps: Application[]): Promise<void> {
  const validated = ApplicationsFileSchema.parse({ applications: apps })
  writeFileSync(applicationsPath(), YAML.stringify(validated))
}

// ─── CRUD Operations ────────────────────────────────────────────────────────

function generateId(apps: Application[]): string {
  const maxNum = apps.reduce((max, a) => {
    const match = a.id.match(/^app-(\d+)$/)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  return `app-${String(maxNum + 1).padStart(3, '0')}`
}

function generateFollowUps(appliedDate: string): FollowUp[] {
  const base = appliedDate ? new Date(appliedDate) : new Date()
  const followUps: FollowUp[] = []

  for (const days of [7, 14, 21]) {
    const due = new Date(base)
    due.setDate(due.getDate() + days)
    followUps.push({
      due: due.toISOString().split('T')[0],
      type: 'post-apply',
      status: 'pending',
      message_summary: days === 7
        ? 'Initial follow-up'
        : days === 14
          ? 'Second follow-up'
          : 'Final follow-up',
    })
  }

  return followUps
}

export async function addApplication(input: NewApplication): Promise<Application> {
  const apps = await parseApplications()
  const id = generateId(apps)
  const appliedDate = new Date().toISOString().split('T')[0]

  const app: Application = ApplicationSchema.parse({
    id,
    company: input.company,
    role: input.role,
    status: input.status || 'researching',
    applied_date: appliedDate,
    jd_source: input.jd_source || 'pasted',
    resume_version: '',
    fit_score: input.fit_score || 0,
    follow_ups: generateFollowUps(appliedDate),
    notes: input.notes || '',
  })

  apps.push(app)
  await writeApplications(apps)
  return app
}

export async function updateApplication(
  id: string,
  field: string,
  value: unknown,
): Promise<Application> {
  const apps = await parseApplications()
  const idx = apps.findIndex((a) => a.id === id)
  if (idx === -1) throw new Error(`Application not found: ${id}`)

  const app = apps[idx]

  if (field === 'status') {
    app.status = value as Application['status']
  } else if (field === 'notes') {
    app.notes = value as string
  } else if (field === 'fit_score') {
    app.fit_score = value as number
  } else if (field === 'resume_version') {
    app.resume_version = value as string
  } else if (field === 'follow_ups') {
    app.follow_ups = value as FollowUp[]
  } else {
    // Generic field update
    (app as Record<string, unknown>)[field] = value
  }

  // Re-validate
  apps[idx] = ApplicationSchema.parse(app)
  await writeApplications(apps)
  return apps[idx]
}

// ─── Stats & Urgency ────────────────────────────────────────────────────────

export async function getPipelineStats(): Promise<PipelineStats> {
  const apps = await parseApplications()

  const byStatus: Record<string, number> = {}
  let fitScoreSum = 0
  let fitScoreCount = 0
  let responded = 0

  for (const app of apps) {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1
    if (app.fit_score > 0) {
      fitScoreSum += app.fit_score
      fitScoreCount++
    }
    if (['phone-screen', 'onsite', 'offer', 'rejected'].includes(app.status)) {
      responded++
    }
  }

  return {
    total: apps.length,
    byStatus,
    responseRate: apps.length > 0 ? Math.round((responded / apps.length) * 100) : 0,
    averageFitScore: fitScoreCount > 0 ? Math.round(fitScoreSum / fitScoreCount) : 0,
  }
}

/**
 * Get networking follow-ups from connection-tracker.yaml.
 * Returns UrgencyItem[] for follow-ups due or overdue.
 */
export async function getNetworkingFollowUps(): Promise<UrgencyItem[]> {
  try {
    const tracker = (await readContext('connection-tracker')) as z.infer<typeof ConnectionTrackerSchema>
    const contacts = tracker?.contacts ?? []
    const items: UrgencyItem[] = []

    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const weekFromNow = new Date(now)
    weekFromNow.setDate(weekFromNow.getDate() + 7)
    const weekStr = weekFromNow.toISOString().split('T')[0]

    for (const contact of contacts) {
      if (!contact.follow_ups) continue

      for (const fu of contact.follow_ups) {
        if (fu.status !== 'pending') continue
        if (!fu.due) continue

        let urgencyType: 'overdue' | 'today' | 'upcoming' = 'upcoming'
        if (fu.due < todayStr) {
          urgencyType = 'overdue'
        } else if (fu.due === todayStr) {
          urgencyType = 'today'
        } else if (fu.due > weekStr) {
          continue // Skip items beyond a week
        }

        items.push({
          id: contact.id,
          company: contact.company,
          role: `${contact.name} (${contact.role})`,
          type: urgencyType,
          due: fu.due,
          followUpType: fu.type,
          status: contact.relationship,
        })
      }
    }

    return items
  } catch {
    return []
  }
}

export async function getUrgencyItems(): Promise<UrgencyItems> {
  const apps = await parseApplications()
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const weekFromNow = new Date(now)
  weekFromNow.setDate(weekFromNow.getDate() + 7)
  const weekStr = weekFromNow.toISOString().split('T')[0]

  const result: UrgencyItems = { overdue: [], today: [], upcoming: [] }

  for (const app of apps) {
    // Skip terminal statuses
    if (['rejected', 'withdrawn', 'offer'].includes(app.status)) continue

    for (const fu of app.follow_ups) {
      if (fu.status !== 'pending') continue
      if (!fu.due) continue

      const item: UrgencyItem = {
        id: app.id,
        company: app.company,
        role: app.role,
        type: 'upcoming',
        due: fu.due,
        followUpType: fu.type,
        status: app.status,
      }

      if (fu.due < todayStr) {
        item.type = 'overdue'
        result.overdue.push(item)
      } else if (fu.due === todayStr) {
        item.type = 'today'
        result.today.push(item)
      } else if (fu.due <= weekStr) {
        item.type = 'upcoming'
        result.upcoming.push(item)
      }
    }
  }

  // Integrate networking follow-ups
  const networkingItems = await getNetworkingFollowUps()
  for (const item of networkingItems) {
    if (item.type === 'overdue') {
      result.overdue.push(item)
    } else if (item.type === 'today') {
      result.today.push(item)
    } else {
      result.upcoming.push(item)
    }
  }

  // Sort by date
  result.overdue.sort((a, b) => a.due.localeCompare(b.due))
  result.today.sort((a, b) => a.company.localeCompare(b.company))
  result.upcoming.sort((a, b) => a.due.localeCompare(b.due))

  return result
}
