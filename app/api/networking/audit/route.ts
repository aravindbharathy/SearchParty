import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

/**
 * GET — read all LinkedIn-related output files from search/output/
 * Returns each file separately so the UI can display them as tabs/sections.
 */
export async function GET() {
  try {
    const outputDir = join(getSearchDir(), 'output')
    if (!existsSync(outputDir)) {
      return NextResponse.json({ documents: [] })
    }

    const allFiles = readdirSync(outputDir)
      .filter(f => f.startsWith('linkedin') && f.endsWith('.md'))
      .sort()
      .reverse()

    if (allFiles.length === 0) {
      return NextResponse.json({ documents: [] })
    }

    const documents = allFiles.map(file => {
      const content = readFileSync(join(outputDir, file), 'utf-8')
      // Extract title from first markdown heading, fall back to filename
      const headingMatch = content.match(/^#\s+(.+)/m)
      const title = headingMatch
        ? headingMatch[1].trim()
        : file.replace(/\.md$/, '').replace(/[-_]\d{4}-\d{2}-\d{2}$/, '').replace(/[-_]/g, ' ').replace(/^linkedin\s*/i, '').replace(/^\w/, c => c.toUpperCase()) || 'LinkedIn Document'
      return { filename: file, title, content }
    })

    return NextResponse.json({ documents })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
