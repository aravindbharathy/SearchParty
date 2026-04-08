import { NextResponse } from 'next/server'
import { getPipelineStats } from '@/lib/parsers'

export async function GET() {
  try {
    const stats = await getPipelineStats()
    return NextResponse.json(stats)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
