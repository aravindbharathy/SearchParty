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

  // ── Workday ────────────────────────────────────────────────────
  { name: 'Microsoft', aliases: ['microsoft', 'microsoft ai'], careers_url: 'https://gcsservices.wd1.myworkdayjobs.com/en-US/Microsoft_Careers' },
  { name: 'Adobe', aliases: ['adobe'], careers_url: 'https://adobe.wd5.myworkdayjobs.com/external_experienced' },
  { name: 'Salesforce', aliases: ['salesforce', 'salesforce / tableau', 'tableau'], careers_url: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site' },
  { name: 'Amazon', aliases: ['amazon', 'amazon / aws', 'aws', 'amazon / aws ai'], careers_url: 'https://amazon.wd5.myworkdayjobs.com/AmazonNew' },
  { name: 'Apple', aliases: ['apple', 'apple ai'], careers_url: 'https://jobs.apple.com/api/role/search' },
  { name: 'NVIDIA', aliases: ['nvidia'], careers_url: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite' },
  { name: 'Uber', aliases: ['uber'], careers_url: 'https://uber.wd5.myworkdayjobs.com/Uber' },
  { name: 'Zillow', aliases: ['zillow'], careers_url: 'https://zillow.wd5.myworkdayjobs.com/Zillow_Group_External' },
  { name: 'T-Mobile', aliases: ['t-mobile'], careers_url: 'https://tmobile.wd1.myworkdayjobs.com/External' },
  { name: 'ServiceNow', aliases: ['servicenow'], careers_url: 'https://servicenow.wd1.myworkdayjobs.com/ServiceNowCareers' },
  { name: 'Mastercard', aliases: ['mastercard'], careers_url: 'https://mastercard.wd1.myworkdayjobs.com/CorporateCareers' },

  // ── Teamtailor ─────────────────────────────────────────────────
  { name: 'Pleo', aliases: ['pleo'], careers_url: 'https://pleo.teamtailor.com/jobs' },
  { name: 'Einride', aliases: ['einride'], careers_url: 'https://einride.teamtailor.com/jobs' },

  // ── India — Greenhouse ────────────────────────────────────────
  { name: 'Razorpay', aliases: ['razorpay'], careers_url: 'https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited' },
  { name: 'Postman', aliases: ['postman'], careers_url: 'https://job-boards.greenhouse.io/postman' },
  { name: 'PhonePe', aliases: ['phonepe'], careers_url: 'https://job-boards.greenhouse.io/phonepe' },
  { name: 'Groww', aliases: ['groww'], careers_url: 'https://job-boards.eu.greenhouse.io/groww' },
  { name: 'Druva', aliases: ['druva'], careers_url: 'https://job-boards.greenhouse.io/druva' },

  // ── India — Lever ─────────────────────────────────────────────
  { name: 'CRED', aliases: ['cred'], careers_url: 'https://jobs.lever.co/cred' },
  { name: 'Meesho', aliases: ['meesho'], careers_url: 'https://jobs.lever.co/meesho' },
  { name: 'Dream11', aliases: ['dream11', 'dream sports', 'dreamsports'], careers_url: 'https://jobs.lever.co/dreamsports' },

  // ── India — Workday ───────────────────────────────────────────
  { name: 'BrowserStack', aliases: ['browserstack'], careers_url: 'https://browserstack.wd3.myworkdayjobs.com/External' },
  { name: 'Samsung', aliases: ['samsung', 'samsung india'], careers_url: 'https://sec.wd3.myworkdayjobs.com/Samsung_Careers' },
  { name: 'Walmart', aliases: ['walmart', 'walmart india', 'walmart global tech'], careers_url: 'https://walmart.wd5.myworkdayjobs.com/WalmartExternal' },
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
