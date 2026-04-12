import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, basename, resolve } from 'path'
import { getVaultDir } from '@/lib/paths'

const VALID_SUBFOLDERS = ['uploads/resumes', 'uploads/jds', 'uploads/transcripts', 'uploads/portfolio', 'uploads/templates'] as const

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const subfolder = formData.get('subfolder') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!subfolder || !VALID_SUBFOLDERS.includes(subfolder as typeof VALID_SUBFOLDERS[number])) {
      return NextResponse.json(
        { error: `Invalid subfolder. Must be one of: ${VALID_SUBFOLDERS.join(', ')}` },
        { status: 400 }
      )
    }

    const vaultDir = getVaultDir()
    const targetDir = join(vaultDir, subfolder)

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    // Sanitize filename to prevent path traversal
    const safeName = basename(file.name).replace(/[^\w.\-]/g, '_')
    if (!safeName || safeName.startsWith('.')) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filePath = join(targetDir, safeName)

    // Verify resolved path is within vault directory
    if (!resolve(filePath).startsWith(resolve(vaultDir))) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }

    writeFileSync(filePath, buffer)

    return NextResponse.json({
      ok: true,
      path: filePath,
      name: safeName,
      subfolder,
      size: buffer.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
