/**
 * POST /api/finding/open-roles/scan
 *
 * Zero-token ATS scan. Fetches job listings directly from Greenhouse/Ashby/Lever APIs.
 * No AI tokens consumed. Returns results in seconds.
 *
 * Body: { scope?: "full" | "top-fit" | "company:{name}" }
 * Returns: { ok, scanned, total_jobs, new_roles, filtered, duplicates, errors, without_ats }
 */

import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { scanViaAts, type TargetCompany } from '@/lib/scanner/ats-scanner'
import { buildTitleFilter } from '@/lib/scanner/title-filter'
import { loadExistingRoleUrls, loadExistingCompanyRoles } from '@/lib/scanner/dedup'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { scope?: string }
    const scope = body.scope || 'full'
    const searchDir = getSearchDir()

    // Read career plan for title filter
    const cpPath = join(searchDir, 'context', 'career-plan.yaml')
    if (!existsSync(cpPath)) {
      return NextResponse.json({ error: 'Career plan not found' }, { status: 400 })
    }
    const cp = YAML.parse(readFileSync(cpPath, 'utf-8'), { uniqueKeys: false }) || {}
    const titleFilter = buildTitleFilter(cp.target || {})

    // Read target companies
    const tcPath = join(searchDir, 'context', 'target-companies.yaml')
    if (!existsSync(tcPath)) {
      return NextResponse.json({ error: 'No target companies' }, { status: 400 })
    }
    const tc = YAML.parse(readFileSync(tcPath, 'utf-8'), { uniqueKeys: false }) || {}
    let companies: TargetCompany[] = tc.companies || []

    // Filter by scope
    if (scope === 'top-fit') {
      companies = companies.filter((c: TargetCompany & { fit_score?: number }) => (c.fit_score || 0) >= 75)
    } else if (scope.startsWith('company:')) {
      const name = scope.slice(8).toLowerCase()
      companies = companies.filter(c =>
        c.name.toLowerCase().includes(name) || c.slug === name.replace(/[^a-z0-9]+/g, '-'),
      )
    }

    if (companies.length === 0) {
      return NextResponse.json({ error: 'No companies match this scope' }, { status: 400 })
    }

    // Load dedup sets
    const existingUrls = loadExistingRoleUrls()
    const existingCompanyRoles = loadExistingCompanyRoles()

    // Run zero-token scan
    const result = await scanViaAts({
      companies,
      titleFilter,
      existingUrls,
      existingCompanyRoles,
    })

    // Write new roles to open-roles.yaml
    if (result.newRoles.length > 0) {
      const orPath = join(searchDir, 'pipeline', 'open-roles.yaml')
      const pipelineDir = join(searchDir, 'pipeline')
      if (!existsSync(pipelineDir)) mkdirSync(pipelineDir, { recursive: true })

      let existing = { roles: [] as unknown[], last_scan: null as string | null, scan_count: 0 }
      if (existsSync(orPath)) {
        existing = YAML.parse(readFileSync(orPath, 'utf-8'), { uniqueKeys: false }) || existing
        if (!Array.isArray(existing.roles)) existing.roles = []
      }

      existing.roles.push(...result.newRoles)
      existing.last_scan = new Date().toISOString()
      existing.scan_count = (existing.scan_count || 0) + 1

      writeFileSync(orPath, YAML.stringify(existing))
    }

    return NextResponse.json({
      ok: true,
      scanned: result.companiesScanned,
      total_jobs: result.totalJobsFound,
      new_roles: result.newRoles.length,
      filtered: result.filteredByTitle,
      duplicates: result.duplicates,
      errors: result.errors,
      without_ats: result.companiesWithoutAts,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
