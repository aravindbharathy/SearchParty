import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const fp = join(getSearchDir(), 'context', 'target-companies.yaml')

    if (!existsSync(fp)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    const companies = Array.isArray(raw.companies) ? raw.companies : []
    const idx = companies.findIndex((c: { slug?: string }) => c.slug === slug)

    if (idx === -1) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const removed = companies.splice(idx, 1)[0]
    raw.companies = companies
    writeFileSync(fp, YAML.stringify(raw))

    return NextResponse.json({ ok: true, removed })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
