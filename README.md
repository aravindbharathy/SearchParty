<p align="center">
  <h1 align="center">Search Party</h1>
  <p align="center"><strong>Your AI-powered job search team.</strong><br/>6 specialist agents that coordinate, remember everything, and get better over time — running locally on your machine.</p>
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

### "Can't AI already do this?"

There are AI tools that evaluate JDs, generate resumes, and draft outreach. They're useful — but they work one command at a time. Paste a JD, get a score. Run another command, get a PDF. Each action is isolated. The tool doesn't know what it told you yesterday, doesn't connect your resume to your interview prep, and doesn't learn what's working across your search.

That's a tool. What you need is a team.

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

Not templates. The agents read your actual experience, your career goals, and each company's culture. Content follows a [writing style guide](.claude/skills/writing-style-guide.md) designed to sound like you wrote it on your best day — not like AI generated it.

### Full lifecycle, not just apply

Most tools focus on the evaluate-and-apply phase. Search Party covers the entire arc: finding roles → scoring fit → tailoring resumes → building warm intros → prepping for interviews → mock interviews with scoring → debriefing after → negotiating the offer. Each stage has a dedicated agent with stage-specific skills. Your coach briefs you every morning and runs a retro every week.

### A real dashboard

Not a terminal. A web dashboard with a kanban pipeline, live agent chat, visual resume editor, and company intel cards. You see your entire search at a glance and interact through a UI, not command-line flags.

<br/>

## The team

| Agent | What they do | Skills |
|-------|-------------|--------|
| **Job Search Coach** | Builds your profile, runs daily briefings, weekly retros | `setup` `daily-briefing` `weekly-retro` |
| **Research** | Scans for open roles, scores JDs, builds company intel, generates target lists | `scan-roles` `score-jd` `company-research` `generate-targets` |
| **Resume** | Tailors resumes (flexible sections, visual editor, PDF export), cover letters, outreach | `resume-tailor` `cover-letter` `hiring-manager-msg` `company-insight` |
| **Networking** | LinkedIn outreach, referral sequences, profile audit | `connection-request` `referral-request` `linkedin-audit` |
| **Interview** | Prep packages, mock interviews with scoring, debriefs, thank-you notes | `interview-prep` `mock-interview` `interview-debrief` `thank-you-note` |
| **Negotiation** | Salary research, offer analysis, counter-offer strategy | `salary-research` `negotiate` |

<br/>

## Before & after

| | Before | After |
|---|--------|-------|
| **Resume** | 30 min per application. Hope keywords match. | Tailored in seconds. Flexible sections. Visual editor + PDF export. |
| **Networking** | Generic "let's connect" to 50 strangers. | Personalized messages referencing their team and your overlap. |
| **Interview prep** | Google questions the night before. | Prep package with company format, your STAR stories, mock with scoring. |
| **Pipeline** | Spreadsheet abandoned after week 2. | Live kanban with fit scores, stage-aware actions, interview scheduling. |
| **Fit assessment** | Apply to everything. Hope for the best. | Score every JD before investing time. Focus on 75%+ matches. |
| **Follow-ups** | Forget. Miss the window. | Tracked by the daily briefing agent. Reminders surfaced proactively. |
| **Learning** | Same mistakes every interview. | Debrief, track patterns, coach targets your weak spots. |
| **Strategy** | Alone with no feedback. | Coach reads your pipeline every morning. "Here's what to focus on today." |

<br/>

## Why a team, not a tool

**Single-agent tools** give you a command palette: one skill at a time, stateless, forget everything between runs. You're the project manager — you decide what to run, when, and stitch the outputs together yourself.

**Search Party** gives you a team with shared memory. Agents read your structured experience library before every action. They coordinate through a [blackboard protocol](blackboard/) — when Research scores a role, Resume and Networking see it and act. Your coach tracks what's working across weeks and adjusts strategy. The system gets smarter the longer you use it, because your profile, your playbook, and your interview history compound.

The difference shows up on day 30. With a tool, your 30th application looks like your 1st — same manual effort, same generic output. With a team, your 30th application benefits from 29 debriefs, a refined strategy, and agents that know exactly how to position you.

<br/>

---

<br/>

## Quick start

### The 30-minute investment that changes everything

The onboarding process takes about 30 minutes. The coach walks you through it — your background, what you're looking for, your story for interviews.

**Why it matters:** Every agent reads your profile before doing anything. A resume tailored by an agent that knows your 6 roles, your STAR stories, and your career goals is fundamentally different from one that only has a job description. The 30 minutes you spend here is the reason application #50 will be dramatically better than what you could write manually.

You can do it in phases — the coach saves as you go and picks up where you left off.

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

1. Go to **Finding Roles** in the sidebar
2. On the **Target Companies** tab, click **Generate Targets** — the research agent builds a ranked list from your career plan
3. Click **Get Intel** on any company card to research their interview process, compensation, and culture
4. Switch to **Score JD** tab — paste a job description and the agent scores it against your profile (0-100)
5. High-scoring JDs (75+) get an **Add to Pipeline** button — this creates a tracked application
6. The pipeline detail view guides you through each stage with contextual next steps

### 5. Work through the pipeline

Each application moves through stages with stage-specific guidance:

| Stage | What the system does |
|-------|---------------------|
| **Researching** | Score JD → Tailor resume → Write cover letter |
| **Applied** | Find referrals → Send hiring manager messages |
| **Phone Screen** | Build prep package → Mock interview → Debrief → Thank-you note |
| **Onsite** | Multi-round prep → Mock each round type → Debrief after |
| **Offer** | Salary research → Negotiation strategy |

### Optional: automated daily scanning

Add a cron job to scan for new roles automatically:

```bash
crontab -e
# Add this line — scans careers pages at 7am daily
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
    uploads/          Your source files (resumes, JDs, transcripts, templates)
    generated/        Agent output (tailored resumes, cover letters, prep, outreach)
  context/            Your profile
    experience-library.yaml   Work history, skills, education
    career-plan.yaml          Target roles, preferences, priorities
    interview-answers.yaml    Why searching, interview prep answers
    target-companies.yaml     Companies of interest
    connection-tracker.yaml   Professional contacts
    interview-history.yaml    Past interviews, patterns, scores
  pipeline/           Application lifecycle
    open-roles.yaml           Canonical role records (score, resume, applications linked)
    applications.yaml         Application submissions (linked to roles via role_id)
    interviews.yaml           Scheduled interviews
    offers.yaml               Received offers
  intel/              Company research files
  playbook.yaml       Accumulated lessons, strategy decisions, checklists
```

No data leaves your machine except when agents search the web for company info or job postings.

### Role-application linking

Every role, scored JD, resume, and application is connected through `role_id`:

```
Open Role (open-roles.yaml)          Application (applications.yaml)
  id: role-google-staff-uxr    ←→     role_id: role-google-staff-uxr
  score: 85                            status: phone-screen
  score_file: entries/...              resume_version: v1.json
  resume_file: vault/...              applied_date: 2026-04-15
```

Agents read this to know: "This role was scored 85, resume v1 was sent, currently at phone screen."

### Agent coordination

Agents share a **blackboard** — a live coordination surface. When one agent discovers something, others act on it:

```
Research scores JD at 85/100
  → Resume: "Tailor resume for Stripe Staff Engineer"
    → Networking: "Check connections at Stripe"
```

Each agent has [directive rules](.claude/agents/) that define exactly when to post cross-agent work — no noise, only actionable triggers.

### The dashboard

Every page: **tabbed content** on the left, **agent chat** on the right. Detail views open as overlays. Progress indicators show skill-specific steps.

| Page | Agent | Purpose |
|------|-------|---------|
| **Pipeline** | — | Kanban board with stage-aware actions and interview scheduling |
| **Job Search Coach** | Coach | Profile setup, daily briefings, weekly retros |
| **Finding Roles** | Research | Target companies, open roles, JD scoring, company intel |
| **Applying** | Resume | Tailored resumes (visual editor + PDF), cover letters, outreach |
| **Networking** | Networking | Connection requests, referrals, LinkedIn audit |
| **Interviewing** | Interview | Prep packages, mock interviews, debriefs, transcript upload |
| **Closing** | Negotiation | Offers, salary research, negotiation strategy |
| **Playbook** | — | Lessons learned, strategy decisions, reusable checklists |
| **Vault** | — | File browser for uploads and generated materials |

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

### Resume editor

Resumes use a flexible section-based format. Add, remove, reorder sections:

- Summary, Experience, Education, Skills (with custom groups), Certifications, Publications, Projects, Custom sections
- Three built-in templates (Clean, Modern, Traditional) + upload your own CSS
- PDF export via browser print

### Writing style

All content-generating skills follow [`.claude/skills/writing-style-guide.md`](.claude/skills/writing-style-guide.md):

- No AI-sounding language ("passionate about", "leverage", "innovative solutions")
- Max 1 em dash per page
- Specific metrics over vague claims
- Cover letters under 350 words with company-specific opening

### Skills (22 total)

Markdown files that control agent behavior. Edit without code changes:

```
.claude/skills/
  writing-style-guide.md    Shared voice + anti-patterns for all content

  # Coach
  setup/                    Profile onboarding flow
  daily-briefing/           Morning priorities + pipeline check
  weekly-retro/             End-of-week analysis + next week plan

  # Research
  scan-roles/               Find open roles (ATS APIs + web search)
  score-jd/                 Score JD against profile (4-block evaluation)
  company-research/         Build company intel profiles
  generate-targets/         Rank target companies by fit

  # Resume
  resume-tailor/            Tailor resume to specific JD (flexible sections)
  cover-letter/             Map top 3 experiences to top 3 requirements
  hiring-manager-msg/       Lead with product insight, not an ask
  company-insight/          1-2 page product analysis brief
  recruiter-review/         6-second scan test rubric
  ats-check/                ATS compatibility rubric

  # Networking
  connection-request/       Personalized LinkedIn outreach batch
  referral-request/         3-message referral sequence
  linkedin-audit/           Profile positioning for target roles

  # Interview
  interview-prep/           Company-specific prep packages
  mock-interview/           One-at-a-time with Three Laws scoring
  interview-debrief/        Post-interview analysis + pattern tracking
  thank-you-note/           Personalized, references conversation moments

  # Negotiation
  salary-research/          Market comp from Levels.fyi, Glassdoor, Blind
  negotiate/                Offer analysis + counter-offer strategy
```

### Profile schema

`lib/profile-schema.yaml` — controls which fields are required, what the coach asks about, and what the profile panel displays.

### Per-agent directive rules

Each agent has a `## Directive Rules` section in `.claude/agents/*.md` defining exactly when to post cross-agent work. Editable without code changes.

<br/>

## Development

```bash
npm run dev                    # Next.js dev server on :8791
npm run build                  # Production build
bun blackboard/server.ts       # Blackboard server separately
bun cli/job-search.ts start    # Start all services
bun cli/job-search.ts stop     # Stop all services
bun cli/job-search.ts status   # Check what's running
```

### Ports

- **8790** — Blackboard server (agent coordination)
- **8791** — Dashboard (Next.js)

<br/>

## Disclaimer

Search Party is a local tool — **not** a hosted service. Your data stays on your machine and is sent only to Anthropic's API when agents run. Agents do not auto-submit applications, but AI can behave unpredictably — always review generated content before submitting. You are responsible for complying with the Terms of Service of any platform you use (LinkedIn, Greenhouse, etc.). Fit scores, salary data, and all AI-generated content are recommendations, not guarantees. See [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) for full details.

## License

**AGPL-3.0** — free to use, modify, and share. If you run a modified version as a service, you must release your source code. See [LICENSE](LICENSE).

For commercial licensing, contact [@aravindbharathy](https://github.com/aravindbharathy).

## Acknowledgments

Blackboard architecture adapted from [Kapi Sprints](https://github.com/Kapi-IDE/kapi-sprints) by Balaji Viswanathan (Apache 2.0). See [NOTICE](NOTICE).

---

<p align="center">Built with <a href="https://claude.ai/code">Claude Code</a>. Agents powered by Claude.</p>
