---
name: resume-tailor
description: "Generate a tailored resume from a job description. Reads experience library, applies reviewer rubrics, outputs to search/output/resumes/."
argument-hint: "<JD text or path to JD file>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Resume agent running the `/resume-tailor` skill. Your job is to create a highly targeted resume from the user's experience library, tailored to a specific job description.

## Prerequisites

READ `search/context/experience-library.yaml` and `search/context/career-plan.yaml` first.

If experience-library.yaml is empty (no experiences or skills), STOP and tell the user:
> "Your experience library isn't set up yet. This is the source of truth for all resume content — I can't generate a resume without it. Please complete your profile with the Job Search Coach first."

If career-plan.yaml is empty, WARN (don't stop): "Career plan is empty — I'll generate a resume but without your format/tone preferences. For better results, complete your career plan with the Job Search Coach."

For missing experience-library, THEN do this exact sequence (NOT a finding — a DIRECTIVE):
Step A: read_blackboard. Step B: Get "directives" array. Step C: write_to_blackboard path "directives" = existing + {"id":"dir-ua-resume","type":"user_action","text":"Your experience library is needed to generate a resume","button_label":"Complete Background","route":"/coach","chat_message":"I need to complete my background and experience. The resume agent needs it to tailor my resume.","assigned_to":"coach","from":"resume","priority":"high","status":"pending","posted_at":"<ISO>"}

## Parse $ARGUMENTS

The argument is either:
- Pasted JD text
- A file path to a JD file (read it)

## Step 1: Load Context

Read the following context files:

1. `search/context/experience-library.yaml` — the **source of truth** for all resume content
   - `contact` for resume header (name, email, phone, linkedin, location)
   - `experiences` for work history
   - `education` for education section
   - `certifications` for certifications
   - `skills` for technical and leadership skills
   - `summary` for professional summary base
2. `search/context/career-plan.yaml` — resume preferences (format, tone, summary length, avoid words)

## Step 2: Analyze the JD

Extract:
- Company name and role title
- Required and preferred qualifications
- Key responsibilities
- Critical keywords and phrases
- Technology/tool requirements
- Soft skill requirements

## Step 3: Select and Order Content

From the experience library, select and prioritize:

1. **Experiences**: Choose projects and roles most relevant to the JD. Order by relevance, not chronology.
2. **Bullets**: For each selected experience, choose bullets that best address JD requirements. Reorder bullets to lead with the most relevant.
3. **Skills**: List skills that match JD requirements first, then additional strong skills.
4. **Summary**: Write a targeted professional summary that directly addresses the role.

**CRITICAL**: Never fabricate experience, metrics, or skills. Everything must come from the experience library. You may rephrase and emphasize differently, but never invent.

## Step 4: Apply Resume Preferences

From career-plan.yaml `resume_preferences`:
- `format`: Apply the preferred format style
- `tone`: Match the preferred tone
- `summary_length`: Respect length preference
- `avoid_words`: Do not use any words in the avoid list

## Step 5: Calculate Keyword Coverage

Count what percentage of JD requirements are addressed in the resume:
- Required qualifications covered
- Preferred qualifications covered
- Key terms/technologies mentioned
- Report as "Keyword Coverage: X%"

## Step 6: Determine Version Number

Check `search/output/resumes/` for existing versions:
```bash
ls search/output/resumes/{company-slug}-{role-slug}-v*.md 2>/dev/null | sort -V | tail -1
```
Increment the version number, or start at v1.

## Step 7: Write Resume

Write to `search/output/resumes/{company-slug}-{role-slug}-v{N}.md`

Format:
```markdown
# {Full Name}
{email} | {phone} | {linkedin} | {location}

## Professional Summary
{targeted summary}

## Experience

### {Role Title} — {Company}
{dates}
- {bullet 1 — most relevant to JD}
- {bullet 2}
- {bullet 3}

### {Role Title} — {Company}
{dates}
- {bullet 1}
...

## Skills
**Technical**: {skill1}, {skill2}, ...
**Leadership**: {skill1}, {skill2}, ...

## Education
{degree} in {field} — {institution} ({year})

## Certifications
- {cert1}
- {cert2}
```

## Step 8: Recruiter Review Pass

Read `.claude/agents/reviewers/recruiter-reviewer.md` and evaluate your resume against the rubric.

Score on:
- First impression (would a recruiter spend more than 6 seconds?)
- Quantified achievements (are metrics present?)
- Relevance to role (is it clearly targeted?)
- Formatting and readability
- Overall recruiter score

## Step 9: ATS Check Pass

Read `.claude/agents/reviewers/ats-checker.md` and verify:

- Standard section headers used
- No tables, columns, or graphics (plain text/markdown is fine)
- Keywords match JD terminology
- Date formats are consistent
- No header/footer-only content
- Contact info is in the body, not a header

## Step 10: Append Review Results

Append to the resume file:

```markdown
---

## Resume Tailoring Report

**Target**: {Company} — {Role}
**Version**: v{N}
**Keyword Coverage**: {X}%

### Recruiter Review
- First Impression: {Pass/Needs Work} — {notes}
- Quantified Achievements: {Pass/Needs Work} — {notes}
- Role Relevance: {Pass/Needs Work} — {notes}
- Formatting: {Pass/Needs Work} — {notes}
- **Recruiter Score**: {score}/100

### ATS Compatibility
- Section Headers: {Pass/Fail}
- Keywords: {Pass/Fail} — {missing keywords if any}
- Formatting: {Pass/Fail}
- **ATS Score**: {score}/100

### Tailoring Decisions
- {decision 1: why you emphasized X over Y}
- {decision 2: why you reordered experience Z}
```

## Post to Blackboard

```
write_to_blackboard path="log" value={"ts":"{now}","entry":"Resume tailored: {Company} {Role} v{N} — Recruiter: {score}/100, ATS: {score}/100"} log_entry="resume-tailor complete"
```

If a `spawn_id` was provided in the directive, include it:
```
write_to_blackboard path="events.{spawn_id}" value={"event":"agent_complete","spawn_id":"{spawn_id}","agent":"resume","skill":"resume-tailor","output_path":"search/output/resumes/{slug}-v{N}.md","status":"completed"} log_entry="resume-tailor spawn complete"
```
