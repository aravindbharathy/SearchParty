import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
// Import processManager normally for the request handler.
// For the background runSequential, access via globalThis to survive Turbopack HMR.
import processManager from '@/lib/process-manager'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getProcessManager = () => (globalThis as any).__processManager || processManager
import { getSearchDir } from '@/lib/paths'

const BLACKBOARD_URL = 'http://localhost:8790'

function postToBlackboard(path: string, value: unknown, logEntry: string): Promise<void> {
  return fetch(`${BLACKBOARD_URL}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, value, log_entry: logEntry }),
    signal: AbortSignal.timeout(3000),
  }).then(() => {}).catch(() => {})
}

function countCompanies(): number {
  try {
    const fp = join(getSearchDir(), 'context', 'target-companies.yaml')
    if (!existsSync(fp)) return 0
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    return Array.isArray(raw.companies) ? raw.companies.length : 0
  } catch { return 0 }
}

/**
 * POST /api/agent/batch-targets
 *
 * Runs the generate-targets skill SEQUENTIALLY across multiple categories.
 * Each run uses the full skill file, has complete tool access, and merges
 * properly with previous results. Progress is reported to the blackboard
 * so the user sees live updates in the research agent chat.
 *
 * This runs in the background — returns immediately with the categories
 * and starts processing. Progress appears via blackboard directives.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { categories?: string[] }

    const cpPath = join(getSearchDir(), 'context', 'career-plan.yaml')
    const industries: string[] = []
    const functions: string[] = []
    const locations: string[] = []
    const whatMatters: string[] = []
    const dealBreakers: string[] = []
    const nonNegotiables: string[] = []
    let level = ''

    if (existsSync(cpPath)) {
      const raw = YAML.parse(readFileSync(cpPath, 'utf-8'), { uniqueKeys: false }) || {}
      const t = raw.target || {}
      level = t.level || ''
      industries.push(...(t.industries || []))
      functions.push(...(t.functions || []))
      locations.push(...(t.locations || []))
      whatMatters.push(...(raw.what_matters || []))
      dealBreakers.push(...(raw.deal_breakers || []))
      nonNegotiables.push(...(raw.motivation?.non_negotiables || []))
    }

    if (!level && functions.length === 0) {
      return NextResponse.json({ error: 'Career plan is empty' }, { status: 400 })
    }

    // Build dynamic scoring weights from career plan priorities
    const wm = whatMatters.map(m => m.toLowerCase())
    const db = dealBreakers.map(d => d.toLowerCase())
    const nn = nonNegotiables.map(n => n.toLowerCase())
    const allPriorities = [...wm, ...db, ...nn].join(' ')

    const hasLocationConstraint = db.some(d => d.includes('onsite') || d.includes('remote')) ||
      nn.some(n => n.includes('remote') || n.includes('hybrid'))
    const hasCompPriority = allPriorities.includes('comp') || allPriorities.includes('salary') || allPriorities.includes('$')
    const hasCulturePriority = allPriorities.includes('culture') || allPriorities.includes('team') || allPriorities.includes('people')
    const hasGrowthPriority = allPriorities.includes('learn') || allPriorities.includes('growth') || allPriorities.includes('impact')

    const scoringWeights = {
      industry_match: 20,
      role_availability: 20,
      compensation: hasCompPriority ? 25 : 15,
      location: hasLocationConstraint ? 25 : 10,
      culture: hasCulturePriority ? 20 : 10,
      growth: hasGrowthPriority ? 10 : 0,
    }
    // Normalize to 100
    const totalWeight = Object.values(scoringWeights).reduce((a, b) => a + b, 0)
    const normalizedWeights = Object.fromEntries(
      Object.entries(scoringWeights).map(([k, v]) => [k, Math.round((v / totalWeight) * 100)])
    )

    // Build dynamic categories from career plan
    const dynamicCategories: string[] = []
    for (const ind of industries.slice(0, 3)) {
      dynamicCategories.push(`established companies in ${ind} (public and late-stage private)`)
    }
    dynamicCategories.push(`growth-stage startups (Series A-D) in ${industries.join(', ')} — include YC, a16z, Sequoia portfolio companies`)
    if (functions.length > 0) {
      dynamicCategories.push(`companies known for strong ${functions[0]} teams and culture`)
    }
    if (locations.some(l => l.toLowerCase().includes('remote'))) {
      dynamicCategories.push(`remote-first companies hiring ${level} ${functions[0] || ''} roles`)
    }
    dynamicCategories.push(`companies in adjacent industries where ${functions.join(', ')} skills transfer well`)

    const categories = body.categories || dynamicCategories
    const careerContext = `Target: ${level} ${functions.join(', ')}. Industries: ${industries.join(', ')}. Locations: ${locations.join(', ')}.`
    const weightsStr = Object.entries(normalizedWeights).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}pts`).join(', ')
    const startCount = countCompanies()

    // Run the sequential spawns in the background (initial message shown client-side)
    runSequential(categories, careerContext, weightsStr, startCount).catch(err => {
      console.error('[batch-targets] sequential run failed:', err)
      postToBlackboard('findings.batch-targets-error', {
        type: 'batch-error',
        text: `Target generation encountered an error: ${err instanceof Error ? err.message : String(err)}`,
        for: 'research',
        timestamp: new Date().toISOString(),
      }, 'Batch targets error')
    })

    return NextResponse.json({
      ok: true,
      categories,
      total: categories.length,
      message: `Starting sequential search across ${categories.length} categories. Watch the chat for progress.`,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

async function runSequential(categories: string[], careerContext: string, weightsStr: string, startCount: number) {
  await postToBlackboard('findings.batch-targets-start', {
    type: 'progress',
    text: `Generating target companies across ${categories.length} categories: ${categories.join(', ')}...`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Searching ${categories.length} categories`)

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i]
    const progress = `${i + 1}/${categories.length}`

    const prompt = `Run this command first: cat .claude/skills/batch-target-search/SKILL.md

Then follow its instructions. Skip any "Post to Blackboard" or curl sections — those are handled externally.

Career profile: ${careerContext}
Scoring weights (personalized from career plan): ${weightsStr}
Search category: ${category}`

    const result = await getProcessManager().spawn({
      agent: 'research',
      directive: {
        skill: 'generate-targets',
        entry_name: `targets-${category.slice(0, 20).replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
        text: prompt,
      },
      oneOff: true,
    })

    if (result.ok) {
      console.log(`[batch-targets] spawned ${progress}: ${result.spawn_id}`)
      await waitForCompletion(result.spawn_id, 4 * 60 * 1000)
      console.log(`[batch-targets] completed ${progress}`)
    } else {
      console.log(`[batch-targets] spawn failed for ${progress}: ${category}`)
    }
  }

  const finalCount = countCompanies()
  const totalAdded = finalCount - startCount

  await postToBlackboard('findings.batch-targets-complete', {
    type: 'batch-complete',
    text: `Target company generation complete. ${finalCount} total companies (${totalAdded} new across ${categories.length} categories).`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Batch targets complete: ${finalCount} companies (${totalAdded} new)`)
}

async function waitForCompletion(spawnId: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      // Poll via HTTP API — avoids Turbopack HMR issues with direct processManager access
      const res = await fetch(`http://localhost:8791/api/agent/spawn/${spawnId}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json() as { status?: string }
        if (data.status === 'completed' || data.status === 'failed') return
      } else if (res.status === 404) {
        // Spawn not found — may have completed and been cleaned up
        return
      }
    } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
}
