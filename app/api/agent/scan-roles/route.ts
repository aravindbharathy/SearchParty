import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import processManager from '@/lib/process-manager'
import { getSearchDir } from '@/lib/paths'

/**
 * POST /api/agent/scan-roles
 *
 * Triggers the research agent to scan target companies for open roles.
 * Designed to be called:
 *   1. By a local cron job (e.g., 0 7 * * * curl -X POST http://localhost:8791/api/agent/scan-roles)
 *   2. By the "Scan for Roles" button in the Finding page
 *   3. By the daily briefing if no scan has run in the last 24 hours
 *
 * Skips if a scan ran within the last 12 hours (configurable).
 */
export async function POST(req: Request) {
  try {
    // Check if force scan is requested
    const body = await req.json().catch(() => ({})) as { force?: boolean }
    const force = body.force === true

    // Check last scan time
    if (!force) {
      const storePath = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
      if (existsSync(storePath)) {
        try {
          const raw = YAML.parse(readFileSync(storePath, 'utf-8'))
          if (raw?.last_scan) {
            const elapsed = Date.now() - new Date(raw.last_scan).getTime()
            const twelveHours = 12 * 60 * 60 * 1000
            if (elapsed < twelveHours) {
              return NextResponse.json({
                ok: false,
                skipped: true,
                reason: 'Scan ran within last 12 hours',
                last_scan: raw.last_scan,
                next_eligible: new Date(new Date(raw.last_scan).getTime() + twelveHours).toISOString(),
              })
            }
          }
        } catch { /* proceed with scan */ }
      }
    }

    // Check if research agent is already running
    const status = processManager.getStatus()
    if (status.agents.research?.status === 'running') {
      return NextResponse.json({
        ok: false,
        skipped: true,
        reason: 'Research agent is already running',
      })
    }

    // Build the scan directive — inline instructions (agents can't reliably read .claude/ skill files)
    const scanDirective = `Scan for open roles at my target companies.

1. Read search/context/career-plan.yaml and search/context/target-companies.yaml.
2. For each high-priority company (up to 10), WebSearch for current open roles: "{company} careers {target role keywords}". Look for roles posted in the last 14 days.
3. Use PREFERRED sources: company careers pages, LinkedIn Jobs, Greenhouse/Lever/Ashby boards. AVOID: ZipRecruiter, SimplyHired, Jooble (stale aggregators).
4. CRITICAL: For EVERY role, WebFetch the posting URL to VERIFY it's active. Check for Apply button. REJECT if: "position filled", "expired", 404, redirect to generic careers page.
5. For roles with fit >= 75, extract full JD text and save to search/vault/job-descriptions/{company-slug}-{role-slug}.txt.
6. Write all verified roles to search/pipeline/open-roles.yaml. Preserve existing roles, deduplicate by URL. Each role: id, company, company_slug, title, url, location, posted_date, discovered_date, source, fit_estimate, status "new", jd_file, verified_active: true.
7. For high-fit roles with saved JDs, post directives to resume and networking agents.
8. Post findings to blackboard with summary.`

    const result = await processManager.spawn({
      agent: 'research',
      directive: {
        skill: 'scan-roles',
        entry_name: 'role-scan',
        text: scanDirective,
        blackboard: true,
      },
    })

    return NextResponse.json({
      ok: result.ok,
      spawn_id: result.spawn_id,
      error: result.error,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * GET — check scan status (last scan time, whether stale)
 */
export async function GET() {
  try {
    const storePath = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(storePath)) {
      return NextResponse.json({ last_scan: null, scan_stale: true, scan_count: 0 })
    }

    const raw = YAML.parse(readFileSync(storePath, 'utf-8'))
    const lastScan = raw?.last_scan || null
    const scanStale = !lastScan || (Date.now() - new Date(lastScan).getTime()) > 24 * 60 * 60 * 1000

    return NextResponse.json({
      last_scan: lastScan,
      scan_stale: scanStale,
      scan_count: raw?.scan_count || 0,
      role_count: Array.isArray(raw?.roles) ? raw.roles.length : 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
