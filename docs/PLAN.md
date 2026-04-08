# Search Party — Implementation Plan

## Context

We're adapting the Kapi Sprints multi-agent coordination system (a coding workflow tool) into a **Search Party** — a multi-agent system that automates and systematizes the full job search lifecycle. The concept is based on the [GrowthPioneer Search Party](https://growthpioneer.gumroad.com/l/jobsearchos): 23 AI-powered skills, 4 AI reviewers, a context system, and a pipeline dashboard — all running in Claude Code.

The Kapi Sprints architecture (blackboard server, MCP shim, agent definitions, skills, Next.js dashboard) provides the scaffolding. We rewrite the domain layer (agents, skills, dashboard pages, shared state schema) for job search.

### Key Design Decisions

1. **Dashboard-first, CLI-launcher architecture** — The user runs `job-search start` once. This starts the blackboard server, dashboard, and process manager. All interaction happens through the dashboard UI at `localhost:8791`. Agents are spawned on-demand in the background when the user clicks actions in the dashboard. The user never needs to open a terminal again after the initial `job-search start` (except for `/setup` during onboarding which requires conversational AI).

2. **On-demand agent spawning with native session resume** — Agents are NOT always running. When the dashboard needs an agent (e.g., user clicks "Tailor Resume"), the process manager spawns `claude --agent resume --resume {session_id}`. The agent does its work, writes output, updates blackboard, and exits. Each agent has a persistent named session that's resumed on every spawn, giving it full memory of prior interactions with this user. This combines context isolation (fresh spawn) with continuity (session history).

3. **Multi-agent for context isolation** — Each agent loads only the context files relevant to its domain, keeping its working memory pristine. The blackboard is how agents share outcomes without polluting each other's context windows:
   - Resume agent: experience-library, career-plan
   - Interview agent: qa-master, interview-history, intel/{company}
   - Networking agent: target-companies, connection-tracker
   - Research agent: target-companies, experience-library (for fit scoring)
   - Strategist agent: intel/{company}, career-plan
   - Coach: pipeline/ (applications, interviews, offers), interview-history (score trends), connection-tracker (networking velocity), snapshot.yaml, board.md
   - Archivist: all context files (read+write)
   - Some skills are cross-cutting (e.g., `/score-jd` reads experience-library + career-plan even though it's assigned to Research)

4. **3-tier memory management** — Each agent gets better over time through three memory layers:
   - **Working memory** (current session context) — ephemeral, per-spawn
   - **Session memory** (Claude Code native session resume) — persists across spawns, carries user preferences, past decisions, learned patterns. This is the key differentiator vs. GrowthPioneer's stateless skills.
   - **Structured context** (YAML files) — permanent facts: experience library, career plan, pipeline state. Shared across agents.

   When sessions grow too large (100+ interactions), the Archivist performs **session rotation**: extracts a memory primer (condensed preferences + patterns), archives old session, starts fresh session pre-loaded with primer. Durable patterns get promoted to context YAML files over time.

5. **4 separate reviewer rubric files** — Same memory principle. Each reviewer defines a focused evaluation rubric (one artifact + one rubric). Primarily used inline as a second pass within skills. Can also be invoked as standalone agents for deep review sessions.

6. **Add `/daily-briefing`** — no Kapi equivalent exists. Surfaces follow-ups due, interviews coming up, stale applications, networking batches ready. The Coach agent's primary daily output.

7. **Directive priorities + deadlines** — Job search has real deadlines (interview dates, application windows). Directives get `priority` (P0/P1/P2) and `due` fields that Kapi didn't need.

---

## Architecture: What Changes, What Stays

### Reuse As-Is
| Component | Path | Why |
|-----------|------|-----|
| `useBlackboard` hook | `app/hooks/use-blackboard.ts` | WebSocket hook is domain-agnostic |

### Reuse with Minor Edits
| Component | Path | Changes |
|-----------|------|---------|
| `.mcp.json` | root | Add `BLACKBOARD_DIR` env var pointing to `search/` |
| MCP Shim | `blackboard/shim.ts` | One-line fix: change `const kapiDir = join(projectDir, 'kapi')` to `const kapiDir = process.env.BLACKBOARD_DIR \|\| join(projectDir, 'kapi')` so the .mcp.json env var is respected |
| Blackboard server | `blackboard/server.ts` | Change `ensureKapiStructure()` to create `search/` dirs (vault/, context/, pipeline/, output/, intel/). Add `priority`/`due` fields to directive interface |
| `project.config.ts` | root | `name: 'Search Party'`, `short: 'JS'`, `opsDir: 'search'` |
| `/post` skill | `.claude/skills/post/SKILL.md` | Change paths from `kapi/` to `search/` |
| Layout + globals.css | `app/layout.tsx`, `app/globals.css` | New title/metadata + warm theme CSS (light base, brown/cream/green palette) — this is a full theme rewrite, not just a title change |

### Rewrite / Build New
- **Sidebar** (`app/_components/sidebar.tsx`) — New simplified sidebar (inspired by Kapi pattern, not adapted from it)
- **CLI launcher** (`job-search` command) — starts blackboard, dashboard, process manager
- **Process manager** — spawns agents on-demand, manages session registry, handles lifecycle
- **Session registry** (`search/agents/sessions.yaml`) — maps agent → session ID for resume
- 7 domain agent definitions (coach, resume, strategist, networking, interview, research, archivist) + 4 reviewer rubrics
- 23 job search skill files (17 core + setup + daily-briefing + post + 3 archivist skills from Phase 6)
- 6 context files (experience library, career plan, etc.)
- Pipeline state files (applications, interviews, offers)
- 11 dashboard pages — now the PRIMARY UI, not just monitoring (actions trigger agent spawns)
- Dashboard API routes that post directives and trigger agent spawning
- Parsers for context + pipeline YAML

---

## Directory Structure

```
job-search-os/                       (root — replaces kapi-sprints/)
├── .claude/
│   ├── CLAUDE.md                    # Job search workflow docs
│   ├── agents/                      # 7 domain agents + 4 reviewer agents (separate for context isolation)
│   │   ├── coach.md                 # Orchestrator: daily briefing, weekly retro, pipeline mgmt
│   │   ├── resume.md                # Resumes + cover letters (experience → JD matching)
│   │   ├── strategist.md            # Work products + hiring manager messages (company analysis → recommendations)
│   │   ├── networking.md            # LinkedIn outreach, referrals, connection tracking
│   │   ├── interview.md             # Prep, mock, debrief, thank-you notes
│   │   ├── research.md              # Company intel, salary data, job fit scoring, negotiation
│   │   ├── archivist.md             # Context file maintenance, pattern extraction, memory curation
│   │   └── reviewers/               # Focused reviewers — each loads ONE artifact + ONE rubric
│   │       ├── recruiter-reviewer.md   # 6-second scan test on resumes
│   │       ├── ats-checker.md          # Formatting/parsing issues
│   │       ├── hiring-manager-reviewer.md  # Work product real-insight test
│   │       └── interview-grader.md     # Three Laws scoring on interview answers
│   └── skills/                      # 23 skills (17 core + setup + daily-briefing + post + 3 archivist skills from Phase 6)
│       ├── setup/SKILL.md
│       ├── daily-briefing/SKILL.md
│       ├── score-jd/SKILL.md
│       ├── company-research/SKILL.md
│       ├── resume-tailor/SKILL.md
│       ├── cover-letter/SKILL.md
│       ├── work-product/SKILL.md
│       ├── hiring-manager-msg/SKILL.md
│       ├── connection-request/SKILL.md
│       ├── referral-request/SKILL.md
│       ├── linkedin-audit/SKILL.md
│       ├── interview-prep/SKILL.md
│       ├── mock-interview/SKILL.md
│       ├── interview-debrief/SKILL.md
│       ├── thank-you-note/SKILL.md
│       ├── salary-research/SKILL.md
│       ├── negotiate/SKILL.md
│       ├── app-tracker/SKILL.md
│       ├── weekly-retro/SKILL.md
│       ├── post/SKILL.md            # Reuse from Kapi with path changes
│       ├── archivist-update/SKILL.md   # Phase 6: post-debrief pattern extraction
│       ├── archivist-audit/SKILL.md    # Phase 6: staleness check across context files
│       └── archivist-rotate/SKILL.md   # Phase 6: session rotation via preferences file
│
├── cli/
│   └── job-search.ts                # CLI launcher: start/stop/status/setup commands
│
├── blackboard/
│   ├── server.ts                    # REUSE — minor edits (dir names, directive schema)
│   ├── shim.ts                      # REUSE — one-line fix for BLACKBOARD_DIR
│   └── package.json                 # REUSE — as-is
│
├── search/                          # Shared state (replaces kapi/)
│   ├── blackboard-live.yaml         # Agent coordination (managed by server)
│   ├── snapshot.yaml                # Weekly search status summary
│   ├── decisions.yaml               # Strategy decisions, offer evaluations
│   ├── board.md                     # Agent signals (kept for blackboard protocol compatibility)
│   ├── lessons.md                   # Interview learnings, what worked
│   ├── entries/                     # One file per skill output/finding/decision
│   ├── agents/                      # Auto-created agent profiles + session registry
│   │   └── sessions.yaml            # Maps agent name → Claude Code session ID for resume
│   ├── archive/                     # Past searches (created by /setup reset)
│   ├── vault/                       # USER INPUT: drop source files here
│   │   ├── resumes/                 # Resume PDFs, DOCXs, plain text
│   │   ├── job-descriptions/        # JDs to evaluate
│   │   ├── transcripts/             # Interview transcripts (Granola, Otter, etc.)
│   │   ├── offers/                  # Offer letters, comp breakdowns
│   │   ├── cover-letters/           # Existing cover letters for style reference
│   │   ├── misc/                    # Work samples, portfolios, anything else
│   │   └── .manifest.yaml           # Tracks processed status per file
│   ├── context/                     # SYSTEM: structured data (from vault + UI)
│   │   ├── experience-library.yaml
│   │   ├── career-plan.yaml
│   │   ├── qa-master.yaml
│   │   ├── target-companies.yaml
│   │   ├── connection-tracker.yaml
│   │   └── interview-history.yaml
│   ├── pipeline/                    # SYSTEM: application funnel state
│   │   ├── applications.yaml
│   │   ├── interviews.yaml
│   │   └── offers.yaml
│   ├── output/                      # SYSTEM: generated artifacts
│   │   ├── resumes/
│   │   ├── cover-letters/
│   │   ├── work-products/
│   │   └── messages/
│   └── intel/                       # SYSTEM: company research cache
│       └── {company-slug}.yaml
│
├── app/                             # Next.js 16 dashboard (routes match stage-centric nav)
│   ├── page.tsx                     # Command Center (/) — daily overview, urgency, funnel
│   ├── onboarding/                  # /onboarding — setup wizard (redirects here when context empty)
│   ├── finding/                     # /finding — target companies, fit scores, new JDs
│   ├── applying/                    # /applying — applications kanban, resumes, cover letters
│   ├── networking/                  # /networking — connections, referrals, outreach, follow-ups
│   ├── interviewing/                # /interviewing — prep, upcoming, history, scores
│   ├── closing/                     # /closing — offers, negotiation, salary
│   ├── analytics/                   # /analytics — weekly trends, response rate, charts
│   ├── playbook/                    # /playbook — lessons, strategy decisions
│   ├── vault/                       # /vault — source document management
│   ├── context/                     # /context — 6 context files editor with freshness
│   ├── api/                         # REST endpoints
│   │   ├── agent/                   # spawn agent, status, rotate session
│   │   ├── vault/                   # upload, scan (parsing happens in CLI)
│   │   ├── pipeline/                # application CRUD, interview CRUD
│   │   └── context/                 # context file read/write
│   ├── _components/sidebar.tsx      # Stage-centric sidebar with vault widget
│   └── hooks/use-blackboard.ts      # REUSE as-is
│
├── lib/
│   ├── process-manager.ts           # Spawns agents on-demand, manages session registry
│   ├── parsers.ts                   # Pipeline + context YAML parsers
│   └── context.ts                   # Context file read/validate helpers
│
├── project.config.ts
├── package.json
├── .mcp.json
└── README.md
```

---

## CLI Launcher & Process Manager

### `job-search` CLI Command

A thin Bun/Node script that bootstraps the entire system:

```bash
$ job-search start
🚀 Search Party starting...
  ✅ Blackboard server on :8790
  ✅ Dashboard on :8791
  ✅ Process manager singleton active (agents spawn on-demand)

Open http://localhost:8791 to start your job search.

$ job-search stop       # Graceful shutdown
$ job-search status     # Show running services + agent spawn stats
$ job-search setup      # Run onboarding (launches /setup skill interactively)
```

The CLI:
1. Starts blackboard server (`bun blackboard/server.ts`)
2. Starts Next.js dashboard (`npm run dev`) — process manager singleton starts automatically with the dashboard
3. Opens browser to `localhost:8791`

### Process Manager

A lightweight service that spawns Claude Code agents on-demand. Lives alongside the blackboard server.

**Trigger flow:**
```
User clicks "Tailor Resume" in dashboard
  → Dashboard: POST /api/agent/spawn { agent: "resume", directive: {...} }
  → Process manager checks sessions.yaml for existing session ID
  → If exists: claude --agent resume --resume {session_id} --print < directive
  → If not: claude --agent resume --print < directive (saves new session ID)
  → Agent does work, writes to search/output/, updates blackboard
  → Blackboard broadcasts to dashboard via WebSocket
  → Dashboard shows "Resume ready" + rendered output
```

**API endpoints:**
- `POST /api/agent/spawn` — Spawn an agent with a directive. Returns immediately (async).
- `GET /api/agent/status` — Active agents, recent spawns, session registry.
- `POST /api/agent/rotate` — Trigger session rotation for an agent (Archivist maintenance).

### Session Registry (`search/agents/sessions.yaml`)

```yaml
agents:
  coach:
    session_id: "abc123"
    last_active: "2026-04-01T09:00:00Z"
    spawn_count: 45
    created: "2026-03-15T10:00:00Z"
  resume:
    session_id: "def456"
    last_active: "2026-04-01T08:30:00Z"
    spawn_count: 28
    created: "2026-03-15T10:05:00Z"
  # ... etc for all 7 agents
```

Updated after every spawn. Used by process manager for `--resume` flag.

---

## Memory Architecture

### Three Tiers (how agents get better over time)

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1: Working Memory (ephemeral)                       │
│ Current Claude context window. Per-spawn. Gone on exit.  │
│ Contains: current directive, loaded context files, task.  │
├─────────────────────────────────────────────────────────┤
│ Tier 2: Session Memory (Claude Code native resume)       │
│ Full conversation history across spawns. Persisted by    │
│ Claude Code. Carries: user preferences, past decisions,  │
│ corrections, style calibration, learned patterns.        │
│ This is the KEY differentiator vs. stateless skills.     │
├─────────────────────────────────────────────────────────┤
│ Tier 3: Structured Context (YAML files on disk)          │
│ Permanent facts: experience library, career plan,        │
│ pipeline state, company intel. Shared across agents.     │
│ Updated by agents and dashboard.                         │
└─────────────────────────────────────────────────────────┘
```

### How vs. GrowthPioneer's Approach

GrowthPioneer = stateless skills reading static files. Same output on Day 1 and Day 30.
Search Party = stateful agents with persistent session memory reading living files. Output calibrates to the user over time.

Example: `/resume-tailor` on Day 30:
- GrowthPioneer: reads YAML, produces generic-quality resume, user re-corrects same issues
- Search Party: Resume agent resumes session with 29 prior interactions, knows user's style preferences, produces pre-calibrated resume with minimal edits needed

### Session Rotation (handling bloat)

When agent sessions grow too large (100+ interactions, ~3-6 months of use):

Each agent maintains a preferences file (`search/agents/{name}-preferences.md`) that captures learned patterns, user corrections, and style calibrations during normal operation.

**Step 1**: On rotation, the Archivist reads the agent's preferences file (not Claude Code session internals)

**Step 2**: Archivist promotes durable patterns from the preferences file to structured context YAML (e.g., `career-plan.yaml` gets a `resume_preferences` section)

**Step 3**: Archivist archives the preferences file to `search/archive/`

**Step 4**: Start fresh session, update sessions.yaml with new session ID. The new session loads context YAML which now contains the promoted patterns.

Even a brand-new session produces calibrated output because durable knowledge lives in context YAML, not in session history.

### Rotation Triggers
- Agent session hits context compression warnings
- Archivist periodic check (weekly during `/weekly-retro`)
- Manual: `POST /api/agent/rotate { agent: "resume" }`

---

## Agent Definitions (7 Domain + 4 Reviewers)

Each agent loads ONLY the context files relevant to its domain. This is the core architectural principle.

### coach.md (replaces pm.md)
- **Role**: Orchestrator. Daily briefing, weekly retro, pipeline management, strategy decisions.
- **Context**: snapshot.yaml, pipeline/ (applications, interviews, offers), board.md, interview-history.yaml (for score trends), connection-tracker.yaml (for networking velocity). Reads pipeline data directly for retro analysis — does NOT load experience-library (that's Resume's domain).
- **Authority**: Prioritize companies, assign directives, declare strategy shifts.
- **Writes to**: snapshot.yaml (weekly summary after retro), board.md (daily briefing items)
- **Template**: `kapi-sprints/.claude/agents/pm.md`

### resume.md
- **Role**: Resumes + cover letters. Maps experience to JD requirements.
- **Context**: experience-library.yaml, career-plan.yaml, the specific JD.
- **Review**: Skills include inline recruiter-review + ats-check passes after generation.

### strategist.md (NEW — split from resume)
- **Role**: Work products + hiring manager messages. Analyzes company products, writes strategic recommendations.
- **Context**: intel/{company}.yaml, career-plan.yaml, product/company research. Forward-looking, not backward-looking.
- **Review**: `/work-product` skill includes inline hiring-manager-review pass.

### networking.md
- **Role**: LinkedIn outreach, referral sequences, connection tracking, LinkedIn profile audit.
- **Context**: target-companies.yaml, connection-tracker.yaml.

### interview.md
- **Role**: Prep packages, mock interviews, debriefs, thank-you notes.
- **Context**: interview-history.yaml, qa-master.yaml, intel/{company}.yaml.
- **Review**: `/mock-interview` skill includes inline interview-grader pass.

### research.md
- **Role**: Company intel, salary data, job fit scoring, negotiation support. Uses WebSearch/WebFetch.
- **Context**: target-companies.yaml, market data. Writes to intel/{company}.yaml.

### archivist.md (NEW — memory curator)
- **Role**: Maintains context file quality over time. Curates, deduplicates, extracts patterns.
- **Context**: All context files (read+write access).
- **Tasks**: Update interview-history patterns after debriefs, prune stale connection-tracker entries, promote learnings from entries/ to lessons.md, keep target-companies.yaml current.

### 4 Reviewer Rubric Files (`.claude/agents/reviewers/`)
These are **rubric definition files**, not always-running agents. They serve two purposes:

**Primary use: Inline within skills** — Skills like `/resume-tailor` include a review pass as part of their instructions. The skill reads the rubric from the reviewer file and applies it as a focused second pass. Example: `/resume-tailor` SKILL.md ends with "After generating the resume, perform a Recruiter Review (read `.claude/agents/reviewers/recruiter-reviewer.md` for the rubric) and an ATS Check (read `.claude/agents/reviewers/ats-checker.md`). Post findings to blackboard." This keeps the review focused without needing a separate terminal session.

**Secondary use: Standalone agent sessions** — When the user wants a deep dedicated review (e.g., "I want to review all my resumes"), they can spawn the reviewer as its own Claude Code agent session with full context isolation.

Rubrics:
- **recruiter-reviewer.md** — Artifact: resume. Test: 6-second scan. "Would a recruiter keep reading past the fold?"
- **ats-checker.md** — Artifact: resume. Test: formatting/parsing. "Will tables, columns, text boxes break ATS?"
- **hiring-manager-reviewer.md** — Artifact: work product. Test: "Does this demonstrate real product understanding, or is it generic?"
- **interview-grader.md** — Artifact: interview answer. Test: Three Laws (Structure, Specificity, Skill Demonstration).

---

## Skills by Lifecycle Phase

### Phase 1: Finding Roles
| Skill | Arg | Agent | Reads |
|-------|-----|-------|-------|
| `/score-jd` | JD text/URL | research | career-plan, experience-library |
| `/company-research` | company name or "generate-targets" | research | target-companies |

### Phase 2: Applying
| Skill | Arg | Agent | Reads |
|-------|-----|-------|-------|
| `/resume-tailor` | JD text/URL | resume | experience-library, career-plan |
| `/cover-letter` | JD text/URL | resume | experience-library |
| `/work-product` | company + type | strategist | intel/{company}, career-plan |
| `/hiring-manager-msg` | company + role | strategist | work-product output, connection-tracker |

### Phase 3: Networking
| Skill | Arg | Agent | Reads |
|-------|-----|-------|-------|
| `/connection-request` | batch-size (default 25) | networking | target-companies, connection-tracker |
| `/referral-request` | contact + company | networking | connection-tracker |
| `/linkedin-audit` | (none) | networking | career-plan |

### Phase 4: Interviewing
| Skill | Arg | Agent | Reads |
|-------|-----|-------|-------|
| `/interview-prep` | company + role + round | interview | intel/{company}, qa-master, interview-history |
| `/mock-interview` | company + role + round-type | interview | prep package, qa-master |
| `/interview-debrief` | transcript | interview | interview-history |
| `/thank-you-note` | company + interviewer | interview | debrief output |

### Phase 5: Closing
| Skill | Arg | Agent | Reads |
|-------|-----|-------|-------|
| `/salary-research` | company + role + level + location | research | target-companies |
| `/negotiate` | company + offer details | research | salary research, offers.yaml |
| `/app-tracker` | action (add/update/view/stats) | coach | applications.yaml |
| `/weekly-retro` | (none) | coach | all pipeline + interview-history |

### Infrastructure Skills
| Skill | Purpose |
|-------|---------|
| `/setup` | Interactive guided fill of all 6 context files. Subcommands: `/setup experience`, `/setup career-plan`, `/setup companies`, etc. |
| `/setup reset` | Archive current search to `search/archive/{date}/` and start fresh. Keeps vault/ intact. |
| `/daily-briefing` | Daily: interviews today, follow-ups due, stale apps, networking batches ready, pipeline stats |
| `/post` | Quick blackboard write (reuse from Kapi) |

---

## Daily/Weekly Workflow

### Daily Cadence (all through the dashboard)
1. **Morning**: Open `localhost:8791` → Command Center shows urgency items (overdue, due today, upcoming). Coach agent auto-spawns for daily briefing if configured.
2. **As needed**: Click action buttons in dashboard — "Score JD", "Tailor Resume", "Send Connection Batch", "Prep for Interview". Each spawns the appropriate agent in the background.
3. **Auto**: Resume/cover-letter agents include inline review passes (recruiter-review, ATS check). Results appear in dashboard via WebSocket.
4. **Evening**: Update pipeline status in Applying page (click to change status, add notes). Follow-ups auto-generate.

### Weekly Cadence
1. **Friday**: Click "Run Weekly Retro" in Analytics page → Coach agent spawns, analyzes the week, posts report
2. **Strategy**: Coach posts strategy decisions to board. Dashboard shows them in Playbook page.

---

## Dashboard Design

### Theme: Warm Command Center
- **Light base** with warm accents (brown/cream/green palette inspired by GrowthPioneer)
- **Motivational elements**: streak counter, momentum score, win highlights
- **Status colors**: Green (on track), Amber (needs attention), Red (overdue)
- **Typography**: Clean, readable — designed for daily 7am check-in
- NOT Kapi's dark developer theme

### Navigation: Stage-Centric
Maps directly to the 5 lifecycle phases + Command Center + meta views.

```
Sidebar:
  Command Center          ← daily overview: actions, pipeline funnel, momentum
  ─── Lifecycle ───
  Finding Roles           ← target companies, fit scores, new JDs
  Applying                ← resumes, cover letters, applications, work products
  Networking              ← connections, referrals, outreach batches, follow-ups
  Interviewing            ← prep status, upcoming, history, scores
  Closing                 ← offers, negotiation, salary research
  ─── Meta ───
  Analytics               ← weekly trends, response rate, score charts
  Playbook                ← lessons learned, strategy decisions
  ──────────
  📁 Vault                ← source documents (resumes, JDs, transcripts, offers)
  ⚙️ Context              ← your search profile (6 context files)
```

Company detail is a drill-down from any page (click company name → detail view).

### Pages

| Page | Route | Data Source |
|------|-------|-------------|
| Onboarding | `/onboarding` | context/ (redirects here when empty) |
| Command Center | `/` | snapshot.yaml, pipeline/, today's actions |
| Finding Roles | `/finding` | target-companies.yaml, intel/, fit scores |
| Applying | `/applying` | pipeline/applications.yaml, output/resumes/ |
| Networking | `/networking` | connection-tracker.yaml, outreach status |
| Interviewing | `/interviewing` | pipeline/interviews.yaml, interview-history.yaml |
| Closing | `/closing` | pipeline/offers.yaml, salary data |
| Analytics | `/analytics` | entries/ retro files, pipeline trends |
| Playbook | `/playbook` | lessons.md, decisions.yaml |
| Vault | `/vault` | vault/ subfolders + .manifest.yaml |
| Context | `/context` | context/*.yaml with freshness indicators |

---

## Onboarding Flow

### First Visit → `/onboarding` Wizard
When dashboard detects empty context files, redirects to guided wizard. 6 steps, ~25 min, any order.

### Three Input Paths (every step)
1. **📁 Drop file into vault/** — User places file in `search/vault/{subfolder}/`, clicks "Scan Vault" in UI
2. **📤 Upload via browser** — File picker in UI, writes to vault/ via `POST /api/vault/upload`
3. **✏️ Type in UI** — Structured form with smart defaults, inline suggestions

All three paths are always available. The vault path is emphasized because it's the most natural for local-first users.

### Vault Directory (`search/vault/`)
User-facing folder for source documents. Three-tier data model:
- **vault/** = what YOU put in (resumes, JDs, transcripts, offers)
- **context/** = what the SYSTEM extracts and maintains (structured YAML)
- **output/** = what the SYSTEM produces (tailored resumes, prep packages)

`.manifest.yaml` tracks processing status per file (new → parsed → used).

### Steps (Hybrid: Dashboard Forms + CLI for AI-Heavy Steps):

**In the dashboard (forms only, no AI needed):**
- **Career Plan** — Structured form: level, functions, industries, locations, comp floor, deal breakers, weaknesses + mitigations. Writes directly to `career-plan.yaml` via API.
- **Q&A Master** — Pre-load answers: why leaving, salary, visa, weakness, custom Q&As. Writes directly to `qa-master.yaml` via API.
- **Connections** — Optional. Paste names/companies or skip. Writes to `connection-tracker.yaml` via API.

**In the CLI (needs AI for parsing/generation):**
- **Experience Library** — Drop resume in `vault/resumes/` OR upload, then run `/setup experience` in terminal. Claude parses resume into structured YAML, pushes for specificity/metrics, adds STAR stories. Dashboard shows: "Resume uploaded — run `/setup experience` in your terminal to parse it."
- **Target Companies** — Paste list in dashboard OR run `/setup companies` in terminal to auto-generate ~100 targets from career plan with fit scoring. Dashboard handles manual paste; CLI handles AI-generated list.

**Auto-populated (no setup needed):**
- **Interview History** — Starts empty, auto-builds via `/interview-debrief`.

**After setup:**
- **First Action** — Recommends: `/company-research` → `/score-jd [JD]` → `/resume-tailor [JD]`.

The onboarding wizard shows all 6 cards with status. Steps 2, 3, 5 complete entirely in the dashboard. Steps 1, 4 show progress after CLI processing. Step 6 shows "Will populate automatically."

### Context Update Mechanisms
Context files are living documents. 5 update paths:

1. **Context page** (⚙️ sidebar) — Dedicated edit view per file with freshness indicators (✅/⚠️/🔴)
2. **Inline edits** — Click ✏️ on any context data shown in any page → edit in-place
3. **Vault re-scan** — Drop updated files in vault/, click Scan, system re-parses
4. **Auto-updates by agents** — Debrief → interview-history. Research → target-companies. Networking → connection-tracker.
5. **Archivist suggestions** — Banners on Command Center + Context page: "5 companies inactive 3 weeks — still targeting?"

### Vault Page (`/vault`)
Dedicated page for managing source documents. Shows files per subfolder with processing status (🆕 New / ✅ Parsed / 🔄 Re-scan needed). Upload button per folder. "Score All New" for JDs, "Run Debrief on New" for transcripts. Vault summary widget in sidebar.

### API Routes for Vault
- `POST /api/vault/upload` — Accepts multipart form, writes to `search/vault/{subfolder}/`
- `GET /api/vault/scan` — Reads vault, compares against .manifest.yaml, returns new/unprocessed files

**Important: File parsing happens in the CLI, not the dashboard.** Claude Code has the Read tool which can parse PDFs, and agents have the context to make intelligent extraction decisions. The dashboard triggers agent spawns via `POST /api/agent/spawn` which calls the process manager singleton. The Next.js server itself cannot run Claude AI inference directly, but it can spawn Claude Code as a child process through the process manager. When new files are detected:
- Dashboard shows: "2 new files in vault/resumes/ — run `/setup experience` in your terminal to parse them"
- The `/setup` skill reads the vault, detects new files, and processes them conversationally
- For DOCX files, the skill uses `pandoc` or `textutil` (macOS) to convert to text before parsing

This is a deliberate design constraint: the dashboard is for viewing and lightweight editing. Heavy AI processing (parsing, generation, review) happens in the CLI where Claude has full tool access.

---

## Follow-Up Tracking System

Every application, outreach, and referral has a follow-up cadence. Without this, the "compounding" promise breaks.

### Data: Follow-ups split across their source files
- **Application follow-ups** → `pipeline/applications.yaml` (Day 7, 14, 21 check-ins after applying)
- **Networking follow-ups** → `context/connection-tracker.yaml` (Day 3, 7 connection nudges; Day 3, 7 referral nudges)
- **Interview follow-ups** → `pipeline/interviews.yaml` (Day 1 thank-you, Day 7 status check)

Example in `pipeline/applications.yaml`:
```yaml
- id: app-001
  company: Stripe
  role: Staff Engineer
  status: applied
  applied_date: 2026-04-01
  follow_ups:
    - type: application-check
      due: 2026-04-08       # 7 days after apply
      status: pending        # pending | sent | skipped
      sent_date: null
    - type: referral-nudge
      due: 2026-04-04       # 3 days after referral request
      status: sent
      sent_date: 2026-04-04
  resume_version: stripe-staff-v2.md
```

### Surfaced in:
- **Daily Briefing** — "3 follow-ups due today, 2 overdue"
- **Command Center** — urgency badge + follow-up list sorted by due date
- **Applying page** — follow-up status column on each application card
- **Networking page** — follow-up status on connection/referral outreach

### Follow-up Cadences (configurable)
| Event | Follow-up 1 | Follow-up 2 | Follow-up 3 |
|-------|-------------|-------------|-------------|
| Application submitted | Day 7 | Day 14 | Day 21 |
| Connection request sent | Day 3 | Day 7 | Day 14 |
| Referral request sent | Day 3 | Day 7 | — |
| Post-interview | Day 1 (thank you) | Day 7 (check) | — |

### Follow-ups Are Suggestions, Not Hard Deadlines
Follow-up status values: `pending | sent | skipped | dismissed | auto-resolved`
- **dismissed**: User manually dismissed ("I already followed up outside the system")
- **auto-resolved**: Company replied, so follow-up is no longer needed. Detected when application status changes.
- **skipped**: User decided not to follow up on this one

Dashboard shows dismiss/skip buttons on every follow-up item. Follow-ups never nag — they surface once as a suggestion and respect the user's decision.

---

## Command Center Notifications

The Command Center (`/`) shows urgency items on page load by reading pipeline state — no skill invocation needed.

### Urgency Sections (top of Command Center)
```
🔴 OVERDUE (2)
  • Follow up with Stripe recruiter (3 days overdue)
  • Send thank-you note to Anthropic interviewer (1 day overdue)

🟡 DUE TODAY (3)
  • Interview prep needed: Figma onsite tomorrow
  • Connection request follow-up: 5 contacts at Day 3
  • Weekly retro due (Friday)

🟢 UPCOMING (5)
  • Stripe onsite in 3 days — prep status: ✅ ready
  • 12 connection requests ready to send (batch)
  • ...
```

### Sidebar Badge
Sidebar shows a notification count badge on Command Center:
```
Command Center [5]    ← 2 overdue + 3 due today
```

Computed from pipeline state on page load: scan `applications.yaml`, `interviews.yaml`, `connection-tracker.yaml` for items with `due` dates <= today.

---

## Company Intel Starter Database

Pre-seeded `search/intel/` with ~15 top tech companies as templates/demos. Research agent builds profiles for all others via web search.

### Format: `search/intel/{company-slug}.yaml`
```yaml
company: Stripe
slug: stripe
industry: fintech
size: 8000+
interview:
  rounds: 4
  format: ["recruiter-screen", "technical-phone", "system-design", "cross-functional"]
  duration: "3-4 weeks"
  what_they_screen_for: ["system design depth", "API design", "product thinking", "collaboration"]
  common_questions:
    - "Design a payment processing system"
    - "How would you handle idempotency in a distributed payment flow?"
  tips: "Strong emphasis on real-world systems, not leetcode"
comp:
  senior: { base: "180-220K", equity: "150-250K/4yr", total: "250-350K" }
  staff: { base: "220-280K", equity: "250-450K/4yr", total: "350-500K" }
culture:
  values: ["users first", "move with urgency", "think rigorously"]
  notes: "Writing-heavy culture. Expect to present written proposals."
sources:
  - "levels.fyi (2026)"
  - "Glassdoor interviews"
  - "Blind reports"
last_updated: "2026-03-01"
```

### Starter Set (~15 companies, not 50)
Ship 10-15 well-researched companies as examples/demos. The Research agent's web-search profile builder is the primary path — hand-maintained data goes stale within months.

**Starter set**: Google, Meta, Apple, Amazon, Stripe, Anthropic, OpenAI, Figma, Vercel, Datadog, Cloudflare, Databricks, Notion, Linear, Scale AI

These serve as:
1. Templates showing the intel format so Research agent knows what to produce
2. Immediately useful data for the most common target companies
3. Demos during onboarding ("run `/interview-prep Stripe` to see the system work")

For ALL other companies, Research agent builds the profile from scratch via web search. For starter companies, Research enriches/updates the pre-seeded data when they become active targets.

---

## Phased Implementation

### Phase 0: Infrastructure Only (scaffolding that must work before anything else)
- Copy blackboard server/shim, modify `ensureKapiStructure()` for `search/` directory structure (vault/, context/, pipeline/, output/, intel/, entries/, agents/)
- Set `BLACKBOARD_DIR` in `.mcp.json` env to point at `search/`
- Build `cli/job-search.ts` — CLI launcher with `start`, `stop`, `status`, `setup` commands
- Build `lib/process-manager.ts` — on-demand agent spawning, session registry management, `POST /api/agent/spawn` endpoint
- Create `project.config.ts` (`name: 'Search Party'`, `opsDir: 'search'`)
- Create `CLAUDE.md` with job search workflow docs
- Copy `package.json` (update name/description), install deps
- Create `search/` directory tree with empty state files + vault subfolders + `agents/sessions.yaml`
- Copy dashboard shell: layout, globals.css, sidebar with stage-centric nav, useBlackboard hook
- Create empty Command Center page that shows "Welcome — run `job-search setup` to get started" when context is empty
- Create 1 company intel schema template (`search/intel/stripe.yaml`) — full seeding of the 15-company starter set is a Phase 3 task
- **Verify**: `job-search start` boots everything, `npm run build` passes, blackboard server on :8790, dashboard on :8791, `POST /api/agent/spawn` responds, sidebar navigates

### Phase 1: Context System + Setup (the foundation everything depends on)
- Design all 6 context YAML schemas with documented fields and example data
- Build `/setup` skill — conversational guided fill with vault file detection (resume parsing via Read tool for PDFs, pandoc for DOCX)
- Build `lib/context.ts` — read/validate helpers for context files
- Build all 7 agent definitions (coach.md, resume.md, strategist.md, networking.md, interview.md, research.md, archivist.md)
- Build 4 reviewer agent definitions (rubric files)
- Build `/onboarding` wizard page — detects empty context, shows 6-step cards, three input paths per step
- Build `/context` page — settings-style editor with freshness indicators
- Build `/vault` page — file browser with processing status, upload button
- Build `POST /api/vault/upload` and `GET /api/vault/scan` API routes
- **Verify**: `/setup` runs in CLI, parses a resume, fills context files. Dashboard onboarding wizard shows progress. Context page shows filled files.

### Phase 2: Finding Roles + Applying (highest daily-use skills)
- Build `/score-jd` skill + dashboard "Score JD" button on Finding page (user pastes JD → Research agent spawns → 0-100 scoring across 5 dimensions with apply/skip/referral-only recommendation)
- Build `/resume-tailor` skill + "Tailor Resume" button on Applying page (spawns Resume agent with session resume)
- Build `/app-tracker` skill + dashboard application CRUD (add/update from Applying page, follow-up cadence auto-generated)
- Build `lib/parsers.ts` — pipeline YAML parsers
- Build `/finding` dashboard page (target companies, fit scores, "Score JD" action button, new JDs from vault)
- Build `/applying` dashboard page (applications kanban, "Tailor Resume" action, generated resumes, follow-up status)
- Build Command Center with urgency sections (overdue/today/upcoming) + pipeline funnel + sidebar badge
- Wire dashboard actions → `POST /api/agent/spawn` → agent runs → blackboard update → dashboard refresh via WebSocket
- **Verify**: User clicks "Score JD" in dashboard → Research agent spawns → score appears → clicks "Tailor Resume" → Resume agent spawns with session history → resume appears with review → adds to pipeline → Command Center shows follow-up

### Phase 3: Networking + Company Research
- Build `/company-research` — research company or generate ranked target list via web search
- Build `/connection-request` — batch LinkedIn outreach (25 per batch, round-robin across targets)
- Build `/referral-request` — 3-message referral sequence
- Build `/linkedin-audit` — profile vs. target JD comparison
- Build `/daily-briefing` — Coach's daily output: deadlines, follow-ups, stale apps, action items
- Build `/finding` page enhancements (company cards with research status)
- Build `/networking` dashboard page (contact tracker, outreach funnel, follow-up status)
- **Verify**: `/company-research Stripe` enriches intel → `/connection-request` generates batch → `/networking` page shows contacts → `/daily-briefing` surfaces follow-ups

### Phase 4: Interview System
- Build `/interview-prep` — prep package from web research + intel + weakness focus
- Build `/mock-interview` — interactive one-question-at-a-time with Three Laws grading (includes inline interview-grader pass)
- Build `/interview-debrief` — transcript analysis, scoring, rewrites for weak answers (detects vault/transcripts/ files)
- Build `/thank-you-note` — references specific conversation moments
- Build `/interviewing` dashboard page (calendar + history + scores)
- **Verify**: `/interview-prep Stripe` generates prep package from intel → `/mock-interview` grades answers → `/interview-debrief` updates interview-history → `/interviewing` page shows score trends

### Phase 5: Closing + Weekly Analytics
- Build `/cover-letter` — maps top 3 experiences to top 3 JD requirements
- Build `/work-product` — 1-pager analyzing their product (3 types: get-interview, in-process, recovery). Includes inline hiring-manager-review pass.
- Build `/hiring-manager-msg` — outreach leading with work product
- Build `/salary-research` — market comp research via web search
- Build `/negotiate` — offer analysis, leverage points, counter-offer language
- Build `/weekly-retro` — end-of-week performance analysis with coaching
- Build `/closing` dashboard page (offers, negotiation state)
- Build `/analytics` dashboard page (charts: response rate, score trends, conversion funnel)
- Build `/post` skill (adapt from Kapi)
- **Verify**: `/salary-research Stripe Staff` returns comp data → `/negotiate` analyzes offer → `/weekly-retro` produces weekly report → `/analytics` shows trends

### Phase 6: Polish + Integration
- Build `/playbook` page (lessons + strategy decisions)
- Empty state handling for every page: graceful messages + CTA to the right skill/action when data is missing
- Archivist agent integration: auto-suggestions surfaced in Command Center + Context page
- End-to-end test: `/setup` → `/company-research` → `/score-jd [JD]` → `/resume-tailor [JD]` → auto-review → `/app-tracker add` → `/interview-prep` → `/mock-interview` → `/interview-debrief` → `/weekly-retro`
- Documentation finalization in CLAUDE.md + README.md

### Empty State Handling (applies to all phases)
Every dashboard page and skill must handle missing/incomplete data gracefully:
- **Context partially filled**: Skills check which context files exist and warn: "Career plan not set up — run `/setup career-plan` for better results"
- **Zero applications**: Applying page shows: "No applications yet. Drop a JD in vault/job-descriptions/ or run `/score-jd` to get started."
- **No company intel**: Interview prep falls back to web search instead of failing
- **Skill run before setup**: Skills check for context files on startup and redirect to `/setup` if missing critical data
- **Empty pipeline**: Command Center shows onboarding CTA instead of empty urgency sections

---

## Critical Files to Reference During Implementation

| Purpose | Kapi Source Path |
|---------|-----------------|
| Agent definition template | `kapi-sprints/.claude/agents/pm.md` |
| Skill file template | `kapi-sprints/.claude/skills/dev/SKILL.md` |
| Blackboard server (to modify) | `kapi-sprints/blackboard/server.ts` |
| MCP shim (copy as-is) | `kapi-sprints/blackboard/shim.ts` |
| Sidebar pattern | `kapi-sprints/app/_components/sidebar.tsx` |
| Dashboard page pattern | `kapi-sprints/app/dashboard/DashboardView.tsx` |
| Parser pattern | `kapi-sprints/lib/parsers.ts` |
| Project config | `kapi-sprints/project.config.ts` |
| CLAUDE.md template | `kapi-sprints/.claude/CLAUDE.md` |

---

## Verification

After each phase, verify:
1. `npm run build` passes
2. Blackboard server starts on :8790
3. Dashboard loads on :8791 with live WebSocket connection
4. Skills run from Claude Code terminal and produce correct output
5. Generated artifacts appear in `search/output/`
6. Pipeline state updates in `search/pipeline/`
7. End-to-end: `/setup` -> `/score-jd [JD]` -> `/resume-tailor [JD]` -> reviewers auto-fire -> `/app-tracker add` -> pipeline page shows the application

---

## Appendix: Scrutiny Log

Three rounds of critical review were performed before this plan was approved. Below is every issue found and how it was resolved. This log exists so future implementers understand WHY the plan looks the way it does.

### Round 1 (10 issues)

| # | Issue | Resolution |
|---|-------|------------|
| 1 | **Shim is NOT "reuse as-is"** — hardcodes `kapi` dir name on line 469, overwrites `BLACKBOARD_DIR` env on line 476 | Moved shim to "Reuse with Minor Edits." One-line fix: `const kapiDir = process.env.BLACKBOARD_DIR \|\| join(projectDir, 'search')` |
| 2 | **"Auto-trigger reviewer agents" has no mechanism** — plan said agents spawn other agents but never explained how | Reviewers are rubric files used inline within skill instructions as a second pass. Can also be invoked as standalone agents. No separate terminal needed. |
| 3 | **Vault "Scan" is vague on file parsing** — dashboard can't parse PDFs or spawn Claude agents | File parsing happens in CLI only. Dashboard shows status + prompts user to run `/setup experience` in terminal. DOCX conversion via `pandoc`/`textutil`. |
| 4 | **Dashboard route structure doesn't match plan** — `app/` dirs said `pipeline/`, `companies/` but routes said `/finding`, `/applying` | Reconciled: `app/` directories now match stage-centric routes (`finding/`, `applying/`, `networking/`, `interviewing/`, `closing/`) |
| 5 | **Coach agent has too little context** — plan said "summaries only" but weekly retro needs actual data | Expanded Coach context to include interview-history.yaml (score trends) and connection-tracker.yaml (networking velocity). Still excludes experience-library. |
| 6 | **50-company intel database is too much to maintain** — hand-maintained data goes stale fast | Reduced to 15 companies as templates/demos. Research agent's web-search builder is the primary path. |
| 7 | **Follow-up tracking creates phantom state** — auto-generated follow-ups nag when irrelevant | Follow-ups are dismissible suggestions with statuses: `pending`, `sent`, `skipped`, `dismissed`, `auto-resolved`. Never nag. |
| 8 | **Phase 0 is trying to do too much** — included context system + all agent definitions + setup skill | Split: Phase 0 = infrastructure only. Phase 1 = context system + setup. Now 7 phases total. |
| 9 | **`app/` directory routes inconsistent** — old names mixed with new | Fixed throughout — all references now use stage-centric route names. |
| 10 | **No error/empty states designed** — what happens with partial data? | Added "Empty State Handling" section: every page and skill handles missing data gracefully with CTAs to the right next action. |

### Round 2 (8 issues)

| # | Issue | Resolution |
|---|-------|------------|
| 11 | **Design Decision #3 lists old Coach context** — said "summaries only" but agent definition was already fixed | Updated Design Decision #3 to list full Coach context including interview-history and connection-tracker |
| 12 | **Reviewer architecture is contradictory** — described as both "separate agents" and "inline in skills" | Clarified: reviewer `.md` files are **rubric definitions**. Primary use = inline second pass within skills. Secondary use = standalone agent sessions for deep review. |
| 13 | **`/job-fit-scorer` needs experience-library but Research agent doesn't load it** — context mismatch | Noted as cross-cutting skill. Added experience-library to Research agent's accessible context for fit scoring. |
| 14 | **Onboarding wizard can't parse resumes** — dashboard is React, can't run AI | Hybrid onboarding: Career Plan, Q&A Master, Connections work as dashboard forms. Experience Library and Target Companies require CLI (`/setup experience`). |
| 15 | **`search/` mixed with `kapi-sprints/` in root** — messy directory | Acceptable — kapi-sprints stays as reference material. No change needed. |
| 16 | **Stale "~50 companies" text** — body said 15 but intro still said 50 | Fixed intro text to match. |
| 17 | **`backlog.md` and `board.md` may not be needed** — Kapi concepts that don't map to job search | Dropped `backlog.md` (follow-ups tracked in pipeline). Kept `board.md` for blackboard protocol compatibility. |
| 18 | **No data migration/reset story** — what if user wants to start fresh? | Added `search/archive/` directory and `/setup reset` skill that archives current search and starts fresh. Vault stays intact. |

### Round 3 (9 issues)

| # | Issue | Resolution |
|---|-------|------------|
| 19 | **Design Decision #2 still says "agents"** — but they're rubric files | Updated to "4 separate reviewer rubric files" with accurate description. |
| 20 | **Shim fix doesn't actually work** — `.mcp.json` env gets overwritten by hardcoded `kapiDir` in shim spawn | Moved shim to "Minor Edits" with explicit one-line fix documented. The shim's `Bun.spawn` env spread overwrites the var, so the source code must change. |
| 21 | **"Rewrite / Build New" lists old page names** — "Pipeline, Companies, Interviews, Network, Weekly Stats" | Updated to "11 dashboard pages (Command Center, Onboarding, Finding, Applying, Networking, Interviewing, Closing, Analytics, Playbook, Vault, Context)" |
| 22 | **Agent definitions still say "auto-triggers"** — implies spawning agents, contradicts inline mechanism | Changed all 3 agents (resume, strategist, interview) from "Auto-triggers" to "Review: Skills include inline review passes" |
| 23 | **Networking follow-ups in wrong file** — all follow-ups were in `applications.yaml` but networking belongs in `connection-tracker.yaml` | Split: application follow-ups → `applications.yaml`, networking follow-ups → `connection-tracker.yaml`, interview follow-ups → `interviews.yaml` |
| 24 | **`app/api/vault/` comment lists "parse"** — but parsing happens in CLI | Removed "parse" from API route comment. |
| 25 | **`globals.css` is NOT "change title only"** — warm theme requires full CSS rewrite | Moved to "Reuse with Minor Edits" with note: "full theme rewrite, not just a title change" |
| 26 | **Onboarding step numbers are confusing** — 2, 3, 5, then 1, 4, then 6, 7 | Restructured as bullet points grouped by "In dashboard" / "In CLI" / "Auto-populated" — no misleading numbering |
| 27 | **Phase 0 intel seeding is content work** — who writes 15 YAML files? accuracy? | Added note: "AI-generated starter data — accuracy varies, Research agent updates via web search when company becomes active target" |

### Post-Scrutiny Architecture Shift (3 major changes)

After plan approval, fundamental UX questions revealed that the plan needed a deeper architectural shift:

| # | Change | Rationale |
|---|--------|-----------|
| 28 | **Dashboard-first, CLI-launcher architecture** — User runs `job-search start` once, then interacts entirely through the dashboard. Skills become dashboard actions that trigger agent spawns, not CLI slash commands. | Original plan had user typing `/resume-tailor` in terminal. But the natural UX is clicking a button in a dashboard, not memorizing 20 slash commands. The CLI is for infrastructure, not daily workflow. |
| 29 | **On-demand agent spawning with native session resume** — Agents spawn per-task via `claude --agent {name} --resume {session_id}`, not always-running. Process manager handles lifecycle. Session registry (`sessions.yaml`) tracks session IDs. | Three approaches evaluated: (A) always-running agents (expensive, complex), (B) on-demand spawning (clean lifecycle, context isolation built-in), (C) direct API calls (loses Claude Code tool access). Chose B. User requested session continuity across spawns → Claude Code's native session resume gives this for free. |
| 30 | **3-tier memory management with session rotation** — Working memory (ephemeral) → Session memory (Claude Code native resume, persists across spawns) → Structured context (YAML files, permanent). Archivist performs session rotation when sessions bloat: extracts memory primer, archives old session, starts fresh. Durable patterns promoted to context YAML. | GrowthPioneer's approach is stateless: same output on Day 1 and Day 30. Our agents get better over time because session memory carries user preferences, past corrections, and calibrated style. Session rotation prevents unbounded growth while preserving learned knowledge. |
