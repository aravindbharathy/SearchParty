/**
 * ATS API response parsers.
 * Adapted from CareerOps scan.mjs (MIT, Santiago Fernandez de Valderrama).
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

export const PARSERS: Record<string, (json: any, companyName: string) => ScannedJob[]> = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
}
