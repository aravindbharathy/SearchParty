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

    // Build the scan directive
    const scanDirective = `Scan for open roles at my target companies that match my career plan.

INSTRUCTIONS:
1. Read search/context/career-plan.yaml for my target level, functions, industries, locations, and comp floor.
2. Read search/context/target-companies.yaml for the list of companies to scan (focus on high and medium priority).
3. For each high-priority company (up to 10), use WebSearch to find current open roles matching my profile:
   - Search: "{company name} careers {target role keywords} {location}"
   - Look for roles posted in the last 10 days
   - Match against my target level and functions
4. For each role found, record: company, title, URL, location, posted date, source, and a quick fit estimate (0-100).
5. For roles with fit_estimate >= 75: use WebFetch to read the job posting URL and extract the full JD text. Save each JD to search/vault/job-descriptions/{company-slug}-{role-slug}.txt with the full text. Set jd_file field to the saved path.
6. Write ALL discovered roles to search/pipeline/open-roles.yaml using this format:
   last_scan: "{current ISO timestamp}"
   scan_count: {increment previous count}
   roles: [{existing roles} + {new roles with status: "new"}]

   Each role entry:
   - id: "role-{timestamp}-{random}"
   - company: "{company name}"
   - company_slug: "{slug}"
   - title: "{role title}"
   - url: "{job posting URL}"
   - location: "{location}"
   - posted_date: "{when posted}"
   - discovered_date: "{today}"
   - source: "web_search"
   - fit_estimate: {0-100}
   - status: "new"
   - jd_file: "{path to saved JD if fetched}"

7. IMPORTANT: Preserve existing roles in the file — only add new ones. Deduplicate by URL.
8. After scanning, post findings to blackboard for the daily briefing.
9. For roles with fit_estimate >= 75 AND a saved JD, post directives:
   - To research agent (self-directive): "Score JD at {jd_file} for {company} {title}"
   - To resume agent: "Tailor resume for {company} {title}, JD at {jd_file}"
   - To networking agent: "Check connections at {company} for {title} referral"
`

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
