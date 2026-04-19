import { NextResponse } from 'next/server'
import { getAllContextStatus, CONTEXT_FILES, type ContextName } from '@/lib/context'

export async function GET() {
  try {
    const statuses = await getAllContextStatus()

    // Build response with labels and descriptions
    const result: Record<string, {
      filled: boolean
      lastModified: string | null
      label: string
      description: string
    }> = {}

    for (const [name, status] of Object.entries(statuses)) {
      const meta = CONTEXT_FILES[name as ContextName]
      result[name] = {
        filled: status.filled,
        lastModified: status.lastModified?.toISOString() ?? null,
        label: meta.label,
        description: meta.description,
      }
    }

    // Compute overall readiness
    const contextReady = statuses['experience-library'].filled && statuses['career-plan'].filled

    return NextResponse.json({ contexts: result, contextReady })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
