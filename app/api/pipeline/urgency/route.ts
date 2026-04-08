import { NextResponse } from 'next/server'
import { getUrgencyItems } from '@/lib/parsers'

export async function GET() {
  try {
    const urgency = await getUrgencyItems()
    return NextResponse.json(urgency)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
