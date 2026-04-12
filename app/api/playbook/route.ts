import { NextResponse } from 'next/server'
import { parsePlaybook } from '@/lib/playbook'

export async function GET() {
  try {
    return NextResponse.json(parsePlaybook())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
