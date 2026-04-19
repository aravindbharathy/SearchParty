import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getGeneratedDir } from '@/lib/paths'

export async function GET() {
  try {
    const resumeDir = join(getGeneratedDir(), 'resumes')
    if (!existsSync(resumeDir)) {
      return NextResponse.json({ resumes: [] })
    }

    // Get all files in the directory
    const allFiles = readdirSync(resumeDir)
    // Build set of JSON resume slugs so we can skip their markdown duplicates
    const jsonSlugs = new Set(
      allFiles.filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
    )
    const resumes = allFiles
      .filter(f => (f.endsWith('.md') || f.endsWith('.txt')) && !jsonSlugs.has(f.replace(/\.(md|txt)$/, '')))
      .map(f => {
        const content = readFileSync(join(resumeDir, f), 'utf-8')
        // Build a readable title from the filename: twilio-director-ux-research-v1.md → "Twilio — Director UX Research v1"
        const slug = f.replace(/\.(md|txt)$/, '')
        const parts = slug.split('-')
        const company = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : ''
        const roleSlug = parts.slice(1).join(' ').replace(/\bv(\d+)$/, '(v$1)')
        const title = company && roleSlug ? `${company} — ${roleSlug}` : slug
        return {
          filename: f,
          title,
          company: parts[0] || '',
          content,
          size: content.length,
        }
      })
      .sort()
      .reverse()

    return NextResponse.json({ resumes })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
