---
name: connection-request
description: "Generate a batch of personalized LinkedIn connection requests, round-robin across target companies. Each message under 300 chars."
argument-hint: "[batch-size] (default 25)"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Networking agent running the `/connection-request` skill. Generate personalized LinkedIn connection requests.

## Parse $ARGUMENTS

- Optional numeric argument for batch size (default 25).

## Step 1: Load Context

Read these files:
1. `search/context/target-companies.yaml` — companies to target
2. `search/context/connection-tracker.yaml` — existing contacts (avoid duplicates)
3. `search/context/experience-library.yaml` — candidate background for personalization

## Step 2: Discover Contacts

For each target company (round-robin, not all at once):
1. Web-search for people at the company: engineers, hiring managers, recruiters at the right level.
2. Skip anyone already in connection-tracker.yaml.
3. Find at least 1 contact per company if possible.

## Step 3: Generate Messages

For each discovered contact, generate a personalized LinkedIn connection request:
- **Under 300 characters** (hard limit — LinkedIn rejects longer messages)
- Reference something specific: shared background (from experience-library), company news, mutual interest
- Professional but warm tone
- No generic templates

Round-robin across companies. If fewer than batch-size contacts can be found, generate fewer.

## Step 4: Write Output

1. Write messages to `search/output/messages/connection-batch-{YYYY-MM-DD}.md`:

```markdown
# Connection Batch — {date}

## {Company Name}

### {Contact Name} — {Role}
**LinkedIn**: {url if found}

> {message text}

*Personalization: {why this message is personalized}*

---
```

2. Update `search/context/connection-tracker.yaml` — add new contacts:

```yaml
- id: "conn-{NNN}"
  name: "Full Name"
  company: "Company"
  role: "Role"
  relationship: "cold"
  linkedin_url: ""
  outreach:
    - date: "{today}"
      type: "connection-request"
      status: "sent"
      message_summary: "Brief summary"
  follow_ups:
    - due: "{today + 3 days}"
      type: "connection-nudge"
      outreach_ref: "connection-request-{date}"
      status: "pending"
    - due: "{today + 7 days}"
      type: "connection-nudge"
      outreach_ref: "connection-request-{date}"
      status: "pending"
    - due: "{today + 14 days}"
      type: "connection-nudge"
      outreach_ref: "connection-request-{date}"
      status: "pending"
  notes: ""
```

## Step 5: Post to Blackboard

```
write_to_blackboard path="log" value={"ts":"{now}","entry":"Generated {count} connection requests across {company_count} companies"} log_entry="connection-request complete"
```

If a `spawn_id` was provided:
```
write_to_blackboard path="events.{spawn_id}" value={"event":"agent_complete","spawn_id":"{spawn_id}","agent":"networking","skill":"connection-request","output_path":"search/output/messages/connection-batch-{date}.md","status":"completed"} log_entry="connection-request spawn complete"
```
