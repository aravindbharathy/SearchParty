---
name: <skill-name>
description: "<One-line description of what this skill does>"
argument-hint: "<What arguments it accepts, e.g. '<company name>' or '[batch-size]'>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
model: claude-sonnet-4-6
---

# Skill Template

Use this template when creating new skills. Delete this header and customize each section.

## Role Statement

You are the {Agent Name} agent running the `/{skill-name}` skill. Your job is to {brief description of what you do}.

## Prerequisites

Check required context files BEFORE doing any work. If critical files are empty or missing, STOP and redirect the user — never ask for the info directly.

### Required Context Files
List each file the skill needs and what it uses from it:
1. `search/context/career-plan.yaml` — target level, functions, industries (if needed)
2. `search/context/experience-library.yaml` — work history, skills (if needed)
3. `search/context/target-companies.yaml` — company list (if needed)
4. `search/context/connection-tracker.yaml` — contacts (if needed)

### When Context is Missing

If a REQUIRED file is empty or missing critical fields:

1. Tell the user what's missing and where to go:
   > "Your {section} isn't set up yet. I need {what you need} to {why}. Please complete your profile with the Career Coach first."

2. Post a user-action directive to the blackboard. This is MANDATORY — it triggers a visible prompt on every page:
   - First: read_blackboard to get the current directives array
   - Then: write_to_blackboard with path "directives" and value = existing array + new entry:

   ```json
   {
     "id": "dir-ua-{skill-name}",
     "type": "user_action",
     "text": "<Short user-friendly description shown in the prompt banner>",
     "button_label": "<Action button text, e.g. 'Complete Career Plan'>",
     "route": "<Page to navigate to: /coach, /finding, /networking, /applying, /interviewing, /closing>",
     "tab": "<Optional tab to activate: companies, open-roles, messages, contacts, linkedin>",
     "chat_message": "<Message sent to the agent on the target page, written in FIRST PERSON as if the user is saying it>",
     "assigned_to": "coach",
     "from": "<your-agent-name>",
     "priority": "high",
     "status": "pending",
     "posted_at": "<current ISO timestamp>"
   }
   ```

3. STOP — do not attempt the skill with incomplete data.

### Optional Context Files
List files that enhance results but aren't required:
- `search/intel/{company}.yaml` — enriches analysis if available
- `search/vault/job-descriptions/` — provides JD context if available

## Parse $ARGUMENTS

Describe what arguments the skill accepts:
- If no arguments, describe what triggers the skill
- Document optional flags (e.g., `--detailed`, `--force`)

## Step-by-Step Instructions

### Step 1: Load Context
Read the required files. Validate they have the expected data.

### Step 2: Core Work
Describe the main task. Be specific about:
- What to search for (if using WebSearch)
- What to validate (if verifying data)
- What format to produce output in
- Quality checks to apply

### Step 3: Write Output
Specify exactly where and how to write results:
- File path: `search/output/{category}/{filename}`
- Format: YAML schema or Markdown structure
- Deduplication: how to handle existing data

## Output Format

```yaml
# Show the exact YAML/Markdown structure the skill produces
field: value
items:
  - name: ""
    score: 0
```

## Quality Checks

Before finalizing, verify:
- [ ] All required fields are populated
- [ ] Output follows the specified format
- [ ] No fabricated data (only real, verified information)
- [ ] {Skill-specific quality checks}

## Cross-Agent Directives

After completing work, post directives for follow-up by other agents if applicable:

For significant results (e.g., high-fit score, new intel):
- To {agent}: "{what they should do}, {file reference}"

For user review needed:
- Post a user-action directive with type "user_action" so the user sees a prompt

## Blackboard Updates

After completing meaningful work (not just reading/answering questions):

1. UPDATE STATUS:
   path: "agents.{agent-name}"
   value: {"role":"{agent}","status":"completed","last_task":"{what}","result_summary":"{outcomes}"}
   Include log_entry under 100 chars.

2. POST FINDINGS (if discovered something other agents should know):
   path: "findings.{agent-name}"
   value: {"type":"{type}","text":"{specific details}","for":"{target agent or 'all'}","timestamp":"{ISO}"}

## Notes

- Skills are the single source of truth for agent behavior
- The dashboard reads these via `cat .claude/skills/{name}/SKILL.md`
- Keep instructions specific — agents follow them literally
- Use exact file paths, YAML field names, and JSON structures
- Test with empty context files to verify prerequisites work
