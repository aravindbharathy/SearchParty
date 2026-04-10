---
name: scan-roles
description: "Scan target companies for open roles matching the user's career plan. Validates postings are active before adding."
argument-hint: "[company name or 'all' for full scan]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
model: claude-sonnet-4-6
---

You are scanning target companies for open roles that match the user's career plan.

## Prerequisites

READ `search/context/career-plan.yaml` and `search/context/target-companies.yaml` first.

If career-plan.yaml is empty or target-companies.yaml has no companies, STOP and tell the user:

> "I need your career plan and target companies to scan for roles. Please complete your profile with the Career Coach first."

THEN you MUST post a user-action directive to the blackboard:
1. First read_blackboard to get the current directives array
2. Then write_to_blackboard with path "directives" and value = existing array + this new entry:
   {"id":"dir-ua-scan","type":"user_action","text":"Your career plan and target companies are needed to scan for roles","button_label":"Complete Career Plan","route":"/coach","chat_message":"I need to complete my career plan and target companies. The research agent needs these to scan for open roles.","assigned_to":"coach","from":"research","priority":"high","status":"pending","posted_at":"<current ISO timestamp>"}

## Context Files to Read

1. `search/context/career-plan.yaml` — target level, functions, industries, locations, comp floor
2. `search/context/target-companies.yaml` — companies to scan (focus on high and medium priority)
3. `search/pipeline/open-roles.yaml` — existing discovered roles (preserve, don't duplicate)

## Sources — Where to Search

### Preferred Sources (most reliable, try these first)
- **Company careers pages** — search `{company} careers {role keywords}` on Google
- **LinkedIn Jobs** — search `site:linkedin.com/jobs "{company}" "{role keywords}"`
- **Greenhouse/Lever/Ashby boards** — many companies use these: `{company}.greenhouse.io/jobs`, `jobs.lever.co/{company}`, `jobs.ashbyhq.com/{company}`

### Acceptable Sources
- **Indeed** — `site:indeed.com "{company}" "{role keywords}"`
- **Glassdoor jobs** — for verification
- **Built In** — for tech companies

### Sources to AVOID (unreliable, aggregators with stale data)
- ZipRecruiter — mostly scraped/stale listings
- SimplyHired — aggregator, often outdated
- Jooble, Talent.com — low-quality aggregators
- Any site that doesn't link to the actual company posting

## Search Strategy

For each company (up to $ARGUMENTS or 10 high-priority if 'all'):

1. **Search for roles**: `"{company name}" careers {target function} {target level}`
   - Use WebSearch to find listings
   - Look for roles posted in the last 14 days
   - Match against user's target level and functions

2. **For each potential match, VERIFY the posting is active**:
   - Use WebFetch on the job posting URL
   - Check for these ACTIVE signals:
     - "Apply" or "Apply Now" button present
     - No "This position has been filled" message
     - No "This job is no longer available" message
     - No "Expired" or "Closed" indicators
     - Page returns 200 (not 404 or redirect to careers homepage)
   - Check for these CLOSED signals (skip if found):
     - "Position filled" / "No longer accepting applications"
     - "This job has expired"
     - Redirect to generic careers page (URL changed from specific to general)
     - 404 or "Page not found"
     - Posting date is older than 60 days with no "reposted" indicator

3. **If active, extract the full JD text**:
   - Capture: title, company, location, salary range (if shown), requirements, responsibilities
   - Save to `search/vault/job-descriptions/{company-slug}-{role-slug}.txt`
   - Include the source URL at the top of the file

4. **Estimate fit** (0-100) based on:
   - Level match (exact match = 30pts, adjacent = 15pts, mismatch = 0)
   - Function match (exact = 25pts, related = 15pts)
   - Industry match (target industry = 20pts, adjacent = 10pts)
   - Location match (matches preference = 15pts, remote when preferred = 15pts)
   - Comp match (meets floor = 10pts, if comp shown)

## Output Format

Write to `search/pipeline/open-roles.yaml`:

```yaml
last_scan: "{ISO timestamp}"
scan_count: {increment from previous}
roles:
  # PRESERVE existing roles — only add new ones. Deduplicate by URL.
  - id: "role-{timestamp}-{random 4 chars}"
    company: "{company name}"
    company_slug: "{company-slug}"
    title: "{exact job title from posting}"
    url: "{direct URL to the job posting — NOT a search result or aggregator link}"
    location: "{location from posting}"
    salary_range: "{if shown on posting, else empty}"
    posted_date: "{date from posting, or 'recent' if unclear}"
    discovered_date: "{today YYYY-MM-DD}"
    source: "{where found: careers_page, linkedin, greenhouse, etc.}"
    fit_estimate: {0-100}
    status: "new"
    jd_file: "{path to saved JD file}"
    verified_active: true
    verification_note: "{brief note: 'Apply button present, posted 3 days ago'}"
```

## Quality Checks — Before Adding a Role

Every role MUST pass ALL of these:
- [ ] URL goes directly to the job posting (not a search result page)
- [ ] WebFetch confirmed the page is active (Apply button, no "filled" message)
- [ ] Title matches the user's target function (not a completely different department)
- [ ] Level is appropriate (not too junior, not C-suite)
- [ ] JD text was successfully extracted and saved to vault

If any check fails, DO NOT add the role. Log it as skipped with the reason.

## Cross-Agent Directives

For roles with fit_estimate >= 75 AND verified active:
- Post directive to **resume agent**: "Tailor resume for {company} {title}, JD at {jd_file}"
- Post directive to **networking agent**: "Check connections at {company} for {title} referral"

## After Scanning

- Post findings to blackboard with summary: "{N} new roles found, {M} high-fit"
- Update `last_scan` timestamp
- Report back to user with a clean summary table of findings
