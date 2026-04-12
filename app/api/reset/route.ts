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

    // Clear generated output — vault/generated/ subdirectories
    const generatedDir = join(searchDir, 'vault', 'generated')
    const generatedSubs = ['resumes', 'cover-letters', 'outreach', 'prep', 'messages', 'closing']
    for (const sub of generatedSubs) {
      const subDir = join(generatedDir, sub)
      if (existsSync(subDir)) {
        for (const f of readdirSync(subDir)) {
          try { unlinkSync(join(subDir, f)) } catch { /* skip */ }
        }
      }
    }
    if (existsSync(generatedDir)) cleared.push('vault/generated')

    // Reset pipeline
    const pipelineDir = join(searchDir, 'pipeline')
    if (!existsSync(pipelineDir)) mkdirSync(pipelineDir, { recursive: true })
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

    // Reset blackboard file (the on-disk copy that survives in-memory clears)
    const bbPath = join(searchDir, 'blackboard-live.yaml')
    if (existsSync(bbPath)) {
      writeFileSync(bbPath, YAML.stringify({
        blackboard: { project: 'search', description: 'Shared state' },
        agents: {},
        directives: [],
        log: [],
        findings: {},
        transports: {},
      }))
      cleared.push('blackboard file')
    }

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

      // Write known schema files and delete any extras
      const knownContextFiles = new Set(Object.keys(emptySchemas).map(n => `${n}.yaml`))
      for (const [name, schema] of Object.entries(emptySchemas)) {
        writeFileSync(join(contextDir, `${name}.yaml`), YAML.stringify(schema))
      }
      // Remove stale context files not in schema (network.yaml, preferences.yaml, resume-master.yaml, etc.)
      if (existsSync(contextDir)) {
        for (const f of readdirSync(contextDir)) {
          if (f.endsWith('.yaml') && !knownContextFiles.has(f)) {
            try { unlinkSync(join(contextDir, f)) } catch {}
          }
        }
      }
      cleared.push('context files')

      // Clear root-level search state files
      for (const f of ['board.md', 'decisions.yaml', 'snapshot.yaml', 'lessons.md']) {
        const fp = join(searchDir, f)
        if (existsSync(fp)) {
          writeFileSync(fp, '')
        }
      }
      cleared.push('search state files')

      // Clear vault JD files (user-saved JDs from scoring)
      const jdDir = join(searchDir, 'vault', 'uploads', 'jds')
      if (existsSync(jdDir)) {
        for (const f of readdirSync(jdDir)) {
          unlinkSync(join(jdDir, f))
        }
        cleared.push('vault/uploads/jds')
      }

      // Clear intel files (contain embedded profile data from previous sessions)
      const intelDir = join(searchDir, 'intel')
      if (existsSync(intelDir)) {
        for (const f of readdirSync(intelDir)) {
          try { unlinkSync(join(intelDir, f)) } catch {}
        }
        cleared.push('intel')
      }
    }

    const preserved = full
      ? ['vault/uploads (source files)']
      : ['context files', 'vault/uploads', 'intel files']

    return NextResponse.json({ ok: true, full, cleared, preserved })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
