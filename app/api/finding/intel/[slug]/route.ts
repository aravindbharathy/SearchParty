/**
 * GET /api/finding/intel/[slug]
 * Reads company intel from search/intel/{slug}.yaml
 */

import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const intelPath = join(getSearchDir(), 'intel', `${slug}.yaml`)

    if (!existsSync(intelPath)) {
      return NextResponse.json(
        { error: 'Intel not found', slug },
        { status: 404 },
      )
    }

    const raw = readFileSync(intelPath, 'utf-8')
    const data = YAML.parse(raw)

    return NextResponse.json({ intel: data, raw })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
