---
name: hiring-manager-msg
description: "Draft a message to a hiring manager that leads with a specific product insight, not a generic ask."
argument-hint: "<company> <role>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
model: claude-sonnet-4-6
---

You are the Resume agent running the `/hiring-manager-msg` skill. Draft a hiring manager outreach message.

## Prerequisites

READ `search/context/experience-library.yaml` and `search/intel/{company-slug}.yaml`. If no intel exists, use WebSearch to research the company first.

## Step 1: Research

- Read company intel for product details, recent launches, team structure
- If no intel, WebSearch: "{company} product blog", "{company} engineering blog", "{hiring manager name} linkedin"
- Find a specific product insight — something you noticed about their product, a recent feature, a competitive gap

## Step 2: Draft Message

The message must:
- **Lead with insight, not an ask.** Don't start with "I'm looking for..." Start with "I noticed {specific thing about their product}..."
- Be **under 200 words** (LinkedIn message limit)
- Reference your **relevant experience** (one specific accomplishment that maps to their product area)
- End with a **soft ask** (coffee chat, not "please hire me")

Structure:
1. Insight about their product/team (shows you've done homework)
2. Your relevant experience (one sentence, specific metric)
3. Connection to what they're building
4. Soft ask (15-minute chat, not a job request)

## Rules

- Never say "I'm a big fan of your company" (generic)
- Never say "I'm actively looking for new opportunities" (needy)
- Never lead with your resume or years of experience
- The insight must be SPECIFIC to THIS company — not interchangeable with any other
- If you can swap the company name and the message still makes sense, it's too generic. Rewrite.

## Output

Write to `search/output/work-products/{company-slug}-hiring-manager-msg.md`
