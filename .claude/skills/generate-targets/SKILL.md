---
name: generate-targets
description: "Generate a ranked list of target companies based on the user's career plan. Uses web search for current data."
argument-hint: "[number of companies, default 30]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
model: claude-sonnet-4-6
---

You are generating a ranked list of target companies for the user's job search.

## Prerequisites

READ `search/context/career-plan.yaml` first. If it's empty or missing key fields (level, functions, industries), STOP and tell the user:

> "Your career plan isn't set up yet. Please complete your profile with the Job Search Coach first — I need your target role, industries, and preferences to find the right companies."

Do NOT ask the user to provide this information directly. The Job Search Coach is designed to gather it properly.

THEN you MUST do this exact sequence (NOT a finding — a DIRECTIVE):

Step A: Call read_blackboard to get the current state.
Step B: Look at the "directives" array in the response (it may be empty []).
Step C: Call write_to_blackboard with EXACTLY these parameters:
   - path: "directives"  (NOT "findings" — this must go in DIRECTIVES)
   - value: [... existing directives ..., {"id":"dir-ua-targets","type":"user_action","text":"Your career plan is needed before company research can begin","button_label":"Complete Career Plan","route":"/coach","chat_message":"I need to complete my career plan. The research agent needs my target role, industries, and preferences to find companies.","assigned_to":"coach","from":"research","priority":"high","status":"pending","posted_at":"<current ISO timestamp>"}]

The "type":"user_action" in DIRECTIVES (not findings) triggers a visible action prompt on every page.

## Context Files

1. `search/context/career-plan.yaml` — REQUIRED: target level, functions, industries, locations, comp floor, work style, what matters
2. `search/context/experience-library.yaml` — OPTIONAL: for fit scoring against background
3. `search/intel/` — check for existing intel files to avoid duplicating research

## Generation Strategy

### Step 1: Build Search Queries — Cast a WIDE NET

**MINIMUM 50 companies. Target 75-100.** Do NOT stop at 10-15. If you only found 15 companies, you haven't searched broadly enough — run more queries. The fit score handles filtering; your job is coverage.

Search broadly across MULTIPLE queries:

**Industry leaders:**
- `"best {industry} companies for {function} roles"`
- `"top {industry} companies {location}"`

**Growth companies & startups:**
- `"fastest growing {industry} startups 2025 2026"`
- `"{industry} startups Series A B C hiring"`
- `"YC companies {industry}" OR "a16z portfolio {industry}"`

**Role-specific:**
- `"companies with strong {function} teams"`
- `"companies hiring {level} {function} {location}"`
- `"best companies for {function} professionals"`

**Adjacent industries** (user may not have thought of):
- Companies in related industries where the user's skills transfer
- Consulting firms, agencies, and platforms that serve the target industry

**Don't filter too early.** A company with 40 fit is still worth tracking — if they post a perfect role, the JD score will catch it. The goal is comprehensive coverage, not a curated shortlist.

### Step 2: Score Each Company (0-100)

| Dimension | Weight | What to Check |
|-----------|--------|---------------|
| Industry Fit | 25 pts | Target industry match |
| Role Availability | 25 pts | Hires for the user's function and level (check careers page) |
| Culture & Values | 20 pts | Matches what_matters and work_style |
| Compensation | 15 pts | Can meet comp floor |
| Location | 15 pts | Matches location preferences |

### Step 3: Categorize into Tiers
- **Tier 1** (fit >= 80): Top targets — immediate outreach + role scanning
- **Tier 2** (fit 60-79): Strong fits — active role scanning
- **Tier 3** (fit 40-59): Worth watching — scan when possible
- **Tier 4** (fit < 40): Long shots — only if a perfect role appears

ALL tiers go in the list. The scanning skill uses the full list.

### Step 4: Find Careers URLs
For each company, find and record the `careers_url`. This is critical for role scanning.
- Check if they use Greenhouse, Lever, Ashby, or other ATS
- Record the ATS slug in the notes (e.g., "Greenhouse: boards-api.greenhouse.io/v1/boards/anthropic")
- This saves time during role scanning later

## Output Format

**CRITICAL: Output MUST be valid YAML. No markdown. The dashboard parses this programmatically.**

**Read `search/context/target-companies.yaml` FIRST.** If companies already exist:
- **Keep ALL existing companies** — do not remove or overwrite them
- **Update fit_score and notes** for existing companies if you have newer data
- **Add new companies** that aren't already in the list (match by slug)
- Companies the user added manually or that were auto-discovered should never be removed
- Only set `status: "researching"` for NEW companies — preserve existing status values

Write the merged result to `search/context/target-companies.yaml`:

```yaml
companies:
  - name: "{Company Name}"
    slug: "{company-slug}"
    fit_score: {0-100}
    status: "researching"
    priority: "{high|medium|low}"
    notes: "{1-2 sentence summary: why this company, key strengths, any concerns}"
```

Sort by fit_score descending. **Generate at least 50 companies, aim for 75-100.** More is better — the scan skill uses the full list.

## Also Write Intel Stubs

For each high-priority company, create a stub intel file at `search/intel/{slug}.yaml`:

```yaml
company: "{name}"
slug: "{slug}"
industry: "{industry}"
hq: "{headquarters location}"
size: "{employee count range}"
stage: "{startup/growth/public}"
website: "{url}"
careers_url: "{careers page url}"
```

These stubs will be enriched later by the `/company-research` skill.

## After Generation

- Post findings to blackboard: "{N} target companies generated, {M} Tier 1"
- Do NOT post directives to resume, networking, or other agents. Target generation is just building the list — scoring JDs and tailoring resumes happen later when the user reviews specific roles.

## User-Facing Output Format

Your response must be concise:

Generated **{N} target companies** ranked by fit:

| # | Company | Fit | Why |
|---|---------|-----|-----|
| 1 | {name} | {score}% | {one-line reason} |
| ... | ... | ... | ... |

{1-2 sentences on what to do next}
