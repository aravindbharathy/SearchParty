---
name: daily-briefing
description: "Generate a daily status briefing covering overdue follow-ups, upcoming interviews, stale applications, networking status, and prioritized action items."
argument-hint: "(no arguments — reads all pipeline data automatically)"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Coach agent running the `/daily-briefing` skill. Produce a comprehensive daily briefing.

## Step 1: Load Context

Read ALL of these files:
1. `search/pipeline/open-roles.yaml` — canonical role records (score, resume_file, application_ids, status)
2. `search/pipeline/applications.yaml` — application submissions (each has a `role_id` linking back to open-roles)
3. `search/pipeline/interviews.yaml` — scheduled interviews
4. `search/context/connection-tracker.yaml` — networking contacts and follow-ups
5. `search/context/snapshot.yaml` — latest search snapshot (if exists)
6. `search/board.md` — current board state (if exists)
7. `search/playbook.yaml` — active strategy decisions

**Linking:** Each application has a `role_id` field. Use it to look up the role in open-roles.yaml for context (fit score, score_file, resume_file). This lets you report: "Follow up on Google Staff UXR (scored 68, resume v1 sent)."

## Step 2: Analyze Data

Calculate:
- **Overdue follow-ups**: Any follow-up with `due` before today and status "pending"
- **Today's follow-ups**: Due date matches today
- **Upcoming interviews**: Scheduled within next 7 days
- **Stale applications**: Status is "applied" or "researching" with no activity in 7+ days
- **Networking follow-ups**: Connection follow-ups due today or overdue
- **Pipeline counts**: Applications grouped by status
- **Reply rate**: Connections with at least one "replied" outreach / total outreach sent

## Step 3: Write Briefing

Write to `search/board.md` (overwrite previous briefing):

```markdown
# Daily Briefing — {YYYY-MM-DD}

## Action Items (Do These Today)
1. {Most urgent item — be specific: "Follow up with Jane at Stripe about referral request sent 3 days ago"}
2. {Second priority}
3. {Third priority}
(Up to 5 items, prioritized by urgency)

## Overdue Follow-ups
| Contact/Company | Type | Due | Action |
|----------------|------|-----|--------|
| {name/company} | {type} | {date} | {specific action} |

## Upcoming Interviews
| Company | Role | Date | Prep Status | To Prepare |
|---------|------|------|-------------|------------|
| {company} | {role} | {date} | {status} | {what to do} |

## Stale Applications
| Company | Role | Last Activity | Suggested Action |
|---------|------|--------------|-----------------|
| {company} | {role} | {date} | {action} |

## Networking Pulse
- Total contacts: {n}
- Pending follow-ups: {n}
- Reply rate: {n}%
- Next batch recommended: {Yes — last batch was {n} days ago / No — recent batch still active}

## Pipeline Summary
| Stage | Count |
|-------|-------|
| Researching | {n} |
| Applied | {n} |
| Phone Screen | {n} |
| Onsite | {n} |
| Offer | {n} |
| Rejected | {n} |
| Withdrawn | {n} |
| **Total** | **{n}** |

## Active Strategy
{List active decisions from playbook.yaml as reminders}
```

## Step 4: Post to Blackboard

```
write_to_blackboard path="daily_briefing" value={"date":"{today}","action_items":{count},"overdue":{count},"interviews":{count},"stale":{count}} log_entry="daily-briefing: {action_count} action items, {overdue_count} overdue"
```

If a `spawn_id` was provided:
```
write_to_blackboard path="events.{spawn_id}" value={"event":"agent_complete","spawn_id":"{spawn_id}","agent":"coach","skill":"daily-briefing","output_path":"search/board.md","status":"completed"} log_entry="daily-briefing spawn complete"
```

## User-Facing Output Format

Keep your response to the user concise and actionable. Share the key outcome and where to find the full output. Do NOT include file paths, YAML structures, internal checklists, or verbose process descriptions.
