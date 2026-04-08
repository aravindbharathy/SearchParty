---
name: app-tracker
description: "Track job applications. Add, update, view, and get stats on your application pipeline."
argument-hint: "<action: add|update|view|stats> [parameters]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Coach agent running the `/app-tracker` skill. Your job is to manage the user's application pipeline.

## Parse $ARGUMENTS

| Action | Syntax | What to do |
|--------|--------|------------|
| `add` | `add {company} {role} [status]` | Add a new application |
| `update` | `update {id} {field} {value}` | Update an application field |
| `view` | `view [id]` | View pipeline summary or single app |
| `stats` | `stats` | Show pipeline metrics |

## File Location

All pipeline data lives in `search/pipeline/applications.yaml`.

## Action: `add`

1. Read current `search/pipeline/applications.yaml` (create if missing)
2. Generate next ID (e.g., `app-001`, `app-002`, ...)
3. Create entry with:
   - `id`: auto-generated
   - `company`: from argument
   - `role`: from argument
   - `status`: from argument (default: `researching`)
   - `applied_date`: today's date (ISO format)
   - `jd_source`: "pasted" (default)
   - `resume_version`: "" (empty until resume is tailored)
   - `fit_score`: 0 (until scored via /score-jd)
   - `follow_ups`: Auto-generate 3 follow-ups:
     - Day 7: "Initial follow-up" (type: post-apply, status: pending)
     - Day 14: "Second follow-up" (type: post-apply, status: pending)
     - Day 21: "Final follow-up" (type: post-apply, status: pending)
   - `notes`: ""
4. Write updated file
5. Confirm to user: "Added {company} — {role} as {status}. 3 follow-ups scheduled."

## Action: `update`

1. Read `search/pipeline/applications.yaml`
2. Find application by `{id}`
3. Update the specified field with the new value
4. Valid fields: `status`, `notes`, `fit_score`, `resume_version`, `jd_source`
5. For `status` changes:
   - If changing to `rejected` or `withdrawn`, auto-resolve all pending follow-ups (set status to `auto-resolved`)
   - If changing to `offer`, auto-resolve follow-ups and note the milestone
6. Write updated file
7. Confirm: "Updated {id}: {field} = {value}"

### Follow-up Management

To update a specific follow-up:
- `update {id} follow_up.{index}.status {value}` — e.g., `update app-001 follow_up.0.status sent`
- Valid follow-up statuses: `pending`, `sent`, `skipped`, `dismissed`, `auto-resolved`

## Action: `view`

If no ID given, show pipeline summary:

```
Pipeline Summary
================
Researching: {n}
Applied: {n}
Phone Screen: {n}
Onsite: {n}
Offer: {n}
Rejected: {n}
Withdrawn: {n}
─────────────
Total: {n}

Recent Applications:
- {id}: {company} — {role} [{status}] (applied {date})
  Next follow-up: {date} ({type})
```

If ID given, show full detail:
```
{id}: {company} — {role}
Status: {status}
Applied: {date}
Fit Score: {score}/100
Resume: {version or "Not yet tailored"}
JD Source: {source}

Follow-ups:
  1. {date} — {type} [{status}]
  2. {date} — {type} [{status}]
  3. {date} — {type} [{status}]

Notes: {notes}
```

## Action: `stats`

Read all applications and compute:

```
Pipeline Stats
==============
Total Applications: {n}
Response Rate: {n}% ({responded}/{total})
Average Fit Score: {n}/100

By Status:
  Researching: {n} ({pct}%)
  Applied: {n} ({pct}%)
  Phone Screen: {n} ({pct}%)
  Onsite: {n} ({pct}%)
  Offer: {n} ({pct}%)
  Rejected: {n} ({pct}%)
  Withdrawn: {n} ({pct}%)

Overdue Follow-ups: {n}
Due Today: {n}
Upcoming (7 days): {n}
```

## Post to Blackboard

After any mutation (add/update):
```
write_to_blackboard path="log" value={"ts":"{now}","entry":"App tracker: {action} — {details}"} log_entry="app-tracker {action}"
```
