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

| Agent | What they do |
|-------|-------------|
| **Job Search Coach** | Builds your profile, runs daily briefings, keeps everything on track |
| **Research** | Scans for open roles, scores JDs, builds company intel, analyzes products |
| **Resume** | Tailors resumes, writes cover letters, creates work products, hiring manager messages |
| **Networking** | Personalized LinkedIn outreach, referral sequences, profile audit |
| **Interview** | Prep packages, mock interviews with scoring, post-interview debriefs |
| **Negotiation** | Salary research, offer analysis, counter-offer strategy, comp comparison |

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

1. Drop your resume PDF into `search/vault/resumes/`
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
  context/    Your profile (experience, career plan, Q&A answers)
  pipeline/   Applications, interviews, open roles
  output/     Generated resumes, cover letters, prep packages
  intel/      Company research files
  vault/      Your source documents (resumes, JDs, transcripts)
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

| Page | Purpose |
|------|---------|
| **Pipeline** | Kanban board — track applications across stages |
| **Job Search Coach** | Profile setup, daily briefings, strategy |
| **Finding Roles** | Companies, open roles, JD scoring, intel |
| **Applying** | Resumes, cover letters, work products |
| **Networking** | Outreach, referrals, LinkedIn audit |
| **Interviewing** | Prep, mock interviews, debriefs |
| **Closing** | Offers, salary research, negotiation strategy |
| **Command Center** | Agent management, blackboard viewer |

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

### Skills

Markdown files that control agent behavior. Edit without code changes:

```
.claude/skills/
  scan-roles/SKILL.md         How to find open roles
  generate-targets/SKILL.md   How to build company lists
  resume-tailor/SKILL.md      How to tailor resumes
  score-jd/SKILL.md           How to score job descriptions
  interview-prep/SKILL.md     How to build prep packages
  mock-interview/SKILL.md     How to run mock interviews
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
