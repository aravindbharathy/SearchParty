import { NextRequest, NextResponse } from 'next/server'
import { readContext, writeContext, CONTEXT_FILES, type ContextName } from '@/lib/context'
import { ZodError } from 'zod'

function isValidContextName(name: string): name is ContextName {
  return name in CONTEXT_FILES
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  if (!isValidContextName(name)) {
    return NextResponse.json(
      { error: `Unknown context file: ${name}. Valid names: ${Object.keys(CONTEXT_FILES).join(', ')}` },
      { status: 404 }
    )
  }

  try {
    const data = await readContext(name)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read context' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  if (!isValidContextName(name)) {
    return NextResponse.json(
      { error: `Unknown context file: ${name}. Valid names: ${Object.keys(CONTEXT_FILES).join(', ')}` },
      { status: 404 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  try {
    await writeContext(name, body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {}
      for (const issue of err.issues) {
        const path = issue.path.join('.')
        if (!fieldErrors[path]) fieldErrors[path] = []
        fieldErrors[path].push(issue.message)
      }
      return NextResponse.json(
        { error: 'Validation failed', fieldErrors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to write context' },
      { status: 500 }
    )
  }
}
