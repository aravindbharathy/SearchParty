import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { acquireFileLock } from '@/lib/file-lock'

/**
 * POST /api/finding/open-roles/verify
 *
 * Checks each open role URL to see if it's still active.
 * Marks dead roles as status: "closed" with a verification note.
 * Returns the count of verified/closed roles.
 */
export async function POST() {
  try {
    const fp = join(getSearchDir(), 'pipeline', 'open-roles.yaml')
    if (!existsSync(fp)) {
      return NextResponse.json({ verified: 0, closed: 0 })
    }

    // Read without lock — the fetch loop takes minutes, can't hold the lock that long
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false }) || {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roles: any[] = Array.isArray(raw.roles) ? raw.roles : []

    let verified = 0
    let closed = 0
    let unverifiable = 0

    for (const role of roles) {
      // Skip roles without URLs or already closed/dismissed
      if (!role.url || role.status === 'closed' || role.status === 'dismissed') continue

      // Roles fresh from ATS APIs are inherently live — skip verification
      if (role.source?.endsWith('_api') && role.status === 'new') {
        role.verified_active = true
        role.verification_note = `Verified ${new Date().toISOString().split('T')[0]}: fresh from ATS API`
        verified++
        continue
      }

      try {
        const res = await fetch(role.url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)' },
        })

        const finalUrl = res.url || role.url
        const text = await res.text()
        const textLower = text.toLowerCase()

        // Check if URL is a generic careers/team page (not a specific posting)
        let isGenericCareersPage = false
        try {
          const parsed = new URL(role.url)
          const path = parsed.pathname.replace(/\/+$/, '') // strip trailing slashes
          const host = parsed.hostname.toLowerCase()
          // No job-specific ID or slug in the path (just /careers, /jobs, /teams/...)
          const hasJobId = /\/\d{4,}|\/[a-f0-9-]{20,}|\/positions\/|\/job\/|\/jobs\/\d/.test(path)
          isGenericCareersPage =
            // Path-based: /careers, /jobs, /careers/, /jobs/
            path === '/careers' || path === '/jobs' || path === '' ||
            // Subdomain-based: careers.company.com/ or jobs.company.com/ without a specific job path
            ((host.startsWith('careers.') || host.startsWith('jobs.')) && !hasJobId) ||
            // Team/department pages (e.g., /teams/design-user-experience/)
            /^\/teams\//.test(path)
        } catch {
          const urlLower = (role.url || '').toLowerCase()
          isGenericCareersPage =
            urlLower.endsWith('/careers') || urlLower.endsWith('/careers/') ||
            urlLower.endsWith('/jobs') || urlLower.endsWith('/jobs/')
        }

        // Check if posting is too old (>60 days)
        const postedDate = role.posted_date ? new Date(role.posted_date) : null
        const isStaleByAge = postedDate && (Date.now() - postedDate.getTime() > 60 * 24 * 60 * 60 * 1000)

        // LinkedIn-specific: expired postings still return 200 but show expiration text
        const isLinkedIn = role.url.includes('linkedin.com/')
        const linkedInDead = isLinkedIn && (
          textLower.includes('no longer accepting applications') ||
          textLower.includes('this job is no longer available') ||
          // LinkedIn auth wall with no job content — likely dead or very old
          (textLower.includes('sign in') && !textLower.includes('responsibilities'))
        )

        // Ashby: dead postings redirect to generic "Jobs" listing page
        const isAshby = role.url.includes('ashbyhq.com/')
        const ashbyDead = isAshby && (
          // Generic jobs list page — title is just "Jobs" with no role-specific content
          (/<title>Jobs<\/title>/i.test(text) && !textLower.includes(role.title?.toLowerCase().split(' ')[0] || '____'))
        )

        // Cloudflare/bot block — can't verify, don't mark as dead but note it
        const isBlocked = res.status === 403 || textLower.includes('attention required') || textLower.includes('captcha')

        const isDead =
          // Generic careers/team page (not a specific job posting)
          isGenericCareersPage ||
          // Posted more than 60 days ago — very likely stale
          isStaleByAge ||
          // Greenhouse error pattern
          finalUrl.includes('?error=true') ||
          // LinkedIn expired postings
          linkedInDead ||
          // Ashby dead postings
          ashbyDead ||
          // Common "closed" signals in page content
          textLower.includes('this job is no longer') ||
          textLower.includes('no longer open') ||
          textLower.includes('position has been filled') ||
          textLower.includes('job has expired') ||
          textLower.includes('job was removed') ||
          textLower.includes('job has been removed') ||
          textLower.includes('posting has been removed') ||
          textLower.includes('job not found') ||
          textLower.includes('may have been taken down') ||
          textLower.includes('may have been closed') ||
          textLower.includes('404 page not found') ||
          textLower.includes('the job you are looking for is no longer open') ||
          textLower.includes('this position is no longer available') ||
          // 404 page
          res.status === 404 ||
          // Redirected to generic careers page (no job-specific content)
          (finalUrl !== role.url && !finalUrl.includes('/jobs/') && !finalUrl.includes('/positions/') && text.length < 500)

        const today = new Date().toISOString().split('T')[0]
        if (isDead) {
          role.status = 'closed'
          role.verified_active = false
          const reason = isGenericCareersPage ? 'URL points to careers/team page, not specific posting'
            : isStaleByAge ? `posting is ${Math.floor((Date.now() - (postedDate?.getTime() || 0)) / (24 * 60 * 60 * 1000))} days old`
            : linkedInDead ? 'LinkedIn posting no longer accepting applications'
            : ashbyDead ? 'Ashby posting redirects to generic jobs page'
            : 'posting no longer active'
          role.verification_note = `Verified ${today}: ${reason}`
          closed++
        } else if (isBlocked) {
          role.verification_note = `Verified ${today}: could not verify (site blocked automated check)`
          unverifiable++
        } else {
          role.verified_active = true
          role.verification_note = `Verified ${today}: posting active`
          verified++
        }
      } catch {
        // Timeout or network error — mark as unverified but don't close
        role.verification_note = `Verification failed ${new Date().toISOString().split('T')[0]}: could not reach URL`
      }
    }

    // Write updated roles back
    // Lock only for the write — the fetch loop above ran unlocked
    const release = await acquireFileLock(fp)
    try {
      raw.roles = roles
      writeFileSync(fp, YAML.stringify(raw))
    } finally { release() }

    return NextResponse.json({ verified, closed, unverifiable, total: roles.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
