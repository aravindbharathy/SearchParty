import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { getSearchDir } from '@/lib/paths'

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  md: 'text/plain',
  html: 'text/html',
  css: 'text/css',
  json: 'application/json',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  csv: 'text/csv',
}

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

  try {
    const buffer = await readFile(fullPath)
    const ext = path.split('.').pop()?.toLowerCase() || ''
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
