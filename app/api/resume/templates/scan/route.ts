import { NextResponse } from 'next/server'
import { existsSync, readdirSync, statSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getUploadsDir } from '@/lib/paths'

/**
 * GET — list all files in vault/uploads/templates/ (raw + processed)
 * Returns each file with its type (raw = docx/pdf, processed = html/css)
 */
export async function GET() {
  try {
    const dir = join(getUploadsDir(), 'templates')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      return NextResponse.json({ files: [] })
    }

    const entries = readdirSync(dir).filter(f => !f.startsWith('.'))
    const files = entries
      .filter(f => {
        const full = join(dir, f)
        return statSync(full).isFile()
      })
      .map(f => {
        const ext = f.split('.').pop()?.toLowerCase() || ''
        const name = f.replace(/\.[^.]+$/, '')
        const isProcessed = ext === 'html' || ext === 'css'
        const size = statSync(join(dir, f)).size
        return { filename: f, name, ext, isProcessed, size }
      })

    // Group: for each base name, determine if a processed version exists
    const processedNames = new Set(
      files.filter(f => f.isProcessed).map(f => f.name)
    )

    const result = files.map(f => ({
      ...f,
      hasProcessedVersion: processedNames.has(f.name),
    }))

    return NextResponse.json({ files: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
