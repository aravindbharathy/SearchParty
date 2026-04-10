/**
 * lib/context.ts — Context file helpers with Zod validation
 *
 * Provides read/write/validate for all 6 context YAML files.
 * File-level locking with .lock files and 5-second timeout.
 */

import { z } from 'zod'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from './paths'

// ─── Zod Schemas (D1) ──────────────────────────────────────────────────────

const StarStorySchema = z.object({
  situation: z.string().default(''),
  task: z.string().default(''),
  action: z.string().default(''),
  result: z.string().default(''),
})

const ProjectSchema = z.object({
  name: z.string().default(''),
  metrics: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  star_stories: z.array(StarStorySchema).default([]),
})

const ExperienceEntrySchema = z.object({
  id: z.string().default(''),
  company: z.string().default(''),
  role: z.string().default(''),
  dates: z.string().default(''),
  projects: z.array(ProjectSchema).default([]),
})

const EducationSchema = z.object({
  institution: z.string().default(''),
  degree: z.string().default(''),
  field: z.string().default(''),
  year: z.string().default(''),
})

const TechnicalSkillSchema = z.object({
  name: z.string().default(''),
  proficiency: z.enum(['expert', 'advanced', 'intermediate', 'beginner']).default('intermediate'),
  years: z.number().default(0),
})

const ContactSchema = z.object({
  name: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  linkedin: z.string().default(''),
  location: z.string().default(''),
})

export const ExperienceLibrarySchema = z.object({
  contact: ContactSchema.default({ name: '', email: '', phone: '', linkedin: '', location: '' }),
  summary: z.string().default(''),
  experiences: z.array(ExperienceEntrySchema).default([]),
  education: z.array(EducationSchema).default([]),
  certifications: z.array(z.string()).default([]),
  skills: z.object({
    technical: z.array(TechnicalSkillSchema).default([]),
    leadership: z.array(z.union([
      z.string(),
      TechnicalSkillSchema,
    ])).default([]),
  }).default({ technical: [], leadership: [] }),
})

const ResumePreferencesSchema = z.object({
  format: z.string().default(''),
  summary_length: z.string().default(''),
  tone: z.string().default(''),
  avoid_words: z.array(z.string()).default([]),
})

const AddressingWeaknessSchema = z.object({
  weakness: z.string().default(''),
  mitigation: z.string().default(''),
})

export const CareerPlanSchema = z.object({
  target: z.object({
    level: z.string().default(''),
    functions: z.array(z.string()).default([]),
    industries: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
    comp_floor: z.number().default(0),
  }).default({ level: '', functions: [], industries: [], locations: [], comp_floor: 0 }),
  deal_breakers: z.array(z.string()).default([]),
  addressing_weaknesses: z.array(AddressingWeaknessSchema).default([]),
  resume_preferences: ResumePreferencesSchema.default({ format: '', summary_length: '', tone: '', avoid_words: [] }),
  work_style: z.object({
    environment: z.string().default(''),
    team_size: z.string().default(''),
    pace: z.string().default(''),
    autonomy: z.string().default(''),
  }).default({ environment: '', team_size: '', pace: '', autonomy: '' }),
  role_preferences: z.object({
    track: z.string().default(''),
    hands_on_vs_strategic: z.string().default(''),
    scope: z.string().default(''),
  }).default({ track: '', hands_on_vs_strategic: '', scope: '' }),
  what_matters: z.array(z.string()).default([]),
  culture_preferences: z.object({
    company_stage: z.string().default(''),
    culture_style: z.string().default(''),
    values: z.array(z.string()).default([]),
  }).default({ company_stage: '', culture_style: '', values: [] }),
  motivation: z.object({
    why_searching: z.string().default(''),
    dream_role: z.string().default(''),
    non_negotiables: z.array(z.string()).default([]),
  }).default({ why_searching: '', dream_role: '', non_negotiables: [] }),
})

const CustomQASchema = z.object({
  q: z.string().default(''),
  a: z.string().default(''),
})

export const QAMasterSchema = z.object({
  salary_expectations: z.string().default(''),
  why_leaving: z.string().default(''),
  greatest_weakness: z.string().default(''),
  visa_status: z.string().default(''),
  custom_qa: z.array(CustomQASchema).default([]),
})

const CompanySchema = z.object({
  name: z.string().default(''),
  slug: z.string().default(''),
  fit_score: z.number().nullable().default(null).transform(v => v ?? 0),
  status: z.string().default('researching'),
  priority: z.string().nullable().default('medium').transform(v => v ?? 'medium'),
  notes: z.string().default(''),
}).passthrough()  // allow extra fields agents might write (category, location, etc.)

export const TargetCompaniesSchema = z.object({
  companies: z.array(CompanySchema).default([]),
})

const OutreachSchema = z.object({
  date: z.string().default(''),
  type: z.enum(['connection-request', 'referral-request', 'follow-up']).default('connection-request'),
  status: z.enum(['sent', 'replied', 'no-response']).default('sent'),
  message_summary: z.string().default(''),
})

const FollowUpSchema = z.object({
  due: z.string().default(''),
  type: z.enum(['connection-nudge', 'referral-step-2', 'referral-step-3']).default('connection-nudge'),
  outreach_ref: z.string().default(''),
  status: z.enum(['pending', 'sent', 'skipped', 'dismissed', 'auto-resolved']).default('pending'),
})

const ConnectionSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  company: z.string().default(''),
  role: z.string().default(''),
  relationship: z.string().default('cold'),  // cold, connected, warm, referred, close, mentor
  how_you_know: z.string().default(''),      // former colleague, met at conference, alumni, etc.
  mutual_connections: z.string().default(''), // people who connect you
  their_team: z.string().default(''),        // which team/org they're on
  can_help_with: z.string().default(''),     // referral, company intel, intro to HM, etc.
  their_interests: z.string().default(''),   // topics to reference when reaching out
  last_interaction: z.string().default(''),  // when and what you last talked about
  linkedin_url: z.string().default(''),
  email: z.string().default(''),
  outreach: z.array(OutreachSchema).default([]),
  follow_ups: z.array(FollowUpSchema).default([]),
  notes: z.string().default(''),
}).passthrough()  // allow extra fields agents might add

export const ConnectionTrackerSchema = z.object({
  contacts: z.array(ConnectionSchema).default([]),
})

const PatternsSchema = z.object({
  strong_areas: z.array(z.string()).default([]),
  weak_areas: z.array(z.string()).default([]),
  avg_score: z.number().default(0),
  total_interviews: z.number().default(0),
})

export const InterviewHistorySchema = z.object({
  interviews: z.array(z.record(z.string(), z.unknown())).default([]),
  patterns: PatternsSchema.default({ strong_areas: [], weak_areas: [], avg_score: 0, total_interviews: 0 }),
})

// ─── Schema Map ─────────────────────────────────────────────────────────────

export const CONTEXT_FILES = {
  'experience-library': {
    schema: ExperienceLibrarySchema,
    filename: 'experience-library.yaml',
    label: 'Your Background',
    description: 'Your work history, skills, and STAR stories',
  },
  'career-plan': {
    schema: CareerPlanSchema,
    filename: 'career-plan.yaml',
    label: 'What You\'re Looking For',
    description: 'Target roles, industries, and preferences',
  },
  'qa-master': {
    schema: QAMasterSchema,
    filename: 'qa-master.yaml',
    label: 'Your Story',
    description: 'Common interview Q&A and personal details',
  },
  'target-companies': {
    schema: TargetCompaniesSchema,
    filename: 'target-companies.yaml',
    label: 'Target Companies',
    description: 'Companies you are targeting or tracking',
  },
  'connection-tracker': {
    schema: ConnectionTrackerSchema,
    filename: 'connection-tracker.yaml',
    label: 'Your Network',
    description: 'Networking contacts and outreach history',
  },
  'interview-history': {
    schema: InterviewHistorySchema,
    filename: 'interview-history.yaml',
    label: 'Interview Journal',
    description: 'Past interviews, scores, and patterns',
  },
} as const

export type ContextName = keyof typeof CONTEXT_FILES

// ─── Helpers ────────────────────────────────────────────────────────────────

function contextDir(): string {
  const dir = join(getSearchDir(), 'context')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function contextPath(name: ContextName): string {
  return join(contextDir(), CONTEXT_FILES[name].filename)
}

function lockPath(name: ContextName): string {
  return join(contextDir(), `${CONTEXT_FILES[name].filename}.lock`)
}

// ─── File-Level Locking ─────────────────────────────────────────────────────

const LOCK_TIMEOUT_MS = 5000

export async function acquireLock(name: ContextName): Promise<() => void> {
  const lp = lockPath(name)
  const start = Date.now()

  while (true) {
    try {
      // Check for stale lock
      if (existsSync(lp)) {
        const stat = statSync(lp)
        const age = Date.now() - stat.mtimeMs
        if (age > LOCK_TIMEOUT_MS) {
          // Stale lock — remove it
          try { unlinkSync(lp) } catch { /* race condition ok */ }
        }
      }

      if (!existsSync(lp)) {
        writeFileSync(lp, `${process.pid}:${Date.now()}`, { flag: 'wx' })
        return () => {
          try { unlinkSync(lp) } catch { /* already removed */ }
        }
      }
    } catch {
      // wx flag throws if file exists — that's expected
    }

    if (Date.now() - start > LOCK_TIMEOUT_MS) {
      // Force-acquire after timeout
      try { unlinkSync(lp) } catch { /* ok */ }
      writeFileSync(lp, `${process.pid}:${Date.now()}`)
      return () => {
        try { unlinkSync(lp) } catch { /* ok */ }
      }
    }

    await new Promise(r => setTimeout(r, 50))
  }
}

// ─── Read / Write / Status ──────────────────────────────────────────────────

export async function readContext(name: ContextName): Promise<z.infer<(typeof CONTEXT_FILES)[typeof name]['schema']>> {
  const fp = contextPath(name)
  const schema = CONTEXT_FILES[name].schema

  if (!existsSync(fp)) {
    // Return default empty structure
    return schema.parse({}) as z.infer<(typeof CONTEXT_FILES)[typeof name]['schema']>
  }

  const raw = readFileSync(fp, 'utf-8')
  const parsed = YAML.parse(raw)

  if (!parsed || typeof parsed !== 'object') {
    return schema.parse({}) as z.infer<(typeof CONTEXT_FILES)[typeof name]['schema']>
  }

  return schema.parse(parsed) as z.infer<(typeof CONTEXT_FILES)[typeof name]['schema']>
}

export async function writeContext(name: ContextName, data: unknown): Promise<void> {
  const schema = CONTEXT_FILES[name].schema
  const validated = schema.parse(data)

  const release = await acquireLock(name)
  try {
    const fp = contextPath(name)
    writeFileSync(fp, YAML.stringify(validated))
  } finally {
    release()
  }
}

export async function isContextFilled(name: ContextName): Promise<boolean> {
  const fp = contextPath(name)
  if (!existsSync(fp)) return false

  try {
    const raw = readFileSync(fp, 'utf-8')
    const parsed = YAML.parse(raw)
    if (!parsed || typeof parsed !== 'object') return false

    // Check for meaningful content based on file type
    switch (name) {
      case 'experience-library':
        // Requires actual experiences AND skills — contact/summary alone is incomplete
        const hasExperiences = Array.isArray(parsed.experiences) && parsed.experiences.length > 0
        const hasSkills = parsed.skills?.technical?.length > 0 || parsed.skills?.leadership?.length > 0
        return hasExperiences && hasSkills
      case 'career-plan':
        return !!(parsed.target?.level || (parsed.target?.functions?.length > 0))
      case 'qa-master':
        return !!(parsed.salary_expectations || parsed.why_leaving || parsed.greatest_weakness)
      case 'target-companies':
        return Array.isArray(parsed.companies) && parsed.companies.length > 0
      case 'connection-tracker':
        return Array.isArray(parsed.contacts) && parsed.contacts.length > 0
      case 'interview-history':
        return Array.isArray(parsed.interviews) && parsed.interviews.length > 0
      default:
        return false
    }
  } catch {
    return false
  }
}

export async function getContextFreshness(name: ContextName): Promise<{
  filled: boolean
  lastModified: Date | null
}> {
  const fp = contextPath(name)
  const filled = await isContextFilled(name)

  if (!existsSync(fp)) {
    return { filled, lastModified: null }
  }

  try {
    const stat = statSync(fp)
    return { filled, lastModified: stat.mtime }
  } catch {
    return { filled, lastModified: null }
  }
}

export async function getAllContextStatus(): Promise<
  Record<ContextName, { filled: boolean; lastModified: Date | null }>
> {
  const result = {} as Record<ContextName, { filled: boolean; lastModified: Date | null }>

  for (const name of Object.keys(CONTEXT_FILES) as ContextName[]) {
    result[name] = await getContextFreshness(name)
  }

  return result
}
