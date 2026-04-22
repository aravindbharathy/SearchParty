/**
 * ATS API detection from careers URLs.
 * Adapted from CareerOps scan.mjs (MIT, Santiago Fernandez de Valderrama).
 */

export interface AtsEndpoint {
  type: 'greenhouse' | 'ashby' | 'lever'
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

  return null
}
