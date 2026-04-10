import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

/**
 * GET — read the latest LinkedIn audit file from search/output/
 * Returns the markdown content of the most recent linkedin-audit-*.md file.
 */
export async function GET() {
  try {
    const outputDir = join(getSearchDir(), 'output')
    if (!existsSync(outputDir)) {
      return NextResponse.json({ content: null })
    }

    // Find the most recent linkedin-audit file
    const files = readdirSync(outputDir)
      .filter(f => f.startsWith('linkedin-audit') && f.endsWith('.md'))
      .sort()
      .reverse()

    if (files.length === 0) {
      return NextResponse.json({ content: null })
    }

    const filePath = join(outputDir, files[0])
    const content = readFileSync(filePath, 'utf-8')

    return NextResponse.json({
      content,
      filename: files[0],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
