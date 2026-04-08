/**
 * lib/agent-prompts.ts — Builds complete prompts with embedded context for -p mode agents.
 *
 * Agents spawned via `claude -p "prompt"` are stateless text processors.
 * They CANNOT read files, write files, or run commands.
 * All context must be fetched server-side and injected into the prompt text.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { readContext } from './context'
import { getSearchDir, getVaultDir } from './paths'

// ─── Vault File Reading ────────────────────────────────────────────────────

interface VaultFile {
  filename: string
  content: string
}

/**
 * Read text-based files from a vault subfolder.
 * Only reads .txt and .md files directly. PDFs are noted as unavailable.
 */
function readVaultFiles(subfolder: string): VaultFile[] {
  const dir = join(getVaultDir(), subfolder)
  if (!existsSync(dir)) return []

  const files: VaultFile[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const filepath = join(dir, entry)
      const ext = entry.toLowerCase().split('.').pop() || ''

      if (['txt', 'md'].includes(ext)) {
        try {
          const content = readFileSync(filepath, 'utf-8')
          files.push({ filename: entry, content })
        } catch {
          files.push({ filename: entry, content: '(error reading file)' })
        }
      } else if (ext === 'pdf') {
        files.push({
          filename: entry,
          content: '(PDF file — content not available in dashboard mode. Run /setup experience in your terminal for PDF parsing.)',
        })
      }
    }
  } catch {
    // directory read error
  }
  return files
}

// ─── Prompt Builders ───────────────────────────────────────────────────────

/**
 * Build a complete prompt for the score-jd skill.
 * Embeds career plan + experience library + the JD text.
 */
export async function buildScoreJDPrompt(jdText: string): Promise<string> {
  const careerPlan = await readContext('career-plan')
  const experience = await readContext('experience-library')

  const careerPlanYaml = YAML.stringify(careerPlan)
  const experienceYaml = YAML.stringify(experience)

  return `You are a job fit scoring expert. Score this job description against the candidate's profile.

=== CANDIDATE CAREER PLAN ===
${careerPlanYaml || '(not set up yet)'}

=== CANDIDATE EXPERIENCE ===
${experienceYaml || '(not set up yet)'}

=== JOB DESCRIPTION TO SCORE ===
${jdText}

Score across 5 dimensions (each 0-20, total 0-100):
1. Level match — does the JD level match the candidate's target?
2. Function match — do the required functions align?
3. Industry match — is the industry a good fit?
4. Skills overlap — how many required skills does the candidate have?
5. Culture indicators — any alignment signals?

Output format:
- Overall Fit Score: XX/100
- Per-dimension scores with brief notes
- Red flags (visa, relocation, deal breakers)
- Salary estimate if possible
- Recommendation: Apply / Referral Only / Skip
- Gaps: what the JD requires that the candidate lacks`
}

/**
 * Build a complete prompt for the resume-tailor skill.
 * Embeds experience library + career plan + the JD text.
 */
export async function buildResumeTailorPrompt(jdText: string): Promise<string> {
  const experience = await readContext('experience-library')
  const careerPlan = await readContext('career-plan')

  const experienceYaml = YAML.stringify(experience)
  const careerPlanYaml = YAML.stringify(careerPlan)

  return `You are a resume tailoring expert. Use the candidate's experience and career plan below to produce a tailored resume for the given job description.

=== CANDIDATE EXPERIENCE LIBRARY ===
${experienceYaml || '(not set up yet — output a note that experience must be set up first)'}

=== CANDIDATE CAREER PLAN ===
${careerPlanYaml || '(not set up yet)'}

=== JOB DESCRIPTION ===
${jdText}

Produce a tailored resume. Output ONLY the resume in clean Markdown format — no explanations, no preamble. Include:
- Contact header
- Tailored 2-line summary
- Work experience with bullets reordered/rewritten for this specific JD
- Education
- Skills section with keyword coverage

Use REAL data from the experience library. Never fabricate. Reorder and emphasize bullets that match the JD.

After the resume, add a section "---\\n## Review" with:
- Keyword coverage score (% of JD requirements addressed)
- Recruiter scan assessment (would a recruiter keep reading?)
- ATS formatting check (any issues?)`
}

/**
 * Build a complete prompt for the setup-experience (parse resume) skill.
 * Reads actual resume files from vault/resumes/ and embeds their content.
 */
export async function buildParseResumePrompt(): Promise<string> {
  const vaultFiles = readVaultFiles('resumes')

  let resumeContent = ''
  if (vaultFiles.length === 0) {
    resumeContent = '(No resume files found in vault/resumes/. Cannot parse.)'
  } else {
    for (const file of vaultFiles) {
      resumeContent += `\n--- FILE: ${file.filename} ---\n${file.content}\n`
    }
  }

  return `Parse the following resume content into a structured experience library.

=== RESUME FILE CONTENT ===
${resumeContent}

Output ONLY valid YAML matching this exact schema (no explanations, no markdown fences, just YAML):

contact:
  name: ""
  email: ""
  phone: ""
  linkedin: ""
  location: ""
summary: "2-3 sentence career summary"
experiences:
  - id: exp-001
    company: "Company Name"
    role: "Role Title"
    dates: "2022-2024"
    projects:
      - name: "Project Name"
        metrics: ["Specific measurable achievement"]
        skills: [skill1, skill2]
        star_stories:
          - situation: ""
            task: ""
            action: ""
            result: ""
education:
  - institution: ""
    degree: ""
    field: ""
    year: ""
certifications: []
skills:
  technical:
    - name: "skill"
      proficiency: "expert"
      years: 5
  leadership: []

Extract REAL data from the resume. Push for specifics — include metrics, team sizes, and concrete outcomes. Output ONLY the YAML.`
}

// ─── Phase 3 Prompt Builders ──────────────────────────────────────────────

/**
 * Build a prompt for the company-research skill (single company).
 * Reads career-plan + target-companies for context.
 */
export async function buildCompanyResearchPrompt(companyName: string): Promise<string> {
  const careerPlan = await readContext('career-plan')
  const targetCompanies = await readContext('target-companies')

  const careerPlanYaml = YAML.stringify(careerPlan)
  const targetCompaniesYaml = YAML.stringify(targetCompanies)

  return `You are a company research expert. Research "${companyName}" and produce structured intel for a job seeker.

=== CANDIDATE CAREER PLAN ===
${careerPlanYaml || '(not set up yet)'}

=== CURRENT TARGET COMPANIES ===
${targetCompaniesYaml || '(none yet)'}

Research the company "${companyName}" thoroughly. Use web search to find information from Glassdoor, Blind, levels.fyi, the company careers page, and recent news.

Output ONLY valid YAML matching this schema (no markdown fences, just YAML):

company: "${companyName}"
slug: "{kebab-case-slug}"
industry: ""
hq: ""
size: ""
stage: ""
website: ""
careers_url: ""

culture:
  values: []
  engineering_culture: ""
  remote_policy: ""

interview:
  stages:
    - name: ""
      duration: ""
      format: ""
      notes: ""
  timeline: ""
  tips: []

comp:
  currency: USD
  bands:
    - level: ""
      base: ""
      equity: ""
      total: ""
  notes: ""

roles: []
notes: ""

Be specific with compensation bands (use real levels.fyi / Glassdoor data). Include at least 3 interview tips specific to this company. Note the remote/hybrid policy accurately.`
}

/**
 * Build a prompt for the generate-targets skill.
 * Reads career-plan to generate a ranked list of target companies.
 */
export async function buildGenerateTargetsPrompt(): Promise<string> {
  const careerPlan = await readContext('career-plan')
  const careerPlanYaml = YAML.stringify(careerPlan)

  return `You are a career strategy expert. Generate a ranked list of target companies for this candidate.

=== CANDIDATE CAREER PLAN ===
${careerPlanYaml || '(not set up yet)'}

Based on the candidate's target level, functions, industries, locations, and compensation floor, generate a ranked list of companies that would be a good fit. Web-search for companies actively hiring for matching roles.

Output ONLY valid YAML matching this schema (no markdown fences, just YAML):

companies:
  - name: "Company Name"
    slug: "company-slug"
    fit_score: 85
    status: "researching"
    priority: "high"
    notes: "Brief reason for fit"

Generate approximately 30-50 companies. For each:
- fit_score: 0-100 based on alignment with career plan
- priority: "high" (fit_score >= 75), "medium" (50-74), "low" (< 50)
- notes: 1-sentence explanation of why this company fits

Sort by fit_score descending. Include a mix of:
- Large tech companies (FAANG+)
- Growth-stage startups (Series B-D)
- Late-stage private companies
- Companies in the candidate's target industries

Focus on companies that are actively hiring for roles matching the candidate's target functions and level.`
}

/**
 * Build a prompt for the connection-request skill.
 * Reads target-companies, connection-tracker, experience-library.
 */
export async function buildConnectionRequestPrompt(batchSize: number = 25): Promise<string> {
  const targetCompanies = await readContext('target-companies')
  const connectionTracker = await readContext('connection-tracker')
  const experience = await readContext('experience-library')

  const targetCompaniesYaml = YAML.stringify(targetCompanies)
  const connectionTrackerYaml = YAML.stringify(connectionTracker)
  const experienceYaml = YAML.stringify(experience)

  return `You are a networking expert. Generate personalized LinkedIn connection requests.

=== TARGET COMPANIES ===
${targetCompaniesYaml || '(none yet)'}

=== EXISTING CONNECTIONS (do not duplicate) ===
${connectionTrackerYaml || '(none yet)'}

=== CANDIDATE EXPERIENCE (for personalization) ===
${experienceYaml || '(not set up yet)'}

Generate up to ${batchSize} personalized LinkedIn connection requests. Requirements:

1. **Round-robin across target companies** — distribute messages across companies, not all to one
2. **Each message must be under 300 characters** (LinkedIn limit)
3. **Each message must reference something specific** — shared background, company news, mutual interest
4. **Skip contacts already in the connection tracker** to avoid duplicates
5. **Minimum 1 message per targeted company** if batch size allows

For each message, web-search the company to find contactable people (engineers, hiring managers, recruiters at the right level).

Use the candidate's experience library for "shared background" personalization (e.g., same university, same previous employer, similar tech stack).

Output format — ONLY valid YAML (no markdown fences):

messages:
  - contact_name: "Full Name"
    contact_role: "Their Role"
    company: "Company Name"
    linkedin_url: ""
    message: "The connection request message (under 300 chars)"
    personalization_note: "Why this message is personalized"

new_contacts:
  - id: "conn-{NNN}"
    name: "Full Name"
    company: "Company Name"
    role: "Their Role"
    relationship: "cold"
    linkedin_url: ""
    outreach:
      - date: "{today YYYY-MM-DD}"
        type: "connection-request"
        status: "sent"
        message_summary: "Brief summary"
    follow_ups:
      - due: "{today + 3 days}"
        type: "connection-nudge"
        outreach_ref: "connection-request-{date}"
        status: "pending"
      - due: "{today + 7 days}"
        type: "connection-nudge"
        outreach_ref: "connection-request-{date}"
        status: "pending"
      - due: "{today + 14 days}"
        type: "connection-nudge"
        outreach_ref: "connection-request-{date}"
        status: "pending"
    notes: ""

Generate real, personalized messages. Never use template placeholders like {name} in the actual message text.`
}

/**
 * Build a prompt for the referral-request skill.
 * Reads connection-tracker for the specified contact.
 */
export async function buildReferralRequestPrompt(contactName: string, company: string): Promise<string> {
  const connectionTracker = await readContext('connection-tracker')
  const connectionTrackerYaml = YAML.stringify(connectionTracker)

  return `You are a networking expert. Generate a 3-message referral request sequence.

=== CONNECTION TRACKER ===
${connectionTrackerYaml || '(none yet)'}

Generate a 3-message referral request sequence for contact "${contactName}" at "${company}".

The sequence:
1. **Day 0 — Initial warm-up / ask**: Casual, warm message referencing your connection. Ask if they'd be open to referring you.
2. **Day 3 — Strong push with specifics**: If no response, follow up with specific role details and why you're a great fit.
3. **Day 7 — Hiring manager fallback**: If still no response, ask if they can point you to the hiring manager instead.

Output format — ONLY valid YAML (no markdown fences):

sequence:
  - day: 0
    subject: "Message subject/context"
    message: "Full message text"
    type: "referral-request"
  - day: 3
    subject: "Follow-up subject"
    message: "Full message text"
    type: "referral-step-2"
  - day: 7
    subject: "Final follow-up subject"
    message: "Full message text"
    type: "referral-step-3"

outreach_updates:
  contact_name: "${contactName}"
  company: "${company}"
  outreach:
    - date: "{today YYYY-MM-DD}"
      type: "referral-request"
      status: "sent"
      message_summary: "Referral request sequence initiated"
  follow_ups:
    - due: "{today + 3 days}"
      type: "referral-step-2"
      outreach_ref: "referral-request-{date}"
      status: "pending"
    - due: "{today + 7 days}"
      type: "referral-step-3"
      outreach_ref: "referral-request-{date}"
      status: "pending"

Make messages personal and specific. Reference any prior interactions from the connection tracker. Each message should escalate naturally without being pushy.`
}

/**
 * Build a prompt for the linkedin-audit skill.
 * Reads career-plan, experience-library, and top vault JDs.
 */
export async function buildLinkedinAuditPrompt(): Promise<string> {
  const careerPlan = await readContext('career-plan')
  const experience = await readContext('experience-library')
  const jdFiles = readVaultFiles('job-descriptions').slice(0, 5)

  const careerPlanYaml = YAML.stringify(careerPlan)
  const experienceYaml = YAML.stringify(experience)

  let jdContent = ''
  if (jdFiles.length === 0) {
    jdContent = '(No JD files found in vault)'
  } else {
    for (const file of jdFiles) {
      jdContent += `\n--- JD: ${file.filename} ---\n${file.content}\n`
    }
  }

  return `You are a LinkedIn profile optimization expert. Audit the candidate's LinkedIn positioning against their target roles.

=== CANDIDATE CAREER PLAN ===
${careerPlanYaml || '(not set up yet)'}

=== CANDIDATE EXPERIENCE ===
${experienceYaml || '(not set up yet)'}

=== TOP TARGET JOB DESCRIPTIONS ===
${jdContent}

Analyze the candidate's experience against their target JDs and career plan. Produce specific before/after suggestions for each LinkedIn profile section.

Output format (Markdown):

# LinkedIn Profile Audit

## Headline
**Current positioning**: (inferred from experience)
**Suggested**: "New headline text"
**Why**: Brief explanation

## About Section
**Suggested** (full text):
> The new About section text...

**Key changes**: What's different and why

## Experience Section
For each relevant role:
### {Company} — {Role}
**Current bullets** (inferred):
- ...
**Suggested bullets**:
- ...
**Changes**: What keywords/framing changed

## Skills Section
**Add**: skill1, skill2, skill3
**Remove**: skill4 (not aligned with targets)
**Reorder top 3**: skill1 > skill2 > skill3

## Overall Assessment
- Keyword coverage score: X% of target JD keywords present
- Recruiter scan verdict: Would a recruiter keep reading?
- Top 3 changes with highest impact

Be specific — give exact text, not vague advice like "make it more impactful".`
}

/**
 * Build a prompt for the daily-briefing skill.
 * Reads applications, interviews, connection-tracker, snapshot.
 */
export async function buildDailyBriefingPrompt(): Promise<string> {
  const connectionTracker = await readContext('connection-tracker')
  const connectionTrackerYaml = YAML.stringify(connectionTracker)

  // Read pipeline files directly
  const searchDir = getSearchDir()
  let applicationsYaml = '(none)'
  let interviewsYaml = '(none)'
  let snapshotYaml = '(none)'

  try {
    const appPath = join(searchDir, 'pipeline', 'applications.yaml')
    if (existsSync(appPath)) {
      applicationsYaml = readFileSync(appPath, 'utf-8')
    }
  } catch { /* ok */ }

  try {
    const intPath = join(searchDir, 'pipeline', 'interviews.yaml')
    if (existsSync(intPath)) {
      interviewsYaml = readFileSync(intPath, 'utf-8')
    }
  } catch { /* ok */ }

  try {
    const snapPath = join(searchDir, 'context', 'snapshot.yaml')
    if (existsSync(snapPath)) {
      snapshotYaml = readFileSync(snapPath, 'utf-8')
    }
  } catch { /* ok */ }

  const today = new Date().toISOString().split('T')[0]

  return `You are a job search coach. Produce a daily briefing for ${today}.

=== APPLICATIONS ===
${applicationsYaml}

=== INTERVIEWS ===
${interviewsYaml}

=== CONNECTION TRACKER ===
${connectionTrackerYaml || '(none)'}

=== SNAPSHOT ===
${snapshotYaml}

Produce a daily briefing covering:

1. **Overdue Follow-ups** — List each with exact name, company, and what action to take
2. **Interviews Coming Up** (next 7 days) — With prep status and what to prepare
3. **Stale Applications** — No activity in 7+ days, suggest next action
4. **Networking Status** — Connection follow-ups due, reply rate, suggested batch if cadence is due
5. **Pipeline Summary** — Applications by stage (researching, applied, phone-screen, onsite, offer, rejected)
6. **Suggested Actions for Today** — Top 3-5 prioritized actions

Output format (Markdown):

# Daily Briefing — ${today}

## Action Items (Do These Today)
1. ...
2. ...
3. ...

## Overdue Follow-ups
| Contact/Company | Type | Due | Action |
|----------------|------|-----|--------|
| ... | ... | ... | ... |

## Upcoming Interviews
| Company | Role | Date | Prep Status | To Prepare |
|---------|------|------|-------------|------------|
| ... | ... | ... | ... | ... |

## Stale Applications
| Company | Role | Last Activity | Suggested Action |
|---------|------|--------------|-----------------|
| ... | ... | ... | ... |

## Networking Pulse
- Total contacts: X
- Pending follow-ups: X
- Reply rate: X%
- Next batch recommended: Yes/No

## Pipeline Summary
| Stage | Count |
|-------|-------|
| ... | ... |

Be specific and actionable. Every item should have a clear next step.`
}

// ─── Skill Registry ────────────────────────────────────────────────────────

export type SkillName =
  | 'score-jd'
  | 'resume-tailor'
  | 'setup-experience'
  | 'company-research'
  | 'generate-targets'
  | 'connection-request'
  | 'referral-request'
  | 'linkedin-audit'
  | 'daily-briefing'

export interface BuildPromptParams {
  skill: SkillName
  jdText?: string
  companyName?: string
  contactName?: string
  company?: string
  batchSize?: number
}

/**
 * Build a prompt for any registered skill.
 * This is the main entry point used by the /api/agent/build-prompt route.
 */
export async function buildPrompt(params: BuildPromptParams): Promise<string> {
  switch (params.skill) {
    case 'score-jd':
      if (!params.jdText) throw new Error('jdText is required for score-jd skill')
      return buildScoreJDPrompt(params.jdText)

    case 'resume-tailor':
      if (!params.jdText) throw new Error('jdText is required for resume-tailor skill')
      return buildResumeTailorPrompt(params.jdText)

    case 'setup-experience':
      return buildParseResumePrompt()

    case 'company-research':
      if (!params.companyName) throw new Error('companyName is required for company-research skill')
      return buildCompanyResearchPrompt(params.companyName)

    case 'generate-targets':
      return buildGenerateTargetsPrompt()

    case 'connection-request':
      return buildConnectionRequestPrompt(params.batchSize ?? 25)

    case 'referral-request':
      if (!params.contactName || !params.company) {
        throw new Error('contactName and company are required for referral-request skill')
      }
      return buildReferralRequestPrompt(params.contactName, params.company)

    case 'linkedin-audit':
      return buildLinkedinAuditPrompt()

    case 'daily-briefing':
      return buildDailyBriefingPrompt()

    default:
      throw new Error(`Unknown skill: ${params.skill}`)
  }
}
