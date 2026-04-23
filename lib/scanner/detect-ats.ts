/**
 * ATS API detection from careers URLs.
 * Adapted from CareerOps scan.mjs + scan.md (MIT, Santiago Fernandez de Valderrama).
 */

export interface AtsEndpoint {
  type: 'greenhouse' | 'ashby' | 'lever' | 'workday' | 'bamboohr' | 'teamtailor'
  apiUrl: string
}

/**
 * Detect which ATS a company uses from their careers URL.
 * Returns the direct API endpoint for fetching job listings.
 */
export function detectAts(
  careersUrl: string,
  overrides?: { ats_provider?: string; ats_slug?: string },
): AtsEndpoint | null {
  if (!careersUrl) return null

  // Explicit override
  if (overrides?.ats_provider && overrides?.ats_slug) {
    const slug = overrides.ats_slug
    switch (overrides.ats_provider) {
      case 'greenhouse':
        return { type: 'greenhouse', apiUrl: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs` }
      case 'ashby':
        return { type: 'ashby', apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true` }
      case 'lever':
        return { type: 'lever', apiUrl: `https://api.lever.co/v0/postings/${slug}` }
      case 'workday':
        return { type: 'workday', apiUrl: careersUrl }
      case 'bamboohr':
        return { type: 'bamboohr', apiUrl: `https://${slug}.bamboohr.com/careers/list` }
      case 'teamtailor':
        return { type: 'teamtailor', apiUrl: `https://${slug}.teamtailor.com/jobs.rss` }
    }
  }

  const url = careersUrl

  // Ashby: jobs.ashbyhq.com/{slug}
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)
  if (ashbyMatch) {
    return {
      type: 'ashby',
      apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    }
  }

  // Lever: jobs.lever.co/{slug}
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/)
  if (leverMatch) {
    return {
      type: 'lever',
      apiUrl: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    }
  }

  // Greenhouse: job-boards.greenhouse.io/{slug} or job-boards.eu.greenhouse.io/{slug}
  const ghMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/)
  if (ghMatch) {
    return {
      type: 'greenhouse',
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs`,
    }
  }

  // Greenhouse API URL directly: boards-api.greenhouse.io/v1/boards/{slug}
  const ghApiMatch = url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/)
  if (ghApiMatch) {
    return {
      type: 'greenhouse',
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${ghApiMatch[1]}/jobs`,
    }
  }

  // Workday: {company}.{shard}.myworkdayjobs.com/{site}
  // e.g., https://salesforce.wd12.myworkdayjobs.com/External_Career_Site
  const wdMatch = url.match(/([\w-]+)\.(wd\d+)\.myworkdayjobs\.com\/([^/?#]+)/)
  if (wdMatch) {
    return {
      type: 'workday',
      apiUrl: `https://${wdMatch[1]}.${wdMatch[2]}.myworkdayjobs.com/wday/cxs/${wdMatch[1]}/${wdMatch[3]}/jobs`,
    }
  }

  // BambooHR: {company}.bamboohr.com/careers
  const bbMatch = url.match(/([\w-]+)\.bamboohr\.com/)
  if (bbMatch) {
    return {
      type: 'bamboohr',
      apiUrl: `https://${bbMatch[1]}.bamboohr.com/careers/list`,
    }
  }

  // Teamtailor: {company}.teamtailor.com
  const ttMatch = url.match(/([\w-]+)\.teamtailor\.com/)
  if (ttMatch) {
    return {
      type: 'teamtailor',
      apiUrl: `https://${ttMatch[1]}.teamtailor.com/jobs.rss`,
    }
  }

  return null
}
