/**
 * Structured resume data format.
 * The agent generates content in this structure.
 * The editor lets users modify it inline.
 * The template renders it as a visual resume.
 * PDF export converts the rendered template.
 */

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
  keywords?: string[] // highlighted JD keyword matches
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

export interface ResumeData {
  id: string
  target_company: string
  target_role: string
  template: 'clean' | 'modern' | 'traditional'
  contact: ResumeContact
  summary: string
  experiences: ResumeExperience[]
  skills: {
    technical: string[]
    leadership: string[]
    other?: string[]
  }
  education: ResumeEducation[]
  certifications: string[]
  keyword_coverage: number // percentage match against JD
  version: number
  created_at: string
  updated_at: string
}

export function emptyResume(): ResumeData {
  return {
    id: `resume-${Date.now()}`,
    target_company: '',
    target_role: '',
    template: 'clean',
    contact: { name: '', email: '', phone: '', linkedin: '', location: '' },
    summary: '',
    experiences: [],
    skills: { technical: [], leadership: [] },
    education: [],
    certifications: [],
    keyword_coverage: 0,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}
