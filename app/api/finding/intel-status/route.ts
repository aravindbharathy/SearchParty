import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

const MIN_INTEL_SIZE = 100 // bytes — files smaller than this are likely incomplete

export async function GET() {
  try {
    const intelDir = join(getSearchDir(), 'intel')
    let files: string[]
    try {
      files = await readdir(intelDir)
    } catch {
      return NextResponse.json({ slugs: [] })
    }

    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    const slugs: string[] = []

    for (const f of yamlFiles) {
      try {
        const s = await stat(join(intelDir, f))
        if (s.size >= MIN_INTEL_SIZE) {
          slugs.push(f.replace(/\.(yaml|yml)$/, ''))
        }
      } catch { /* skip */ }
    }

    return NextResponse.json({ slugs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
