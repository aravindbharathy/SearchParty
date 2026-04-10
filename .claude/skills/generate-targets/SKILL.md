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

> "Your career plan isn't set up yet. Please complete your profile with the Career Coach first — I need your target role, industries, and preferences to find the right companies."

Do NOT ask the user to provide this information directly. The Career Coach is designed to gather it properly.

THEN you MUST post a user-action directive to the blackboard. Use write_to_blackboard:
1. First read_blackboard to get the current directives array
2. Then write_to_blackboard with path "directives" and value = existing array + this new entry:
   {"id":"dir-ua-targets","type":"user_action","text":"Your career plan is needed before company research can begin","button_label":"Complete Career Plan","route":"/coach","chat_message":"I need to complete my career plan. The research agent needs my target role, industries, and preferences to find companies.","assigned_to":"coach","from":"research","priority":"high","status":"pending","posted_at":"<current ISO timestamp>"}

This directive triggers a visible prompt on every page so the user knows what to do.

## Context Files

1. `search/context/career-plan.yaml` — REQUIRED: target level, functions, industries, locations, comp floor, work style, what matters
2. `search/context/experience-library.yaml` — OPTIONAL: for fit scoring against background
3. `search/intel/` — check for existing intel files to avoid duplicating research

## Generation Strategy

### Step 1: Build Search Queries
Based on the career plan, construct searches:
- `"best {industry} companies for {function} roles {location}"`
- `"top {industry} startups hiring {level} {function}"`
- `"{industry} companies known for {what_matters priorities}"`
- `"companies with strong {function} teams {location}"`

### Step 2: Research & Rank
For each company found, evaluate on these dimensions (100 points total):

| Dimension | Weight | What to Check |
|-----------|--------|---------------|
| Industry Fit | 25 pts | Does the company operate in the user's target industries? |
| Role Availability | 25 pts | Does the company hire for the user's target function and level? Use WebSearch to check careers page. |
| Culture & Values | 20 pts | Does it match what_matters (impact, learning, balance, etc.) and work_style? |
| Compensation | 15 pts | Can the company meet the comp floor? Check Levels.fyi, Glassdoor via WebSearch. |
| Location | 15 pts | Does it match location preferences (remote, specific cities)? |

### Step 3: Categorize
- **High priority** (fit_score >= 75): Active targets — scan for roles, prepare outreach
- **Medium priority** (fit_score 50-74): Worth watching — research further if roles appear
- **Low priority** (fit_score < 50): Backup options

### Step 4: Verify Quality
For each company in the list:
- Confirm it's a real, active company (not acquired, shutdown, or in hiring freeze)
- Check if it has a careers page with current listings
- Verify it operates in the stated industry

## Output Format

Write to `search/context/target-companies.yaml`:

```yaml
companies:
  - name: "{Company Name}"
    slug: "{company-slug}"
    fit_score: {0-100}
    status: "researching"
    priority: "{high|medium|low}"
    notes: "{1-2 sentence summary: why this company, key strengths, any concerns}"
```

Sort by fit_score descending. Include at least 20 companies, aim for 30.

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

- Post findings to blackboard: "{N} target companies generated, {M} high-priority"
- Post directive to networking agent: "New target company list ready — {M} high-priority companies for outreach planning"
