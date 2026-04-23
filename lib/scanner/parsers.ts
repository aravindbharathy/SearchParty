/**
 * ATS API response parsers.
 * Adapted from CareerOps scan.mjs + scan.md (MIT, Santiago Fernandez de Valderrama).
 */

export interface ScannedJob {
  title: string
  url: string
  company: string
  location: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseGreenhouse(json: any, companyName: string): ScannedJob[] {
  const jobs = json?.jobs || []
  return jobs.map((j: any) => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
  }))
}

export function parseAshby(json: any, companyName: string): ScannedJob[] {
  const jobs = json?.jobs || []
  return jobs.map((j: any) => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || j.locationName || '',
  }))
}

export function parseLever(json: any, companyName: string): ScannedJob[] {
  if (!Array.isArray(json)) return []
  return json.map((j: any) => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
  }))
}

export function parseWorkday(json: any, companyName: string, baseUrl: string): ScannedJob[] {
  const postings = json?.jobPostings || []
  // Extract base for constructing URLs: https://{company}.{shard}.myworkdayjobs.com/{site}
  const urlBase = baseUrl.replace(/\/wday\/cxs\/.*/, '')
  return postings.map((j: any) => ({
    title: j.title || '',
    url: j.externalPath ? `${urlBase}${j.externalPath}` : '',
    company: companyName,
    location: j.locationsText || j.bulletFields?.[0] || '',
  }))
}

export function parseBambooHR(json: any, companyName: string, slug: string): ScannedJob[] {
  const jobs = json?.result || []
  if (!Array.isArray(jobs)) return []
  return jobs.map((j: any) => ({
    title: j.jobOpeningName || '',
    url: j.jobOpeningShareUrl || `https://${slug}.bamboohr.com/careers/${j.id}/detail`,
    company: companyName,
    location: j.location?.city ? `${j.location.city}, ${j.location.state || ''}`.trim() : '',
  }))
}

export function parseTeamtailor(rssText: string, companyName: string): ScannedJob[] {
  // Parse RSS XML — extract <item><title> and <link> tags
  const items: ScannedJob[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(rssText)) !== null) {
    const item = match[1]
    const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || ''
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
    const location = item.match(/<location>(.*?)<\/location>/)?.[1] || ''
    if (title && link) {
      items.push({ title, url: link, company: companyName, location })
    }
  }
  return items
}

export const PARSERS: Record<string, (json: any, companyName: string) => ScannedJob[]> = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
  // workday, bamboohr, teamtailor have different signatures — handled in ats-scanner.ts
}
