import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')

  if (!path) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  // Security: only allow reading from vault/uploads/jds/
  if (!path.startsWith('vault/uploads/jds/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const fullPath = join(getSearchDir(), path)
  if (!fullPath.startsWith(getSearchDir())) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const content = readFileSync(fullPath, 'utf-8')

  // Strip the header (Company/Role/URL/Saved/---) to get just the JD text
  const headerEnd = content.indexOf('---\n\n')
  const jdText = headerEnd >= 0 ? content.slice(headerEnd + 5) : content

  return NextResponse.json({ text: jdText, raw: content })
}
