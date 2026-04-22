/**
 * URL liveness classification.
 * Adapted from CareerOps liveness-core.mjs (MIT, Santiago Fernandez de Valderrama).
 */

const HARD_EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
  /job was removed/i,
  /may have been taken down/i,
]

const LISTING_PAGE_PATTERNS = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
]

const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,
]

const APPLY_PATTERNS = [
  /\bapply\b/i,
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,
]

const MIN_CONTENT_CHARS = 300

function firstMatch(patterns: RegExp[], text: string): RegExp | undefined {
  return patterns.find(p => p.test(text))
}

function hasApplyControl(controls: string[]): boolean {
  return controls.some(c => APPLY_PATTERNS.some(p => p.test(c)))
}

export interface LivenessResult {
  result: 'active' | 'expired' | 'uncertain'
  reason: string
}

export function classifyLiveness(opts: {
  status?: number
  finalUrl?: string
  bodyText?: string
  applyControls?: string[]
} = {}): LivenessResult {
  const { status = 0, finalUrl = '', bodyText = '', applyControls = [] } = opts

  if (status === 404 || status === 410) {
    return { result: 'expired', reason: `HTTP ${status}` }
  }

  const expiredUrl = firstMatch(EXPIRED_URL_PATTERNS, finalUrl)
  if (expiredUrl) {
    return { result: 'expired', reason: `redirect to ${finalUrl}` }
  }

  const expiredBody = firstMatch(HARD_EXPIRED_PATTERNS, bodyText)
  if (expiredBody) {
    return { result: 'expired', reason: `pattern matched: ${expiredBody.source}` }
  }

  if (hasApplyControl(applyControls)) {
    return { result: 'active', reason: 'visible apply control detected' }
  }

  const listingPage = firstMatch(LISTING_PAGE_PATTERNS, bodyText)
  if (listingPage) {
    return { result: 'expired', reason: `listing page: ${listingPage.source}` }
  }

  if (bodyText.trim().length < MIN_CONTENT_CHARS) {
    return { result: 'expired', reason: 'insufficient content' }
  }

  return { result: 'uncertain', reason: 'content present but no apply control found' }
}
