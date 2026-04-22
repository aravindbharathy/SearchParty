/**
 * POST /api/finding/open-roles/score-all
 *
 * Scores all unscored open roles by spawning oneOff agents.
 * Runs in the background — returns immediately with the count of roles to score.
 */

import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { getProcessManager, postToBlackboard, waitForCompletion } from '@/lib/agent-utils'

export async function POST() {
  try {
    const fp = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(fp)) {
      return NextResponse.json({ error: 'No open roles file' }, { status: 400 })
    }

    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    const roles = (raw.roles || []).filter(
      (r: { status?: string; url?: string }) => r.status === 'new' && r.url,
    ) as Array<{ id: string; company: string; title: string; url: string; jd_file?: string }>

    if (roles.length === 0) {
      return NextResponse.json({ ok: true, scoring: 0, message: 'No unscored roles to process.' })
    }

    // Run scoring in background
    scoreAllRoles(roles).catch(err => {
      console.error('[score-all] failed:', err)
      postToBlackboard('findings.scan-progress', {
        type: 'batch-error',
        text: `Scoring error: ${err instanceof Error ? err.message : String(err)}`,
        for: 'research',
        timestamp: new Date().toISOString(),
      }, 'Score-all error')
    })

    return NextResponse.json({ ok: true, scoring: roles.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

async function scoreAllRoles(
  roles: Array<{ id: string; company: string; title: string; url: string; jd_file?: string }>,
) {
  await postToBlackboard('findings.scan-progress', {
    type: 'progress',
    text: `Scoring ${roles.length} open roles against your profile...`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scoring ${roles.length} roles`)

  let scored = 0
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i]
    const jdSource = role.jd_file
      ? `Read the JD from: search/${role.jd_file}`
      : `Fetch the JD from: ${role.url}`

    const prompt = `Run this command first: cat .claude/skills/score-jd/SKILL.md

Then follow its instructions. Skip any "Post to Blackboard", "Update Role Status", or curl sections — those are handled externally.

Score this JD:
Company: ${role.company}
Role: ${role.title}
Role ID: ${role.id}
${jdSource}`

    const result = await getProcessManager().spawn({
      agent: 'research',
      directive: { skill: 'score-jd', text: prompt, skipEntry: true },
      oneOff: true,
    })

    if (result.ok) {
      console.log(`[score-all] scoring ${i + 1}/${roles.length}: ${role.company} — ${role.title}`)
      await waitForCompletion(result.spawn_id, 10 * 60 * 1000)

      // Only mark as scored if the agent actually wrote a score file
      const slug = `${role.company}-${role.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const entriesDir = join(getSearchDir(), 'entries')
      const hasScoreFile = existsSync(entriesDir) && (await import('fs')).readdirSync(entriesDir)
        .some((f: string) => f.startsWith('score-jd-') && f.includes(slug) && f.endsWith('.md'))

      if (hasScoreFile) {
        try {
          await fetch('http://localhost:8791/api/finding/open-roles/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: role.id, company: role.company, title: role.title, status: 'scored' }),
            signal: AbortSignal.timeout(5000),
          })
        } catch {}
        scored++
      } else {
        console.warn(`[score-all] no score file found for ${role.company} — ${role.title}, keeping as 'new'`)
      }
    }
  }

  await postToBlackboard('findings.scan-progress', {
    type: 'category-complete',
    text: `Scored ${scored}/${roles.length} roles.`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scored ${scored} roles`)
}
