import { NextResponse } from 'next/server'
import { existsSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import { getSearchDir } from '@/lib/paths'

export async function POST(req: Request) {
  try {
    const { path } = await req.json() as { path: string }
    if (!path) {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    // Only allow deleting from output/ and vault/ directories
    if (!path.startsWith('output/') && !path.startsWith('vault/')) {
      return NextResponse.json({ error: 'Can only delete files from output/ or vault/' }, { status: 403 })
    }

    const searchDir = getSearchDir()
    const fullPath = resolve(join(searchDir, path))

    // Prevent path traversal
    if (!fullPath.startsWith(resolve(searchDir))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    unlinkSync(fullPath)
    return NextResponse.json({ ok: true, deleted: path })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
