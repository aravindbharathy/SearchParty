import { NextResponse } from 'next/server'
import { existsSync, readdirSync, unlinkSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

export async function POST() {
  try {
    const searchDir = getSearchDir()

    // Clear entries
    const entriesDir = join(searchDir, 'entries')
    if (existsSync(entriesDir)) {
      for (const f of readdirSync(entriesDir)) {
        unlinkSync(join(entriesDir, f))
      }
    }

    // Clear generated output
    for (const sub of ['resumes', 'cover-letters', 'messages', 'work-products']) {
      const dir = join(searchDir, 'output', sub)
      if (existsSync(dir)) {
        for (const f of readdirSync(dir)) {
          unlinkSync(join(dir, f))
        }
      }
    }

    // Reset pipeline
    writeFileSync(join(searchDir, 'pipeline', 'applications.yaml'), 'applications: []\n')
    writeFileSync(join(searchDir, 'pipeline', 'interviews.yaml'), 'interviews: []\n')
    writeFileSync(join(searchDir, 'pipeline', 'offers.yaml'), 'offers: []\n')

    // Reset agent sessions
    const agentsDir = join(searchDir, 'agents')
    if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'sessions.yaml'), '{}\n')

    // Reset vault manifest (keep the actual files)
    writeFileSync(join(searchDir, 'vault', '.manifest.yaml'), 'files: []\n')

    // Note: context files (experience, career plan, etc.) are NOT reset
    // Note: vault source files (resumes, JDs) are NOT reset
    // Note: intel files are NOT reset

    return NextResponse.json({
      ok: true,
      cleared: ['entries', 'output/resumes', 'output/messages', 'output/cover-letters', 'output/work-products', 'pipeline', 'agent sessions', 'vault manifest'],
      preserved: ['context files', 'vault source files', 'intel files'],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
