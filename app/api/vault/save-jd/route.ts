import { NextResponse } from 'next/server'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getVaultDir } from '@/lib/paths'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      company: string
      role: string
      url?: string
      text: string
    }

    if (!body.text?.trim()) {
      return NextResponse.json({ error: 'JD text is required' }, { status: 400 })
    }

    const vaultDir = getVaultDir()
    const jdDir = join(vaultDir, 'uploads/jds')
    if (!existsSync(jdDir)) mkdirSync(jdDir, { recursive: true })

    // Build filename: company-role.txt (sanitized)
    const company = (body.company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const role = (body.role || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const date = new Date().toISOString().split('T')[0]
    const filename = `${company}-${role}-${date}.txt`
    const filepath = join(jdDir, filename)

    // Build file content with header
    const header = [
      `Company: ${body.company || 'Unknown'}`,
      `Role: ${body.role || 'Unknown'}`,
      body.url ? `URL: ${body.url}` : null,
      `Saved: ${date}`,
      '---',
      '',
    ].filter(Boolean).join('\n')

    writeFileSync(filepath, header + body.text.trim())

    // Relative path for storage in applications
    const relativePath = `vault/uploads/jds/${filename}`

    return NextResponse.json({ ok: true, path: relativePath, filename })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
