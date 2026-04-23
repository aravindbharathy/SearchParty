/**
 * POST /api/networking/import-connections
 *
 * Parses a LinkedIn Connections.csv and imports contacts into
 * search/context/connection-tracker.yaml, cross-referencing
 * against target companies.
 */

import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'
import { acquireFileLock } from '@/lib/file-lock'

interface LinkedInConnection {
  firstName: string
  lastName: string
  email: string
  company: string
  position: string
  connectedOn: string
  url?: string
}

function parseLinkedInCSV(csvText: string): LinkedInConnection[] {
  const lines = csvText.split('\n')
  if (lines.length < 2) return []

  // Find header row (LinkedIn CSVs sometimes have notes before the header)
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (lines[i].toLowerCase().includes('first name') || lines[i].toLowerCase().includes('firstname')) {
      headerIdx = i
      break
    }
  }

  const header = lines[headerIdx].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))

  // Map column indices
  const colMap: Record<string, number> = {}
  for (let i = 0; i < header.length; i++) {
    const h = header[i]
    if (h.includes('first') && h.includes('name')) colMap.firstName = i
    else if (h.includes('last') && h.includes('name')) colMap.lastName = i
    else if (h.includes('email')) colMap.email = i
    else if (h.includes('company')) colMap.company = i
    else if (h.includes('position')) colMap.position = i
    else if (h.includes('connected') && h.includes('on')) colMap.connectedOn = i
    else if (h.includes('url') || h.includes('profile')) colMap.url = i
  }

  const connections: LinkedInConnection[] = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV parse (handles quoted fields with commas)
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += ch
    }
    fields.push(current.trim())

    const firstName = fields[colMap.firstName] || ''
    const lastName = fields[colMap.lastName] || ''
    if (!firstName && !lastName) continue

    connections.push({
      firstName,
      lastName,
      email: fields[colMap.email] || '',
      company: fields[colMap.company] || '',
      position: fields[colMap.position] || '',
      connectedOn: fields[colMap.connectedOn] || '',
      url: fields[colMap.url] || '',
    })
  }

  return connections
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { csv: string }
    if (!body.csv) {
      return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 })
    }

    const connections = parseLinkedInCSV(body.csv)
    if (connections.length === 0) {
      return NextResponse.json({ error: 'No connections found in CSV. Make sure it\'s a LinkedIn Connections export.' }, { status: 400 })
    }

    // Load target companies for matching
    const searchDir = getSearchDir()
    const tcPath = join(searchDir, 'context', 'target-companies.yaml')
    const targetCompanies = new Map<string, string>() // normalized name → original name
    if (existsSync(tcPath)) {
      const tc = YAML.parse(readFileSync(tcPath, 'utf-8'), { uniqueKeys: false }) || {}
      for (const c of tc.companies || []) {
        const name = (c.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
        targetCompanies.set(name, c.name)
        // Also add slug and partial matches
        if (c.slug) targetCompanies.set(c.slug, c.name)
        // Add first word for partial matching (e.g., "microsoft" matches "Microsoft AI")
        const firstWord = name.split(/\s+/)[0]
        if (firstWord.length >= 4) targetCompanies.set(firstWord, c.name)
      }
    }

    // Match connections against target companies
    const matchCompany = (company: string): string | null => {
      if (!company) return null
      const norm = company.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
      // Exact match
      if (targetCompanies.has(norm)) return targetCompanies.get(norm)!
      // Partial: check if any target company name is contained in the connection's company
      for (const [key, original] of targetCompanies) {
        if (norm.includes(key) || key.includes(norm)) return original
      }
      return null
    }

    const atTargetCompanies: Array<LinkedInConnection & { targetCompany: string }> = []
    const otherConnections: LinkedInConnection[] = []

    for (const conn of connections) {
      const target = matchCompany(conn.company)
      if (target) {
        atTargetCompanies.push({ ...conn, targetCompany: target })
      } else {
        otherConnections.push(conn)
      }
    }

    // Write to connection-tracker.yaml (merge with existing)
    const ctPath = join(searchDir, 'context', 'connection-tracker.yaml')
    const release = await acquireFileLock(ctPath)
    try {
      let tracker = { contacts: [] as unknown[] }
      if (existsSync(ctPath)) {
        tracker = YAML.parse(readFileSync(ctPath, 'utf-8'), { uniqueKeys: false }) || tracker
        if (!Array.isArray(tracker.contacts)) tracker.contacts = []
      }

      // Build set of existing contacts for dedup
      const existing = new Set(
        (tracker.contacts as Array<{ name?: string }>).map(c =>
          (c.name || '').toLowerCase()
        )
      )

      let added = 0
      for (const conn of connections) {
        const name = `${conn.firstName} ${conn.lastName}`.trim()
        if (existing.has(name.toLowerCase())) continue
        existing.add(name.toLowerCase())

        const target = matchCompany(conn.company)

        tracker.contacts.push({
          name,
          company: conn.company,
          position: conn.position,
          email: conn.email || '',
          linkedin_url: conn.url || '',
          connected_on: conn.connectedOn,
          source: 'linkedin_import',
          at_target_company: target || '',
          relationship: 'unknown',
          context: '',
          can_help_with: [],
          reviewed: false,
        })
        added++
      }

      writeFileSync(ctPath, YAML.stringify(tracker))
    } finally { release() }

    // Group target company connections for the response
    const byCompany = new Map<string, Array<{ name: string; position: string }>>()
    for (const conn of atTargetCompanies) {
      const key = conn.targetCompany
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key)!.push({ name: `${conn.firstName} ${conn.lastName}`, position: conn.position })
    }

    return NextResponse.json({
      ok: true,
      total: connections.length,
      at_target_companies: atTargetCompanies.length,
      other: otherConnections.length,
      by_company: Object.fromEntries(byCompany),
      companies_matched: [...byCompany.keys()],
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
