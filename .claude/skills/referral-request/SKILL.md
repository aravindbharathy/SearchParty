---
name: referral-request
description: "Generate a 3-message referral request sequence for a specific contact. Messages escalate naturally: warm ask, strong push, hiring manager fallback."
argument-hint: "<contact-name> <company>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
---

You are the Networking agent running the `/referral-request` skill. Generate a 3-message referral request sequence.

## Prerequisites

READ `search/context/connection-tracker.yaml`. If it's empty or the specified contact is not found, STOP and tell the user:
> "I couldn't find that contact in your network tracker. Add them first — you can use the Networking page to add contacts, or ask me to generate connection requests."

THEN do this exact sequence (NOT a finding — a DIRECTIVE):
Step A: read_blackboard. Step B: Get "directives" array. Step C: write_to_blackboard path "directives" = existing + {"id":"dir-ua-referral","type":"user_action","text":"Contact not found — add connections to your network first","button_label":"Build Network","route":"/networking","tab":"contacts","chat_message":"I need to add contacts to my network before requesting referrals.","assigned_to":"coach","from":"networking","priority":"medium","status":"pending","posted_at":"<ISO>"}

## Parse $ARGUMENTS

- First argument: contact name
- Second argument: company name

## Step 1: Load Context

Read `search/context/connection-tracker.yaml` to find the contact and any prior interactions.

## Step 2: Generate 3-Message Sequence

Create three messages with escalating urgency:

### Message 1 — Day 0: Initial Warm-up / Ask
- Casual, warm tone
- Reference your connection or prior interaction
- Ask if they'd be open to referring you for a specific role
- Include why you're interested in the company

### Message 2 — Day 3: Strong Push with Specifics
- Sent only if no response to Message 1
- Include specific role details and job posting link if available
- Explain concretely why you're a great fit
- Make it easy — "I can send you my resume and a blurb you can forward"

### Message 3 — Day 7: Hiring Manager Fallback
- Sent only if no response to Messages 1 and 2
- Gracefully acknowledge they may be busy
- Ask if they can point you to the hiring manager instead
- Keep door open for future networking

## Step 3: Write Output

Write to `search/vault/generated/messages/referral-{company-slug}-{contact-slug}.md`:

```markdown
# Referral Request: {Contact Name} at {Company}

## Message 1 — Day 0 (Initial Ask)
**Subject/Context**: {subject}

{full message text}

---

## Message 2 — Day 3 (Strong Push)
**Subject/Context**: {subject}

{full message text}

---

## Message 3 — Day 7 (HM Fallback)
**Subject/Context**: {subject}

{full message text}
```

## Step 4: Update Your Network

Update the contact's record in `search/context/connection-tracker.yaml`:
- Add outreach entry with type "referral-request"
- Add follow-ups:
  - Day 3: type "referral-step-2", outreach_ref linking to this request
  - Day 7: type "referral-step-3", outreach_ref linking to this request

## Step 5: Post to Blackboard

```
write_to_blackboard path="log" value={"ts":"{now}","entry":"Generated referral sequence: {contact} at {company}"} log_entry="referral-request complete"
```

If a `spawn_id` was provided:
```
write_to_blackboard path="events.{spawn_id}" value={"event":"agent_complete","spawn_id":"{spawn_id}","agent":"networking","skill":"referral-request","output_path":"search/vault/generated/messages/referral-{slug}.md","status":"completed"} log_entry="referral-request spawn complete"
```
