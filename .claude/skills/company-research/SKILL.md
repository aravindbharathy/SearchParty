---
name: company-research
description: "Research a company and produce structured intel (interview format, comp bands, culture) or generate a ranked target company list from career plan."
argument-hint: "<company-name> OR generate-targets"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Research agent running the `/company-research` skill. Your job is to research a company and produce structured intel, OR generate a ranked target company list.

## Parse $ARGUMENTS

- If the argument is "generate-targets", switch to target list generation mode (see Step A below).
- Otherwise, the argument is a company name. Research that company (see Step B below).

## Step A: Generate Target Company List

1. Read `search/context/career-plan.yaml` for target level, functions, industries, locations, comp floor.
2. Web-search for companies actively hiring for matching roles.
3. Generate a ranked list of ~30-50 companies with fit scores.
4. Write the list to `search/context/target-companies.yaml` in this format:

```yaml
companies:
  - name: "Company Name"
    slug: "company-slug"
    fit_score: 85
    status: "researching"
    priority: "high"
    notes: "Brief reason for fit"
```

Priority rules: high (fit >= 75), medium (50-74), low (< 50). Sort by fit_score descending.

5. Post to blackboard:
```
write_to_blackboard path="log" value={"ts":"{now}","entry":"Generated target company list: {count} companies"} log_entry="generate-targets complete"
```

## Step B: Research Single Company

1. Read `search/context/career-plan.yaml` and `search/context/target-companies.yaml` for context.
2. Web-search the company using multiple sources:
   - Company careers page
   - Glassdoor reviews and interviews
   - Blind discussions
   - levels.fyi compensation data
   - Recent news articles
3. Write structured intel to `search/intel/{company-slug}.yaml` matching this schema:

```yaml
company: "Name"
slug: "kebab-case"
industry: ""
hq: ""
size: ""
stage: ""
website: ""
careers_url: ""

culture:
  values: []
  engineering_culture: ""
  remote_policy: ""

interview:
  stages:
    - name: ""
      duration: ""
      format: ""
      notes: ""
  timeline: ""
  tips: []

comp:
  currency: USD
  bands:
    - level: ""
      base: ""
      equity: ""
      total: ""
  notes: ""

roles: []
notes: ""
```

4. If the company exists in target-companies.yaml, update its status to "targeting".

5. Post to blackboard:
```
write_to_blackboard path="log" value={"ts":"{now}","entry":"Researched {company}: intel written to search/intel/{slug}.yaml"} log_entry="company-research complete: {company}"
```

If a `spawn_id` was provided in the directive, include it:
```
write_to_blackboard path="events.{spawn_id}" value={"event":"agent_complete","spawn_id":"{spawn_id}","agent":"research","skill":"company-research","output_path":"search/intel/{slug}.yaml","status":"completed"} log_entry="company-research spawn complete"
```
