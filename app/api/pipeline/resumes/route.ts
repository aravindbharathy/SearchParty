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

    const resumes = readdirSync(resumeDir)
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .map(f => {
        const content = readFileSync(join(resumeDir, f), 'utf-8')
        const titleMatch = content.match(/^#\s+(.+)/m)
        // Extract company from filename: company-slug-role-slug-vN.md
        const parts = f.replace(/\.(md|txt)$/, '').split('-')
        return {
          filename: f,
          title: titleMatch?.[1] || f.replace(/\.(md|txt)$/, ''),
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
