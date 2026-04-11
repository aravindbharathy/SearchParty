# Search Party

**Your AI-powered job search team.** 7 specialist agents that research companies, tailor resumes, generate outreach, prep you for interviews, and keep your entire pipeline organized — all running locally on your machine.

---

## The problem

You know the drill. You find a role on LinkedIn, spend 30 minutes tailoring your resume, write a cover letter no one reads, hit apply, and hear nothing back for weeks. Repeat 50 times. Meanwhile, the people who get hired had a warm intro from someone on the team.

The modern job search is broken in specific ways:

- **You're applying blind.** You don't know if a role is a real fit until you've already invested hours. The JD says "5+ years of experience" but doesn't tell you whether your background in cloud platforms translates to their fintech stack.
- **Every application is a cold start.** Each resume takes 20-30 minutes to tailor. Each cover letter is written from scratch. There's no compounding — your 50th application doesn't benefit from your 1st.
- **Networking feels transactional.** You know you should reach out to people at target companies, but "Hi, I'd like to connect" messages get ignored. You don't have time to research each person and craft something genuine.
- **Interview prep is scattered.** You Google "common PM interview questions," practice in front of a mirror, and hope for the best. You don't track what went well or poorly across interviews, so you repeat the same mistakes.
- **There's no system.** Everything lives in your head, a messy spreadsheet, and 47 browser tabs. You forget to follow up, miss deadlines, and lose track of where you are with each company.
- **It's lonely.** You're doing all of this alone, making judgment calls without feedback, and the emotional weight of rejection compounds when there's no one to debrief with.

## What Search Party does differently

Search Party gives you a team of 7 AI specialists. They remember everything about you, coordinate with each other, and handle the repetitive work so you can focus on the human parts — building real relationships and performing in interviews.

**Your work compounds.** Every answer you give the coach, every resume the agent tailors, every interview you debrief — it all feeds back into your profile. Your 50th application is dramatically better than your 1st because the system has learned your strengths, your stories, and what resonates.

**Agents coordinate automatically.** When the Research Agent finds a high-fit role at Stripe, it doesn't just tell you — it tells the Resume Agent to tailor a resume, the Networking Agent to check for warm connections, and the Coach to add it to your morning briefing. You wake up to: "New role at Stripe (92% fit). Resume ready. Marcus Rivera can refer you."

**Everything is personalized.** Not "here's a template, fill in the blanks." The agents read your actual experience, your specific career goals, and the company's culture to produce output that sounds like you wrote it on your best day.

### The team

- **Job Search Coach** — walks you through setting up your profile, runs daily briefings, keeps everything on track
- **Research Agent** — scans companies for open roles, scores job descriptions against your profile, builds company intel
- **Resume Agent** — tailors resumes to specific JDs, writes cover letters, creates strategic work products
- **Networking Agent** — generates personalized LinkedIn outreach, crafts referral sequences, audits your profile
- **Interview Agent** — builds prep packages, runs mock interviews with scoring, debriefs after real interviews
- **Strategist Agent** — analyzes company products, writes hiring manager messages
- **Archivist Agent** — maintains your context files, extracts patterns, keeps data fresh

They coordinate through a shared blackboard — when the Research Agent finds a high-fit role, it automatically tells the Resume Agent to tailor a resume and the Networking Agent to check for connections at that company.

## The old way vs Search Party

| The old way | With Search Party |
|------------|-------------------|
| Spend 30 min tailoring each resume. Hope the keywords are right. | Agent reads the JD, maps your experience to their requirements, hits 90%+ keyword coverage. Takes seconds. |
| Send "Hi, I'd love to connect" to 50 strangers. Get 2 replies. | Each message references the person's team, recent work, and your specific connection to their domain. |
| Google "Stripe interview questions" the night before. | Prep package with the company's actual interview format, your best STAR stories for their likely questions, and a mock interview with scoring. |
| Track applications in a spreadsheet you stop updating after week 2. | Live kanban board with fit scores, follow-up reminders, and agents that keep working while you sleep. |
| Apply to everything and hope something sticks. | Score every JD before investing time. Skip the 40% fits. Focus energy on the 85%+ matches. |
| Forget to follow up. Miss the window. | Auto-scheduled follow-ups at days 7, 14, 21. Agents remind you before deadlines. |
| Same mistakes in every interview. No feedback loop. | Debrief after every interview. Track patterns. Coach targets your weak spots with practice. |
| No one to talk through strategy with. | A coach that reads your full pipeline every morning and says "here's what to focus on today." |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/) 1.0+
- [Claude Code](https://claude.ai/code) CLI installed and authenticated

### Setup

```bash
# Clone the repo
git clone https://github.com/aravindbharathy/SearchParty.git
cd SearchParty

# Install dependencies
npm install

# Start everything (blackboard server + dashboard)
bun cli/job-search.ts start
```

The dashboard opens at **http://localhost:8791**. The blackboard server runs on port 8790.

### First steps

1. **Upload your resume** — drop a PDF into `search/vault/resumes/`
2. **Open the Job Search Coach** — click "Job Search Coach" in the sidebar
3. **Answer the coach's questions** — it'll parse your resume, ask about your goals, and build your profile
4. **Start finding roles** — go to "Finding Roles" to generate target companies and scan for open positions

The coach guides you through everything. Your profile builds up as you answer questions, and the other agents use it to personalize everything they do.

### Optional: Daily role scanning

Set up a cron job to scan for new roles every morning:

```bash
# Add to crontab (runs at 7am daily)
crontab -e
0 7 * * * curl -s -X POST http://localhost:8791/api/agent/scan-roles
```

The research agent will check your target companies for new openings and have everything ready for your morning briefing.

## How it works

### Your data stays local

Everything lives in the `search/` directory on your machine:

```
search/
  context/          <- Your profile (experience, career plan, Q&A answers)
  pipeline/         <- Applications, interviews, open roles
  output/           <- Generated resumes, cover letters, prep packages
  intel/            <- Company research files
  vault/            <- Your source documents (resumes, JDs, transcripts)
```

No data leaves your machine except when agents use web search to research companies or find job postings.

### Agent coordination

Agents communicate through a shared blackboard — a YAML file that all agents can read and write to. When one agent discovers something relevant to another, it posts a finding or directive:

- Research scores a JD at 85/100 → posts directive to Resume: "Tailor resume for Stripe Staff Engineer"
- Resume finishes tailoring → posts directive to Networking: "Check connections at Stripe"
- Networking finds a warm connection → posts to Coach: "Referral path available at Stripe"

The dashboard auto-dispatches directives every 30 seconds, so agents pick up work automatically.

### The dashboard

Every page follows the same pattern: tabbed content on the left, specialist agent chat on the right. Ask questions, trigger skills, review output — all in one place.

| Page | What it does |
|------|-------------|
| **Pipeline** (home) | Kanban board tracking all applications across stages |
| **Job Search Coach** | Profile setup, daily briefings, strategy advice |
| **Finding Roles** | Target companies, open role scanning, JD scoring, company intel |
| **Applying** | Tailored resumes, cover letters, strategic work products |
| **Networking** | Connection requests, referral sequences, LinkedIn audit |
| **Interviewing** | Prep packages, mock interviews with scoring, debriefs |
| **Command Center** | Agent management, blackboard viewer, directive tracking |

## Configuration

### Agent model

Edit `project.config.ts` to change which Claude model agents use:

```typescript
// All agents use this model by default
export const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Override per agent if needed
export const AGENT_MODELS: Record<string, string> = {
  // interview: 'claude-opus-4-6',    // deeper reasoning for mocks
  // archivist: 'claude-haiku-4-5-20251001',  // fast/cheap for maintenance
}
```

### Skills

Skills are markdown files in `.claude/skills/` that define how agents do specific tasks. Edit them to customize behavior — no code changes needed:

```
.claude/skills/
  scan-roles/SKILL.md        <- How to find open roles (sources, verification)
  generate-targets/SKILL.md  <- How to build target company list
  resume-tailor/SKILL.md     <- How to tailor resumes
  score-jd/SKILL.md          <- How to score job descriptions
  interview-prep/SKILL.md    <- How to build prep packages
  mock-interview/SKILL.md    <- How to run mock interviews
  ...
```

### Profile schema

Edit `search/config/profile-schema.yaml` to change which fields are required for each profile section. This controls the completion indicators and what the coach asks about.

## Development

```bash
npm run dev          # Next.js dev server on :8791
npm run build        # Production build
bun blackboard/server.ts  # Start blackboard server separately
```

## License

**AGPL-3.0** — free to use, modify, and share. If you run a modified version as a service, you must release your source code. See [LICENSE](LICENSE) for details.

For commercial licensing, contact [@aravindbharathy](https://github.com/aravindbharathy).

## Acknowledgments

The multi-agent blackboard architecture is adapted from [Kapi Sprints](https://github.com/Kapi-IDE/kapi-sprints) by Balaji Viswanathan (Apache 2.0). See [NOTICE](NOTICE) for attribution details.

---

Built with [Claude Code](https://claude.ai/code). Agents powered by Claude.
