/**
 * Title filter derived from career plan.
 * Adapted from CareerOps scan.mjs title filter concept (MIT, Santiago Fernandez de Valderrama).
 *
 * Strategy: cast a WIDE net. This filter only removes roles that are
 * clearly in the wrong department (accounting, legal, facilities).
 * The real relevance filtering happens in the agent triage phase,
 * where the agent reads the user's actual experience and decides.
 *
 * Why not tighten? Non-standard titles like "Researcher, Core Product
 * Strategy" or "People Scientist" might be perfect fits but wouldn't
 * match specific keyword lists.
 */

interface CareerPlanTarget {
  functions?: string[]
  level?: string
}

export function buildTitleFilter(target: CareerPlanTarget): (title: string) => boolean {
  // Broad positive keywords derived from target functions
  const positive: string[] = []

  for (const fn of target.functions || []) {
    const lower = fn.toLowerCase()
    positive.push(lower)

    // Add broad related terms — err on the side of inclusion
    if (lower.includes('research')) {
      positive.push('research', 'researcher', 'insights', 'mixed methods')
    }
    if (lower.includes('product manager') || lower.includes('product management')) {
      positive.push('product manager', 'product lead', 'product management', 'program manager')
    }
    if (lower.includes('software engineer') || lower.includes('software development')) {
      positive.push('engineer', 'developer', 'swe', 'full stack', 'backend', 'frontend')
    }
    if (lower.includes('data scien')) {
      positive.push('data scientist', 'ml engineer', 'machine learning', 'applied scientist')
    }
    if (lower.includes('design')) {
      positive.push('designer', 'design')
    }
  }

  // Negative keywords — only clearly wrong departments
  const negative: string[] = []
  const level = (target.level || '').toLowerCase()

  if (level.includes('senior') || level.includes('staff') || level.includes('principal')) {
    negative.push('intern', 'internship', 'co-op', 'new grad', 'entry level')
  }

  // Always exclude roles in completely unrelated departments
  negative.push(
    'executive assistant', 'office manager', 'recruiter', 'talent acquisition',
    'accountant', 'accounting', 'legal counsel', 'paralegal', 'attorney',
    'facilities', 'janitor', 'security guard', 'receptionist',
    'payroll', 'accounts payable', 'accounts receivable',
    'truck driver', 'warehouse', 'forklift',
  )

  return (title: string) => {
    const lower = title.toLowerCase()
    if (negative.some(k => lower.includes(k))) return false
    if (positive.length === 0) return true
    return positive.some(k => lower.includes(k))
  }
}
