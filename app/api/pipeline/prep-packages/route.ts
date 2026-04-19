import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getGeneratedDir } from '@/lib/paths'

export async function GET() {
  try {
    const prepDir = join(getGeneratedDir(), 'prep')
    if (!existsSync(prepDir)) {
      return NextResponse.json({ packages: [] })
    }

    const packages = readdirSync(prepDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const content = readFileSync(join(prepDir, f), 'utf-8')
        const titleMatch = content.match(/^#\s+(.+)/m)
        return {
          filename: f,
          title: titleMatch?.[1] || f.replace('.md', ''),
          content,
        }
      })
      .sort()
      .reverse()

    return NextResponse.json({ packages })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
