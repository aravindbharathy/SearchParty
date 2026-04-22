/**
 * POST /api/finding/open-roles/discover
 *
 * Broad discovery — searches across ATS platforms for roles matching
 * the user's profile at ANY company, not just target companies.
 *
 * Uses an agent with WebSearch to run queries derived from the career plan.
 * Results are triaged, verified, and written to open-roles.yaml with
 * source_type: "discovered".
 */

import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { getProcessManager, postToBlackboard, waitForCompletion } from '@/lib/agent-utils'
import { loadOrGenerateQueries } from '@/lib/scanner/broad-discovery'

export async function POST() {
  try {
    const searchDir = getSearchDir()

    // Check career plan exists
    const cpPath = join(searchDir, 'context', 'career-plan.yaml')
    if (!existsSync(cpPath)) {
      return NextResponse.json({ error: 'Career plan not found' }, { status: 400 })
    }
    const cp = YAML.parse(readFileSync(cpPath, 'utf-8'), { uniqueKeys: false }) || {}
    const t = cp.target || {}
    const careerContext = `Target: ${t.level || ''} ${(t.functions || []).join(', ')}. Industries: ${(t.industries || []).join(', ')}. Locations: ${(t.locations || []).join(', ')}.`

    // Generate or load search queries
    const queries = loadOrGenerateQueries().filter(q => q.enabled)
    if (queries.length === 0) {
      return NextResponse.json({ error: 'No search queries — career plan may be incomplete' }, { status: 400 })
    }

    // Save queries for future use
    const sqPath = join(searchDir, 'context', 'search-queries.yaml')
    if (!existsSync(sqPath)) {
      writeFileSync(sqPath, YAML.stringify({ queries, generated_from: 'career-plan', last_updated: new Date().toISOString() }))
    }

    // Run discovery in background
    runDiscovery(queries, careerContext).catch(err => {
      console.error('[discover] failed:', err)
      postToBlackboard('findings.scan-progress', {
        type: 'batch-error',
        text: `Discovery error: ${err instanceof Error ? err.message : String(err)}`,
        for: 'research',
        timestamp: new Date().toISOString(),
      }, 'Discovery error')
    })

    return NextResponse.json({ ok: true, queries: queries.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

async function runDiscovery(
  queries: Array<{ id: string; name: string; query: string; platform: string }>,
  careerContext: string,
) {
  await postToBlackboard('findings.scan-progress', {
    type: 'progress',
    text: `Searching for roles beyond your target companies (${queries.length} queries)...`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Broad discovery: ${queries.length} queries`)

  // Load existing URLs for dedup
  const searchDir = getSearchDir()
  const orPath = join(searchDir, 'pipeline', 'open-roles.yaml')
  const existingUrls = new Set<string>()
  if (existsSync(orPath)) {
    try {
      const raw = YAML.parse(readFileSync(orPath, 'utf-8'), { uniqueKeys: false }) || {}
      for (const r of raw.roles || []) {
        if (r.url) existingUrls.add(r.url)
      }
    } catch {}
  }

  // Load target company slugs to tag discovered vs targeted
  const tcPath = join(searchDir, 'context', 'target-companies.yaml')
  const targetSlugs = new Set<string>()
  if (existsSync(tcPath)) {
    try {
      const tc = YAML.parse(readFileSync(tcPath, 'utf-8'), { uniqueKeys: false }) || {}
      for (const c of tc.companies || []) {
        if (c.slug) targetSlugs.add(c.slug)
        if (c.name) targetSlugs.add(c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      }
    } catch {}
  }

  // Build the search queries into a prompt for the agent
  const queryList = queries.map((q, i) => `${i + 1}. ${q.query}`).join('\n')

  const prompt = `You are searching for job roles beyond the user's target company list. Run each WebSearch query and collect the results.

Career profile: ${careerContext}

Run these WebSearch queries one by one. For each result, extract: company name, role title, URL, location (if available).

QUERIES:
${queryList}

DEDUP: Skip any URL that matches one of these existing URLs (already in the pipeline):
${[...existingUrls].slice(0, 50).join('\n')}
${existingUrls.size > 50 ? `... and ${existingUrls.size - 50} more` : ''}

For each NEW role found, classify:
- KEEP: role title and company are genuinely relevant to the user's profile
- SKIP: clearly irrelevant, or URL looks stale/generic

After running all queries, READ these files to make your triage decisions:
- search/context/experience-library.yaml
- search/context/career-plan.yaml

Output ONLY a JSON array of kept roles:
[{"company": "Loom", "company_slug": "loom", "title": "Senior UX Researcher", "url": "https://...", "location": "Remote", "source_query": "query name"}]

Only include roles you're confident are relevant and have valid, specific job posting URLs (not generic careers pages).`

  const result = await getProcessManager().spawn({
    agent: 'research',
    directive: { skill: 'broad-discovery', text: prompt, skipEntry: true },
    oneOff: true,
  })

  if (!result.ok) {
    console.error('[discover] spawn failed')
    return
  }

  console.log(`[discover] agent: ${result.spawn_id}`)
  await waitForCompletion(result.spawn_id, 15 * 60 * 1000)

  const output = getProcessManager().getOneOffStatus(result.spawn_id)
  if (!output?.output) {
    await postToBlackboard('findings.scan-progress', {
      type: 'category-complete',
      text: 'Broad discovery: no new roles found.',
      for: 'research',
      timestamp: new Date().toISOString(),
    }, 'Discovery: 0 roles')
    return
  }

  // Parse agent output
  let discoveredRoles: Array<{ company: string; company_slug: string; title: string; url: string; location: string; source_query?: string }> = []
  try {
    const jsonMatch = output.output.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      discoveredRoles = JSON.parse(jsonMatch[0])
    }
  } catch (err) {
    console.warn('[discover] parse failed:', err)
  }

  if (discoveredRoles.length === 0) {
    await postToBlackboard('findings.scan-progress', {
      type: 'category-complete',
      text: 'Broad discovery: no new roles found.',
      for: 'research',
      timestamp: new Date().toISOString(),
    }, 'Discovery: 0 roles')
    return
  }

  // Convert to open-roles format
  const today = new Date().toISOString().split('T')[0]
  const newRoles = discoveredRoles
    .filter(r => r.url && !existingUrls.has(r.url))
    .map(r => {
      const slug = (r.company_slug || r.company.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      const isTargetCompany = targetSlugs.has(slug)
      return {
        id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        company: r.company,
        company_slug: slug,
        title: r.title,
        url: r.url,
        location: r.location || '',
        discovered_date: today,
        source: 'broad_discovery',
        source_type: isTargetCompany ? 'targeted' as const : 'discovered' as const,
        fit_estimate: 0,
        status: 'new',
        jd_file: '',
        score_file: '',
        resume_file: '',
        cover_letter_file: '',
        application_ids: [],
      }
    })

  // Write to open-roles.yaml
  if (newRoles.length > 0) {
    const existing = existsSync(orPath)
      ? YAML.parse(readFileSync(orPath, 'utf-8'), { uniqueKeys: false }) || { roles: [], last_scan: null, scan_count: 0 }
      : { roles: [], last_scan: null, scan_count: 0 }
    if (!Array.isArray(existing.roles)) existing.roles = []
    existing.roles.push(...newRoles)
    writeFileSync(orPath, YAML.stringify(existing))
  }

  const discoveredCount = newRoles.filter(r => r.source_type === 'discovered').length
  await postToBlackboard('findings.scan-progress', {
    type: 'category-complete',
    text: `Broad discovery: ${newRoles.length} new roles found (${discoveredCount} at companies outside your target list).`,
    for: 'research',
    timestamp: new Date().toISOString(),
  }, `Discovery: ${newRoles.length} roles`)

  console.log(`[discover] ${newRoles.length} roles written (${discoveredCount} discovered)`)
}
