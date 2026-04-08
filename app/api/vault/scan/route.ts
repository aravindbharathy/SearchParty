import { NextResponse } from 'next/server'
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'

const SUBFOLDERS = ['resumes', 'jds', 'transcripts', 'work-products'] as const

interface ManifestEntry {
  file: string
  subfolder: string
  status: 'new' | 'parsed' | 'rescan-needed'
  added_at: string
  parsed_at?: string
}

interface Manifest {
  files: ManifestEntry[]
}

function getVaultDir(): string {
  const searchDir = join(process.cwd(), process.env.BLACKBOARD_DIR || 'search')
  return join(searchDir, 'vault')
}

function getManifestPath(): string {
  return join(getVaultDir(), '.manifest.yaml')
}

function loadManifest(): Manifest {
  const mp = getManifestPath()
  if (!existsSync(mp)) return { files: [] }
  try {
    const raw = YAML.parse(readFileSync(mp, 'utf-8'))
    return { files: Array.isArray(raw?.files) ? raw.files : [] }
  } catch {
    return { files: [] }
  }
}

function saveManifest(manifest: Manifest): void {
  const vaultDir = getVaultDir()
  if (!existsSync(vaultDir)) mkdirSync(vaultDir, { recursive: true })
  writeFileSync(getManifestPath(), YAML.stringify(manifest))
}

export async function GET() {
  try {
    const vaultDir = getVaultDir()
    const manifest = loadManifest()

    // Build a set of known files from manifest
    const known = new Set(manifest.files.map(f => `${f.subfolder}/${f.file}`))

    // Scan all subfolders
    const allFiles: Array<{
      file: string
      subfolder: string
      status: 'new' | 'parsed' | 'rescan-needed'
      size: number
    }> = []
    const newFiles: string[] = []

    for (const sub of SUBFOLDERS) {
      const subDir = join(vaultDir, sub)
      if (!existsSync(subDir)) continue

      const entries = readdirSync(subDir).filter(f => !f.startsWith('.'))
      for (const file of entries) {
        const fullPath = join(subDir, file)
        const stat = statSync(fullPath)
        if (!stat.isFile()) continue

        const key = `${sub}/${file}`
        const existing = known.has(key) ? manifest.files.find(m => m.subfolder === sub && m.file === file) : undefined

        if (!existing) {
          // New file — add to manifest
          newFiles.push(key)
          manifest.files.push({
            file,
            subfolder: sub,
            status: 'new',
            added_at: new Date().toISOString(),
          })
          allFiles.push({ file, subfolder: sub, status: 'new', size: stat.size })
        } else {
          allFiles.push({ file, subfolder: sub, status: existing.status, size: stat.size })
        }
      }
    }

    // Save updated manifest with any new files
    if (newFiles.length > 0) {
      saveManifest(manifest)
    }

    // Build subfolder summaries
    const subfolders: Record<string, { count: number; newCount: number }> = {}
    for (const sub of SUBFOLDERS) {
      const inSub = allFiles.filter(f => f.subfolder === sub)
      subfolders[sub] = {
        count: inSub.length,
        newCount: inSub.filter(f => f.status === 'new').length,
      }
    }

    return NextResponse.json({
      vaultPath: vaultDir,
      subfolders,
      files: allFiles,
      newFiles,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 }
    )
  }
}
