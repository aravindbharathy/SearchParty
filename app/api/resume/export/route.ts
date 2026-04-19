import { NextResponse } from 'next/server'
import type { ResumeData } from '@/lib/resume-types'

/**
 * POST — export resume as PDF-ready HTML
 *
 * The actual PDF conversion happens client-side via window.print()
 * or a browser print-to-PDF dialog. This endpoint returns clean HTML
 * optimized for printing.
 *
 * For server-side PDF generation, install puppeteer and uncomment below.
 */
export async function POST(req: Request) {
  try {
    const resume = await req.json() as ResumeData

    // Render the resume HTML (reuse the render logic)
    const renderRes = await fetch(new URL('/api/resume/render', req.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resume),
    })

    if (!renderRes.ok) {
      return NextResponse.json({ error: 'Failed to render' }, { status: 500 })
    }

    const { html } = await renderRes.json() as { html: string }

    // Add print-specific styles
    const printHtml = html.replace('</style>', `
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .resume { padding: 0; }
        @page { margin: 0.5in 0.6in; size: letter; }
      }
    </style>`)

    return NextResponse.json({ html: printHtml })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
