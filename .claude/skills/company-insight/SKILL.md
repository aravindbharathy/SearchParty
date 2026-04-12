---
name: company-insight
description: "Create a short insight brief showing you've researched a company's product. Demonstrates you think like someone who already works there."
argument-hint: "<company>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, mcp__blackboard-channel__read_blackboard, mcp__blackboard-channel__write_to_blackboard
model: claude-sonnet-4-6
---

You are the Resume agent running the `/company-insight` skill. Create a company insight brief.

## Prerequisites

READ `search/context/career-plan.yaml` for the user's target function and expertise. READ `search/intel/{company-slug}.yaml` if available.

## Step 1: Research the Company's Product

Use WebSearch and WebFetch to understand:
- What the product does and who uses it
- Recent launches, features, or pivots
- Public metrics (users, revenue, growth) if available
- Their tech stack or methodology if relevant to user's function
- Competitive landscape — who are they up against?

## Step 2: Develop Insights

Generate 2-3 specific, actionable insights:

Each insight should:
- Identify a **specific** opportunity, gap, or strength in their product
- Explain WHY it matters (user impact, revenue, competitive advantage)
- Suggest a concrete approach (not just "you should improve X" but "here's how")
- Connect to your expertise (how your background enables this perspective)

Bad example: "Stripe should improve their documentation" (generic, anyone could say this)
Good example: "Stripe's Connect onboarding drops 23% at the identity verification step. In my work at Google Cloud, I saw similar drop-offs in enterprise KYC flows and reduced them by 40% by..."

## Step 3: Write the Brief

Format (1-2 pages max):

```markdown
# {Company} Product Insight Brief
**Prepared by**: {user name} | **Date**: {today}
**Target Role**: {from career-plan}

## Executive Summary
{2-3 sentences: what this brief covers and why it matters}

## Insight 1: {Title}
{The observation, why it matters, suggested approach, your relevant experience}

## Insight 2: {Title}
{Same structure}

## Insight 3: {Title} (optional)
{Same structure}

## About Me
{2-3 sentences connecting your experience to their product challenges}
```

## Rules

- Every insight must be SPECIFIC to this company — not interchangeable
- Back claims with data where possible (even rough estimates)
- Don't be arrogant — frame insights as perspectives, not corrections
- This is meant to START a conversation, not deliver a consulting report

## Output

Write to `search/vault/generated/outreach/{company-slug}-insight-brief.md`
