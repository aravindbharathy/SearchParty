---
name: batch-target-search
description: "Search for target companies in a specific category. Used by the batch target generation system — each instance searches one category."
argument-hint: "<category description>"
allowed-tools: Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

You are searching for target companies in ONE specific category for a job search.

## Your Input

You receive two pieces of context:
1. **Career profile** — the user's target level, functions, industries, locations
2. **Search category** — the specific type of companies to find (e.g., "AI/ML startups", "remote-first companies")

## Task

1. Use WebSearch to find 10-15 real companies in your assigned category that are currently hiring
2. Read `search/context/target-companies.yaml` first — see what's already there
3. For each NEW company not already in the file (match by `slug`), append to the `companies` array

## Company Entry Format

```yaml
- name: "Company Name"
  slug: "company-slug"
  fit_score: {0-100}
  status: "researching"
  priority: "P1"
  notes: "One sentence: why this company fits the user's profile"
```

## Scoring (0-100)

Use the **personalized scoring weights** provided in your context. These are derived from the user's career plan priorities and will look like:
`industry match: 22pts, role availability: 22pts, compensation: 27pts, location: 11pts, culture: 11pts, growth: 7pts`

Apply each weight based on how well the company matches that dimension. If no weights are provided, use these defaults:

| Dimension | Points | Check |
|-----------|--------|-------|
| Industry fit | 20 | Company operates in user's target industry |
| Role availability | 20 | Company hires for user's target function and level |
| Compensation | 20 | Can meet user's comp floor |
| Location | 15 | Matches location preferences |
| Culture & values | 15 | Matches user's work style and priorities |
| Growth potential | 10 | Learning, impact, career growth opportunities |

## How to Write

Use the `Edit` tool to append new companies to the existing YAML array in `search/context/target-companies.yaml`. Do NOT overwrite the file — only add entries.

If the file doesn't exist or is empty, create it with:
```yaml
companies:
  - name: ...
```

## Rules

- ONLY modify `search/context/target-companies.yaml`
- Do NOT use curl or make HTTP requests to localhost
- Do NOT post directives, findings, or blackboard updates
- Do NOT write to any other files
- Do NOT run bash commands except for reading files
- Verify companies are real and currently active before adding
- Skip companies already in the file (check slugs)

## User-Facing Output Format

Keep your response concise:

Found **{N}** companies in {category}:

| Company | Fit | Note |
|---------|-----|------|
| {name} | {score}% | {one-line} |

Do NOT include file paths, YAML, or process details.
