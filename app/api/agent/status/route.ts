import { NextResponse } from 'next/server'
import processManager from '@/lib/process-manager'

export async function GET() {
  const status = processManager.getStatus()
  return NextResponse.json(status)
}
