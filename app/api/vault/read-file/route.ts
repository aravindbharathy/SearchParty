import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { getSearchDir } from '@/lib/paths'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  // Normalize: strip leading 'search/' if present (agents write full paths)
  const normalizedPath = path.replace(/^search\//, '')

  // Only allow reading from output/ and vault/ directories
  if (!normalizedPath.startsWith('output/') && !normalizedPath.startsWith('vault/')) {
    return NextResponse.json({ error: 'Can only read files from output/ or vault/' }, { status: 403 })
  }

  const searchDir = getSearchDir()
  const fullPath = resolve(join(searchDir, normalizedPath))

  // Prevent path traversal
  if (!fullPath.startsWith(resolve(searchDir))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const content = readFileSync(fullPath, 'utf-8')
  return NextResponse.json({ content, path })
}
