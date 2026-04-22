/**
 * Known ATS registry — maps companies to their job board endpoints.
 *
 * The zero-token scanner checks this registry when a company in
 * target-companies.yaml doesn't have an explicit careers_url.
 * This lets the scanner work immediately without the user or coach
 * needing to look up ATS endpoints.
 *
 * To add a company: add an entry with the slug (lowercase, hyphenated),
 * the display name variants the coach might use, and the careers URL.
 * The detectAts() function infers ats_provider from the URL automatically.
 *
 * Contributions welcome — this registry benefits all users.
 */

interface KnownCompany {
  /** Canonical display name */
  name: string
  /** All name variants the coach might generate (lowercase) */
  aliases: string[]
  /** ATS-hosted careers page URL */
  careers_url: string
}

const KNOWN_COMPANIES: KnownCompany[] = [
  // ── Greenhouse ─────────────────────────────────────────────────
  { name: 'Anthropic', aliases: ['anthropic'], careers_url: 'https://job-boards.greenhouse.io/anthropic' },
  { name: 'Stripe', aliases: ['stripe'], careers_url: 'https://job-boards.greenhouse.io/stripe' },
  { name: 'Figma', aliases: ['figma'], careers_url: 'https://job-boards.greenhouse.io/figma' },
  { name: 'Databricks', aliases: ['databricks'], careers_url: 'https://job-boards.greenhouse.io/databricks' },
  { name: 'Qualtrics', aliases: ['qualtrics'], careers_url: 'https://job-boards.greenhouse.io/qualtrics' },
  { name: 'Notion', aliases: ['notion'], careers_url: 'https://job-boards.greenhouse.io/notion' },
  { name: 'Ramp', aliases: ['ramp'], careers_url: 'https://job-boards.greenhouse.io/ramp' },
  { name: 'Coinbase', aliases: ['coinbase'], careers_url: 'https://job-boards.greenhouse.io/coinbase' },
  { name: 'Discord', aliases: ['discord'], careers_url: 'https://job-boards.greenhouse.io/discord' },
  { name: 'Plaid', aliases: ['plaid'], careers_url: 'https://job-boards.greenhouse.io/plaid' },
  { name: 'Airtable', aliases: ['airtable'], careers_url: 'https://job-boards.greenhouse.io/airtable' },
  { name: 'HashiCorp', aliases: ['hashicorp'], careers_url: 'https://job-boards.greenhouse.io/hashicorp' },
  { name: 'Cockroach Labs', aliases: ['cockroach labs', 'cockroachdb'], careers_url: 'https://job-boards.greenhouse.io/cockroachlabs' },
  { name: 'Vercel', aliases: ['vercel'], careers_url: 'https://job-boards.greenhouse.io/vercel' },
  { name: 'Rippling', aliases: ['rippling'], careers_url: 'https://job-boards.greenhouse.io/rippling' },
  { name: 'Scale AI', aliases: ['scale ai', 'scale'], careers_url: 'https://job-boards.greenhouse.io/scaleai' },
  { name: 'Datadog', aliases: ['datadog'], careers_url: 'https://job-boards.greenhouse.io/datadog' },
  { name: 'Anduril', aliases: ['anduril'], careers_url: 'https://job-boards.greenhouse.io/andurilindustries' },
  { name: 'Brex', aliases: ['brex'], careers_url: 'https://job-boards.greenhouse.io/brex' },
  { name: 'GitLab', aliases: ['gitlab'], careers_url: 'https://job-boards.greenhouse.io/gitlab' },
  { name: 'Instacart', aliases: ['instacart'], careers_url: 'https://job-boards.greenhouse.io/instacart' },
  { name: 'DoorDash', aliases: ['doordash'], careers_url: 'https://job-boards.greenhouse.io/doordash' },
  { name: 'Pinterest', aliases: ['pinterest'], careers_url: 'https://job-boards.greenhouse.io/pinterest' },
  { name: 'Toast', aliases: ['toast'], careers_url: 'https://job-boards.greenhouse.io/toast' },
  { name: 'Palantir', aliases: ['palantir'], careers_url: 'https://job-boards.greenhouse.io/palantirtechnologies' },
  { name: 'Reddit', aliases: ['reddit'], careers_url: 'https://job-boards.greenhouse.io/reddit' },
  { name: 'Okta', aliases: ['okta'], careers_url: 'https://job-boards.greenhouse.io/okta' },
  { name: 'MongoDB', aliases: ['mongodb', 'mongo'], careers_url: 'https://job-boards.greenhouse.io/mongodb' },
  { name: 'Cloudflare', aliases: ['cloudflare'], careers_url: 'https://job-boards.greenhouse.io/cloudflare' },
  { name: 'Confluent', aliases: ['confluent'], careers_url: 'https://job-boards.greenhouse.io/confluent' },
  { name: 'Elastic', aliases: ['elastic', 'elasticsearch'], careers_url: 'https://job-boards.greenhouse.io/elastic' },
  { name: 'Samsara', aliases: ['samsara'], careers_url: 'https://job-boards.greenhouse.io/samsara' },
  { name: 'Snyk', aliases: ['snyk'], careers_url: 'https://job-boards.greenhouse.io/snyk' },
  { name: 'Gusto', aliases: ['gusto'], careers_url: 'https://job-boards.greenhouse.io/gusto' },
  { name: 'Twilio', aliases: ['twilio'], careers_url: 'https://job-boards.greenhouse.io/twilio' },
  { name: 'Navan', aliases: ['navan', 'tripactions'], careers_url: 'https://job-boards.greenhouse.io/navan' },

  // ── Ashby ──────────────────────────────────────────────────────
  { name: 'OpenAI', aliases: ['openai'], careers_url: 'https://jobs.ashbyhq.com/openai' },
  { name: 'Cursor', aliases: ['cursor'], careers_url: 'https://jobs.ashbyhq.com/anysphere' },
  { name: 'Linear', aliases: ['linear'], careers_url: 'https://jobs.ashbyhq.com/linear' },
  { name: 'Retool', aliases: ['retool'], careers_url: 'https://jobs.ashbyhq.com/retool' },
  { name: 'Supabase', aliases: ['supabase'], careers_url: 'https://jobs.ashbyhq.com/supabase' },
  { name: 'Resend', aliases: ['resend'], careers_url: 'https://jobs.ashbyhq.com/resend' },
  { name: 'ElevenLabs', aliases: ['elevenlabs', 'eleven labs'], careers_url: 'https://jobs.ashbyhq.com/elevenlabs' },
  { name: 'Perplexity', aliases: ['perplexity', 'perplexity ai'], careers_url: 'https://jobs.ashbyhq.com/perplexity' },
  { name: 'Mistral AI', aliases: ['mistral', 'mistral ai'], careers_url: 'https://jobs.ashbyhq.com/mistralai' },
  { name: 'Cohere', aliases: ['cohere'], careers_url: 'https://jobs.ashbyhq.com/cohere' },

  // ── Lever ──────────────────────────────────────────────────────
  { name: 'Netflix', aliases: ['netflix'], careers_url: 'https://jobs.lever.co/netflix' },
  { name: 'Spotify', aliases: ['spotify'], careers_url: 'https://jobs.lever.co/spotify' },
]

/**
 * Look up a company's careers URL from the known registry.
 * Matches against name and slug (case-insensitive, with normalization).
 */
export function lookupKnownAts(companyName: string, slug?: string): string | null {
  const nameLower = companyName.toLowerCase().trim()
  const slugLower = slug?.toLowerCase().trim()

  for (const known of KNOWN_COMPANIES) {
    // Match against canonical name
    if (known.name.toLowerCase() === nameLower) return known.careers_url
    // Match against aliases
    if (known.aliases.some(a => a === nameLower)) return known.careers_url
    // Match against slug
    if (slugLower && known.aliases.some(a => a.replace(/\s+/g, '-') === slugLower)) return known.careers_url
    // Fuzzy: check if company name contains or is contained by an alias
    if (known.aliases.some(a => nameLower.includes(a) || a.includes(nameLower))) return known.careers_url
  }

  return null
}
