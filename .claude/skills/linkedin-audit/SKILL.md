---
name: linkedin-audit
description: "Audit LinkedIn profile positioning against target JDs. Produces specific before/after suggestions for headline, about, experience, and skills sections."
argument-hint: "(no arguments — reads profile context automatically)"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Networking agent running the `/linkedin-audit` skill. Audit the candidate's LinkedIn profile and suggest optimizations.

## Prerequisites

READ `search/context/career-plan.yaml` and `search/context/experience-library.yaml` first.

If career-plan.yaml is empty or missing level/functions/industries, STOP and tell the user:
> "Your career plan isn't set up yet. I need your target roles and industries to know how to position your LinkedIn profile. Please complete your profile with the Career Coach first."

If experience-library.yaml is empty (no experiences), STOP and tell the user:
> "Your experience library isn't set up yet. I need your work history to write LinkedIn profile suggestions. Please complete your profile with the Career Coach first."

For either case, THEN do this exact sequence (NOT a finding — a DIRECTIVE):
Step A: read_blackboard. Step B: Get "directives" array. Step C: write_to_blackboard path "directives" = existing + {"id":"dir-ua-linkedin","type":"user_action","text":"Your profile is needed for LinkedIn audit","button_label":"Complete Profile","route":"/coach","chat_message":"I need to complete my profile. The networking agent needs my career plan and experience for a LinkedIn audit.","assigned_to":"coach","from":"networking","priority":"high","status":"pending","posted_at":"<ISO>"}

## Step 1: Load Context

Read these files:
1. `search/context/career-plan.yaml` — target roles, industries, level
2. `search/context/experience-library.yaml` — actual experience to work with
3. Top 5 JD files from `vault/job-descriptions/` — target role requirements

## Step 2: Analyze Positioning

For each LinkedIn profile section, analyze:
- **Headline**: Does it position for target roles? Does it contain the right keywords?
- **About**: Does it tell a compelling story aligned with target roles? Keyword density?
- **Experience**: Are bullets optimized for target JD requirements? STAR format?
- **Skills**: Are the right skills listed and prioritized?

## Step 3: Generate Before/After Suggestions

For each section, provide:
1. What the current positioning likely looks like (inferred from experience-library)
2. Specific rewritten text optimized for target roles
3. Explanation of why each change matters

## Step 4: Write Output

Write to `search/output/messages/linkedin-audit-{YYYY-MM-DD}.md`:

```markdown
# LinkedIn Profile Audit — {date}

## Headline
**Current**: {inferred current}
**Suggested**: {new headline}
**Why**: {explanation}

## About Section
**Suggested**:
> {full about section text}

**Key changes**: {what changed and why}

## Experience
### {Company} — {Role}
**Current bullets**:
- {inferred current}
**Suggested bullets**:
- {optimized bullets}
**Changes**: {explanation}

## Skills
**Add**: {skills to add}
**Remove**: {skills to remove}
**Top 3 order**: {recommended order}

## Summary
- Keyword coverage: {X}%
- Recruiter scan: {assessment}
- Top 3 highest-impact changes:
  1. {change}
  2. {change}
  3. {change}
```

## Step 5: Post to Blackboard

```
write_to_blackboard path="log" value={"ts":"{now}","entry":"LinkedIn audit complete — {n} suggestions generated"} log_entry="linkedin-audit complete"
```

If a `spawn_id` was provided:
```
write_to_blackboard path="events.{spawn_id}" value={"event":"agent_complete","spawn_id":"{spawn_id}","agent":"networking","skill":"linkedin-audit","output_path":"search/output/messages/linkedin-audit-{date}.md","status":"completed"} log_entry="linkedin-audit spawn complete"
```
