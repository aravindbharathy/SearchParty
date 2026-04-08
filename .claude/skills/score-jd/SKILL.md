---
name: score-jd
description: "Score a job description against your profile. Outputs fit score 0-100 across 5 dimensions, red flags, salary estimate, recommendation, and gaps analysis."
argument-hint: "[--detailed] <JD text or path to JD file>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Research agent running the `/score-jd` skill. Your job is to analyze a job description against the user's profile and produce a structured fit assessment.

## Parse $ARGUMENTS

- If `--detailed` flag is present, produce an expanded analysis with per-dimension breakdown and experience-to-requirement mapping.
- The remaining text is the JD content (pasted text) or a file path to a JD file.
- If a file path is given, read the file.

## Step 1: Load Context

Read the following context files:

1. `search/context/career-plan.yaml` — target level, functions, industries, locations, comp floor, deal-breakers
2. `search/context/experience-library.yaml` — experiences, skills (technical + leadership), education, certifications
3. Check if `search/intel/{company-slug}.yaml` exists for the company mentioned in the JD. If so, read it for additional context.

## Step 2: Analyze the JD

Extract from the JD:
- Company name
- Role title
- Level/seniority
- Required qualifications
- Preferred qualifications
- Key responsibilities
- Location/remote policy
- Any mentioned compensation
- Red flags (visa requirements, relocation mandates, etc.)

## Step 3: Score Across 5 Dimensions

Score each dimension 0-100:

| Dimension | What to Evaluate |
|-----------|-----------------|
| **Level Match** | Does the JD level match career-plan target level? Over/under-leveled? |
| **Function Match** | Does the role function align with career-plan target functions? |
| **Industry Match** | Does the company's industry match career-plan target industries? |
| **Skills Overlap** | What % of required skills appear in experience-library skills? Count both technical and leadership. |
| **Culture Indicators** | Does the company culture (from JD language, intel if available) align with user preferences? |

Compute overall fit score as weighted average:
- Skills Overlap: 30%
- Level Match: 25%
- Function Match: 20%
- Industry Match: 15%
- Culture Indicators: 10%

## Step 4: Assess Red Flags

Check against career-plan deal-breakers:
- Visa/work authorization requirements vs. QA master visa status
- Location requirements vs. career-plan locations
- Compensation range vs. career-plan comp floor
- Any explicit deal-breakers from career-plan

## Step 5: Generate Recommendation

| Score Range | Recommendation |
|------------|----------------|
| 75-100 | **Apply** — strong fit, prioritize this application |
| 60-74 | **Referral Only** — decent fit but gaps exist, worth pursuing via referral |
| 0-59 | **Skip** — significant misalignment, move on |

## Step 6: Gaps Analysis

List what the JD asks for that is missing from the experience library:
- Missing required skills
- Missing years of experience in specific areas
- Missing certifications or education
- Missing domain experience

## Step 7: Salary Estimate

- If company intel exists with salary data, use it
- Otherwise, provide a range estimate based on: level, function, industry, location
- Compare against career-plan comp floor

## Step 8: Detailed Mode (`--detailed`)

If `--detailed` flag was present, additionally output:
- Per-dimension breakdown with specific evidence
- Which specific experiences from the library map to which JD requirements
- Keyword match list (present vs. missing)
- Suggested talking points for cover letter

## Output

Write the analysis to `search/entries/score-jd-{company-slug}-{role-slug}.md` with this structure:

```markdown
# JD Score: {Company} — {Role}

**Overall Fit Score: {score}/100**
**Recommendation: {Apply/Referral Only/Skip}**

## Dimension Scores
| Dimension | Score | Notes |
|-----------|-------|-------|
| Level Match | {n}/100 | {brief explanation} |
| Function Match | {n}/100 | {brief explanation} |
| Industry Match | {n}/100 | {brief explanation} |
| Skills Overlap | {n}/100 | {brief explanation} |
| Culture Indicators | {n}/100 | {brief explanation} |

## Red Flags
- {flag 1}
- {flag 2}

## Salary Estimate
{range or specific estimate}

## Gaps Analysis
- {gap 1}
- {gap 2}

## Company Intel Summary
{summary if available, otherwise "No intel available — run company research in Phase 3"}
```

If `--detailed`, append:
```markdown
## Detailed Analysis

### Experience Mapping
| JD Requirement | Your Experience | Strength |
|---------------|----------------|----------|
| {req} | {matching exp} | Strong/Partial/Missing |

### Keywords
**Present**: {list}
**Missing**: {list}

### Suggested Talking Points
- {point 1}
- {point 2}
```

## Post to Blackboard

After writing the file:
```
write_to_blackboard path="log" value={"ts":"{now}","entry":"Scored JD: {Company} {Role} — {score}/100 ({recommendation})"} log_entry="score-jd complete: {Company} {Role} = {score}"
```

If a `spawn_id` was provided in the directive, include it:
```
write_to_blackboard path="events.{spawn_id}" value={"event":"agent_complete","spawn_id":"{spawn_id}","agent":"research","skill":"score-jd","output_path":"search/entries/score-jd-{slug}.md","status":"completed"} log_entry="score-jd spawn complete"
```
