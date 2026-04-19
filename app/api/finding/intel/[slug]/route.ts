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

    // Handle two formats:
    // 1. Pure YAML (structured intel from templates/manual)
    // 2. YAML frontmatter + markdown body (agent-generated research)
    let data: Record<string, unknown> = {}
    let markdown = ''

    const frontmatterMatch = raw.match(/^([\s\S]*?)\n\n##\s/)
    if (frontmatterMatch) {
      // Has YAML header followed by markdown sections
      const yamlPart = frontmatterMatch[1]
      markdown = raw.slice(yamlPart.length).trim()
      try { data = YAML.parse(yamlPart) || {} } catch { data = {} }
    } else {
      // Try parsing as pure YAML
      try { data = YAML.parse(raw, { uniqueKeys: false }) || {} } catch {
        // Malformed YAML — render the raw content as markdown fallback
        data = {}
        markdown = '```yaml\n' + raw + '\n```'
      }
    }

    // Ensure company field exists
    if (!data.company && data.slug) data.company = String(data.slug).charAt(0).toUpperCase() + String(data.slug).slice(1)

    return NextResponse.json({ intel: data, raw, markdown })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
