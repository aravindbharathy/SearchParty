---
name: score-jd
description: "Evaluate a job description against your profile. Produces a 4-block assessment: Role Analysis, Experience Match, Fit Score, and Legitimacy Check."
argument-hint: "<JD text, URL, or file path>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Research agent running the `/score-jd` skill. Your job is to produce a comprehensive evaluation that feeds directly into resume tailoring, cover letters, and interview prep.

## Prerequisites

READ `search/context/career-plan.yaml` and `search/context/experience-library.yaml` first.

If either is empty, STOP and tell the user to complete their profile with the coach. Post a user-action directive.

## Step 1: Load Context

1. `search/context/career-plan.yaml` — target level, functions, industries, locations, comp floor, deal-breakers, what_matters, work_style, role_preferences.track (IC/management), addressing_weaknesses
2. `search/context/experience-library.yaml` — experiences, skills, education, certifications (check ALL of these against JD requirements)
3. `search/context/interview-answers.yaml` — visa_status (see Visa section below), salary_expectations (cross-check with JD comp range)
4. `search/context/connection-tracker.yaml` — check if user has contacts at this company (affects referral recommendation)
5. `search/intel/{company-slug}.yaml` — comp data, culture, interview process, visa sponsorship policy
6. `search/playbook.yaml` — lessons for this company or for this role type

## Step 2: Extract JD Data

If input is a URL, use WebFetch to get the JD text first.

Extract from the JD:
- Company name, role title, level/seniority
- Required vs preferred qualifications (separate them)
- Key responsibilities
- Location/remote policy, compensation if mentioned
- Team/org context if mentioned

## Block A: Role Analysis

Classify the role:
- **Archetype**: What kind of role is this? (e.g., IC research, research leadership, mixed-methods, quant, strategic, applied)
- **Track**: IC or management? Compare to user's `role_preferences.track` — flag mismatch
- **Level**: JD level vs your target level (match / over-leveled / under-leveled)
- **Remote**: full remote / hybrid / onsite — vs user's `work_style.environment`
- **Visa**: Does JD mention authorization requirements? Cross-check with user's `visa_status`:
  - If user is "US Citizen" or "Green Card" → no issue
  - If user needs sponsorship (H1B, OPT): check if JD says "no sponsorship" → RED FLAG
  - If JD is silent on visa: check company intel or WebSearch `"{company}" visa sponsorship H1B` to assess likelihood
  - Note: "H1B with approved I-140" is much stronger than "needs new H1B" — companies treat these differently
- **Compensation**: If JD shows a range, compare to user's comp floor AND salary expectations from interview-answers
- **Requirements ranked**: List the top 5-7 requirements by importance (what would get you rejected vs nice-to-have)
- **Certifications required**: Check if JD requires specific certs and whether user has them

## Block B: Experience Match

**This is the most important block.** It feeds directly into resume tailoring.

For EACH requirement in the JD, map to your experience library:

| JD Requirement | Your Evidence | Strength |
|---------------|---------------|----------|
| {required skill/experience} | {specific experience, role, metric from your library} | Strong / Partial / Gap |

For **Strong** matches: note the exact experience + metrics to emphasize in resume.
For **Partial** matches: note how to reframe the experience to address this requirement.
For **Gaps**: check `addressing_weaknesses` in career plan — the user may have already documented a mitigation. Use it. If not, suggest adjacent experience, quick learning, or projects.

Also check:
- **Education requirements**: Does JD require a specific degree? Check user's education entries.
- **Certification requirements**: Does JD require specific certs? Check user's certifications.
- **Keywords covered**: JD terms that appear in your experience (count and list)
- **Keywords missing**: JD terms not in your experience (these need to be addressed)
- **Referral path**: Check connection-tracker for contacts at this company. If found, note in the resume strategy — referrals change the approach.

## Block C: Fit Score

**Dynamic scoring** — weights derived from your career plan priorities.

Base dimensions (always scored):
- **Requirements match** (30pts): What percentage of JD requirements are you a Strong or Partial match for?
- **Level fit** (20pts): Is the seniority right?

Weighted dimensions (from career plan `what_matters` and `deal_breakers`):
- **Compensation** (5-20pts): Can the company meet your comp floor? Higher weight if comp is a top priority.
- **Location** (5-20pts): Matches your preference? Higher weight if location is a deal-breaker.
- **Culture** (5-15pts): Aligns with your values? Higher if culture/team is a priority.
- **Growth** (0-10pts): Learning/impact opportunity? Only if growth is in what_matters.

Compute overall score 0-100. Apply deal-breaker penalties:
- Visa mismatch (needs sponsorship, company doesn't sponsor): -30
- Location mismatch (onsite-only when user needs remote): -20
- Below comp floor with no equity upside: -15
- Track mismatch (IC role for management-track user or vice versa): -10
- Any career-plan `deal_breakers` triggered by JD content: -20 each

**Recommendation:**
- 75+ → **Apply** — strong fit, prioritize
- 60-74 → **Consider** — worth pursuing if gaps are addressable
- 40-59 → **Referral Only** — only worth it if user has a warm contact (check connection-tracker)
- Below 40 → **Skip**

If user has contacts at this company (from connection-tracker), bump recommendation up one tier and note the referral path.

## Block D: Legitimacy Check

Assess if this is a real, active opening:

1. **Posting freshness**: How old is the posting? (Under 14 days = good, 30+ = concerning, 60+ = likely stale)
2. **Description quality**: Specific technologies and context vs generic boilerplate?
3. **Requirements realism**: Do years-of-experience requirements make sense for the technology?
4. **Company signals**: Use WebSearch for recent layoffs or hiring freeze news

**Assessment**: High Confidence / Proceed with Caution / Suspicious
**Present observations, not accusations** — every signal has legitimate explanations.

## Output File

Write to `search/entries/score-jd-{company-slug}-{role-slug}-{YYYY-MM-DDTHH-MM-SS}.md`:

```markdown
---
Company: {company}
Role: {role}
URL: {url if available}
Date: {today YYYY-MM-DD}
JD File: {path to saved JD if applicable}
---

# JD Score: {Company} — {Role}

**Overall Fit Score: {score}/100**
**Recommendation: {Apply/Consider/Referral Only/Skip}**
**Legitimacy: {High Confidence/Proceed with Caution/Suspicious}**

## A) Role Analysis

- **Archetype**: {type}
- **Level**: {JD level} vs {your target} — {match/over/under}
- **Remote**: {policy} vs {your preference} — {match/mismatch}
- **Top requirements**: {ranked list}

## B) Experience Match

| JD Requirement | Your Evidence | Strength |
|---------------|---------------|----------|
| {requirement} | {your experience + metrics} | Strong/Partial/Gap |

**Keywords covered**: {N}/{total} ({percentage}%)
**Keywords missing**: {list}

**Resume strategy**: {2-3 sentences on how to tailor — which experiences to lead with, which to reframe}

## C) Fit Score Breakdown

| Dimension | Score | Weight | Notes |
|-----------|-------|--------|-------|
| Requirements match | {n}/100 | 30% | {brief} |
| Level fit | {n}/100 | 20% | {brief} |
| Compensation | {n}/100 | {wt}% | {brief} |
| Location | {n}/100 | {wt}% | {brief} |
| Culture | {n}/100 | {wt}% | {brief} |
| Growth | {n}/100 | {wt}% | {brief} |

**Deal-breaker penalties**: {list or "none"}
**Salary estimate**: {range based on research}

## D) Legitimacy

**Assessment**: {tier}
- {signal 1}: {finding}
- {signal 2}: {finding}
```

## Update Role Status

After saving the score file, update the role status via API. Include the Role ID if it was provided in the prompt (look for "Role ID: ..." in the input). If no Role ID was given (manual scoring), omit the `id` field — the API will match by company+title or create a new entry.

```bash
curl -s -X POST http://localhost:8791/api/finding/open-roles/update-status \
  -H 'Content-Type: application/json' \
  -d '{"id":"{Role ID if provided, otherwise omit this field}","company":"{Company}","title":"{Role}","status":"scored","score":{overall score},"score_file":"entries/{score-filename}.md"}'
```

This links the scored JD file to the open role record.

## Post to Blackboard

```
write_to_blackboard path="log" value={"ts":"{now}","entry":"Scored JD: {Company} {Role} — {score}/100 ({recommendation})"} log_entry="score-jd complete"
```

## User-Facing Output Format

Your response must be concise:

**{Company} — {Role}**: {score}/100 → {recommendation} ({legitimacy})

**Top matches**: {2-3 strongest experience-to-requirement matches}
**Gaps to address**: {2-3 key gaps with mitigation}
**Resume strategy**: {1-2 sentences}

Do NOT include the full experience match table, file paths, or internal details in chat.
The full report is saved for the resume and interview agents to read.
