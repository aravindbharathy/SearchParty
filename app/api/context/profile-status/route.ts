import { NextResponse } from 'next/server'
import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { loadProfileSchema, checkSectionStatus, type SectionStatus } from '@/lib/profile-schema'

export async function GET() {
  try {
    const schema = loadProfileSchema()
    const searchDir = getSearchDir()
    const contextDir = join(searchDir, 'context')

    const sections: Record<string, SectionStatus & { lastModified: string | null }> = {}
    let contextReady = true

    for (const [name, sectionDef] of Object.entries(schema.sections)) {
      // Map section name to filename
      const filename = `${name}.yaml`
      const filepath = join(contextDir, filename)

      let data: Record<string, unknown> = {}
      let lastModified: string | null = null

      if (existsSync(filepath)) {
        try {
          data = YAML.parse(readFileSync(filepath, 'utf-8')) || {}
          lastModified = statSync(filepath).mtime.toISOString()
        } catch {
          data = {}
        }
      }

      // Normalize agent field aliases before checking
      if (name === 'career-plan') {
        const target = data.target as Record<string, unknown> | undefined
        if (target && !target.comp_floor && target.comp && typeof target.comp === 'object') {
          const comp = target.comp as Record<string, unknown>
          target.comp_floor = comp.total_comp_floor ?? comp.comp_floor ?? comp.floor ?? 0
        }
        if (!data.what_matters && data.what_matters_most) data.what_matters = data.what_matters_most
        if (!data.addressing_weaknesses && data.weaknesses) data.addressing_weaknesses = data.weaknesses
      }

      const status = checkSectionStatus(name, data, schema)
      sections[name] = {
        ...status,
        lastModified,
      }

      // contextReady requires experience-library AND career-plan to be filled
      if ((name === 'experience-library' || name === 'career-plan') && !status.filled) {
        contextReady = false
      }
    }

    return NextResponse.json({ sections, contextReady })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
