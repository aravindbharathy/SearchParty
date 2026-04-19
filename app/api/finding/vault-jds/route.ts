import { NextResponse } from 'next/server'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { getUploadsDir } from '@/lib/paths'

export async function GET() {
  try {
    const jdDir = join(getUploadsDir(), 'jds')
    if (!existsSync(jdDir)) {
      return NextResponse.json({ files: [] })
    }

    const files = readdirSync(jdDir).filter(
      (f) => !f.startsWith('.') && !f.startsWith('_'),
    )

    return NextResponse.json({ files })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
