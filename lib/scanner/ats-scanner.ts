/**
 * Zero-token ATS scanner.
 * Fetches job listings directly from Greenhouse/Ashby/Lever APIs.
 * No AI tokens consumed — pure HTTP + JSON parsing.
 *
 * Adapted from CareerOps scan.mjs (MIT, Santiago Fernandez de Valderrama).
 */

import { detectAts } from './detect-ats'
import { PARSERS, parseWorkday, parseBambooHR, parseTeamtailor, type ScannedJob } from './parsers'
import { normalizeCompany, normalizeRole } from './dedup'
import { lookupKnownAts } from './known-ats'

const FETCH_TIMEOUT_MS = 15_000

export interface TargetCompany {
  name: string
  slug: string
  careers_url?: string
  ats_provider?: string
  ats_slug?: string
}

export interface ScannedRole {
  id: string
  company: string
  company_slug: string
  title: string
  url: string
  location: string
  discovered_date: string
  source: string
  source_type: 'targeted' | 'discovered'
  fit_estimate: number
  status: 'new'
  jd_file: string
  score_file: string
  resume_file: string
  cover_letter_file: string
  application_ids: string[]
}

export interface ScanResult {
  companiesScanned: number
  totalJobsFound: number
  filteredByTitle: number
  duplicates: number
  newRoles: ScannedRole[]
  errors: Array<{ company: string; error: string }>
  companiesWithoutAts: string[]
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch Workday jobs with pagination.
 * Workday API uses POST with offset-based pagination.
 */
async function fetchWorkdayJobs(apiUrl: string, companyName: string): Promise<ScannedJob[]> {
  const allJobs: ScannedJob[] = []
  let offset = 0
  const limit = 20

  for (let page = 0; page < 50; page++) { // safety: max 1000 jobs
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: '' }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const jobs = parseWorkday(json, companyName, apiUrl)
      allJobs.push(...jobs)

      // Check if there are more pages
      const total = json.total || 0
      offset += limit
      if (offset >= total || jobs.length === 0) break
    } finally {
      clearTimeout(timer)
    }
  }

  return allJobs
}

async function parallelFetch<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = []
  let i = 0
  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++]
      results.push(await task())
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next())
  await Promise.all(workers)
  return results
}

function generateRoleId(): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `role-${ts}-${rand}`
}

export async function scanViaAts(options: {
  companies: TargetCompany[]
  titleFilter: (title: string) => boolean
  existingUrls: Set<string>
  existingCompanyRoles: Set<string>
  concurrency?: number
}): Promise<ScanResult> {
  const { companies, titleFilter, existingUrls, existingCompanyRoles, concurrency = 10 } = options

  const withAts: Array<TargetCompany & { ats: NonNullable<ReturnType<typeof detectAts>> }> = []
  const withoutAts: string[] = []

  for (const company of companies) {
    // Try explicit careers_url first, then known-ATS registry
    const careersUrl = company.careers_url || lookupKnownAts(company.name, company.slug)
    if (!careersUrl) {
      withoutAts.push(company.name)
      continue
    }
    const ats = detectAts(careersUrl, {
      ats_provider: company.ats_provider,
      ats_slug: company.ats_slug,
    })
    if (ats) {
      withAts.push({ ...company, ats })
    } else {
      withoutAts.push(company.name)
    }
  }

  let totalFound = 0
  let filteredByTitle = 0
  let duplicates = 0
  const newRoles: ScannedRole[] = []
  const errors: Array<{ company: string; error: string }> = []
  const today = new Date().toISOString().split('T')[0]

  // Track seen URLs within this scan to avoid intra-scan dupes
  const seenThisScan = new Set<string>()

  const tasks = withAts.map(company => async () => {
    try {
      let jobs: ScannedJob[]

      if (company.ats.type === 'workday') {
        // Workday: POST with JSON body, paginate
        jobs = await fetchWorkdayJobs(company.ats.apiUrl, company.name)
      } else if (company.ats.type === 'bamboohr') {
        const json = await fetchJson(company.ats.apiUrl)
        const slug = company.ats.apiUrl.match(/([\w-]+)\.bamboohr\.com/)?.[1] || company.slug
        jobs = parseBambooHR(json, company.name, slug)
      } else if (company.ats.type === 'teamtailor') {
        // Teamtailor: RSS feed (XML)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        try {
          const res = await fetch(company.ats.apiUrl, { signal: controller.signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const text = await res.text()
          jobs = parseTeamtailor(text, company.name)
        } finally { clearTimeout(timer) }
      } else {
        // Greenhouse, Ashby, Lever — standard JSON
        const json = await fetchJson(company.ats.apiUrl)
        const parser = PARSERS[company.ats.type]
        if (!parser) {
          errors.push({ company: company.name, error: `Unknown ATS type: ${company.ats.type}` })
          return
        }
        jobs = parser(json, company.name)
      }
      totalFound += jobs.length

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          filteredByTitle++
          continue
        }
        if (existingUrls.has(job.url) || seenThisScan.has(job.url)) {
          duplicates++
          continue
        }
        const key = `${normalizeCompany(job.company)}::${normalizeRole(job.title)}`
        if (existingCompanyRoles.has(key)) {
          duplicates++
          continue
        }

        seenThisScan.add(job.url)

        newRoles.push({
          id: generateRoleId(),
          company: company.name,
          company_slug: company.slug,
          title: job.title,
          url: job.url,
          location: job.location,
          discovered_date: today,
          source: `${company.ats.type}_api`,
          source_type: 'targeted' as const,
          fit_estimate: 0,
          status: 'new',
          jd_file: '',
          score_file: '',
          resume_file: '',
          cover_letter_file: '',
          application_ids: [],
        })
      }
    } catch (err) {
      errors.push({
        company: company.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  await parallelFetch(tasks, concurrency)

  return {
    companiesScanned: withAts.length,
    totalJobsFound: totalFound,
    filteredByTitle,
    duplicates,
    newRoles,
    errors,
    companiesWithoutAts: withoutAts,
  }
}
