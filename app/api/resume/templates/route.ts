import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getUploadsDir } from '@/lib/paths'

/**
 * GET — list user-uploaded resume templates from vault/resumes/templates/
 * Templates are HTML files that the resume renderer can use.
 * The filename (minus extension) becomes the template name in the editor.
 */
export async function GET() {
  try {
    const dir = join(getUploadsDir(), 'templates')
    if (!existsSync(dir)) {
      return NextResponse.json({ templates: [] })
    }

    const templates = readdirSync(dir)
      .filter(f => f.endsWith('.html') || f.endsWith('.css'))
      .map(f => {
        const name = f.replace(/\.(html|css)$/, '')
        const content = readFileSync(join(dir, f), 'utf-8')
        return { name, filename: f, type: f.endsWith('.html') ? 'html' : 'css', content }
      })

    return NextResponse.json({ templates })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
