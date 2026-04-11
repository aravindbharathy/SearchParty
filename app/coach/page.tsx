'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { MarkdownView } from '../_components/markdown-view'
import { useAgentEvents } from '../hooks/use-agent-events'
import { useDirectiveNotifications } from '../hooks/use-directive-notifications'
import { usePendingAction } from '../hooks/use-pending-action'
import { DirectiveBanner } from '../_components/directive-banner'
import type { ProfileStatusResponse, ProfileSectionStatus } from '../types/context'

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

// Keywords ordered from most specific to least — matched in section order (first wins)
const SECTION_KEYWORDS: Record<SectionKey, string[]> = {
  'experience-library': ['your background', 'experience library', 'experience entries', 'work history', 'let\'s start with experience', 'start with your experience', 'parse your resume', 'star stor', 'each role'],
  'career-plan': ['what you\'re looking for', 'career plan', 'career targets', 'target level', 'what level', 'deal breaker', 'comp floor', 'minimum comp'],
  'qa-master': ['your story', 'q&a master', 'q&a prep', 'salary expectation', 'why are you leaving', 'greatest weakness', 'visa status', 'tough interview question'],
  'target-companies': ['target companies', 'company list', 'which companies', 'companies you want'],
  'connection-tracker': ['your network', 'connection tracker', 'existing contacts', 'contacts at target', 'know anyone at'],
}

const ONBOARDING_DIRECTIVE = `You are onboarding a new Search Party user. Your job is to walk them through setting up their complete job search profile.

IMPORTANT: First, run this command: cat .claude/skills/setup/SKILL.md — it contains detailed instructions for each section including what questions to ask, how to push for specifics, what schemas to use, and how to write the YAML files. Follow those instructions closely along with the phase guide below.

## Onboarding Flow — Start Easy, Go Deep

Start with quick, easy questions to build momentum. Save the deep-dive for later.

### Phase 1: Quick Setup (5 min) — get the basics locked in fast
Start with a brief, warm greeting — introduce yourself as their career coach and explain you'll help build their profile. Keep it to 2-3 sentences max, then immediately get to work. Check search/vault/resumes/ for resume files.

IF A RESUME EXISTS: Parse it IMMEDIATELY using the Read tool. Extract name, email, phone, LinkedIn, location, and a summary of roles. Then present what you found and ask the user to CONFIRM:
"I found your resume and extracted these details — let me know if anything needs correcting:
- Name: {extracted}
- Email: {extracted}
- Phone: {extracted}
- LinkedIn: {extracted}
- Location: {extracted}
- Current/recent role: {extracted}"

WRITE the extracted contact info to search/context/experience-library.yaml right away (don't wait for confirmation — user can correct later).

Then move to the career plan questions:
1. "What role are you targeting? (e.g., Senior PM, Staff Engineer, Research Manager)"
2. "What level? (e.g., Senior, Staff, Principal, Manager)"
3. "What industries interest you?" (give examples: SaaS, FinTech, AI/ML, DevTools)
4. "What's your minimum total comp?"
5. "Remote, hybrid, or in-person?"
6. "IC track, management track, or open to either?"

IF NO RESUME: Ask the basics ONE at a time:
1. "What's your full name?"
2. "Email and phone number?"
3. "LinkedIn URL?"
4. "Where are you based?"
Then continue with the career plan questions above.

CRITICAL — WRITE FILES AFTER EVERY USER RESPONSE:
Before asking the next question, you MUST use the Write tool to save what you've learned so far.
- After getting name/email/phone/linkedin/location → Write to search/context/experience-library.yaml (contact section)
- After getting role/level/industries/comp/remote/track → Write to search/context/career-plan.yaml (target section)
- Do NOT wait until the end. Write INCREMENTALLY after each response.
- The user sees the profile panel update in real-time — this is critical for their experience.

### Phase 2: What Matters (5 min) — preferences that shape the search
11. "What matters most to you? Rank these: impact, learning, compensation, growth, work-life balance, team quality"
12. "Any deal breakers?" (things that would make you reject an offer)
13. "Do you prefer startups, growth-stage, or enterprise companies?"
14. "What are you moving TOWARD in your next role?" (not just what you're leaving)

BEFORE asking the next question, WRITE to search/context/career-plan.yaml with the updated work_style, what_matters, culture_preferences, motivation fields.

### Phase 3: Your Story (5 min) — interview prep answers
15. "What are your salary expectations? (range is fine)"
16. "Why are you leaving your current role?" — help them frame it positively
17. "What would you say is your greatest weakness?" — help craft a genuine answer
18. "Visa status?" (if applicable)

BEFORE asking the next question, WRITE to search/context/qa-master.yaml with whatever answers you have so far.

### Phase 4: Resume Deep-Dive (10 min) — now go deep
Check search/vault/resumes/ for uploaded files. If found, parse the most recent one.
For EACH role in their resume:
- Push for specific metrics: "What was the revenue impact?" "How many users?"
- Ask for team size and scope
- Build STAR stories for key accomplishments
- Don't accept vague bullets — ask "by how much?" "what changed?"

After EACH role discussion, WRITE the updated experiences to search/context/experience-library.yaml. Don't wait for all roles.

### Phase 5: Network & Companies (5 min) — optional, can skip
19. Target companies — suggest based on career plan, or let them list their own
20. Connections — contacts at target companies (optional)

WRITE to search/context/target-companies.yaml and search/context/connection-tracker.yaml.

## Key Rules
- Ask ONE question at a time — never dump a list of 5 questions
- WRITE to context files after each phase, not just at the end
- Show progress: "Great, your basic profile is saved. Now let's dig deeper."
- If they want to skip ahead, let them — but note what's missing
- Use the exact YAML schemas from the SKILL.md file`

const COMPANION_DIRECTIVE = `You are the Career Coach for a Search Party user who has already completed onboarding. Read the blackboard and context files in search/context/.

Greet the user, briefly summarize their search status (pipeline stats, recent activity), and ask what they'd like to work on today.

You can help with:
- Updating their profile (any of the 5 context sections)
- Reviewing job search strategy
- Prepping for upcoming interviews
- Refining their resume or cover letter approach
- Networking strategy
- Any job search question

Read search/pipeline/applications.yaml and search/context/snapshot.yaml for current pipeline status. Be warm, practical, and proactive.`

// ─── Section detection ──────────────────────────────────────────────────────

function detectSection(text: string): SectionKey | null {
  const lower = text.toLowerCase()
  for (const key of SECTION_ORDER) {
    if (SECTION_KEYWORDS[key].some((kw) => lower.includes(kw))) {
      return key
    }
  }
  return null
}

// ─── Section Meta ──────────────────────────────────────────────────────────

const SECTION_META: Record<string, { icon: string; description: string; label: string }> = {
  'experience-library': { icon: '\uD83D\uDCCB', description: 'Work history, skills, education', label: 'Your Background' },
  'career-plan': { icon: '\uD83C\uDFAF', description: 'Target level, functions, industries, comp', label: "What You're Looking For" },
  'qa-master': { icon: '\uD83D\uDCAC', description: 'Salary, why leaving, weakness, visa', label: 'Your Story' },
  'target-companies': { icon: '\uD83C\uDFE2', description: 'Companies you want to work at', label: 'Target Companies' },
  'connection-tracker': { icon: '\uD83E\uDD1D', description: 'Contacts at target companies', label: 'Your Network' },
  'interview-history': { icon: '\uD83D\uDCDD', description: 'Auto-populated after interviews', label: 'Interview Journal' },
}

// ─── Badge Component ───────────────────────────────────────────────────────

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 bg-bg border border-border rounded-full text-xs font-medium">
      {children}
    </span>
  )
}

// ─── Context Preview Components ────────────────────────────────────────────

function ExperienceLibraryPreview({ data }: { data: Record<string, unknown> }) {
  const contact = (data.contact || {}) as Record<string, string>
  const experiences = (data.experiences as Array<Record<string, unknown>>) || []
  const education = (data.education as Array<Record<string, unknown>>) || []
  const skills = (data.skills || {}) as Record<string, unknown>
  const technical = (skills.technical as Array<Record<string, unknown>>) || []
  const leadership = (skills.leadership as unknown[]) || []

  if (!contact.name && experiences.length === 0 && technical.length === 0) {
    return <p className="text-xs text-text-muted italic">No data yet</p>
  }

  const contactParts = [contact.name, contact.email, contact.location].filter(Boolean)

  return (
    <div className="space-y-1 text-xs text-text-muted">
      {contactParts.length > 0 && (
        <p><span className="font-medium text-text">{contactParts.join(' \u00B7 ')}</span></p>
      )}
      <p>
        <Badge>{experiences.length} experience{experiences.length !== 1 ? 's' : ''}</Badge>
        {' '}
        <Badge>{education.length} degree{education.length !== 1 ? 's' : ''}</Badge>
        {' '}
        <Badge>{technical.length + leadership.length} skills</Badge>
      </p>
    </div>
  )
}

function CareerPlanPreview({ data }: { data: Record<string, unknown> }) {
  const target = (data.target || {}) as Record<string, unknown>
  const level = target.level as string
  const functions = (target.functions as string[]) || []
  const locations = (target.locations as string[]) || []
  const compFloor = target.comp_floor as number

  if (!level && functions.length === 0) {
    return <p className="text-xs text-text-muted italic">No data yet</p>
  }

  const parts = [level, ...functions].filter(Boolean)
  return (
    <div className="space-y-1 text-xs text-text-muted">
      <p>Target: <span className="font-medium text-text">{parts.join(' \u00B7 ')}</span></p>
      {locations.length > 0 && <p>Locations: <span className="font-medium text-text">{locations.join(', ')}</span></p>}
      {compFloor > 0 && <p>Min comp: <span className="font-medium text-text">${compFloor.toLocaleString()}</span></p>}
    </div>
  )
}

function QAMasterPreview({ data }: { data: Record<string, unknown> }) {
  const items = [
    { label: 'Salary', set: !!(data.salary_expectations as string) },
    { label: 'Why leaving', set: !!(data.why_leaving as string) },
    { label: 'Weakness', set: !!(data.greatest_weakness as string) },
    { label: 'Visa', set: !!(data.visa_status as string) },
  ]
  const customQA = (data.custom_qa as Array<Record<string, unknown>>) || []
  const anySet = items.some(i => i.set) || customQA.length > 0

  if (!anySet) return <p className="text-xs text-text-muted italic">No data yet</p>

  return (
    <div className="text-xs text-text-muted">
      <div className="flex flex-wrap gap-x-3">
        {items.map(item => (
          <span key={item.label}>
            {item.label}: {item.set ? <span className="text-text font-medium">(set)</span> : <span className="italic">(empty)</span>}
          </span>
        ))}
      </div>
      {customQA.length > 0 && <p className="mt-1"><Badge>{customQA.length} custom Q&amp;As</Badge></p>}
    </div>
  )
}

function TargetCompaniesPreview({ data }: { data: Record<string, unknown> }) {
  const companies = (data.companies as Array<Record<string, unknown>>) || []
  if (companies.length === 0) return <p className="text-xs text-text-muted italic">No companies yet</p>

  const top = [...companies].sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
    return (order[(a.priority as string) || 'low'] || 2) - (order[(b.priority as string) || 'low'] || 2)
  }).slice(0, 3).map(c => c.name as string)

  return (
    <div className="text-xs text-text-muted">
      <p><Badge>{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</Badge></p>
      <p className="mt-1">Top: <span className="font-medium text-text">{top.join(', ')}</span></p>
    </div>
  )
}

function ConnectionTrackerPreview({ data }: { data: Record<string, unknown> }) {
  const contacts = (data.contacts as Array<Record<string, unknown>>) || []
  if (contacts.length === 0) return <p className="text-xs text-text-muted italic">No contacts yet</p>

  const companies = new Set(contacts.map(c => c.company as string).filter(Boolean))
  return (
    <div className="text-xs text-text-muted">
      <p><Badge>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</Badge> across <Badge>{companies.size} compan{companies.size !== 1 ? 'ies' : 'y'}</Badge></p>
    </div>
  )
}

function InterviewHistoryPreview({ data }: { data: Record<string, unknown> }) {
  const interviews = (data.interviews as Array<Record<string, unknown>>) || []
  if (interviews.length === 0) {
    return <p className="text-xs text-text-muted italic">Will populate after interview debriefs</p>
  }
  return <p className="text-xs text-text-muted"><Badge>{interviews.length} interview{interviews.length !== 1 ? 's' : ''}</Badge></p>
}

function ContextPreviewCompact({ name, data }: { name: string; data: Record<string, unknown> }) {
  switch (name) {
    case 'experience-library': return <ExperienceLibraryPreview data={data} />
    case 'career-plan': return <CareerPlanPreview data={data} />
    case 'qa-master': return <QAMasterPreview data={data} />
    case 'target-companies': return <TargetCompaniesPreview data={data} />
    case 'connection-tracker': return <ConnectionTrackerPreview data={data} />
    case 'interview-history': return <InterviewHistoryPreview data={data} />
    default: return null
  }
}

/** Expanded view — shows detail NOT in the KeyInfoLine (avoids repetition) */
function ContextPreviewExpanded({ name, data }: { name: string; data: Record<string, unknown> }) {
  switch (name) {
    case 'experience-library': {
      const contact = (data.contact || {}) as Record<string, string>
      const experiences = (data.experiences as Array<Record<string, unknown>>) || []
      const education = (data.education as Array<Record<string, unknown>>) || []
      // KeyInfoLine shows: name · N roles · N skills — expanded shows contact details, role list, education
      const contactDetails = [contact.email, contact.location, contact.linkedin].filter(Boolean)
      return (
        <div className="space-y-1.5 text-xs text-text-muted">
          {contactDetails.length > 0 && <p>{contactDetails.join(' · ')}</p>}
          {experiences.length > 0 && (
            <div>
              {experiences.slice(0, 4).map((exp, i) => (
                <p key={i}><span className="font-medium text-text">{exp.role as string}</span> at {exp.company as string} <span className="text-text-muted">({exp.dates as string})</span></p>
              ))}
              {experiences.length > 4 && <p className="italic">+{experiences.length - 4} more</p>}
            </div>
          )}
          {education.length > 0 && <p>{education.map(ed => `${(ed.degree as string)} ${(ed.field as string)}, ${(ed.institution as string)}`).join(' · ')}</p>}
        </div>
      )
    }
    case 'career-plan': {
      const target = (data.target || {}) as Record<string, unknown>
      const locations = (target.locations as string[]) || []
      const dealBreakers = (data.deal_breakers as string[]) || []
      const workStyle = (data.work_style || {}) as Record<string, string>
      const motivation = (data.motivation || {}) as Record<string, unknown>
      // KeyInfoLine shows: level · functions · comp — expanded shows locations, deal breakers, work style, motivation
      return (
        <div className="space-y-1 text-xs text-text-muted">
          {locations.length > 0 && <p>Locations: <span className="font-medium text-text">{locations.join(', ')}</span></p>}
          {dealBreakers.length > 0 && <p>Deal breakers: {dealBreakers.join(', ')}</p>}
          {workStyle.environment && <p>Environment: {workStyle.environment}</p>}
          {(motivation.dream_role as string) && <p>Dream role: <span className="font-medium text-text">{motivation.dream_role as string}</span></p>}
        </div>
      )
    }
    case 'qa-master': {
      // KeyInfoLine shows: N/4 answered · Missing: X — expanded shows which are set with previews
      const items = [
        { label: 'Salary', value: data.salary_expectations as string },
        { label: 'Why leaving', value: data.why_leaving as string },
        { label: 'Weakness', value: data.greatest_weakness as string },
        { label: 'Visa', value: data.visa_status as string },
      ]
      const customQA = (data.custom_qa as Array<Record<string, unknown>>) || []
      return (
        <div className="text-xs text-text-muted space-y-1">
          {items.map(item => (
            <p key={item.label}>
              {item.label}: {item.value ? <span className="text-text">{item.value.length > 60 ? item.value.slice(0, 60) + '…' : item.value}</span> : <span className="italic">not set</span>}
            </p>
          ))}
          {customQA.length > 0 && <p><Badge>{customQA.length} custom Q&amp;As</Badge></p>}
        </div>
      )
    }
    case 'target-companies': {
      // KeyInfoLine shows: N companies — expanded shows top companies by priority
      const companies = (data.companies as Array<Record<string, unknown>>) || []
      if (companies.length === 0) return null
      const top = [...companies].sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
        return (order[(a.priority as string) || 'low'] || 2) - (order[(b.priority as string) || 'low'] || 2)
      }).slice(0, 5).map(c => c.name as string)
      return (
        <div className="text-xs text-text-muted">
          <p>Top: <span className="font-medium text-text">{top.join(', ')}</span></p>
        </div>
      )
    }
    case 'connection-tracker': {
      // KeyInfoLine shows: N contacts — expanded shows companies and recent contacts
      const contacts = (data.contacts as Array<Record<string, unknown>>) || []
      if (contacts.length === 0) return null
      const companies = [...new Set(contacts.map(c => c.company as string).filter(Boolean))]
      const recent = contacts.slice(0, 3)
      return (
        <div className="text-xs text-text-muted space-y-1">
          {companies.length > 0 && <p>At: <span className="font-medium text-text">{companies.slice(0, 5).join(', ')}{companies.length > 5 ? ` +${companies.length - 5}` : ''}</span></p>}
          {recent.map((c, i) => (
            <p key={i}>{c.name as string} — {c.role as string}{c.company ? `, ${c.company as string}` : ''}</p>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}

// ─── Edit Modal Components ─────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4">
        {children}
      </div>
    </div>
  )
}

function ExperienceLibraryEditor({ data, onSave, onCancel, saving, saveError }: {
  data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean; saveError: string | null
}) {
  const contact = (data.contact || {}) as Record<string, string>
  const [name, setName] = useState(contact.name || '')
  const [email, setEmail] = useState(contact.email || '')
  const [phone, setPhone] = useState(contact.phone || '')
  const [linkedin, setLinkedin] = useState(contact.linkedin || '')
  const [location, setLocation] = useState(contact.location || '')
  const [summary, setSummary] = useState((data.summary as string) || '')

  const existingExperiences = (data.experiences as Array<Record<string, unknown>>) || []
  const [experiences, setExperiences] = useState(
    existingExperiences.map(e => ({
      id: (e.id as string) || '',
      company: (e.company as string) || '',
      role: (e.role as string) || '',
      dates: (e.dates as string) || '',
      projects: (e.projects as Array<Record<string, unknown>>) || [],
    }))
  )

  const existingEducation = (data.education as Array<Record<string, unknown>>) || []
  const [education, setEducation] = useState(
    existingEducation.map(ed => ({
      institution: (ed.institution as string) || '',
      degree: (ed.degree as string) || '',
      field: (ed.field as string) || '',
      year: (ed.year as string) || '',
    }))
  )

  const skills = (data.skills || {}) as Record<string, unknown>
  const existingTechnical = (skills.technical as Array<Record<string, unknown>>) || []
  const existingLeadership = (skills.leadership as unknown[]) || []
  const [technicalSkills, setTechnicalSkills] = useState(
    existingTechnical.map(s => ({
      name: (s.name as string) || '',
      proficiency: (s.proficiency as string) || 'intermediate',
      years: (s.years as number) || 0,
    }))
  )
  const [leadershipSkills, setLeadershipSkills] = useState(
    existingLeadership.map(s => {
      if (typeof s === 'string') return { name: s, proficiency: 'intermediate', years: 0 }
      const sk = s as Record<string, unknown>
      return { name: (sk.name as string) || '', proficiency: (sk.proficiency as string) || 'intermediate', years: (sk.years as number) || 0 }
    })
  )

  const updateExperience = (i: number, field: string, value: string) => {
    setExperiences(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }

  const updateEducation = (i: number, field: string, value: string) => {
    setEducation(prev => prev.map((ed, idx) => idx === i ? { ...ed, [field]: value } : ed))
  }

  const updateTechnical = (i: number, field: string, value: string | number) => {
    setTechnicalSkills(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  const updateLeadership = (i: number, field: string, value: string | number) => {
    setLeadershipSkills(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  const handleSubmit = () => {
    onSave({
      ...data,
      contact: { name, email, phone, linkedin, location },
      summary,
      experiences: experiences.filter(e => e.company.trim()).map((e, i) => ({
        ...e,
        id: e.id || `exp-${String(i + 1).padStart(3, '0')}`,
      })),
      education: education.filter(ed => ed.institution.trim()),
      skills: {
        technical: technicalSkills.filter(s => s.name.trim()),
        leadership: leadershipSkills.filter(s => s.name.trim()),
      },
    })
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Edit Your Background</h2>

      {saveError && <p className="text-danger text-sm mb-3">{saveError}</p>}

      <div className="space-y-4">
        {/* Contact Info */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Contact Information</h4>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
          <input type="text" value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="LinkedIn URL" className="w-full mt-2 px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>

        {/* Summary */}
        <div>
          <label className="block text-sm font-semibold mb-1">Summary</label>
          <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder="Professional summary..." className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>

        {/* Experiences */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Work Experience</h4>
          {experiences.map((exp, i) => (
            <div key={i} className="mb-3 p-3 border border-border/50 rounded space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={exp.company} onChange={e => updateExperience(i, 'company', e.target.value)} placeholder="Company" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
                <input type="text" value={exp.role} onChange={e => updateExperience(i, 'role', e.target.value)} placeholder="Role" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              </div>
              <input type="text" value={exp.dates} onChange={e => updateExperience(i, 'dates', e.target.value)} placeholder="Dates (e.g. Jan 2020 - Dec 2022)" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
              <div className="flex justify-end">
                <button onClick={() => setExperiences(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
              </div>
            </div>
          ))}
          <button onClick={() => setExperiences(prev => [...prev, { id: '', company: '', role: '', dates: '', projects: [] }])} className="text-sm text-accent hover:text-accent-hover">+ Add Experience</button>
        </div>

        {/* STAR Stories note */}
        <p className="text-xs text-text-muted italic bg-bg border border-border/50 rounded p-2">
          STAR stories are best created through the coach conversation. Ask the coach to help you refine your stories for maximum impact.
        </p>

        {/* Education */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Education</h4>
          {education.map((ed, i) => (
            <div key={i} className="mb-3 p-3 border border-border/50 rounded space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={ed.institution} onChange={e => updateEducation(i, 'institution', e.target.value)} placeholder="Institution" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
                <input type="text" value={ed.degree} onChange={e => updateEducation(i, 'degree', e.target.value)} placeholder="Degree" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
                <input type="text" value={ed.field} onChange={e => updateEducation(i, 'field', e.target.value)} placeholder="Field of Study" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
                <input type="text" value={ed.year} onChange={e => updateEducation(i, 'year', e.target.value)} placeholder="Year" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              </div>
              <div className="flex justify-end">
                <button onClick={() => setEducation(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
              </div>
            </div>
          ))}
          <button onClick={() => setEducation(prev => [...prev, { institution: '', degree: '', field: '', year: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Education</button>
        </div>

        {/* Technical Skills */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Technical Skills</h4>
          {technicalSkills.map((s, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input type="text" value={s.name} onChange={e => updateTechnical(i, 'name', e.target.value)} placeholder="Skill name" className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm" />
              <select value={s.proficiency} onChange={e => updateTechnical(i, 'proficiency', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
              <input type="number" value={s.years || ''} onChange={e => updateTechnical(i, 'years', Number(e.target.value) || 0)} placeholder="Yrs" className="w-16 px-3 py-2 bg-bg border border-border rounded text-sm" />
              <button onClick={() => setTechnicalSkills(prev => prev.filter((_, idx) => idx !== i))} className="px-2 py-2 text-text-muted hover:text-danger text-sm">x</button>
            </div>
          ))}
          <button onClick={() => setTechnicalSkills(prev => [...prev, { name: '', proficiency: 'intermediate', years: 0 }])} className="text-sm text-accent hover:text-accent-hover">+ Add Skill</button>
        </div>

        {/* Leadership Skills */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Leadership Skills</h4>
          {leadershipSkills.map((s, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input type="text" value={s.name} onChange={e => updateLeadership(i, 'name', e.target.value)} placeholder="Skill name" className="flex-1 px-3 py-2 bg-bg border border-border rounded text-sm" />
              <select value={s.proficiency} onChange={e => updateLeadership(i, 'proficiency', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
              <input type="number" value={s.years || ''} onChange={e => updateLeadership(i, 'years', Number(e.target.value) || 0)} placeholder="Yrs" className="w-16 px-3 py-2 bg-bg border border-border rounded text-sm" />
              <button onClick={() => setLeadershipSkills(prev => prev.filter((_, idx) => idx !== i))} className="px-2 py-2 text-text-muted hover:text-danger text-sm">x</button>
            </div>
          ))}
          <button onClick={() => setLeadershipSkills(prev => [...prev, { name: '', proficiency: 'intermediate', years: 0 }])} className="text-sm text-accent hover:text-accent-hover">+ Add Skill</button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
        {saving && <span className="text-sm text-text-muted">Saving...</span>}
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-bg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
      </div>
    </div>
  )
}

function CareerPlanEditor({ data, onSave, onCancel, saving, saveError }: {
  data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean; saveError: string | null
}) {
  const target = (data.target || {}) as Record<string, unknown>
  const [level, setLevel] = useState((target.level as string) || '')
  const [functions, setFunctions] = useState(((target.functions as string[]) || []).join(', '))
  const [industries, setIndustries] = useState(((target.industries as string[]) || []).join(', '))
  const [locations, setLocations] = useState(((target.locations as string[]) || []).join(', '))
  const [compFloor, setCompFloor] = useState(String(target.comp_floor || ''))
  const [dealBreakers, setDealBreakers] = useState(((data.deal_breakers as string[]) || []).join(', '))

  const workStyle = (data.work_style || {}) as Record<string, string>
  const [environment, setEnvironment] = useState(workStyle.environment || '')
  const [teamSize, setTeamSize] = useState(workStyle.team_size || '')
  const [pace, setPace] = useState(workStyle.pace || '')
  const [autonomy, setAutonomy] = useState(workStyle.autonomy || '')

  const rolePrefs = (data.role_preferences || {}) as Record<string, string>
  const [track, setTrack] = useState(rolePrefs.track || '')
  const [handsOnVsStrategic, setHandsOnVsStrategic] = useState(rolePrefs.hands_on_vs_strategic || '')
  const [scope, setScope] = useState(rolePrefs.scope || '')

  const [whatMatters, setWhatMatters] = useState(((data.what_matters as string[]) || []).join(', '))

  const culturePrefs = (data.culture_preferences || {}) as Record<string, unknown>
  const [companyStage, setCompanyStage] = useState((culturePrefs.company_stage as string) || '')
  const [cultureStyle, setCultureStyle] = useState((culturePrefs.culture_style as string) || '')
  const [cultureValues, setCultureValues] = useState(((culturePrefs.values as string[]) || []).join(', '))

  const motivation = (data.motivation || {}) as Record<string, unknown>
  const [whySearching, setWhySearching] = useState((motivation.why_searching as string) || '')
  const [dreamRole, setDreamRole] = useState((motivation.dream_role as string) || '')
  const [nonNegotiables, setNonNegotiables] = useState(((motivation.non_negotiables as string[]) || []).join(', '))

  const handleSubmit = () => {
    onSave({
      ...data,
      target: {
        level,
        functions: functions.split(',').map(s => s.trim()).filter(Boolean),
        industries: industries.split(',').map(s => s.trim()).filter(Boolean),
        locations: locations.split(',').map(s => s.trim()).filter(Boolean),
        comp_floor: compFloor ? Number(compFloor) : 0,
      },
      deal_breakers: dealBreakers.split(',').map(s => s.trim()).filter(Boolean),
      work_style: { environment, team_size: teamSize, pace, autonomy },
      role_preferences: { track, hands_on_vs_strategic: handsOnVsStrategic, scope },
      what_matters: whatMatters.split(',').map(s => s.trim()).filter(Boolean),
      culture_preferences: {
        company_stage: companyStage,
        culture_style: cultureStyle,
        values: cultureValues.split(',').map(s => s.trim()).filter(Boolean),
      },
      motivation: {
        why_searching: whySearching,
        dream_role: dreamRole,
        non_negotiables: nonNegotiables.split(',').map(s => s.trim()).filter(Boolean),
      },
    })
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Edit What You&apos;re Looking For</h2>
      {saveError && <p className="text-danger text-sm mb-3">{saveError}</p>}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Target Level</label>
            <input type="text" value={level} onChange={e => setLevel(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Min Total Comp ($)</label>
            <input type="number" value={compFloor} onChange={e => setCompFloor(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Functions (comma-separated)</label>
          <input type="text" value={functions} onChange={e => setFunctions(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Industries (comma-separated)</label>
          <input type="text" value={industries} onChange={e => setIndustries(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Locations (comma-separated)</label>
          <input type="text" value={locations} onChange={e => setLocations(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Deal Breakers (comma-separated)</label>
          <input type="text" value={dealBreakers} onChange={e => setDealBreakers(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>

        {/* Work Style */}
        <h3 className="text-sm font-semibold pt-2">Work Style</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Environment</label>
            <select value={environment} onChange={e => setEnvironment(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="">--</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="in-office">In-office</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Team Size</label>
            <select value={teamSize} onChange={e => setTeamSize(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="">--</option>
              <option value="small">Small (1-10)</option>
              <option value="medium">Medium (10-50)</option>
              <option value="large">Large (50+)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Pace</label>
            <select value={pace} onChange={e => setPace(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="">--</option>
              <option value="startup">Startup (fast)</option>
              <option value="moderate">Moderate</option>
              <option value="steady">Steady</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Autonomy</label>
            <select value={autonomy} onChange={e => setAutonomy(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm">
              <option value="">--</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low / structured</option>
            </select>
          </div>
        </div>

        {/* Role Preferences */}
        <h3 className="text-sm font-semibold pt-2">Role Preferences</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Track</label>
            <input type="text" value={track} onChange={e => setTrack(e.target.value)} placeholder="e.g. IC, Manager" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Hands-on vs Strategic</label>
            <input type="text" value={handsOnVsStrategic} onChange={e => setHandsOnVsStrategic(e.target.value)} placeholder="e.g. 70% hands-on" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Scope</label>
            <input type="text" value={scope} onChange={e => setScope(e.target.value)} placeholder="e.g. team, org, company" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
        </div>

        {/* What Matters */}
        <div>
          <label className="block text-sm font-medium mb-1">What Matters (comma-separated, in priority order)</label>
          <input type="text" value={whatMatters} onChange={e => setWhatMatters(e.target.value)} placeholder="e.g. impact, learning, compensation, culture" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>

        {/* Culture */}
        <h3 className="text-sm font-semibold pt-2">Culture Preferences</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Company Stage</label>
            <input type="text" value={companyStage} onChange={e => setCompanyStage(e.target.value)} placeholder="e.g. startup, growth, enterprise" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Culture Style</label>
            <input type="text" value={cultureStyle} onChange={e => setCultureStyle(e.target.value)} placeholder="e.g. collaborative, competitive" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Values (comma-separated)</label>
          <input type="text" value={cultureValues} onChange={e => setCultureValues(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>

        {/* Motivation */}
        <h3 className="text-sm font-semibold pt-2">Motivation</h3>
        <div>
          <label className="block text-xs text-text-muted mb-1">Why are you searching?</label>
          <textarea value={whySearching} onChange={e => setWhySearching(e.target.value)} rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Dream role description</label>
          <textarea value={dreamRole} onChange={e => setDreamRole(e.target.value)} rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Non-negotiables (comma-separated)</label>
          <input type="text" value={nonNegotiables} onChange={e => setNonNegotiables(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
        {saving && <span className="text-sm text-text-muted">Saving...</span>}
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-bg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
      </div>
    </div>
  )
}

function QAMasterEditor({ data, onSave, onCancel, saving, saveError }: {
  data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean; saveError: string | null
}) {
  const [salary, setSalary] = useState((data.salary_expectations as string) || '')
  const [whyLeaving, setWhyLeaving] = useState((data.why_leaving as string) || '')
  const [weakness, setWeakness] = useState((data.greatest_weakness as string) || '')
  const [visa, setVisa] = useState((data.visa_status as string) || '')
  const existingQA = (data.custom_qa as Array<{ q: string; a: string }>) || []
  const [customQA, setCustomQA] = useState(existingQA.length > 0 ? existingQA : [] as Array<{ q: string; a: string }>)

  const handleSubmit = () => {
    onSave({
      ...data,
      salary_expectations: salary,
      why_leaving: whyLeaving,
      greatest_weakness: weakness,
      visa_status: visa,
      custom_qa: customQA.filter(qa => qa.q.trim()),
    })
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Edit Your Story</h2>
      {saveError && <p className="text-danger text-sm mb-3">{saveError}</p>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Salary Expectations</label>
          <textarea value={salary} onChange={e => setSalary(e.target.value)} rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Why Leaving</label>
          <textarea value={whyLeaving} onChange={e => setWhyLeaving(e.target.value)} rows={3} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Greatest Weakness</label>
          <textarea value={weakness} onChange={e => setWeakness(e.target.value)} rows={3} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Visa Status</label>
          <input type="text" value={visa} onChange={e => setVisa(e.target.value)} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
        </div>

        {/* Custom Q&As */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Custom Q&amp;As</h4>
          {customQA.map((qa, i) => (
            <div key={i} className="mb-3 p-3 border border-border/50 rounded space-y-2">
              <input type="text" value={qa.q} onChange={e => setCustomQA(prev => prev.map((item, idx) => idx === i ? { ...item, q: e.target.value } : item))} placeholder="Question" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
              <textarea value={qa.a} onChange={e => setCustomQA(prev => prev.map((item, idx) => idx === i ? { ...item, a: e.target.value } : item))} placeholder="Answer" rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
              <div className="flex justify-end">
                <button onClick={() => setCustomQA(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
              </div>
            </div>
          ))}
          <button onClick={() => setCustomQA(prev => [...prev, { q: '', a: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Q&amp;A</button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
        {saving && <span className="text-sm text-text-muted">Saving...</span>}
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-bg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
      </div>
    </div>
  )
}

function TargetCompaniesEditor({ data, onSave, onCancel, saving, saveError }: {
  data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean; saveError: string | null
}) {
  const existingCompanies = (data.companies as Array<Record<string, unknown>>) || []
  const [companies, setCompanies] = useState(
    existingCompanies.length > 0
      ? existingCompanies.map(c => ({
          name: (c.name as string) || '',
          slug: (c.slug as string) || '',
          fit_score: (c.fit_score as number) || 0,
          status: (c.status as string) || 'researching',
          priority: (c.priority as string) || 'medium',
          notes: (c.notes as string) || '',
        }))
      : [{ name: '', slug: '', fit_score: 0, status: 'researching', priority: 'medium', notes: '' }]
  )

  const updateCompany = (i: number, field: string, value: string | number) => {
    setCompanies(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  const handleSubmit = () => {
    const validCompanies = companies.filter(c => c.name.trim())
    onSave({
      ...data,
      companies: validCompanies.map(c => ({
        ...c,
        slug: c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      })),
    })
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Edit Target Companies</h2>
      {saveError && <p className="text-danger text-sm mb-3">{saveError}</p>}

      <div className="space-y-3">
        {companies.map((company, i) => (
          <div key={i} className="p-3 border border-border/50 rounded space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={company.name} onChange={e => updateCompany(i, 'name', e.target.value)} placeholder="Company Name" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <select value={company.priority} onChange={e => updateCompany(i, 'priority', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
              <select value={company.status} onChange={e => updateCompany(i, 'status', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
                <option value="researching">Researching</option>
                <option value="targeting">Targeting</option>
                <option value="applied">Applied</option>
                <option value="archived">Archived</option>
              </select>
              <input type="number" value={company.fit_score || ''} onChange={e => updateCompany(i, 'fit_score', Number(e.target.value) || 0)} placeholder="Fit Score (0-100)" min={0} max={100} className="px-3 py-2 bg-bg border border-border rounded text-sm" />
            </div>
            <textarea value={company.notes} onChange={e => updateCompany(i, 'notes', e.target.value)} placeholder="Notes" rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
            <div className="flex justify-end">
              <button onClick={() => setCompanies(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
            </div>
          </div>
        ))}
        <button onClick={() => setCompanies(prev => [...prev, { name: '', slug: '', fit_score: 0, status: 'researching', priority: 'medium', notes: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Company</button>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
        {saving && <span className="text-sm text-text-muted">Saving...</span>}
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-bg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
      </div>
    </div>
  )
}

function ConnectionTrackerEditor({ data, onSave, onCancel, saving, saveError }: {
  data: Record<string, unknown>; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean; saveError: string | null
}) {
  const existingContacts = (data.contacts as Array<Record<string, unknown>>) || []
  const [contacts, setContacts] = useState(
    existingContacts.length > 0
      ? existingContacts.map(c => ({
          name: (c.name as string) || '',
          company: (c.company as string) || '',
          role: (c.role as string) || '',
          relationship: (c.relationship as string) || 'cold',
          linkedin_url: (c.linkedin_url as string) || '',
          notes: (c.notes as string) || '',
        }))
      : [{ name: '', company: '', role: '', relationship: 'cold', linkedin_url: '', notes: '' }]
  )

  const updateContact = (i: number, field: string, value: string) => {
    setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  const handleSubmit = () => {
    const validContacts = contacts.filter(c => c.name.trim())
    onSave({
      ...data,
      contacts: validContacts.map((c, i) => ({
        id: `conn-${String(i + 1).padStart(3, '0')}`,
        name: c.name,
        company: c.company,
        role: c.role,
        relationship: c.relationship,
        linkedin_url: c.linkedin_url,
        notes: c.notes,
      })),
    })
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Edit Your Network</h2>
      {saveError && <p className="text-danger text-sm mb-3">{saveError}</p>}

      <div className="space-y-3">
        {contacts.map((contact, i) => (
          <div key={i} className="p-3 border border-border/50 rounded space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={contact.name} onChange={e => updateContact(i, 'name', e.target.value)} placeholder="Name" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <input type="text" value={contact.company} onChange={e => updateContact(i, 'company', e.target.value)} placeholder="Company" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <input type="text" value={contact.role} onChange={e => updateContact(i, 'role', e.target.value)} placeholder="Role" className="px-3 py-2 bg-bg border border-border rounded text-sm" />
              <select value={contact.relationship} onChange={e => updateContact(i, 'relationship', e.target.value)} className="px-3 py-2 bg-bg border border-border rounded text-sm">
                <option value="cold">Cold</option>
                <option value="connected">Connected</option>
                <option value="warm">Warm</option>
                <option value="referred">Referred</option>
              </select>
            </div>
            <input type="text" value={contact.linkedin_url} onChange={e => updateContact(i, 'linkedin_url', e.target.value)} placeholder="LinkedIn URL" className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
            <textarea value={contact.notes} onChange={e => updateContact(i, 'notes', e.target.value)} placeholder="Notes" rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded text-sm" />
            <div className="flex justify-end">
              <button onClick={() => setContacts(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-text-muted hover:text-danger">Remove</button>
            </div>
          </div>
        ))}
        <button onClick={() => setContacts(prev => [...prev, { name: '', company: '', role: '', relationship: 'cold', linkedin_url: '', notes: '' }])} className="text-sm text-accent hover:text-accent-hover">+ Add Contact</button>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
        {saving && <span className="text-sm text-text-muted">Saving...</span>}
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-bg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50">Save</button>
      </div>
    </div>
  )
}

function InterviewHistoryViewer({ data, onCancel }: { data: Record<string, unknown>; onCancel: () => void }) {
  const interviews = (data.interviews as Array<Record<string, unknown>>) || []
  const patterns = (data.patterns || {}) as Record<string, unknown>

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Interview Journal</h2>
      {interviews.length === 0 ? (
        <p className="text-sm text-text-muted">Will populate after interview debriefs.</p>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview, i) => (
            <div key={i} className="p-3 border border-border/50 rounded text-sm">
              <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(interview, null, 2)}</pre>
            </div>
          ))}
          {(patterns.strong_areas as string[] || []).length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium">Patterns</h4>
              <p className="text-xs text-text-muted">Strong: {(patterns.strong_areas as string[]).join(', ')}</p>
              <p className="text-xs text-text-muted">Weak: {((patterns.weak_areas as string[]) || []).join(', ')}</p>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end mt-6 pt-4 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-bg transition-colors">Close</button>
      </div>
    </div>
  )
}

// ─── Field Progress Bar ───────────────────────────────────────────────────

function KeyInfoLine({ sectionKey, data, filled, section }: { sectionKey: string; data?: Record<string, unknown>; filled: boolean; section: ProfileSectionStatus }) {
  if (!data && !filled) {
    // Only show "Missing:" in red when partially filled — not when completely empty
    if (section.required_filled > 0) {
      const missing = Object.values(section.fields || {}).filter(f => f.required && !f.filled).map(f => f.label)
      if (missing.length > 0) {
        return <p className="text-sm text-danger truncate">Missing: {missing.slice(0, 3).join(', ')}{missing.length > 3 ? ` +${missing.length - 3}` : ''}</p>
      }
    }
    return <p className="text-sm text-text-muted italic">Not started</p>
  }
  if (!data) return null

  switch (sectionKey) {
    case 'experience-library': {
      const contact = (data.contact || {}) as Record<string, string>
      const exp = (data.experiences as unknown[]) || []
      const skills = (data.skills as Record<string, unknown[]>) || {}
      const parts: string[] = []
      if (contact.name) parts.push(contact.name)
      if (exp.length > 0) parts.push(`${exp.length} role${exp.length !== 1 ? 's' : ''}`)
      // Count all skill categories (technical, leadership, research_methods, domain_expertise, etc.)
      let skillCount = 0
      for (const arr of Object.values(skills)) {
        if (Array.isArray(arr)) skillCount += arr.length
      }
      if (skillCount > 0) parts.push(`${skillCount} skills`)
      // If we have data but parts is empty, check if section is actually filled
      if (parts.length === 0 && filled) return <p className="text-sm text-text-muted">Profile data loaded</p>
      if (parts.length === 0) {
        if (section.required_filled > 0) {
          const missing = Object.values(section.fields || {}).filter(f => f.required && !f.filled).map(f => f.label)
          if (missing.length > 0) return <p className="text-sm text-danger truncate">Missing: {missing.slice(0, 3).join(', ')}</p>
        }
        return <p className="text-sm text-text-muted italic">Not started</p>
      }
      return <p className="text-sm text-text-muted truncate">{parts.join(' · ')}</p>
    }
    case 'career-plan': {
      const target = (data.target || {}) as Record<string, unknown>
      const parts: string[] = []
      if (target.level) parts.push(String(target.level))
      const funcs = (target.functions as string[]) || []
      if (funcs.length > 0) parts.push(funcs.join(', '))
      if (target.comp_floor && Number(target.comp_floor) > 0) parts.push(`$${Number(target.comp_floor).toLocaleString()}+`)
      if (parts.length === 0) {
        if (section.required_filled > 0) {
          const missing = Object.values(section.fields || {}).filter(f => f.required && !f.filled).map(f => f.label)
          if (missing.length > 0) return <p className="text-sm text-danger truncate">Missing: {missing.slice(0, 3).join(', ')}</p>
        }
        return <p className="text-sm text-text-muted italic">Not started</p>
      }
      return <p className="text-sm text-text-muted truncate">{parts.join(' · ')}</p>
    }
    case 'qa-master': {
      const fields = ['salary_expectations', 'why_leaving', 'greatest_weakness', 'visa_status'] as const
      const setCount = fields.filter(f => data[f] && String(data[f]).trim()).length
      if (setCount === 0) return <p className="text-sm text-text-muted italic">Not started</p>
      const missing = Object.values(section.fields || {}).filter(f => f.required && !f.filled).map(f => f.label)
      if (missing.length > 0) return <p className="text-sm text-text-muted">{setCount}/4 answered · <span className="text-danger">Missing: {missing.join(', ')}</span></p>
      return <p className="text-sm text-text-muted">{setCount}/4 core answers set</p>
    }
    case 'target-companies': {
      const companies = (data.companies as unknown[]) || []
      if (companies.length === 0) return <p className="text-sm text-text-muted italic">No companies yet</p>
      return <p className="text-sm text-text-muted">{companies.length} companies</p>
    }
    case 'connection-tracker': {
      const contacts = (data.contacts as unknown[]) || []
      if (contacts.length === 0) return <p className="text-sm text-text-muted italic">No contacts yet</p>
      return <p className="text-sm text-text-muted">{contacts.length} contacts</p>
    }
    default:
      return null
  }
}

function FieldProgressBar({ section }: { section: ProfileSectionStatus }) {
  if (section.filled) return null
  if (section.required_total === 0) return null

  const pct = Math.round((section.required_filled / section.required_total) * 100)
  const filledBlocks = Math.round((section.required_filled / section.required_total) * 6)

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-[10px] text-text-muted whitespace-nowrap">
        {section.required_filled}/{section.required_total} required
      </span>
      <div className="flex gap-px flex-1 max-w-[60px]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${i < filledBlocks ? 'bg-green-500' : 'bg-border'}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-text-muted">{pct}%</span>
    </div>
  )
}

function MissingFieldsList({ section }: { section: ProfileSectionStatus }) {
  const missing = Object.values(section.fields)
    .filter(f => f.required && !f.filled)
    .map(f => f.label)
  if (missing.length === 0) return null

  return (
    <p className="text-[10px] text-danger font-medium mt-1">
      Missing: {missing.join(', ')}
    </p>
  )
}

// ─── Profile Panel (Right Panel) ───────────────────────────────────────────

function ProfilePanel({
  status,
  currentSection,
  contextData,
  onSectionClick,
  onEditSection,
  onResumeUploaded,
}: {
  status: ProfileStatusResponse | null
  currentSection: SectionKey | null
  contextData: Record<string, Record<string, unknown>>
  onSectionClick: (section: SectionKey) => void
  onEditSection: (section: string) => void
  onResumeUploaded: () => void
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  if (!status) return null

  const sections = status.sections
  const setupSections = SECTION_ORDER.filter((k) => k in sections)
  const filledCount = setupSections.filter((k) => sections[k]?.filled).length

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-text">Your Profile</h2>
        <p className="text-sm text-text-muted mt-1">{filledCount}/5 complete</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {SECTION_ORDER.map((key) => {
          const sect = sections[key]
          if (!sect) return null
          const meta = { icon: sect.icon || SECTION_META[key]?.icon || '', label: sect.label || SECTION_META[key]?.label || key, description: sect.description || SECTION_META[key]?.description || '' }
          const isCurrent = currentSection === key
          const isFilled = sect.filled
          const isExpanded = expandedSection === key
          const pct = sect.required_total > 0 ? Math.round((sect.required_filled / sect.required_total) * 100) : 0

          return (
            <div
              key={key}
              className={`rounded-lg border transition-all ${
                isCurrent
                  ? 'border-accent bg-accent/5'
                  : isFilled
                    ? 'border-border bg-surface'
                    : 'border-border/60 bg-bg'
              }`}
            >
              {/* Header + key info — always visible */}
              <div
                className="px-4 py-3 cursor-pointer"
                onClick={() => setExpandedSection(isExpanded ? null : key)}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">
                    {isFilled ? '\u2705' : isCurrent ? '\uD83D\uDD35' : '\u26AA'}
                  </span>
                  <span className="text-sm">{meta.icon}</span>
                  <span className="text-base font-medium text-text">{meta.label}</span>
                  <div className="ml-auto flex items-center gap-3">
                    {!isFilled && sect.required_total > 0 && (
                      <span className="text-xs text-text-muted">{sect.required_filled}/{sect.required_total}</span>
                    )}
                    {isFilled ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditSection(key) }}
                        className="text-sm text-accent hover:text-accent-hover font-medium px-2 py-0.5 rounded hover:bg-accent/10"
                      >
                        Edit
                      </button>
                    ) : !isCurrent ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSectionClick(key) }}
                        className="text-sm text-accent hover:text-accent-hover px-2 py-0.5 rounded hover:bg-accent/10"
                      >
                        {sect.required_filled > 0 ? 'Resume' : 'Start'}
                      </button>
                    ) : null}
                    <span className="text-xs text-text-muted">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {/* Key info line — visible when collapsed */}
                {!isExpanded && (
                  <div className="flex gap-2.5 mt-0.5">
                    <span className="text-base invisible" aria-hidden>.</span>
                    <span className="text-sm invisible" aria-hidden>.</span>
                    <KeyInfoLine sectionKey={key} data={contextData[key]} filled={isFilled} section={sect} />
                  </div>
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-border/50 pt-2">
                  {contextData[key] && (
                    <div className="mb-2">
                      <ContextPreviewExpanded name={key} data={contextData[key]} />
                    </div>
                  )}

                  {!isFilled && <FieldProgressBar section={sect} />}
                  {!isFilled && <MissingFieldsList section={sect} />}

                  {/* Actions row */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                    {isFilled && (
                      <button
                        onClick={() => onSectionClick(key)}
                        className="text-xs text-text-muted hover:text-accent cursor-pointer"
                      >
                        Discuss with coach
                      </button>
                    )}
                    {isFilled && (
                      <button
                        onClick={() => onEditSection(key)}
                        className="text-xs text-accent hover:text-accent-hover font-medium cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                    {!isFilled && (
                      <button
                        onClick={() => onSectionClick(key)}
                        className="text-xs text-accent hover:text-accent-hover cursor-pointer"
                      >
                        {sect.required_filled > 0 ? 'Resume with coach' : 'Start with coach'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Interview Journal removed from profile — belongs in Interviewing page */}
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

        {/* Resume upload */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-text-muted mb-2">Have a new resume? Upload it so the coach can review and update your profile.</p>
          <ResumeDropZone onUploaded={onResumeUploaded} compact />
        </div>
      </div>
    </div>
  )
}

// ─── Resume Drop Zone ───────────────────────────────────────────────────────

function ResumeDropZone({
  onUploaded,
  compact = false,
}: {
  onUploaded: () => void
  compact?: boolean
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
    <div className={compact ? '' : 'px-4 py-3'}>
      <div
        className={`border-2 border-dashed rounded-lg text-center transition-colors cursor-pointer ${
          compact ? 'p-2.5' : 'p-4'
        } ${dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}
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
          <p className="text-xs text-text-muted">Uploading...</p>
        ) : (
          <p className={`${compact ? 'text-xs' : 'text-sm'} text-text-muted`}>
            {compact ? 'Drop resume or click to upload' : 'Drop your resume here'}
            {!compact && <span className="block text-xs text-text-muted mt-1">PDF, DOC, DOCX, or TXT</span>}
          </p>
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

export default function CoachPage() {
  // Restore conversation from localStorage if available
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('coach-messages')
      if (!saved) return []
      const parsed = JSON.parse(saved) as ChatMessage[]
      // Filter out stale internal messages from process manager
      return parsed.filter(m => !(m.role === 'coach' && (
        m.content.includes('session preserved for resume') ||
        m.content.includes('Dashboard restarted')
      )))
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [currentSection, setCurrentSection] = useState<SectionKey | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const saved = localStorage.getItem('coach-section')
      return (saved as SectionKey) || null
    } catch { return null }
  })
  const [contextStatus, setContextStatus] = useState<ProfileStatusResponse | null>(null)
  // showResumeZone removed — resume upload is always visible
  const hasStartedRef = useRef(false)
  const [contextData, setContextData] = useState<Record<string, Record<string, unknown>>>({})
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents('coach-agent')

  // Derive processing state from agent hook — survives tab switches since hook persists to localStorage
  const isProcessing = agentStatus === 'running'

  // Show notifications from ALL agents since coach is the orchestrator
  const { notifications, dismiss: dismissNotification, dismissAll: dismissAllNotifications } = useDirectiveNotifications()

  // Persist conversation to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('coach-messages', JSON.stringify(messages))
    }
  }, [messages])

  useEffect(() => {
    if (currentSection) {
      localStorage.setItem('coach-section', currentSection)
    }
  }, [currentSection])

  // coach-resume-zone localStorage removed — always visible

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  // Only scroll when a new message is added, not during streaming partial updates
  useEffect(() => {
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  // Fetch profile status on mount and poll every 5s
  const fetchContextStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/context/profile-status')
      if (res.ok) {
        const data = await res.json()
        setContextStatus(data)
      }
    } catch {
      // ignore
    }
  }, [])

  // Fetch all context data for previews
  const fetchAllContextData = useCallback(async () => {
    const names = ['experience-library', 'career-plan', 'qa-master', 'target-companies', 'connection-tracker']
    try {
      const results = await Promise.all(
        names.map(async (name) => {
          try {
            const res = await fetch(`/api/context/${name}`)
            if (!res.ok) return [name, {}] as const
            const data = await res.json()
            return [name, data] as const
          } catch {
            return [name, {}] as const
          }
        })
      )
      const dataMap: Record<string, Record<string, unknown>> = {}
      for (const [name, data] of results) {
        dataMap[name] = data as Record<string, unknown>
      }
      setContextData(dataMap)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchContextStatus()
    fetchAllContextData()
    const interval = setInterval(fetchContextStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchContextStatus, fetchAllContextData])

  // Determine if this is first visit (context empty) or return visit
  const isContextReady = contextStatus?.contextReady ?? false

  // Dynamic subtitle based on state
  const coachSubtitle = useMemo(() => {
    if (!contextStatus) return 'Loading...'

    const sections = contextStatus.sections ?? {}
    const filledCount = Object.values(sections).filter((s) => s.filled).length
    const totalSections = Object.keys(sections).length || 5

    if (filledCount === 0) return 'Let\u2019s set up your job search profile'

    if (filledCount < totalSections) {
      const missing = Object.values(sections).filter((s) => !s.filled).map((s) => s.label)
      return `${filledCount}/${totalSections} profile sections done \u2014 next: ${missing[0]}`
    }

    // Profile complete — check time-based suggestions
    const hour = new Date().getHours()
    const lastBriefingKey = 'coach-last-briefing-date'
    const today = new Date().toISOString().split('T')[0]
    const lastBriefing = typeof window !== 'undefined' ? localStorage.getItem(lastBriefingKey) : null

    if (lastBriefing !== today && hour < 12) return 'Good morning \u2014 start with a daily briefing'
    if (hour >= 17) return 'End of day \u2014 log any updates or run a retro'

    return 'Your job search companion \u2014 ask me anything'
  }, [contextStatus])

  // Spawn coach on mount — ONLY if no saved conversation exists
  // Spawn coach on mount — wait for blackboard to be ready first
  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    if (messages.length > 0) return // restored from localStorage

    let cancelled = false
    const waitAndSpawn = async () => {
      // Wait for blackboard to be reachable (handles post-reset race)
      for (let i = 0; i < 5; i++) {
        try {
          const res = await fetch('http://localhost:8790/state', { signal: AbortSignal.timeout(2000) })
          if (res.ok) break
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 1000))
      }
      if (cancelled) return
      const directive = isContextReady ? COMPANION_DIRECTIVE : ONBOARDING_DIRECTIVE
      spawnAgent('coach', {
        skill: 'onboarding-coach',
        entry_name: 'onboarding-session',
        text: directive,
      })
    }
    waitAndSpawn()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watch for agent completion
  useEffect(() => {
    if (agentStatus === 'completed' && agentOutput) {
      // Filter out internal process manager messages
      if (agentOutput.includes('session preserved for resume') || agentOutput.includes('Dashboard restarted')) {
  
        agentReset()
        return
      }
      setMessages((prev) => [...prev, { role: 'coach', content: agentOutput }])


      const detected = detectSection(agentOutput)
      if (detected) {
        setCurrentSection(prev => {
          const currentIdx = prev ? SECTION_ORDER.indexOf(prev) : -1
          const detectedIdx = SECTION_ORDER.indexOf(detected)
          return detectedIdx >= currentIdx ? detected : prev
        })
      }

      agentReset()
      fetchContextStatus()
      fetchAllContextData()
    }
    if (agentStatus === 'failed') {
      setMessages((prev) => [
        ...prev,
        { role: 'coach', content: 'Something went wrong. Please try sending your message again.' },
      ])

      agentReset()
    }
    if (agentStatus === 'timeout') {
      setMessages((prev) => [
        ...prev,
        { role: 'coach', content: 'The request timed out. Please try again.' },
      ])

      agentReset()
    }
  }, [agentStatus, agentOutput, agentReset, fetchContextStatus, fetchAllContextData])

  // Send a message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return
      setMessages((prev) => [...prev, { role: 'user', content: text.trim() }])
      setInput('')
  

      try {
        const result = await spawnAgent('coach', {
          skill: 'onboarding-coach',
          entry_name: 'onboarding-followup',
          text: text.trim(),
        })
        // If spawnAgent returned null, the spawn was blocked (concurrent guard)
        if (result === null) {
          setMessages((prev) => [
            ...prev,
            { role: 'coach', content: 'The coach is still processing. Please wait a moment and try again.' },
          ])
    
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'coach', content: 'Failed to reach the coach. Please try again.' },
        ])
  
      }
    },
    [agentStatus, spawnAgent],
  )

  // Pick up pending action from user-action bar navigation
  usePendingAction(sendMessage)

  const handleSectionClick = (section: SectionKey) => {
    if (isProcessing) return
    const sectionStatus = contextStatus?.sections?.[section]
    const label = sectionStatus?.label || SECTION_META[section]?.label || section
    const isFilled = sectionStatus?.filled

    if (isFilled) {
      // Use schema-driven field data to detect gaps
      const missingFields = Object.values(sectionStatus?.fields || {})
        .filter(f => f.required && !f.filled)
        .map(f => f.label)
      const gaps = missingFields.length > 0
        ? ` I notice these are still empty: ${missingFields.join(', ')}.`
        : ''
      sendMessage(`Let's review my ${label} section.${gaps} What's in there, and what should I update?`)
    } else {
      sendMessage(`I'd like to work on my ${label} section.`)
    }
    setCurrentSection(section)
  }

  const handleEditSection = async (section: string) => {
    // Load fresh data for modal
    try {
      const res = await fetch(`/api/context/${section}`)
      if (res.ok) {
        const data = await res.json()
        setEditData(data)
        setEditingSection(section)
        setSaveError(null)
      }
    } catch {
      // ignore
    }
  }

  const handleModalSave = async (section: string, data: Record<string, unknown>) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/context/${section}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json()
        if (body.fieldErrors) {
          const msgs = Object.entries(body.fieldErrors).map(([path, errs]) => `${path}: ${(errs as string[]).join(', ')}`)
          setSaveError(msgs.join('; '))
        } else {
          setSaveError(body.error || 'Save failed')
        }
        return
      }
      setEditingSection(null)
      setEditData(null)
      fetchContextStatus()
      fetchAllContextData()
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

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
            <h1 className="text-base font-semibold text-text">Career Coach</h1>
            <p className="text-xs text-text-muted">
              {coachSubtitle}
            </p>
          </div>
        </div>

        {/* Coach skill buttons */}
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 overflow-x-auto">
          <button
            onClick={async () => {
              try { localStorage.setItem('coach-last-briefing-date', new Date().toISOString().split('T')[0]) } catch {}
              // Trigger role scan if stale before briefing
              try {
                const scanRes = await fetch('/api/agent/scan-roles')
                if (scanRes.ok) {
                  const scanData = await scanRes.json() as { scan_stale: boolean }
                  if (scanData.scan_stale) {
                    fetch('/api/agent/scan-roles', { method: 'POST' }).catch(() => {})
                  }
                }
              } catch {}
              sendMessage('Give me my daily briefing. Read search/pipeline/applications.yaml, search/pipeline/open-roles.yaml, search/context/connection-tracker.yaml, and search/context/snapshot.yaml. Include: (1) new open roles discovered at target companies, (2) follow-ups due, (3) upcoming interviews, (4) pipeline status, (5) priorities for today.')
            }}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-medium border border-accent/30 text-accent rounded-full hover:bg-accent/10 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            Daily Briefing
          </button>
          <button
            onClick={() => sendMessage('Do a weekly retro. Analyze my applications, response rates, interview scores, and networking velocity this week.')}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-medium border border-border text-text-muted rounded-full hover:bg-bg hover:text-text transition-colors whitespace-nowrap disabled:opacity-50"
          >
            Weekly Retro
          </button>
          <button
            onClick={() => sendMessage('Review my pipeline and suggest what I should focus on next.')}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-medium border border-border text-text-muted rounded-full hover:bg-bg hover:text-text transition-colors whitespace-nowrap disabled:opacity-50"
          >
            What&apos;s Next?
          </button>
          <button
            onClick={() => sendMessage('Review my profile sections and suggest improvements or missing information.')}
            disabled={isProcessing}
            className="px-3 py-1.5 text-xs font-medium border border-border text-text-muted rounded-full hover:bg-bg hover:text-text transition-colors whitespace-nowrap disabled:opacity-50"
          >
            Profile Review
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Directive notifications from all agents */}
          <DirectiveBanner
            notifications={notifications}
            onDismiss={dismissNotification}
            onDismissAll={dismissAllNotifications}
            onDiscuss={sendMessage}
          />
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
                onClick={() => sendMessage('Skip this')}
                className="text-xs text-text-muted hover:text-text transition-colors"
              >
                Skip this &rarr;
              </button>
            </div>
          )}
          <p className="text-xs text-text-muted mb-1.5 flex items-center gap-1">
            <span>{'\uD83C\uDF99\uFE0F'}</span>
            <span>Tip: Use your device&apos;s dictation (mic button on keyboard) -- speaking produces richer, more natural answers than typing.</span>
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type or dictate your response..."
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

      {/* ─── Right Panel: Profile (40%) ─── */}
      <div className="lg:w-[40%] border-t lg:border-t-0 lg:border-l border-border bg-bg flex flex-col min-h-0">
        <ProfilePanel
          status={contextStatus}
          currentSection={currentSection}
          contextData={contextData}
          onSectionClick={handleSectionClick}
          onEditSection={handleEditSection}
          onResumeUploaded={handleResumeUploaded}
        />
      </div>

      {/* ─── Edit Modals ─── */}
      {editingSection && editData && (
        <ModalOverlay onClose={() => { setEditingSection(null); setEditData(null) }}>
          {editingSection === 'experience-library' && (
            <ExperienceLibraryEditor data={editData} onSave={d => handleModalSave(editingSection, d)} onCancel={() => { setEditingSection(null); setEditData(null) }} saving={saving} saveError={saveError} />
          )}
          {editingSection === 'career-plan' && (
            <CareerPlanEditor data={editData} onSave={d => handleModalSave(editingSection, d)} onCancel={() => { setEditingSection(null); setEditData(null) }} saving={saving} saveError={saveError} />
          )}
          {editingSection === 'qa-master' && (
            <QAMasterEditor data={editData} onSave={d => handleModalSave(editingSection, d)} onCancel={() => { setEditingSection(null); setEditData(null) }} saving={saving} saveError={saveError} />
          )}
          {editingSection === 'target-companies' && (
            <TargetCompaniesEditor data={editData} onSave={d => handleModalSave(editingSection, d)} onCancel={() => { setEditingSection(null); setEditData(null) }} saving={saving} saveError={saveError} />
          )}
          {editingSection === 'connection-tracker' && (
            <ConnectionTrackerEditor data={editData} onSave={d => handleModalSave(editingSection, d)} onCancel={() => { setEditingSection(null); setEditData(null) }} saving={saving} saveError={saveError} />
          )}
          {editingSection === 'interview-history' && (
            <InterviewHistoryViewer data={editData} onCancel={() => { setEditingSection(null); setEditData(null) }} />
          )}
        </ModalOverlay>
      )}
    </div>
  )
}
