/**
 * POST /api/agent/build-prompt
 *
 * Server-side prompt builder for -p mode agents.
 * Reads context files from disk and embeds them into the prompt text
 * so the stateless agent receives all needed data inline.
 *
 * Body: { skill: string, params: { jdText?, companyName?, contactName?, company?, batchSize? } }
 * Returns: { prompt: string }
 */

import { NextResponse } from 'next/server'
import { buildPrompt, type SkillName } from '@/lib/agent-prompts'

interface BuildPromptRequest {
  skill?: string
  params?: {
    jdText?: string
    companyName?: string
    contactName?: string
    company?: string
    batchSize?: number
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BuildPromptRequest

    if (!body.skill) {
      return NextResponse.json(
        { error: 'skill is required' },
        { status: 400 }
      )
    }

    const prompt = await buildPrompt({
      skill: body.skill as SkillName,
      jdText: body.params?.jdText,
      companyName: body.params?.companyName,
      contactName: body.params?.contactName,
      company: body.params?.company,
      batchSize: body.params?.batchSize,
    })

    return NextResponse.json({ prompt })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
