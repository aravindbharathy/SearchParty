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
}

function parseScoreFromContent(content: string): { score: number; recommendation: string } {
  // Try to extract "Overall Fit Score: XX/100"
  const scoreMatch = content.match(/(?:Overall\s+)?Fit\s+Score:\s*(\d+)\s*\/\s*100/i)
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0

  // Try to extract recommendation
  const recMatch = content.match(/Recommendation:\s*\*{0,2}(Apply|Referral Only|Skip)\*{0,2}/i)
  const recommendation = recMatch ? recMatch[1] : (score >= 75 ? 'Apply' : score >= 60 ? 'Referral Only' : 'Skip')

  return { score, recommendation }
}

function parseCompanyRole(filename: string): { company: string; role: string } {
  // Pattern: score-jd-{company-slug}-{role-slug}.md
  const match = filename.match(/^score-jd-(.+)\.md$/)
  if (!match) return { company: filename, role: '' }

  const parts = match[1].split('-')
  // Heuristic: first part is company, rest is role
  // But since both are slugified, try to split intelligently
  // For now, use the full slug as company-role display
  const slug = match[1]
  const dashParts = slug.split('-')

  if (dashParts.length >= 2) {
    // First chunk is likely company, rest is role
    return {
      company: dashParts[0].charAt(0).toUpperCase() + dashParts[0].slice(1),
      role: dashParts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
    }
  }

  return { company: slug, role: '' }
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
      const content = readFileSync(filePath, 'utf-8')
      const { company: parsedCompany, role: parsedRole } = parseCompanyRole(file)

      // Try to extract company/role from content heading
      const headingMatch = content.match(/^#\s+JD\s+Score:\s*(.+?)\s*[-\u2014]\s*(.+)$/m)
      const company = headingMatch ? headingMatch[1].trim() : parsedCompany
      const role = headingMatch ? headingMatch[2].trim() : parsedRole

      const { score, recommendation } = parseScoreFromContent(content)

      scoredJDs.push({
        filename: file,
        company,
        role,
        score,
        recommendation,
        path: filePath,
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
