# Search Party — Phase Implementation Guide

Updated: 2026-04-10

## Architecture Patterns (established in Phases 1-3)

### Page Pattern: Tabbed Layout + Agent Chat Sidebar
Every lifecycle page follows this structure:
- **Left 65%**: Tabbed content area with stats bar at top
- **Right 35%**: Persistent agent chat sidebar
- Actions flow through the chat (buttons → sendChatMessage)
- `chatProcessing` derived from `agentStatus === 'running'`
- State persisted to localStorage via `useAgentEvents(persistKey)`
- `usePendingAction` hook picks up navigation from user-action prompts
- `useDirectiveNotifications` shows completed directive banners
- 30-second data polling for auto-dispatched agent results
- `hasSpawnedRef` (useRef) guards initial spawn, survives strict mode
- `waitAndSpawn` pattern: wait for blackboard before spawning

### Agent Pattern: Blackboard Protocol
Every agent message includes a postamble with:
1. **WHEN YOU CANNOT PROCEED** → post user-action directive to `directives` array
2. **UPDATE STATUS** → write to `agents.{name}`
3. **POST FINDING** → write to `findings.{name}`
4. **POST DIRECTIVE** → append to `directives` array
5. **SKIP** for casual Q&A

### Skill Pattern: Prerequisites + User-Action Directives
Every skill file follows SKILL_TEMPLATE.md:
- Prerequisites section checks required context files
- If missing: tell user, post user-action directive (to `directives`, NOT `findings`)
- Step A/B/C pattern for blackboard writes
- Agents read skills via `cat .claude/skills/{name}/SKILL.md`
- Skills are the single source of truth — edit without code changes

### Process Manager
- `globalThis` singleton survives HMR
- `--output-format json` with blackboard MCP channel
- Session tracking in `search/agents/sessions.yaml`
- Blackboard postamble appended to every message
- Model configured in `project.config.ts` (currently `claude-sonnet-4-6`)

---

## Phase 3: Applying (CURRENT — refactor to new patterns)

### Status: Applying page exists but needs redesign to match tabbed layout pattern

### Deliverables

#### 1. Applying Page Redesign (`app/applying/page.tsx`)
**Layout**: Tabbed (65%) + Resume Agent chat (35%)

**Tabs**:
- **Pipeline** — Kanban board (existing, migrate here). Columns: Researching → Applied → Phone Screen → Onsite → Offer → Rejected/Withdrawn. Per-card: fit score, days in stage, follow-up status, actions (update status, tailor resume, view JD).
- **Resumes** — List of generated resumes from `search/output/resumes/`. View, copy, download. Filter by company. Shows which resume was used for which application.
- **Cover Letters** — List from `search/output/cover-letters/`. Same pattern as resumes.
- **Work Products** — Strategic work products from `search/output/work-products/`. These are 1-pagers analyzing company products.

**Chat Sidebar**: Resume agent
- Persistent session with `useAgentEvents('applying-chat')`
- Skill buttons: "Tailor Resume", "Write Cover Letter", "Create Work Product"
- Actions flow through chat

**Stats Bar**: Total apps, Applied, Phone Screen, Onsite, Offers, Response Rate

#### 2. Skills (already exist, add prerequisites)
- `resume-tailor` ✅ (has prerequisites)
- `score-jd` ✅ (has prerequisites)
- `app-tracker` ✅ (self-contained)
- NEW: `cover-letter/SKILL.md`
- NEW: `work-product/SKILL.md`

#### 3. API Routes (already exist)
- `/api/pipeline/applications` ✅
- `/api/pipeline/stats` ✅
- `/api/pipeline/urgency` ✅
- NEW: `/api/pipeline/resumes` — list generated resumes
- NEW: `/api/pipeline/cover-letters` — list generated cover letters

---

## Phase 4: Interviewing (NEW BUILD)

### Deliverables

#### 1. Interviewing Page (`app/interviewing/page.tsx`)
**Layout**: Tabbed (65%) + Interview Agent chat (35%)

**Tabs**:
- **Upcoming** — Interviews scheduled in the next 2 weeks. Per-interview: company, role, round, date/time, prep status (ready/in-progress/not started), interviewer names. Actions: "Prep for This", "View Prep".
- **Prep Packages** — Generated prep materials from `search/output/prep/`. Company-specific: key questions, STAR stories to use, company intel summary, interviewers. Filter by company.
- **History** — Past interviews from `search/context/interview-history.yaml`. Shows date, company, role, round, score, strengths/weaknesses. Score trend chart.
- **Mock** — Interactive mock interview interface. Select company + round type. Agent asks questions one at a time. Three Laws scoring (Structure, Specificity, Skill Demonstration).

**Chat Sidebar**: Interview agent
- Persistent session with `useAgentEvents('interviewing-chat')`
- Skill buttons: "Prep for Interview", "Mock Interview", "Debrief", "Thank-You Note"
- Actions flow through chat

**Stats Bar**: Upcoming, Completed, Avg Score, Strong Areas, Weak Areas

#### 2. Skills (NEW — follow SKILL_TEMPLATE.md)

##### interview-prep/SKILL.md
- **Prerequisites**: career-plan, experience-library, intel/{company} (or fetch via web search)
- **Input**: company + role + round type
- **Output**: `search/output/prep/{company-slug}-{round}.md`
- **Content**: Company overview, role analysis, likely questions (behavioral + technical), STAR stories to use (from experience-library), interviewer research, red flags to address, questions to ask
- **Cross-agent**: Posts finding for coach (prep ready)

##### mock-interview/SKILL.md
- **Prerequisites**: experience-library, qa-master, interview-history (optional)
- **Input**: company + role + round type (behavioral/technical/system-design)
- **Process**: Ask ONE question at a time. Wait for answer. Score using Three Laws (Structure 1-5, Specificity 1-5, Skill Demonstration 1-5). Provide feedback. Ask follow-up or next question.
- **Output**: Score summary + rewrite suggestions
- **Cross-agent**: Posts to interview-history patterns

##### interview-debrief/SKILL.md
- **Prerequisites**: interview-history (creates if missing)
- **Input**: What happened in the interview (user describes or provides transcript)
- **Process**: Extract questions asked, assess answer quality, identify what went well and what to improve, score overall
- **Output**: Updates `search/context/interview-history.yaml` with new entry
- **Cross-agent**: If recurring weakness detected → directive to coach for targeted practice

##### thank-you-note/SKILL.md
- **Prerequisites**: Recent debrief or interview context
- **Input**: company + interviewer name(s)
- **Output**: `search/output/messages/thank-you-{company}-{date}.md`
- **Content**: Personalized thank-you referencing specific conversation moments, reaffirming fit

#### 3. API Routes (NEW)

##### GET /api/pipeline/interviews
- Reads from `search/pipeline/interviews.yaml`
- Returns upcoming + past interviews with prep status

##### POST /api/pipeline/interviews
- Add interview: company, role, round, date, time, interviewer, notes
- Auto-posts directive to interview agent: "Prep package needed"

##### GET /api/pipeline/interview-history
- Reads from `search/context/interview-history.yaml`
- Returns interviews with scores and patterns

##### GET /api/pipeline/prep-packages
- Lists files in `search/output/prep/`
- Returns with company, round, date metadata

#### 4. Data Files
- `search/pipeline/interviews.yaml` — scheduled interviews
- `search/context/interview-history.yaml` — completed interview records + patterns
- `search/output/prep/` — generated prep packages
- `search/output/messages/thank-you-*.md` — thank-you notes

---

## Phase 5: Closing + Analytics (FUTURE)

### Closing Page
**Tabs**: Offers, Negotiation, Salary Research
**Agent**: Strategist agent chat
**Skills**: salary-research, negotiate, hiring-manager-msg

### Analytics Page
**Content**: Pipeline funnel, response rate trends, score trends, networking velocity
**Data**: Computed from pipeline + interview-history + connection-tracker

---

## Phase 6: Polish (FUTURE)

### Playbook Page
**Content**: Strategy decisions, lessons learned
**Data**: From decisions.yaml, lessons.md, weekly retro outputs

### Empty State Handling
Every page: graceful empty states with CTAs pointing to the right skill/page

### End-to-End Test
Full lifecycle: setup → research → score → tailor → apply → prep → interview → debrief → offer → negotiate

---

## Best Practices Checklist (for every new page/feature)

### Page
- [ ] Tabbed layout (65%) + agent chat sidebar (35%)
- [ ] Stats bar at top with key metrics
- [ ] `useAgentEvents(persistKey)` for chat
- [ ] `chatProcessing = agentStatus === 'running'` (derived, not state)
- [ ] `hasSpawnedRef` (useRef, not useState) for spawn guard
- [ ] `waitAndSpawn` pattern for initial agent spawn
- [ ] `usePendingAction` for navigation from user-action prompts
- [ ] `useDirectiveNotifications` for completed directive banners
- [ ] `DirectiveBanner` component rendered inside tab content
- [ ] 30-second polling for auto-dispatched agent results
- [ ] Agent greeting checks context and redirects to coach if missing
- [ ] "Reset" button rotates agent session + clears localStorage
- [ ] Scroll only on `messages.length` change

### Skill
- [ ] Follows SKILL_TEMPLATE.md structure
- [ ] Prerequisites section with context file checks
- [ ] User-action directive posted to `directives` (NOT findings) when context missing
- [ ] Step A/B/C pattern for blackboard writes
- [ ] Quality checks before finalizing output
- [ ] Cross-agent directives for follow-up work
- [ ] Output path specified exactly
- [ ] Read via `cat .claude/skills/{name}/SKILL.md`

### Agent
- [ ] Agent definition in `.claude/agents/{name}.md`
- [ ] 3-phase protocol: ARRIVE → WORK → REPORT
- [ ] Greeting directive checks context, redirects to coach if missing
- [ ] Uses `globalThis` singleton ProcessManager
- [ ] Model from `project.config.ts`

### Reset
- [ ] Clears: entries, output, pipeline, sessions, blackboard file, localStorage
- [ ] Full reset also clears: context files, intel, vault JDs, stale files
- [ ] Calls blackboard `/reset` endpoint to reload
