import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import processManager from '@/lib/process-manager'
import { getSearchDir } from '@/lib/paths'

const BLACKBOARD_URL = 'http://localhost:8790'
const BATCH_SIZE = 8


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getProcessManager = () => (globalThis as any).__processManager || processManager

function postToBlackboard(path: string, value: unknown, logEntry: string): Promise<void> {
  return fetch(`${BLACKBOARD_URL}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, value, log_entry: logEntry }),
    signal: AbortSignal.timeout(3000),
  }).then(() => {}).catch(() => {})
}

function countNewRoles(): number {
  try {
    const fp = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(fp)) return 0
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    return (raw.roles || []).filter((r: { status?: string }) => r.status === 'new').length
  } catch { return 0 }
}

async function updateRoleStatus(id: string, company: string, title: string, status: string): Promise<void> {
  try {
    await fetch('http://localhost:8791/api/finding/open-roles/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, company, title, status }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {}
}

function getNewHighFitRoles(): Array<{ id: string; company: string; title: string; fit_estimate: number; jd_file: string; url: string }> {
  try {
    const fp = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(fp)) return []
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    return (raw.roles || [])
      .filter((r: { status?: string; fit_estimate?: number }) => r.status === 'new' && (r.fit_estimate || 0) >= 75)
      .sort((a: { fit_estimate?: number }, b: { fit_estimate?: number }) => (b.fit_estimate || 0) - (a.fit_estimate || 0))
  } catch { return [] }
}

async function waitForCompletion(spawnId: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:8791/api/agent/spawn/${spawnId}`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json() as { status?: string }
        if (data.status === 'completed' || data.status === 'failed') return
      } else if (res.status === 404) return
    } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
}

/**
 * POST /api/agent/batch-scan
 *
 * Full pipeline: scan → verify → score → tailor
 * Accepts scope: "full" | "top-fit" | "company:{name}"
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { scope?: string }
    const scope = body.scope || 'full'

    // Ensure open-roles.yaml exists (agents need to read + append to it)
    const orPath = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(orPath)) {
      const pipelineDir = join(getSearchDir(), 'pipeline')
      if (!existsSync(pipelineDir)) mkdirSync(pipelineDir, { recursive: true })
      writeFileSync(orPath, 'roles: []\nlast_scan: null\nscan_count: 0\n')
    }

    // Read career plan for context
    const cpPath = join(getSearchDir(), 'context', 'career-plan.yaml')
    if (!existsSync(cpPath)) {
      return NextResponse.json({ error: 'Career plan is empty' }, { status: 400 })
    }
    const cp = YAML.parse(readFileSync(cpPath, 'utf-8'), { uniqueKeys: false }) || {}
    const t = cp.target || {}
    const careerContext = `Target: ${t.level || ''} ${(t.functions || []).join(', ')}. Industries: ${(t.industries || []).join(', ')}. Locations: ${(t.locations || []).join(', ')}.`

    // Read target companies
    const tcPath = join(getSearchDir(), 'context', 'target-companies.yaml')
    if (!existsSync(tcPath)) {
      return NextResponse.json({ error: 'No target companies' }, { status: 400 })
    }
    const tc = YAML.parse(readFileSync(tcPath, 'utf-8'), { uniqueKeys: false }) || {}
    let companies: Array<{ name: string; slug: string; fit_score: number }> = tc.companies || []

    // Filter by scope
    if (scope === 'top-fit') {
      companies = companies.filter(c => (c.fit_score || 0) >= 75)
    } else if (scope.startsWith('company:')) {
      const companyName = scope.slice(8)
      companies = companies.filter(c =>
        c.name.toLowerCase().includes(companyName.toLowerCase()) ||
        c.slug === companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      )
    }
    // Sort by fit score descending
    companies.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))

    if (companies.length === 0) {
      return NextResponse.json({ error: 'No companies match this scope' }, { status: 400 })
    }

    // Split into batches
    const batches: Array<Array<{ name: string; slug: string }>> = []
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
      batches.push(companies.slice(i, i + BATCH_SIZE))
    }

    // Run pipeline in background
    runPipeline(batches, careerContext, scope).catch(err => {
      console.error('[batch-scan] pipeline failed:', err)
      postToBlackboard('findings.batch-scan-error', {
        type: 'batch-error',
        text: `Scan pipeline error: ${err instanceof Error ? err.message : String(err)}`,
        for: 'research',
        timestamp: new Date().toISOString(),
      }, 'Batch scan error')
    })

    return NextResponse.json({
      ok: true,
      scope,
      companies: companies.length,
      batches: batches.length,
      phases: ['scan', 'verify', 'score', 'tailor'],
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

async function runPipeline(
  batches: Array<Array<{ name: string; slug: string }>>,
  careerContext: string,
  scope: string,
) {
  const totalCompanies = batches.reduce((s, b) => s + b.length, 0)

  // ── Phase 1: Scan ──
  await postToBlackboard('findings.batch-scan-phase1', {
    type: 'progress',
    text: `Scanning ${totalCompanies} companies for open roles (${batches.length} batches)...`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scanning ${totalCompanies} companies`)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const names = batch.map(c => c.name).join(', ')
    const progress = `${i + 1}/${batches.length}`

    const prompt = `Run this command first: cat .claude/skills/scan-roles/SKILL.md

Then follow its instructions. Skip any "Post to Blackboard", "Update Role Status", or curl sections — those are handled externally.

Career profile: ${careerContext}
Companies to scan: ${names}

Scan ONLY these companies. Find matching roles, save JDs, append to open-roles.yaml.`

    const result = await getProcessManager().spawn({
      agent: 'research',
      directive: { skill: 'scan-roles', entry_name: `scan-batch-${i + 1}`, text: prompt },
      oneOff: true,
    })

    if (result.ok) {
      console.log(`[batch-scan] phase 1, batch ${progress}: ${result.spawn_id}`)
      await waitForCompletion(result.spawn_id, 4 * 60 * 1000)
    }
  }

  const roleCount = countNewRoles()
  await postToBlackboard('findings.batch-scan-phase1-done', {
    type: 'category-complete',
    text: `Scan complete: ${roleCount} new roles found across ${totalCompanies} companies.`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scan done: ${roleCount} roles`)

  // ── Phase 2: Verify ──

  try {
    const verifyRes = await fetch('http://localhost:8791/api/finding/open-roles/verify', {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
    })
    const verifyData = await verifyRes.json() as { verified?: number; closed?: number }
    await postToBlackboard('findings.batch-scan-verified', {
      type: 'category-complete',
      text: `Verified: ${verifyData.verified || 0} active, ${verifyData.closed || 0} closed.`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `Verified: ${verifyData.verified || 0} active, ${verifyData.closed || 0} closed`)
  } catch {
    console.log('[batch-scan] verify failed, continuing')
  }

  // ── Phase 3: Score high-fit JDs ──
  const highFitRoles = getNewHighFitRoles()
  if (highFitRoles.length > 0) {
    await postToBlackboard('findings.batch-scan-phase3', {
      type: 'progress',
      text: `Scoring ${highFitRoles.length} high-fit JDs...`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `Scoring ${highFitRoles.length} JDs`)

    for (let i = 0; i < highFitRoles.length; i++) {
      const role = highFitRoles[i]
      const jdSource = role.jd_file
        ? `Read the JD from: search/${role.jd_file}`
        : `Fetch the JD from: ${role.url}`

      const prompt = `Run this command first: cat .claude/skills/score-jd/SKILL.md

Then follow its instructions. Skip any "Post to Blackboard", "Update Role Status", or curl sections — those are handled externally.

Score this JD:
Company: ${role.company}
Role: ${role.title}
${jdSource}`

      const result = await getProcessManager().spawn({
        agent: 'research',
        directive: { skill: 'score-jd', entry_name: `score-${role.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, text: prompt },
        oneOff: true,
      })

      if (result.ok) {
        console.log(`[batch-scan] phase 3, scoring ${i + 1}/${highFitRoles.length}: ${role.company}`)
        await waitForCompletion(result.spawn_id, 4 * 60 * 1000)
        updateRoleStatus(role.id, role.company, role.title, 'scored')
      }
    }

    await postToBlackboard('findings.batch-scan-phase3-done', {
      type: 'category-complete',
      text: `Scored ${highFitRoles.length} JDs: ${highFitRoles.map(r => r.company).join(', ')}.`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `Scored ${highFitRoles.length} JDs`)
  }

  // ── Phase 4: Tailor resumes for top 3 scored ──
  const entriesDir = join(getSearchDir(), 'entries')
  const scoredFiles = existsSync(entriesDir)
    ? (await import('fs')).readdirSync(entriesDir)
        .filter((f: string) => f.startsWith('score-jd-') && f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, 5)
    : []

  const toTailor: Array<{ company: string; role: string; scoreFile: string }> = []
  for (const file of scoredFiles) {
    try {
      const content = readFileSync(join(entriesDir, file), 'utf-8')
      const scoreMatch = content.match(/Overall Fit Score:\s*\*{0,2}\s*(\d+)/i)
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0
      const companyMatch = content.match(/^# JD Score:\s*(.+?)\s*[—-]\s*(.+)/m)
      if (score >= 75 && companyMatch) {
        toTailor.push({ company: companyMatch[1].trim(), role: companyMatch[2].trim(), scoreFile: file })
      }
    } catch {}
  }

  if (toTailor.length > 0) {
    const top3 = toTailor.slice(0, 3)
    await postToBlackboard('findings.batch-scan-phase4', {
      type: 'progress',
      text: `Tailoring resumes for ${top3.length} top-scoring roles...`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `Tailoring ${top3.length} resumes`)

    for (let i = 0; i < top3.length; i++) {
      const item = top3[i]
      const prompt = `Run this command first: cat .claude/skills/resume-tailor/SKILL.md

Then follow its instructions. Skip any "Post to Blackboard" or curl sections — those are handled externally.

Tailor a resume for:
Company: ${item.company}
Role: ${item.role}
JD Score Report: search/entries/${item.scoreFile}

Read the score report first — Block B has the experience match that guides tailoring.`

      const result = await getProcessManager().spawn({
        agent: 'resume',
        directive: { skill: 'resume-tailor', entry_name: `tailor-${item.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, text: prompt },
        oneOff: true,
      })

      if (result.ok) {
        console.log(`[batch-scan] phase 4, tailoring ${i + 1}/${top3.length}: ${item.company}`)
        await waitForCompletion(result.spawn_id, 5 * 60 * 1000)
      }
    }

    await postToBlackboard('findings.batch-scan-phase4-done', {
      type: 'category-complete',
      text: `Resumes tailored for ${top3.map(t => t.company).join(', ')}.`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `Tailored ${top3.length} resumes`)
  }

  // ── Summary ──
  const finalRoleCount = countNewRoles()
  await postToBlackboard('findings.batch-scan-complete', {
    type: 'batch-complete',
    text: `Scan pipeline complete. ${totalCompanies} companies scanned, ${finalRoleCount} new roles, ${highFitRoles.length} JDs scored, ${toTailor.slice(0, 3).length} resumes tailored.`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scan complete: ${finalRoleCount} roles, ${toTailor.slice(0, 3).length} resumes`)
}
