import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getSearchDir } from '@/lib/paths'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params
    const filePath = join(getSearchDir(), 'entries', decodeURIComponent(filename))

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const content = readFileSync(filePath, 'utf-8')
    return NextResponse.json({ content })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
