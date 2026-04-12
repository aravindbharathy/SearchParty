import { NextResponse } from 'next/server'
import { parseApplications, addApplication } from '@/lib/parsers'

export async function GET() {
  try {
    const applications = await parseApplications()
    return NextResponse.json({ applications })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      company?: string
      role?: string
      status?: string
      jd_source?: string
      jd_file?: string
      jd_url?: string
      fit_score?: number
      notes?: string
    }

    if (!body.company || !body.role) {
      return NextResponse.json(
        { error: 'company and role are required' },
        { status: 400 },
      )
    }

    const app = await addApplication({
      company: body.company,
      role: body.role,
      status: (body.status as 'researching' | 'applied' | 'phone-screen' | 'onsite' | 'offer' | 'rejected' | 'withdrawn') || undefined,
      jd_source: body.jd_source,
      jd_file: body.jd_file,
      jd_url: body.jd_url,
      fit_score: body.fit_score,
      notes: body.notes,
    })

    return NextResponse.json({ application: app }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
