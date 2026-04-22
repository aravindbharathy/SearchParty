import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { getProcessManager, postToBlackboard, waitForCompletion } from '@/lib/agent-utils'
import { scanViaAts, type TargetCompany } from '@/lib/scanner/ats-scanner'
import { buildTitleFilter } from '@/lib/scanner/title-filter'
import { loadExistingRoleUrls, loadExistingCompanyRoles } from '@/lib/scanner/dedup'

const BATCH_SIZE = 8

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
    const titleFilter = buildTitleFilter(t)

    // Read target companies
    const tcPath = join(getSearchDir(), 'context', 'target-companies.yaml')
    if (!existsSync(tcPath)) {
      return NextResponse.json({ error: 'No target companies' }, { status: 400 })
    }
    const tc = YAML.parse(readFileSync(tcPath, 'utf-8'), { uniqueKeys: false }) || {}
    let companies: Array<{ name: string; slug: string; fit_score: number; careers_url?: string; ats_provider?: string; ats_slug?: string }> = tc.companies || []

    // Filter by scope
    if (scope === 'top-fit') {
      companies = companies.filter(c => (c.fit_score || 0) >= 75)
    } else if (scope === 'tier-1-2') {
      companies = companies.filter(c => (c.fit_score || 0) >= 60)
    } else if (scope.startsWith('company:')) {
      const companyName = scope.slice(8)
      companies = companies.filter(c =>
        c.name.toLowerCase().includes(companyName.toLowerCase()) ||
        c.slug === companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      )
    }
    companies.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))

    if (companies.length === 0) {
      return NextResponse.json({ error: 'No companies match this scope' }, { status: 400 })
    }

    // Run pipeline in background (zero-token scan + agent fallback + verify + score + tailor)
    runPipeline(companies, careerContext, titleFilter, scope).catch(err => {
      console.error('[batch-scan] pipeline failed:', err)
      postToBlackboard('findings.scan-error', {
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
      phases: ['ats-scan', 'agent-fallback', 'verify', 'score', 'tailor'],
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

async function runPipeline(
  companies: Array<{ name: string; slug: string; fit_score?: number; careers_url?: string; ats_provider?: string; ats_slug?: string }>,
  careerContext: string,
  titleFilter: (title: string) => boolean,
  scope: string,
) {
  const totalCompanies = companies.length

  await postToBlackboard('findings.scan-progress', {
    type: 'progress',
    text: `Scanning ${totalCompanies} companies via ATS APIs...`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scanning ${totalCompanies} companies`)

  const existingUrls = loadExistingRoleUrls()
  const existingCompanyRoles = loadExistingCompanyRoles()

  let atsRoleCount = 0
  let companiesWithoutAts: string[] = []

  try {
    const atsResult = await scanViaAts({
      companies,
      titleFilter,
      existingUrls,
      existingCompanyRoles,
    })

    companiesWithoutAts = atsResult.companiesWithoutAts

    console.log(`[batch-scan] ATS scan: ${atsResult.companiesScanned} companies, ${atsResult.totalJobsFound} total jobs, ${atsResult.newRoles.length} candidates, ${atsResult.errors.length} errors`)
    if (atsResult.errors.length > 0) {
      console.log(`[batch-scan] ATS errors: ${atsResult.errors.map(e => `${e.company}: ${e.error}`).join('; ')}`)
    }

    await postToBlackboard('findings.scan-progress', {
      type: 'progress',
      text: `ATS scan found ${atsResult.newRoles.length} candidates from ${atsResult.companiesScanned} companies (${atsResult.totalJobsFound} total listings). Triaging against your profile...`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `ATS: ${atsResult.newRoles.length} candidates from ${atsResult.companiesScanned} companies`)

    // ── Triage: agent reviews titles against profile BEFORE writing ──
    let keptRoles = atsResult.newRoles
    if (atsResult.newRoles.length > 0) {
      const roleList = atsResult.newRoles.map((r, i) => `${i + 1}. ${r.company} — ${r.title} (${r.location || 'unknown location'})`).join('\n')

      const triagePrompt = `You are triaging job listings for relevance. Read the user's experience library and career plan, then classify each role.

READ THESE FILES FIRST:
- search/context/experience-library.yaml
- search/context/career-plan.yaml

Here are ${atsResult.newRoles.length} roles discovered by scanning ATS APIs. For each, decide:
- KEEP: the user's skills and experience genuinely transfer to this role
- DISMISS: clearly NOT relevant (wrong domain, wrong function — e.g. "Biological Safety Research Scientist" for a UX Researcher, or "Research Engineer, Audio" for someone without audio/ML background)

Be practical — keep roles where the title is ambiguous but COULD be relevant. Only dismiss roles that are clearly wrong.

Output ONLY a JSON array, no other text:
[{"index": 1, "decision": "keep"}, {"index": 2, "decision": "dismiss"}]

ROLES:
${roleList}`

      const triageResult = await getProcessManager().spawn({
        agent: 'research',
        directive: { skill: 'triage', entry_name: 'triage-scan', text: triagePrompt },
        oneOff: true,
      })

      if (triageResult.ok) {
        console.log(`[batch-scan] triage: ${triageResult.spawn_id}`)
        await waitForCompletion(triageResult.spawn_id, 5 * 60 * 1000)

        const triageOutput = getProcessManager().getOneOffStatus(triageResult.spawn_id)
        if (triageOutput?.output) {
          try {
            const jsonMatch = triageOutput.output.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
              const decisions = JSON.parse(jsonMatch[0]) as Array<{ index: number; decision: string }>
              const keepIndices = new Set(decisions.filter(d => d.decision === 'keep').map(d => d.index))
              const dismissCount = decisions.filter(d => d.decision === 'dismiss').length

              // Only keep roles the agent approved
              keptRoles = atsResult.newRoles.filter((_, i) => keepIndices.has(i + 1))
              console.log(`[batch-scan] triage: ${keptRoles.length} kept, ${dismissCount} dismissed`)

              await postToBlackboard('findings.scan-progress', {
                type: 'category-complete',
                text: `Triage: ${keptRoles.length} roles kept, ${dismissCount} dismissed as irrelevant to your profile.`,
                for: 'research',
                timestamp: new Date().toISOString(),
              }, `Triage: ${keptRoles.length} kept, ${dismissCount} dismissed`)
            }
          } catch (err) {
            console.warn('[batch-scan] triage parse failed, keeping all roles:', err)
          }
        }
      }
    }

    // Write ONLY triaged roles to open-roles.yaml
    atsRoleCount = keptRoles.length
    if (keptRoles.length > 0) {
      const orPath = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
      const existing = existsSync(orPath)
        ? YAML.parse(readFileSync(orPath, 'utf-8'), { uniqueKeys: false }) || { roles: [], last_scan: null, scan_count: 0 }
        : { roles: [], last_scan: null, scan_count: 0 }
      if (!Array.isArray(existing.roles)) existing.roles = []
      existing.roles.push(...keptRoles)
      existing.last_scan = new Date().toISOString()
      existing.scan_count = (existing.scan_count || 0) + 1
      writeFileSync(orPath, YAML.stringify(existing))
    }
  } catch (err) {
    console.error('[batch-scan] ATS scan failed:', err)
    // All companies fall back to agent scan
    companiesWithoutAts = companies.map(c => c.name)
  }

  // ── Phase 1b: Agent fallback for companies without ATS APIs ──
  // "full" scope from user's "Scan All" button: scan all companies
  // Auto-triggered scans (from generate-targets or cron): only Tier 1+2 (fit >= 60)
  const userExplicit = scope === 'full' || scope === 'top-fit' || scope.startsWith('company:')
  const companyFitMap = new Map(companies.map(c => [c.name, c.fit_score || 0]))
  const agentFallbackCompanies = userExplicit
    ? companiesWithoutAts
    : companiesWithoutAts.filter(name => (companyFitMap.get(name) || 0) >= 60)
  const skippedLowFit = companiesWithoutAts.length - agentFallbackCompanies.length

  if (agentFallbackCompanies.length > 0) {
    const fallbackBatches: string[][] = []
    for (let i = 0; i < agentFallbackCompanies.length; i += BATCH_SIZE) {
      fallbackBatches.push(agentFallbackCompanies.slice(i, i + BATCH_SIZE))
    }

    await postToBlackboard('findings.scan-progress', {
      type: 'progress',
      text: `Scanning ${agentFallbackCompanies.length} Tier 1-2 companies via agent (${agentFallbackCompanies.join(', ')})...${skippedLowFit > 0 ? ` Skipping ${skippedLowFit} lower-fit companies without ATS APIs.` : ''}`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `Agent scan: ${agentFallbackCompanies.length} companies`)

    for (let i = 0; i < fallbackBatches.length; i++) {
      const names = fallbackBatches[i].join(', ')
      const prompt = `Run this command first: cat .claude/skills/scan-roles/SKILL.md

Then follow its instructions. Skip any "Post to Blackboard", "Update Role Status", or curl sections — those are handled externally.

Career profile: ${careerContext}
Companies to scan: ${names}

Scan ONLY these companies. Find matching roles, save JDs, append to open-roles.yaml.`

      const result = await getProcessManager().spawn({
        agent: 'research',
        directive: { skill: 'scan-roles', entry_name: `scan-fallback-${i + 1}`, text: prompt },
        oneOff: true,
      })

      if (result.ok) {
        console.log(`[batch-scan] agent fallback batch ${i + 1}/${fallbackBatches.length}: ${result.spawn_id}`)
        await waitForCompletion(result.spawn_id, 12 * 60 * 1000)
      }
    }
  }

  const roleCount = countNewRoles()
  await postToBlackboard('findings.scan-progress', {
    type: 'category-complete',
    text: `Discovery complete: ${roleCount} relevant roles found across ${totalCompanies} companies (${atsRoleCount} via ATS${agentFallbackCompanies.length > 0 ? `, ${agentFallbackCompanies.length} via agent` : ''}${skippedLowFit > 0 ? `, ${skippedLowFit} low-fit skipped` : ''}). Verifying links...`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scan done: ${roleCount} roles`)

  // ── Phase 2: Verify ──

  try {
    const verifyRes = await fetch('http://localhost:8791/api/finding/open-roles/verify', {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
    })
    const verifyData = await verifyRes.json() as { verified?: number; closed?: number; unverifiable?: number }
    const verifyParts = [`${verifyData.verified || 0} active`, `${verifyData.closed || 0} closed`]
    if (verifyData.unverifiable) verifyParts.push(`${verifyData.unverifiable} could not be checked`)
    const verifyText = `Verified: ${verifyParts.join(', ')}.`
    await postToBlackboard('findings.scan-progress', {
      type: 'category-complete',
      text: verifyText,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, verifyText)
  } catch {
    console.log('[batch-scan] verify failed, continuing')
  }

  // ── Phase 3: Score high-fit JDs ──
  const highFitRoles = getNewHighFitRoles()
  if (highFitRoles.length > 0) {
    await postToBlackboard('findings.scan-progress', {
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
        directive: { skill: 'score-jd', text: prompt, skipEntry: true },
        oneOff: true,
      })

      if (result.ok) {
        console.log(`[batch-scan] phase 3, scoring ${i + 1}/${highFitRoles.length}: ${role.company}`)
        await waitForCompletion(result.spawn_id, 10 * 60 * 1000)
        updateRoleStatus(role.id, role.company, role.title, 'scored')
      }
    }

    await postToBlackboard('findings.scan-progress', {
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
    await postToBlackboard('findings.scan-progress', {
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
        await waitForCompletion(result.spawn_id, 10 * 60 * 1000)
      }
    }

    await postToBlackboard('findings.scan-progress', {
      type: 'category-complete',
      text: `Resumes tailored for ${top3.map(t => t.company).join(', ')}.`,
      for: 'research',
      timestamp: new Date().toISOString(),
    }, `Tailored ${top3.length} resumes`)
  }

  // ── Summary ──
  const finalRoleCount = countNewRoles()
  await postToBlackboard('findings.scan-complete', {
    type: 'batch-complete',
    text: `Scan pipeline complete. ${totalCompanies} companies scanned, ${finalRoleCount} new roles, ${highFitRoles.length} JDs scored, ${toTailor.slice(0, 3).length} resumes tailored.`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Scan complete: ${finalRoleCount} roles, ${toTailor.slice(0, 3).length} resumes`)
}
