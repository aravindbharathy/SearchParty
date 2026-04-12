<p align="center">
  <h1 align="center">Search Party</h1>
  <p align="center"><strong>Your AI-powered job search team.</strong><br/>6 specialist agents that research, tailor, network, prep, and negotiate — running locally on your machine.</p>
</p>

<br/>

## The problem with job searching today

You find a role on LinkedIn. Spend 30 minutes tailoring your resume. Write a cover letter no one reads. Hit apply. Hear nothing for weeks.

Repeat 50 times.

Meanwhile, the people who get hired had a warm intro from someone on the team.

<br/>

### Sound familiar?

> **"Is this role even worth applying to?"**
> You don't know until you've already invested hours. The JD says "5+ years" but doesn't tell you if your background translates.

> **"I'm sending the same resume everywhere."**
> Each one takes 20-30 minutes to tailor. No compounding — your 50th application doesn't benefit from your 1st.

> **"My LinkedIn outreach gets ignored."**
> "Hi, I'd like to connect" doesn't work. You don't have time to research each person.

> **"I keep making the same interview mistakes."**
> No feedback loop. No tracking. No one to debrief with.

> **"Everything is in my head and 47 browser tabs."**
> Forgot to follow up with Stripe. Lost track of the Figma timeline. When did I apply to Anthropic again?

<br/>

## What if you had a team?

Search Party gives you **6 AI specialists** that remember everything about you, coordinate with each other, and handle the grunt work — so you can focus on building relationships and performing in interviews.

<br/>

### Your work compounds

Every answer you give the coach, every resume tailored, every interview debriefed — it feeds back into your profile. Application #50 is dramatically better than #1.

### Agents coordinate automatically

Research Agent finds a role at Stripe (92% fit) → Resume Agent tailors your resume → Networking Agent checks for warm connections → You wake up to:

> *"New role at Stripe. Resume ready. Marcus Rivera can refer you."*

### Everything is personalized

Not templates. The agents read your actual experience, your career goals, and each company's culture. The output sounds like you wrote it on your best day.

<br/>

## The team

| Agent | What they do | Skills |
|-------|-------------|--------|
| **Job Search Coach** | Builds your profile, runs daily briefings, weekly retros | `setup` `daily-briefing` `weekly-retro` |
| **Research** | Scans for open roles, scores JDs, builds company intel, generates target lists | `scan-roles` `score-jd` `company-research` `generate-targets` |
| **Resume** | Tailors resumes, cover letters, hiring manager messages, company insight briefs | `resume-tailor` `cover-letter` `hiring-manager-msg` `company-insight` |
| **Networking** | LinkedIn outreach, referral sequences, profile audit | `connection-request` `referral-request` `linkedin-audit` |
| **Interview** | Prep packages, mock interviews with scoring, debriefs, thank-you notes | `interview-prep` `mock-interview` `interview-debrief` `thank-you-note` |
| **Negotiation** | Salary research, offer analysis, counter-offer strategy | `salary-research` `negotiate` |

<br/>

## Before & after

| | Before | After |
|---|--------|-------|
| **Resume** | 30 min per application. Hope keywords match. | Tailored in seconds. 90%+ keyword coverage. |
| **Networking** | Generic "let's connect" to 50 strangers. | Personalized messages referencing their team and your overlap. |
| **Interview prep** | Google questions the night before. | Prep package with company format, your STAR stories, mock with scoring. |
| **Pipeline** | Spreadsheet abandoned after week 2. | Live kanban with fit scores, follow-ups, agent coordination. |
| **Fit assessment** | Apply to everything. Hope for the best. | Score every JD before investing time. Focus on 85%+ matches. |
| **Follow-ups** | Forget. Miss the window. | Auto-scheduled at days 7, 14, 21. Reminders before deadlines. |
| **Learning** | Same mistakes every interview. | Debrief, track patterns, coach targets your weak spots. |
| **Strategy** | Alone with no feedback. | Coach reads your pipeline every morning. "Here's what to focus on today." |

<br/>

---

<br/>

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/) 1.0+
- [Claude Code](https://claude.ai/code) CLI — installed and authenticated

### 1. Clone and install

```bash
git clone https://github.com/aravindbharathy/SearchParty.git
cd SearchParty
npm install
```

### 2. Start the system

```bash
bun cli/job-search.ts start
```

Dashboard opens at **http://localhost:8791**

### 3. Set up your profile

1. Drop your resume PDF into `search/vault/uploads/resumes/`
2. Click **Job Search Coach** in the sidebar
3. The coach parses your resume, confirms details, asks about your goals
4. Your profile fills up as you answer — other agents use it to personalize everything

### 4. Start finding roles

Go to **Finding Roles** → generate target companies → scan for open positions → score JDs → tailor resumes.

### Optional: automated daily scanning

```bash
# Scan for new roles at 7am every day
crontab -e
0 7 * * * curl -s -X POST http://localhost:8791/api/agent/scan-roles
```

<br/>

---

<br/>

## How it works

### Your data stays local

```
search/
  vault/
    uploads/      Your source files (resumes, JDs, transcripts, templates)
    generated/    Agent output (tailored resumes, cover letters, prep, outreach)
  context/        Your profile (experience, career plan, Q&A answers)
  pipeline/       Applications, interviews, offers
  intel/          Company research files
  playbook.yaml   Accumulated lessons, strategy decisions, checklists
```

No data leaves your machine except when agents search the web for company info or job postings.

### Agent coordination

Agents share a **blackboard** — a live coordination surface. When one agent discovers something, it posts for others:

```
Research scores JD at 85/100
  → Resume: "Tailor resume for Stripe Staff Engineer"
    → Networking: "Check connections at Stripe"
      → Coach: "Referral path available"
```

The dashboard auto-dispatches work every 30 seconds.

### The dashboard

Every page: **tabbed content** on the left, **agent chat** on the right.

| Page | Agent | Purpose |
|------|-------|---------|
| **Pipeline** | — | Kanban board — track applications across stages |
| **Job Search Coach** | Coach | Profile setup, daily briefings, weekly retros |
| **Finding Roles** | Research | Companies, open roles, JD scoring, company intel |
| **Applying** | Resume | Tailored resumes, cover letters, outreach materials |
| **Networking** | Networking | Connection requests, referrals, LinkedIn audit |
| **Interviewing** | Interview | Prep packages, mock interviews, debriefs |
| **Closing** | Negotiation | Offers, salary research, negotiation strategy |
| **Analytics** | — | Pipeline funnel, response rates, fit score insights, stale apps |
| **Playbook** | — | Lessons learned, strategy decisions, reusable checklists |
| **Vault** | — | File browser for uploads and generated materials |
| **Command Center** | All | Agent management, blackboard viewer, reset |

<br/>

---

<br/>

## Configuration

### Agent model

```typescript
// project.config.ts
export const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Override per agent
export const AGENT_MODELS: Record<string, string> = {
  // interview: 'claude-opus-4-6',          // deeper reasoning
  // networking: 'claude-haiku-4-5-20251001', // fast + cheap for outreach
}
```

### Skills (22 total)

Markdown files that control agent behavior. Edit without code changes:

```
.claude/skills/
  # Coach
  setup/                  Profile onboarding flow
  daily-briefing/         Morning priorities + pipeline check
  weekly-retro/           End-of-week analysis + next week plan

  # Research
  scan-roles/             Find open roles (sources, verification)
  score-jd/               Score JD against profile (5 dimensions)
  company-research/       Build company intel profiles
  generate-targets/       Rank target companies by fit

  # Resume
  resume-tailor/          Tailor resume to specific JD
  cover-letter/           Map top 3 experiences to top 3 requirements
  hiring-manager-msg/     Lead with product insight, not an ask
  company-insight/        1-2 page product analysis brief
  recruiter-review/       6-second scan test rubric (used by resume-tailor)
  ats-check/              ATS compatibility rubric (used by resume-tailor)

  # Networking
  connection-request/     Personalized LinkedIn outreach batch
  referral-request/       3-message referral sequence
  linkedin-audit/         Profile positioning for target roles

  # Interview
  interview-prep/         Company-specific prep packages
  mock-interview/         One-at-a-time with Three Laws scoring
  interview-debrief/      Post-interview analysis + pattern tracking
  thank-you-note/         Personalized, references conversation moments

  # Negotiation
  salary-research/        Market comp from Levels.fyi, Glassdoor, Blind
  negotiate/              Offer analysis + counter-offer strategy
```

### Profile schema

`search/config/profile-schema.yaml` — controls which fields are required and what the coach asks about.

<br/>

## Development

```bash
npm run dev                    # Next.js dev server on :8791
npm run build                  # Production build
bun blackboard/server.ts       # Blackboard server separately
```

<br/>

## License

**AGPL-3.0** — free to use, modify, and share. If you run a modified version as a service, you must release your source code. See [LICENSE](LICENSE).

For commercial licensing, contact [@aravindbharathy](https://github.com/aravindbharathy).

## Acknowledgments

Blackboard architecture adapted from [Kapi Sprints](https://github.com/Kapi-IDE/kapi-sprints) by Balaji Viswanathan (Apache 2.0). See [NOTICE](NOTICE).

---

<p align="center">Built with <a href="https://claude.ai/code">Claude Code</a>. Agents powered by Claude.</p>
