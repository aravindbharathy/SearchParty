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

// ─── Skill Registry ────────────────────────────────────────────────────────

export type SkillName = 'score-jd' | 'resume-tailor' | 'setup-experience'

export interface BuildPromptParams {
  skill: SkillName
  jdText?: string
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

    default:
      throw new Error(`Unknown skill: ${params.skill}`)
  }
}
