import { NextResponse } from 'next/server'
import { readdir } from 'fs/promises'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

/**
 * GET — return which company slugs have intel files.
 * Replaces N individual fetch calls with one bulk check.
 */
export async function GET() {
  try {
    const intelDir = join(getSearchDir(), 'intel')
    let files: string[]
    try {
      files = await readdir(intelDir)
    } catch {
      return NextResponse.json({ slugs: [] })
    }

    const slugs = files
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map(f => f.replace(/\.(yaml|yml)$/, ''))

    return NextResponse.json({ slugs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
