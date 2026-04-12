import { NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

function getResumeDir(): string {
  const dir = join(getSearchDir(), 'output', 'resumes')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * GET — list all structured resumes (JSON files)
 */
export async function GET() {
  try {
    const dir = getResumeDir()
    const resumes = readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(readFileSync(join(dir, f), 'utf-8'))
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a: Record<string, string>, b: Record<string, string>) => (b.updated_at || '').localeCompare(a.updated_at || ''))

    return NextResponse.json({ resumes })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

/**
 * POST — save a structured resume
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const dir = getResumeDir()
    const id = body.id || `resume-${Date.now()}`
    const slug = `${(body.target_company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(body.target_role || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

    body.id = id
    body.updated_at = new Date().toISOString()
    if (!body.created_at) body.created_at = body.updated_at

    const filename = `${slug}-v${body.version || 1}.json`
    writeFileSync(join(dir, filename), JSON.stringify(body, null, 2))

    return NextResponse.json({ ok: true, id, filename })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
