import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

interface ScoredJD {
  filename: string
  company: string
  role: string
  score: number
  recommendation: string
  path: string
  url: string
  date: string
  jd_file: string
  role_id: string
}

function parseScoreFromContent(content: string): { score: number; recommendation: string } {
  // Extract "Overall Fit Score: XX/100" — handles markdown bold (**), whitespace, etc.
  const scoreMatch = content.match(/(?:Overall\s+)?Fit\s+Score[:\s]*\*{0,2}\s*(\d+)\s*\/\s*100\s*\*{0,2}/i)
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0

  // Fallback: look for any "XX/100" pattern near "score"
  if (!scoreMatch) {
    const fallback = content.match(/score[:\s]*\*{0,2}\s*(\d+)\s*\/\s*100/i)
    if (fallback) {
      const fbScore = parseInt(fallback[1], 10)
      if (fbScore > 0 && fbScore <= 100) return { score: fbScore, recommendation: fbScore >= 75 ? 'Apply' : fbScore >= 60 ? 'Referral Only' : 'Skip' }
    }
  }

  // Extract recommendation — handles markdown bold
  const recMatch = content.match(/Recommendation[:\s]*\*{0,2}\s*(Apply|Referral Only|Skip)\s*\*{0,2}/i)
  const recommendation = recMatch ? recMatch[1] : (score >= 75 ? 'Apply' : score >= 60 ? 'Referral Only' : 'Skip')

  return { score, recommendation }
}

interface EntryMetadata {
  company: string
  role: string
  url: string
  date: string
  jd_file: string
  role_id: string
}

function parseMetadataHeader(content: string): { metadata: EntryMetadata | null; body: string } {
  // Parse YAML frontmatter: ---\nKey: Value\n---\n\n...body
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) return { metadata: null, body: content }

  const header = match[1]
  const body = match[2]
  const metadata: EntryMetadata = { company: '', role: '', url: '', date: '', jd_file: '', role_id: '' }

  for (const line of header.split('\n')) {
    const [key, ...rest] = line.split(': ')
    const value = rest.join(': ').trim()
    const k = key.trim().toLowerCase().replace(/\s+/g, '_')
    if (k === 'company') metadata.company = value
    if (k === 'role' || k === 'title' || k === 'position') metadata.role = value
    if (k === 'url' || k === 'link' || k === 'job_url') metadata.url = value
    if (k === 'date' || k === 'scored_date' || k === 'scored') metadata.date = value
    if (k === 'jd_file' || k === 'jd_path' || k === 'file') metadata.jd_file = value
    if (k === 'role_id') metadata.role_id = value
  }

  return { metadata, body }
}

function parseCompanyRole(filename: string): { company: string; role: string } {
  // Pattern: score-jd-{company-role-slug}-{timestamp}.md
  const match = filename.match(/^score-jd-(.+)-\d{4}-\d{2}-\d{2}T[\d-]+\.md$/)
  if (match) {
    const slug = match[1]
    const parts = slug.split('-')
    if (parts.length >= 2) {
      return {
        company: parts[0].charAt(0).toUpperCase() + parts[0].slice(1),
        role: parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
      }
    }
    return { company: slug, role: '' }
  }

  // Fallback for old format: score-jd-{timestamp}-{id}.md
  const oldMatch = filename.match(/^score-jd-(.+)\.md$/)
  if (!oldMatch) return { company: filename, role: '' }
  return { company: 'Unknown', role: '' }
}

export async function GET() {
  try {
    const entriesDir = join(getSearchDir(), 'entries')
    if (!existsSync(entriesDir)) {
      return NextResponse.json({ scoredJDs: [] })
    }

    const files = readdirSync(entriesDir).filter((f) => f.startsWith('score-jd-') && f.endsWith('.md'))
    const scoredJDs: ScoredJD[] = []

    for (const file of files) {
      const filePath = join(entriesDir, file)
      const rawContent = readFileSync(filePath, 'utf-8')
      const { metadata, body: content } = parseMetadataHeader(rawContent)
      const { company: parsedCompany, role: parsedRole } = parseCompanyRole(file)

      // Priority: metadata header > content heading > filename parsing
      const headingMatch = content.match(/^#\s+JD\s+Score:\s*(.+?)\s*[-\u2014]\s*(.+)$/m)
      const company = metadata?.company || (headingMatch ? headingMatch[1].trim() : parsedCompany)
      const role = metadata?.role || (headingMatch ? headingMatch[2].trim() : parsedRole)

      const { score, recommendation } = parseScoreFromContent(content)

      // Extract date from metadata or filename
      const dateStr = metadata?.date || file.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || ''

      scoredJDs.push({
        filename: file,
        company,
        role,
        score,
        recommendation,
        path: filePath,
        url: metadata?.url || '',
        date: dateStr,
        jd_file: metadata?.jd_file || '',
        role_id: metadata?.role_id || '',
      })
    }

    // Sort by score descending
    scoredJDs.sort((a, b) => b.score - a.score)

    return NextResponse.json({ scoredJDs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const { filename } = await req.json() as { filename: string }
    if (!filename || !filename.startsWith('score-jd-') || !filename.endsWith('.md')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const entriesDir = join(getSearchDir(), 'entries')
    const filePath = join(entriesDir, filename)

    // Prevent path traversal
    if (!filePath.startsWith(entriesDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const { unlinkSync } = await import('fs')
    unlinkSync(filePath)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
