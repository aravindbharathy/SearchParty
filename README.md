# Search Party

**Your AI-powered job search team.** 7 specialist agents that research companies, tailor resumes, generate outreach, prep you for interviews, and keep your entire pipeline organized — all running locally on your machine.

---

## Why this exists

Job searching is a full-time job. You're juggling dozens of companies, customizing resumes for each one, crafting connection messages, prepping for interviews, following up — and doing it all alone.

Search Party gives you a team of AI specialists, each focused on one part of your search:

- **Job Search Coach** — walks you through setting up your profile, runs daily briefings, keeps everything on track
- **Research Agent** — scans companies for open roles, scores job descriptions against your profile, builds company intel
- **Resume Agent** — tailors resumes to specific JDs, writes cover letters, creates strategic work products
- **Networking Agent** — generates personalized LinkedIn outreach, crafts referral sequences, audits your profile
- **Interview Agent** — builds prep packages, runs mock interviews with scoring, debriefs after real interviews
- **Strategist Agent** — analyzes company products, writes hiring manager messages
- **Archivist Agent** — maintains your context files, extracts patterns, keeps data fresh

They coordinate through a shared blackboard — when the Research Agent finds a high-fit role, it automatically tells the Resume Agent to tailor a resume and the Networking Agent to check for connections at that company.

## What's different from doing it yourself

| Without Search Party | With Search Party |
|---------------------|-------------------|
| Generic resume for every application | Resume tailored to each JD with keyword matching |
| "Hi, I'd like to connect" on LinkedIn | Personalized messages referencing company-specific context |
| Googling "common interview questions" | Prep packages with STAR stories mapped to likely questions |
| Spreadsheet with company names | Live pipeline with fit scores, follow-up tracking, agent coordination |
| Spending 20 min per application | Agents handle research, tailoring, outreach in parallel |
| Forgetting to follow up | Automatic follow-up scheduling with reminders |
| No idea if a role is worth applying to | 0-100 fit scoring across 5 dimensions before you invest time |

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

MIT

---

Built with [Claude Code](https://claude.ai/code). Agents powered by Claude.
