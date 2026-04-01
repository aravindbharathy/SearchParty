# Phase 2: Finding Roles + Applying

## Goal
The highest daily-use skills. User can score JDs, tailor resumes, and track applications — all from the dashboard. The Finding and Applying pages become functional. Command Center shows urgency items and pipeline funnel. This is the phase where the product becomes usable for a real job search.

## Prerequisites
- Phase 1 gate criteria met
- At least experience-library and career-plan context files are filled
- Agent definitions exist (from Phase 1)
- Process manager can spawn agents (from Phase 0)

## Deliverables

### D0: Pipeline YAML Schemas (full field definitions)

Define full pipeline YAML schemas with all fields, types, and enums:

**`search/pipeline/applications.yaml`**
```yaml
applications:
  - id: ""                        # auto-generated, e.g. "app-001"
    company: ""
    role: ""
    status: ""                    # "researching" | "applied" | "phone-screen" | "onsite" | "offer" | "rejected" | "withdrawn"
    applied_date: ""              # ISO date
    jd_source: ""                 # path to JD file or "pasted"
    resume_version: ""            # path to tailored resume
    fit_score: 0                  # 0-100, from /score-jd
    follow_ups:
      - due: ""                   # ISO date
        type: ""                  # "initial" | "post-apply" | "post-interview" | "negotiation"
        status: ""                # "pending" | "sent" | "skipped" | "dismissed" | "auto-resolved"
        message_summary: ""
    notes: ""
```

**`search/pipeline/interviews.yaml`**
```yaml
interviews:
  - id: ""                        # auto-generated, e.g. "int-001"
    company: ""
    role: ""
    round: ""                     # "phone-screen" | "technical" | "system-design" | "behavioral" | "hiring-manager" | "team-match"
    date: ""                      # ISO date
    time: ""                      # "HH:MM AM/PM TZ" e.g. "2:00 PM PST"
    interviewer: ""               # name or "unknown"
    prep_status: ""               # "not-started" | "in-progress" | "ready"
    prep_package: ""              # path to prep package, populated by /interview-prep
    status: ""                    # "scheduled" | "completed" | "cancelled" | "no-show"
    debrief: ""                   # path to debrief file, e.g. "search/entries/debriefs/int-001.md"
    score: 0                      # 0-100, self-assessed or from debrief
    follow_ups:
      - due: ""
        type: ""
        status: ""
```

**`search/pipeline/offers.yaml`**
```yaml
offers:
  - id: ""                        # auto-generated, e.g. "offer-001"
    company: ""
    role: ""
    date_received: ""             # ISO date
    status: ""                    # "received" | "negotiating" | "accepted" | "declined" | "expired"
    comp:
      base: 0
      equity: 0                   # annualized value
      equity_type: ""             # "RSU" | "ISO" | "options"
      vesting: ""                 # e.g. "4 years, 1 year cliff"
      bonus: 0                    # annual target
      sign_on: 0
      # total is derived/computed (base + equity/4 + bonus) — do NOT manually enter
    market_percentile: 0          # 0-100
    salary_research: ""           # path to salary research file, e.g. "search/entries/salary-{company}-{level}.md"
    negotiation: ""               # path to negotiation file, e.g. "search/entries/negotiate-{company}.md"
    deadline: ""                  # ISO date
```

### D1: `/score-jd` Skill (`.claude/skills/score-jd/SKILL.md`)
**Agent**: Research
**Input**: JD text (pasted or from vault file)
**Reads**: `career-plan.yaml`, `experience-library.yaml`, `intel/{company}.yaml` if exists
**Note**: Uses `experiences` and `skills` sections for matching, plus optionally `education`/`certifications` for completeness scoring.
**Output**: Structured analysis written to `search/entries/` and posted to blackboard
- Fit score (0-100) across 5 dimensions: level match, function match, industry match, skills overlap, culture indicators
- Red flags (visa requirements, relocation, deal breakers from career plan)
- Salary estimate (from intel if available, otherwise range estimate)
- Apply/skip/referral-only recommendation (below 60: skip, 60-75: referral only, 75+: apply)
- Gaps analysis: what the JD asks for that is missing from experience library
- Company intel summary if available
- `--detailed` flag: shows which specific experiences map to which requirements, per-dimension breakdown

**Dashboard integration**: "Score JD" button on Finding page → textarea for JD paste → spawns Research agent → result appears via WebSocket.

### D2: `/resume-tailor` Skill (`.claude/skills/resume-tailor/SKILL.md`)
**Agent**: Resume
**Input**: JD text (pasted or from vault file)
**Reads**: `experience-library.yaml`, `career-plan.yaml`
**Note**: Uses `contact` for resume header, `experiences` for work history bullets, `education` and `certifications` for those sections, `skills` for keyword coverage.
**Output**: Tailored resume written to `search/output/resumes/{company}-{role}-v{N}.md`
- Different bullet ordering, emphasis, and summary per JD
- Built from real experience library data — never fabricates
- Keyword coverage score (% of JD requirements addressed)
- Includes inline recruiter-review pass (reads `.claude/agents/reviewers/recruiter-reviewer.md` rubric)
- Includes inline ATS check pass (reads `.claude/agents/reviewers/ats-checker.md` rubric)
- Posts review findings to blackboard

**Dashboard integration**: "Tailor Resume" button on Applying page → select JD (from vault or paste) → spawns Resume agent with session resume → resume appears in output viewer with review results.

### D3: `/app-tracker` Skill (`.claude/skills/app-tracker/SKILL.md`)
**Agent**: Coach
**Input**: Action + parameters
**Actions**:
- `add {company} {role} {status}` — creates entry in `pipeline/applications.yaml` with auto-generated follow-up cadence
- `update {id} {field} {value}` — updates status, adds notes
- `view` — shows pipeline summary
- `stats` — shows metrics (total apps, response rate, stage distribution)

**Dashboard integration**: Application CRUD directly in the Applying page — add via form, update via click, status changes via dropdown.

### D4: `lib/parsers.ts` — Pipeline YAML Parsers (validates against D0 schemas)
```typescript
// Parse applications.yaml
parseApplications(): Promise<Application[]>
// Parse interviews.yaml
parseInterviews(): Promise<Interview[]>
// Parse offers.yaml
parseOffers(): Promise<Offer[]>
// Add application with auto-generated follow-ups
addApplication(app: NewApplication): Promise<Application>
// Update application field
updateApplication(id: string, field: string, value: any): Promise<Application>
// Get pipeline stats
getPipelineStats(): Promise<PipelineStats>
// Get urgency items (overdue, due today, upcoming)
getUrgencyItems(): Promise<UrgencyItems>
```

### D5: Pipeline API Routes
- `GET /api/pipeline/applications` — list all applications
- `POST /api/pipeline/applications` — add new application
- `PUT /api/pipeline/applications/[id]` — update application
- `GET /api/pipeline/stats` — pipeline metrics
- `GET /api/pipeline/urgency` — overdue/today/upcoming items

### D6: Finding Roles Page (`app/finding/page.tsx`)
Phase 2 Finding page is JD-centric, not company-centric. Shows:
- **Scored JDs** (from `/score-jd`): list of JDs scored with fit score and recommendation
- **"Score JD" action**: textarea to paste JD + "Score" button → spawns Research agent
- **New JDs from vault**: detects files in `vault/job-descriptions/`, shows unscored ones
- **Target companies list** (from setup): shows company names and status — no fit scores yet (deferred to Phase 3 when `/company-research` is built)
- Company intel modal only shows data for the 1 starter company (Stripe). Empty state for companies without intel: "No intel yet — research will be available in Phase 3."
- Empty state: "No target companies yet. Complete setup or run `/setup companies`."

### D7: Applying Page (`app/applying/page.tsx`)
- Kanban board: columns for Researching, Applied, Phone Screen, Onsite, Offer, Rejected, Withdrawn
- Each card: company name, role, days-in-stage, next follow-up, resume version
- "Tailor Resume" button: select JD → spawns Resume agent → shows output
- "Add Application" form: company, role, status, JD link
- Follow-up status visible on each card (pending/overdue indicator)
- Click card → detail panel: full application info, resume link, follow-up history, notes
- Drag-and-drop between columns to update status (nice-to-have, can be dropdown)

### D8: Command Center — Full Implementation (`app/page.tsx`)
Replace stub with full Command Center:
- **Urgency sections**: 🔴 Overdue, 🟡 Due Today, 🟢 Upcoming (reads from pipeline via `/api/pipeline/urgency`)
- **Pipeline funnel**: visual bar showing count at each stage
- **Momentum**: streak counter (consecutive days with activity), total apps this week
- **Quick actions**: "Score a JD", "Tailor Resume", "Add Application" — buttons that navigate to the right page
- **Recent activity**: last 5 agent outputs (from blackboard log)
- Sidebar badge: notification count = overdue + due today items

### D9: Agent Spawn Wiring
Complete the dashboard → process manager → agent → blackboard → dashboard loop:
- Dashboard action (e.g., "Score JD") → `POST /api/agent/spawn { agent: "research", directive: { skill: "score-jd", jd: "..." } }`
- Process manager spawns Claude Code with agent + directive
- Agent writes output to `search/entries/` and `search/output/`
- Agent updates blackboard (writes to appropriate section)
- Blackboard broadcasts via WebSocket
- Dashboard receives update, refreshes relevant component
- Show loading state while agent is running ("Research agent scoring JD...")
- Show result when agent completes

**Spawn-to-result correlation**: The spawn API returns a `spawn_id`. The directive passed to the agent includes this `spawn_id`. When the agent completes, it writes `spawn_id` to its blackboard update. The dashboard subscribes to updates filtered by `spawn_id`. Add timeout (120 seconds) — dashboard shows error if no result. Add `GET /api/agent/spawn/{spawn_id}` status endpoint returning `running` / `completed` / `failed`.

**WebSocket event schema**: Define a WebSocket event schema. The process manager posts structured events to the blackboard: `{ event: 'agent_complete', spawn_id, agent, skill, output_path, status }`. Create a `useAgentEvents` hook that filters blackboard updates by `spawn_id` for specific action-to-result correlation.

**Error handling specification**:
- Spawn timeout: 120 seconds
- Failure detection: non-zero exit + no blackboard update within timeout
- Retry policy: 1 automatic retry, then surface error to user
- Concurrent spawn limit: 1 per agent type, queue additional spawns
- Partial completion detection
- Process manager health check in dashboard

**Session resume**: Use `--resume {session_id}` (not `--continue`) for session resumption. Verify CLI flag composition before implementation.

---

## Implementation Steps (ordered)

1. Define full pipeline YAML schemas (D0) — write schema files with all fields, types, and enums
2. Build `lib/parsers.ts` (D4) — pipeline YAML parsers + urgency calculator
3. Build pipeline API routes (`/api/pipeline/`) (D5)
4. Build `/score-jd` SKILL.md (D1) — combines quick analysis + detailed scoring
5. Build `/resume-tailor` SKILL.md (D2) with inline review passes
6. Build `/app-tracker` SKILL.md (D3)
7. Wire agent spawn loop (D9): dashboard → API → process manager → agent → blackboard → WebSocket → dashboard (including spawn_id correlation, WebSocket event schema, error handling)
8. Build Finding page (D6) with "Score JD" action (JD-centric layout)
9. Build Applying page (D7) with kanban + "Tailor Resume" action
10. Build full Command Center (D8) with urgency sections + pipeline funnel
11. Add sidebar notification badge
12. End-to-end test: Score JD → Tailor Resume → Add to Pipeline → See in Command Center

---

## Testing Criteria

### Automated Tests

| Test | Command/Method | Pass Criteria |
|------|----------------|---------------|
| T2.1: Pipeline parsers | Unit test `lib/parsers.ts` | Parse/write/roundtrip for applications, interviews, offers |
| T2.2: Follow-up auto-generation | Add application via parser | 3 follow-ups created with correct dates (Day 7, 14, 21) |
| T2.3: Urgency calculation | Add app with follow-up due today | `getUrgencyItems()` returns it in "due today" section |
| T2.4: Overdue detection | Add app with follow-up due yesterday | `getUrgencyItems()` returns it in "overdue" section |
| T2.5: Pipeline stats | Add 5 apps with various statuses | `getPipelineStats()` returns correct counts per stage |
| T2.6: Pipeline API CRUD | POST + GET + PUT | Create app, read it back, update status, verify |
| T2.7: Agent spawn API | POST /api/agent/spawn with mock directive | Returns spawn_id, process starts |
| T2.8: Build passes | `npm run build` | Exit code 0 |
| T2.9: Follow-up dismiss | Update follow-up status to "dismissed" | Follow-up no longer appears in urgency items |
| T2.10: Pipeline schema validation | Unit test with sample YAML | All pipeline YAML files (applications, interviews, offers) conform to D0 schemas |
| T2.11: Spawn-id correlation | POST /api/agent/spawn, then GET /api/agent/spawn/{spawn_id} | Status endpoint returns running/completed/failed correctly |
| T2.12: WebSocket event schema | Mock agent completion event | Event matches `{ event, spawn_id, agent, skill, output_path, status }` structure |

### Manual Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| T2.M1: Score JD end-to-end | Paste JD on Finding page, click "Score" | Research agent spawns, loading shown, score appears with 5-dimension breakdown |
| T2.M2: Tailor Resume end-to-end | Click "Tailor Resume" on Applying page, paste JD | Resume agent spawns (with session resume if not first time), resume appears with review results |
| T2.M3: Resume quality | Read generated resume | Uses real experience from library, bullets are specific, keyword coverage shown, review findings present |
| T2.M4: Add application | Fill form on Applying page, submit | Card appears in correct kanban column, follow-ups auto-created |
| T2.M5: Update application status | Change app status via dropdown | Card moves to new column, follow-ups may auto-resolve if company replied |
| T2.M6: Command Center urgency | Add app with follow-up due today, visit `/` | Item appears in "Due Today" section |
| T2.M7: Sidebar badge | Have 3 overdue + 2 due-today items | Badge shows "5" on Command Center nav item |
| T2.M8: Pipeline funnel | Have apps at various stages | Funnel visualization shows correct counts |
| T2.M9: Session resume | (1) Spawn Resume agent, tell it "my preference: always use bullet points, never numbered lists", (2) Spawn Resume agent again with `--resume {session_id}`, ask it to list remembered preferences, (3) Verify it outputs the bullet point preference | Agent recalls the bullet point preference from the previous session |
| T2.M10: Finding page companies | Have target companies from setup | List shows companies (no fit scores — deferred to Phase 3), click shows intel for starter company only |
| T2.M11: Empty states | Visit Finding with no companies, Applying with no apps | Clear CTAs shown, no broken layouts |
| T2.M12: Agent loading state | Click "Score JD" | Loading indicator visible while agent runs, disappears when done |
| T2.M13: Session YAML tracking | Spawn Resume agent once | Verify `sessions.yaml` updated with correct session ID after first spawn |
| T2.M14: Spawn timeout | Simulate agent hang (or very long task) | Dashboard shows error after 120 seconds |
| T2.M15: Spawn-to-result correlation | Click "Score JD", observe spawn_id | Dashboard receives result filtered by the correct spawn_id |

---

## Acceptance Criteria

- [ ] Full pipeline YAML schemas defined (applications, interviews, offers) with all fields, types, and enums
- [ ] User can paste a JD and get a scored analysis via `/score-jd` (0-100 fit score, 5 dimensions, gaps analysis, recommendation, `--detailed` flag for experience mapping)
- [ ] User can generate a tailored resume from a JD, receiving inline recruiter + ATS review
- [ ] Generated resumes are written to `search/output/resumes/` and visible in dashboard
- [ ] User can add, update, and view applications in a kanban board
- [ ] Follow-ups auto-generate with correct cadences (Day 7, 14, 21)
- [ ] Follow-ups can be dismissed/skipped from the dashboard
- [ ] Command Center shows urgency items (overdue, due today, upcoming)
- [ ] Sidebar badge shows notification count
- [ ] Pipeline funnel visualization is accurate
- [ ] Agent spawn → work → result loop works end-to-end through the dashboard with spawn_id correlation
- [ ] Spawn timeout (120s), error handling, and retry (1 automatic) work correctly
- [ ] WebSocket events follow defined schema with spawn_id filtering
- [ ] `GET /api/agent/spawn/{spawn_id}` returns correct status
- [ ] Loading states shown while agents are working
- [ ] Session resume works using `--resume {session_id}` (Resume agent on 2nd run remembers first run's context)
- [ ] `sessions.yaml` updated with correct session ID after agent spawn
- [ ] Finding page is JD-centric: shows scored JDs and target company list (no company fit scores until Phase 3)
- [ ] `npm run build` passes

---

## UX Review

| Criterion | Expected | Check |
|-----------|----------|-------|
| Score JD flow | Paste → click → wait (with spinner) → see result. Under 30 seconds. | [ ] |
| Resume generation flow | Click → select JD → wait → see resume + review. Clear and linear. | [ ] |
| Kanban usability | Cards are readable, status colors are clear, columns aren't crowded | [ ] |
| Follow-up visibility | Overdue items are visually distinct (red). Due-today items are amber. | [ ] |
| Command Center scannability | User can assess their search status in under 10 seconds | [ ] |
| Action discoverability | "Score JD", "Tailor Resume", "Add Application" buttons are prominent and labeled | [ ] |
| Loading state clarity | User knows something is happening (spinner, progress text) and roughly what (agent name) | [ ] |
| Result presentation | Resume is rendered readably, review findings are scannable (pass/fail + details) | [ ] |
| Error handling | If agent spawn fails, user sees a clear error message with retry option | [ ] |
| Empty → populated transition | Going from 0 to 1 application is smooth, kanban doesn't look broken with 1 card | [ ] |

---

## Gate Criteria (must pass before Phase 3)

1. All T2.* automated tests pass (T2.1-T2.12)
2. All T2.M* manual tests pass (T2.M1-T2.M15, especially T2.M1, T2.M2, T2.M9)
3. All acceptance criteria checked
4. Full loop works: Score JD → Tailor Resume → Add to Pipeline → See in Command Center
5. Session resume demonstrated: Resume agent remembers previous interaction
6. UX review completed — daily workflow feels natural
7. `git commit` with clean working tree
