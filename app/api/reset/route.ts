import { NextResponse } from 'next/server'
import { existsSync, readdirSync, unlinkSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'
import YAML from 'yaml'

export async function POST(req: Request) {
  try {
    const searchDir = getSearchDir()
    const { searchParams } = new URL(req.url)
    const full = searchParams.get('full') === 'true'

    const cleared: string[] = []

    // ─── Always cleared ─────────────────────────────────────

    // Clear entries
    const entriesDir = join(searchDir, 'entries')
    if (existsSync(entriesDir)) {
      for (const f of readdirSync(entriesDir)) {
        unlinkSync(join(entriesDir, f))
      }
      cleared.push('entries')
    }

    // Clear generated output — subfolders and root-level files
    const outputDir = join(searchDir, 'output')
    if (existsSync(outputDir)) {
      for (const f of readdirSync(outputDir)) {
        const fp = join(outputDir, f)
        try {
          const stat = require('fs').statSync(fp)
          if (stat.isFile()) {
            unlinkSync(fp)
          } else if (stat.isDirectory()) {
            for (const sf of readdirSync(fp)) {
              unlinkSync(join(fp, sf))
            }
          }
        } catch { /* skip */ }
      }
      cleared.push('output')
    }

    // Reset pipeline
    writeFileSync(join(searchDir, 'pipeline', 'applications.yaml'), 'applications: []\n')
    writeFileSync(join(searchDir, 'pipeline', 'interviews.yaml'), 'interviews: []\n')
    writeFileSync(join(searchDir, 'pipeline', 'offers.yaml'), 'offers: []\n')
    // Clear open roles and messages
    const openRolesPath = join(searchDir, 'pipeline', 'open-roles.yaml')
    if (existsSync(openRolesPath)) unlinkSync(openRolesPath)
    const messagesPath = join(searchDir, 'pipeline', 'messages.yaml')
    if (existsSync(messagesPath)) unlinkSync(messagesPath)
    cleared.push('pipeline')

    // Reset agent sessions
    const agentsDir = join(searchDir, 'agents')
    if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'sessions.yaml'), '{}\n')
    cleared.push('agent sessions')

    // Reset vault manifest (keep actual files)
    writeFileSync(join(searchDir, 'vault', '.manifest.yaml'), 'files: []\n')
    cleared.push('vault manifest')

    // ─── Full reset: also clear context files ───────────────

    if (full) {
      const contextDir = join(searchDir, 'context')
      if (!existsSync(contextDir)) mkdirSync(contextDir, { recursive: true })

      // Reset each context file to empty schema
      const emptySchemas: Record<string, object> = {
        'experience-library': {
          contact: { name: '', email: '', phone: '', linkedin: '', location: '' },
          summary: '',
          experiences: [],
          education: [],
          certifications: [],
          skills: { technical: [], leadership: [] },
        },
        'career-plan': {
          target: { level: '', functions: [], industries: [], locations: [], comp_floor: 0 },
          deal_breakers: [],
          addressing_weaknesses: [],
          resume_preferences: { format: '', summary_length: '', tone: '', avoid_words: [] },
        },
        'qa-master': {
          salary_expectations: '',
          why_leaving: '',
          greatest_weakness: '',
          visa_status: '',
          custom_qa: [],
        },
        'target-companies': { companies: [] },
        'connection-tracker': { contacts: [] },
        'interview-history': {
          interviews: [],
          patterns: { strong_areas: [], weak_areas: [], avg_score: 0, total_interviews: 0 },
        },
      }

      for (const [name, schema] of Object.entries(emptySchemas)) {
        writeFileSync(join(contextDir, `${name}.yaml`), YAML.stringify(schema))
      }
      cleared.push('context files')

      // Clear vault JD files (user-saved JDs from scoring)
      const jdDir = join(searchDir, 'vault', 'job-descriptions')
      if (existsSync(jdDir)) {
        for (const f of readdirSync(jdDir)) {
          unlinkSync(join(jdDir, f))
        }
        cleared.push('vault/job-descriptions')
      }
    }

    const preserved = full
      ? ['vault/resumes (source files)', 'intel files']
      : ['context files', 'vault source files', 'intel files']

    return NextResponse.json({ ok: true, full, cleared, preserved })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
