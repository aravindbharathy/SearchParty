/**
 * Structured resume data format — Section-based architecture (v2).
 *
 * Contact is always at the top. Everything else is an ordered section.
 * Sections can be added, removed, reordered by both users and agents.
 * Templates render sections in array order via dispatch.
 */

// ─── Shared primitives ─────────────────────────────────────────────────────

export interface ResumeContact {
  name: string
  email: string
  phone: string
  linkedin: string
  location: string
  website?: string
}

export interface ResumeBullet {
  text: string
  keywords?: string[]
}

export interface ResumeExperience {
  company: string
  role: string
  dates: string
  location?: string
  bullets: ResumeBullet[]
}

export interface ResumeEducation {
  institution: string
  degree: string
  field: string
  year: string
  gpa?: string
}

export interface ResumePublication {
  title: string
  venue: string
  date: string
  url?: string
}

export interface ResumeProject {
  name: string
  description: string
  technologies?: string[]
  url?: string
  bullets: ResumeBullet[]
}

export interface SkillGroup {
  label: string
  items: string[]
}

// ─── Section types (discriminated union) ────────────────────────────────────

export type SectionType = 'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'publications' | 'projects' | 'custom'

interface SectionBase {
  id: string
  type: SectionType
  title: string
}

export interface SummarySection extends SectionBase {
  type: 'summary'
  text: string
}

export interface ExperienceSection extends SectionBase {
  type: 'experience'
  entries: ResumeExperience[]
}

export interface EducationSection extends SectionBase {
  type: 'education'
  entries: ResumeEducation[]
}

export interface SkillsSection extends SectionBase {
  type: 'skills'
  groups: SkillGroup[]
}

export interface CertificationsSection extends SectionBase {
  type: 'certifications'
  items: string[]
}

export interface PublicationsSection extends SectionBase {
  type: 'publications'
  entries: ResumePublication[]
}

export interface ProjectsSection extends SectionBase {
  type: 'projects'
  entries: ResumeProject[]
}

export interface CustomSection extends SectionBase {
  type: 'custom'
  content: string
}

export type ResumeSection =
  | SummarySection
  | ExperienceSection
  | EducationSection
  | SkillsSection
  | CertificationsSection
  | PublicationsSection
  | ProjectsSection
  | CustomSection

// ─── Resume data ────────────────────────────────────────────────────────────

export interface ResumeData {
  id: string
  target_company: string
  target_role: string
  template: string
  contact: ResumeContact
  sections: ResumeSection[]
  keyword_coverage: number
  version: number
  schema_version: number
  created_at: string
  updated_at: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let _counter = 0
export function genSectionId(): string {
  return `sec-${Date.now()}-${(++_counter).toString(36)}`
}

export function defaultSection(type: SectionType): ResumeSection {
  const id = genSectionId()
  switch (type) {
    case 'summary': return { id, type, title: 'Summary', text: '' }
    case 'experience': return { id, type, title: 'Experience', entries: [] }
    case 'education': return { id, type, title: 'Education', entries: [] }
    case 'skills': return { id, type, title: 'Skills', groups: [{ label: 'Technical', items: [] }, { label: 'Leadership', items: [] }] }
    case 'certifications': return { id, type, title: 'Certifications', items: [] }
    case 'publications': return { id, type, title: 'Publications', entries: [] }
    case 'projects': return { id, type, title: 'Projects', entries: [] }
    case 'custom': return { id, type, title: 'Additional', content: '' }
  }
}

export function emptyResume(): ResumeData {
  return {
    id: `resume-${Date.now()}`,
    target_company: '',
    target_role: '',
    template: 'clean',
    contact: { name: '', email: '', phone: '', linkedin: '', location: '' },
    sections: [
      defaultSection('summary'),
      defaultSection('experience'),
      defaultSection('education'),
      defaultSection('skills'),
    ],
    keyword_coverage: 0,
    version: 1,
    schema_version: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// ─── Migration (v1 fixed fields → v2 sections array) ───────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateResume(raw: any): ResumeData {
  // Already v2
  if (raw?.schema_version === 2 && Array.isArray(raw.sections)) {
    return raw as ResumeData
  }

  // v1 → v2: convert fixed fields to sections array
  const sections: ResumeSection[] = []

  if (raw.summary) {
    sections.push({ id: genSectionId(), type: 'summary', title: 'Summary', text: raw.summary })
  }
  if (Array.isArray(raw.experiences) && raw.experiences.length > 0) {
    sections.push({ id: genSectionId(), type: 'experience', title: 'Experience', entries: raw.experiences })
  }
  if (raw.skills) {
    const groups: SkillGroup[] = []
    if (Array.isArray(raw.skills.technical) && raw.skills.technical.length > 0) {
      groups.push({ label: 'Technical', items: raw.skills.technical })
    }
    if (Array.isArray(raw.skills.leadership) && raw.skills.leadership.length > 0) {
      groups.push({ label: 'Leadership', items: raw.skills.leadership })
    }
    if (Array.isArray(raw.skills.other) && raw.skills.other.length > 0) {
      groups.push({ label: 'Other', items: raw.skills.other })
    }
    if (groups.length > 0) {
      sections.push({ id: genSectionId(), type: 'skills', title: 'Skills', groups })
    }
  }
  if (Array.isArray(raw.education) && raw.education.length > 0) {
    sections.push({ id: genSectionId(), type: 'education', title: 'Education', entries: raw.education })
  }
  if (Array.isArray(raw.certifications) && raw.certifications.length > 0) {
    sections.push({ id: genSectionId(), type: 'certifications', title: 'Certifications', items: raw.certifications })
  }

  return {
    id: raw.id || `resume-${Date.now()}`,
    target_company: raw.target_company || '',
    target_role: raw.target_role || '',
    template: raw.template || 'clean',
    contact: raw.contact || { name: '', email: '', phone: '', linkedin: '', location: '' },
    sections,
    keyword_coverage: raw.keyword_coverage ?? 0,
    version: raw.version ?? 1,
    schema_version: 2,
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
  }
}

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  certifications: 'Certifications',
  publications: 'Publications',
  projects: 'Projects',
  custom: 'Custom Section',
}
