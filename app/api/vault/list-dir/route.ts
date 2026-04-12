import { NextResponse } from 'next/server'
import { existsSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { getSearchDir } from '@/lib/paths'

/**
 * GET /api/vault/list-dir?dir=vault/generated/cover-letters
 * Lists files in a directory under search/. Allowed prefixes: vault/, entries/
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const dir = searchParams.get('dir')

  if (!dir) {
    return NextResponse.json({ error: 'dir parameter required' }, { status: 400 })
  }

  const normalized = dir.replace(/^search\//, '')
  if (!normalized.startsWith('vault/') && !normalized.startsWith('entries/')) {
    return NextResponse.json({ error: 'Can only list vault/ or entries/' }, { status: 403 })
  }

  const searchDir = getSearchDir()
  const fullPath = resolve(join(searchDir, normalized))

  if (!fullPath.startsWith(resolve(searchDir))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ files: [] })
  }

  const files = readdirSync(fullPath)
    .filter(f => !f.startsWith('.') && statSync(join(fullPath, f)).isFile())

  return NextResponse.json({ files })
}
