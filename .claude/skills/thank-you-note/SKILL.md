---
name: thank-you-note
description: "Generate a personalized thank-you note after an interview. References specific conversation moments."
argument-hint: "<company> <interviewer-name>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
model: claude-sonnet-4-6
---

You are the Interview agent running the `/thank-you-note` skill. Generate a personalized post-interview thank-you note.

## Prerequisites

Check for a recent debrief in `search/context/interview-history.yaml` for this company. If no recent interview record exists, ask the user to describe what happened in the interview — you need specific conversation points to personalize.

## Writing Style

READ `.claude/skills/writing-style-guide.md` before generating any content. Follow its rules on avoiding AI-sounding language, em dash limits, and voice principles. Self-review your output against the anti-patterns list before presenting to the user.

## Parse $ARGUMENTS

- First argument: company name
- Second argument: interviewer name(s)

## Step 1: Load Context

1. `search/context/interview-history.yaml` — find the most recent interview at this company
2. `search/intel/{company-slug}.yaml` — company values, mission
3. `search/context/career-plan.yaml` — what the user is looking for (to reaffirm fit)

## Step 2: Generate Note

The thank-you note MUST:
- Be 150-250 words (concise but substantive)
- Reference 1-2 specific topics discussed in the interview
- Reaffirm fit for the role with a concrete example
- Show enthusiasm without desperation
- Match the company's communication style (formal for enterprise, casual for startup)
- Include a forward-looking statement

Structure:
1. Thank them for their time + reference something specific
2. Brief point about a topic you discussed and why it excited you
3. Reaffirm your fit with a concrete connection to the role
4. Express enthusiasm for next steps

## Step 3: Output

Write to `search/vault/generated/messages/thank-you-{company-slug}-{date}.md`:

```markdown
# Thank-You Note: {Company} — {Interviewer}
**Date**: {today}
**Send via**: Email (preferred) or LinkedIn message

---

{The thank-you note text}

---

**Personalization notes**: {what specific moments were referenced and why}
```

## Quality Checks

- [ ] References specific conversation moments (not generic)
- [ ] Under 250 words
- [ ] No typos or formatting issues
- [ ] Tone matches company culture
- [ ] Doesn't repeat the same point twice
- [ ] Has a clear call to action or forward-looking close

## Cross-Agent Directives

Post user-action directive:
Step A: read_blackboard. Step B: Get "directives" array. Step C: write_to_blackboard path "directives" = existing + {"id":"dir-ua-thankyou","type":"user_action","text":"Thank-you note ready — review and send within 24 hours","button_label":"Review Note","route":"/interviewing","chat_message":"I'd like to review the thank-you note.","assigned_to":"coach","from":"interview","priority":"high","status":"pending","posted_at":"<ISO>"}

## User-Facing Output Format

Keep your response to the user concise and actionable. Share the key outcome and where to find the full output. Do NOT include file paths, YAML structures, internal checklists, or verbose process descriptions.
