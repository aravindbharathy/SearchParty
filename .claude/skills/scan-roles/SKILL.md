---
name: scan-roles
description: "Scan a set of companies for open roles. Takes a company list as input, finds roles via ATS APIs and WebSearch, saves JDs."
argument-hint: "<company list or 'all'>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
---

You are scanning specific companies for open roles matching the user's career plan.

## Input

You receive:
1. **Career profile** — target level, functions, industries, locations
2. **Companies to scan** — a specific list of company names

## Context Files to Read

1. `search/context/career-plan.yaml` — target level, functions, locations, comp floor
2. `search/pipeline/open-roles.yaml` — READ FIRST. Keep all existing roles.
3. `search/pipeline/applications.yaml` — already-applied roles (never re-add)

## How to Scan Each Company

### Try ATS APIs first (fast, reliable)

| ATS | API URL | Parse |
|-----|---------|-------|
| **Greenhouse** | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs` | `jobs[]` → `title`, `absolute_url`, `content` (JD text) |
| **Lever** | `https://api.lever.co/v0/postings/{slug}?mode=json` | `[]` → `text`, `hostedUrl`, `description` |
| **Ashby** | `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams` | POST with company slug |
| **Teamtailor** | `https://{slug}.teamtailor.com/jobs.rss` | RSS items |

To find which ATS: WebSearch `"{company}" site:greenhouse.io OR site:lever.co OR site:jobs.ashbyhq.com`

### Fall back to WebSearch

If no ATS API works: `site:{company-domain}/careers "{role keywords}"`

### For each role found

1. **Filter by title** — must match user's target functions. Skip unrelated roles.
2. **Extract JD text** — from API response or WebFetch the URL
3. **Save JD file** to `search/vault/uploads/jds/{company-slug}-{role-slug}.txt`:
```
URL: {posting URL}
Company: {company}
Title: {title}
Location: {location}
Salary: {if shown}

{JD text}
```
4. **Estimate fit** (0-100): level 30pts, function 25pts, industry 20pts, location 15pts, comp 10pts

## Deduplication

Before adding a role, check:
- URL already in open-roles.yaml → skip
- Same company + similar title already applied → skip

## Writing Results

Read existing `search/pipeline/open-roles.yaml` first. If the file doesn't exist or is empty, create it with `roles: []`. Then append new roles using the Write tool (NOT Edit — Write the complete file with existing + new roles):

```yaml
  - id: "role-{timestamp}-{random}"
    company: "{company}"
    company_slug: "{slug}"
    title: "{title}"
    url: "{posting URL}"
    location: "{location}"
    salary_range: "{if available}"
    posted_date: "{from posting}"
    discovered_date: "{today}"
    source: "{greenhouse_api|lever_api|ashby_api|websearch}"
    fit_estimate: {0-100}
    status: "new"
    jd_file: "vault/uploads/jds/{slug}-{role-slug}.txt"
    score_file: ""
    resume_file: ""
    cover_letter_file: ""
    application_ids: []
```

The `id` field is the unique key for this role. Other skills and the update-status API use it to link scored JDs, resumes, and applications back to this role. Never change a role's `id` after creation.

Before adding a role, check if a role with the same company+title already exists in the file. If so, skip it — do not create duplicates.

Update `last_scan` and increment `scan_count`. Keep ALL existing roles. File must contain ONLY `last_scan`, `scan_count`, and `roles` array.

## Rules

- ONLY modify `search/pipeline/open-roles.yaml` and JD files in `vault/uploads/jds/`
- Do NOT post directives to other agents
- Do NOT score JDs or tailor resumes — that happens in a later step
- Do NOT use curl to hit localhost APIs

## User-Facing Output Format

```
Scanned {N} companies, found {M} new roles:

| Company | Role | Fit | Source |
|---------|------|-----|--------|
| ... | ... | ...% | ... |
```
