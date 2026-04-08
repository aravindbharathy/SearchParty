import { NextResponse } from 'next/server'
import { updateApplication } from '@/lib/parsers'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json() as { field?: string; value?: unknown }

    if (!body.field) {
      return NextResponse.json(
        { error: 'field is required' },
        { status: 400 },
      )
    }

    const app = await updateApplication(id, body.field, body.value)
    return NextResponse.json({ application: app })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
