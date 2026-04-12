import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { getSearchDir } from '@/lib/paths'

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

/**
 * GET /api/vault/serve-file?path=vault/uploads/resumes/file.pdf
 * Serves a binary file with correct content type for browser viewing.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  const normalized = path.replace(/^search\//, '')
  if (!normalized.startsWith('vault/')) {
    return NextResponse.json({ error: 'Can only serve files from vault/' }, { status: 403 })
  }

  const searchDir = getSearchDir()
  const fullPath = resolve(join(searchDir, normalized))

  if (!fullPath.startsWith(resolve(searchDir))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const ext = path.split('.').pop()?.toLowerCase() || ''
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  const buffer = readFileSync(fullPath)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
    },
  })
}
