# Phase 4: Interview System

## Goal
Build the full interview lifecycle: prep packages from company intel, interactive mock interviews with grading, post-interview debriefs with scoring, and thank-you notes. The Interviewing page shows calendar view, history, and score trends. Interview performance compounds over time.

## Prerequisites
- Phase 3 gate criteria met
- Company intel exists for at least a few target companies
- Interview agent definition exists (from Phase 1)
- `interview-history.yaml` schema defined (from Phase 1)

### Agent Prompt Pattern (applies to all dashboard-triggered skills)
Agents spawned via the dashboard run in -p (print) mode and CANNOT read files.
All context data must be fetched server-side via `POST /api/agent/build-prompt`
and embedded in the prompt before spawning. The process manager routes agent
stdout to the target file via the `write_to` directive field.

Each new skill added in this phase must have a corresponding prompt builder
function in `lib/agent-prompts.ts` that reads the required context files
(e.g., `intel/{company}.yaml`, `qa-master.yaml`, `interview-history.yaml`)
and injects them into the prompt text.

## Deliverables

### D0: Transcript Format Guide
Define canonical transcript format: Markdown with speaker labels (`**Interviewer**: ...` / `**Me**: ...`). Document that Otter (.txt), Granola (.md), and Zoom (.vtt) transcripts should be manually cleaned to this format, or the agent will attempt best-effort parsing. Vault detection reuses the `.manifest.yaml` mechanism from Phase 1.

### D0B: Three Laws Scoring Rubric (`interview-grader.md` detailed spec)
Define anchor points: score 2 = vague, no examples, no structure. Score 5 = adequate structure but generic, few specifics. Score 9 = perfect STAR format, specific metrics, clearly demonstrates the skill. Define per-question-type variants: behavioral uses STAR for Structure; system design uses Problem-Approach-Tradeoffs-Scale. Include 2-3 calibration examples with expected scores. Overall score = geometric mean of three dimensions.

### D1: `/interview-prep` Skill (`.claude/skills/interview-prep/SKILL.md`)
**Agent**: Interview
**Input**: company + role + round (e.g., "Stripe Staff-Engineer system-design")
**Reads**: `intel/{company}.yaml`, `qa-master.yaml`, `interview-history.yaml`, `career-plan.yaml` (for weakness areas)
**Output**: Prep package written to `search/output/prep-packages/{company}-{round}-{date}.md`
- Interview format and timeline for this company
- Likely questions for this specific round (from intel + web research if intel is sparse)
- Interviewer background (if provided — name lookup via web search)
- Your weakness game plan: areas they'll probe based on your career-plan weaknesses
- Product/company talking points: recent launches, strategy, what to have opinions on
- Your STAR stories mapped to likely question types
- Questions to ask them (tailored to role + company)

**Dashboard integration**: "Prep for Interview" button on Interviewing page -> select company/role/round -> spawns Interview agent -> prep package rendered. Company intel, QA master, interview history, and career plan data are injected via the build-prompt API, not read by the agent.

### D2: `/mock-interview` Skill (`.claude/skills/mock-interview/SKILL.md`)
**Agent**: Interview
**Input**: company + role + round-type (e.g., "Stripe Staff-Engineer behavioral")
**Reads**: prep package (if exists), `qa-master.yaml`, `interview-history.yaml` (to target weak areas)
**Behavior**: Interactive, one question at a time
1. Agent asks a question appropriate to the round type
2. User answers
3. Agent grades the answer using Three Laws rubric (inline from `interview-grader.md`):
   - **Structure** (1-10): Was the answer organized? (STAR format, clear opening)
   - **Specificity** (1-10): Real examples, metrics, names? Or vague generalities?
   - **Skill Demonstration** (1-10): Did the answer prove the skill being evaluated?
4. Agent provides a rewrite using the user's REAL experience from `qa-master.yaml`/experience library
5. Repeats for 5-8 questions
6. Final debrief: overall score, strongest answer, weakest answer, focus areas

**Output**: Session summary written to `search/entries/mock-{company}-{date}.md`
**Updates**: `interview-history.yaml` with scores per question type

**Dashboard integration**: Mock interviews run in the CLI only. The dashboard "Mock Interview" button shows: "Run `/mock-interview Stripe Staff-Engineer behavioral` in your terminal for an interactive practice session." The session results (scores, rewrites) are written to `search/entries/mock-{company}-{date}.md` and `interview-history.yaml`, then appear on the Interviewing page via WebSocket update. Rationale: the fire-and-forget agent spawn architecture cannot support multi-turn interactive dialogue. Building a WebSocket chat channel is out of scope.

### D3: `/interview-debrief` Skill (`.claude/skills/interview-debrief/SKILL.md`)
**Agent**: Interview
**Input**: transcript text (pasted or from `vault/transcripts/` file)
**Reads**: `interview-history.yaml`
**Output**: Debrief written to `search/entries/debrief-{company}-{date}.md`
- Every question categorized by type (behavioral, technical, system design, product sense, etc.)
- Every answer scored on Three Laws (Structure, Specificity, Skill Demonstration)
- Moments where value was left on the table: "At the 14-minute mark, you gave a generic answer about stakeholder conflict — here's how to rewrite it using your Affirm Card launch story"
- Rewrites for weak answers using real experience
- Pattern analysis: compare to previous interviews — improving? Same mistakes?

**Updates**: `interview-history.yaml` with new interview entry, pattern updates
**Dashboard integration**: "Debrief Interview" button -> paste transcript or select from vault -> spawns Interview agent -> debrief appears with scored answers. Interview history and transcript content are injected via the build-prompt API, not read by the agent. For vault transcripts, the build-prompt API reads the file content server-side.

### D4: `/thank-you-note` Skill (`.claude/skills/thank-you-note/SKILL.md`)
**Agent**: Interview
**Input**: company + interviewer name
**Reads**: most recent debrief entry for this company
**Output**: Thank-you note written to `search/output/messages/thankyou-{company}-{interviewer}.md`
- References specific conversation moments from the debrief (not "thanks for your time")
- Mentions a topic discussed that you found interesting
- Brief and professional — under 150 words
- If debrief exists: uses actual conversation details
- If no debrief: asks user for key discussion points

### D5: Interview Pipeline Integration
- `pipeline/interviews.yaml` schema:
```yaml
interviews:
  - id: int-001
    company: Stripe
    role: Staff Engineer
    round: system-design
    date: "2026-04-10"
    time: "2:00 PM PST"
    interviewer: "Jane Doe"
    prep_status: ready         # not-started | in-progress | ready
    prep_package: "output/prep-packages/stripe-system-design-2026-04-10.md"
    status: scheduled          # scheduled | completed | cancelled | no-show
    debrief: null              # path to debrief entry
    score: null                # overall score from debrief
    follow_ups:
      - type: thank-you
        due: "2026-04-11"     # Day 1
        status: pending
      - type: status-check
        due: "2026-04-17"     # Day 7
        status: pending
```

**Data flow**: `pipeline/interviews.yaml` = scheduled real interviews (what's happening). `context/interview-history.yaml` = cumulative scoring data and patterns (what you've learned). Debrief updates BOTH: sets `score` and `debrief` path in pipeline, appends scoring data to history. Mock interviews update ONLY `interview-history.yaml` (practice scores affect patterns but are not real interviews). Add `source: real | mock` field to history entries. Score API reads `interview-history.yaml` for trends, `pipeline/interviews.yaml` for per-interview detail.

- `context/interview-history.yaml` entry schema:
```yaml
interviews:
  - date: "2026-04-10"
    company: Stripe
    round: system-design
    source: real          # real | mock
    questions:
      - type: system-design
        topic: "Design a rate limiter"
        scores: { structure: 7, specificity: 6, skill_demonstration: 8 }
        overall: 7
    overall_score: 7.0
patterns:
  strong_areas: [{ area: "behavioral-leadership", avg_score: 8.2, count: 5 }]
  weak_areas: [{ area: "system-design-estimation", avg_score: 5.1, count: 3 }]
```

### D6: Interviewing Page (`app/interviewing/page.tsx`)
- **Upcoming interviews**: timeline/calendar view showing next interviews with prep status (🔴 Not prepped / 🟡 In progress / 🟢 Ready)
- **History**: past interviews with scores, company, round type
- **Score trends**: chart showing Three Laws scores over time (line chart, one line per dimension)
- **Weak areas**: extracted from `interview-history.yaml` patterns — "System design estimation: avg 5.2/10"
- **Actions**: "Prep for Interview", "Mock Interview", "Debrief Interview", "Send Thank You"
- "Add Interview" form: company, role, round, date, time, interviewer name
- Click past interview → detail view with full debrief, scores, rewrites

### D7: Interview API Routes
- `GET /api/pipeline/interviews` — list all interviews
- `POST /api/pipeline/interviews` — add new interview
- `PUT /api/pipeline/interviews/[id]` — update interview
- `GET /api/pipeline/interviews/scores` — score history for charts

### D8: Vault Transcript Detection
- Vault page shows `vault/transcripts/` with "Run Debrief" action for each unprocessed transcript
- Dashboard detects new transcripts and surfaces: "New transcript detected — run debrief?"

---

## Implementation Steps (ordered)

1. Define `pipeline/interviews.yaml` schema + add to parsers. Install charting library: `npm install recharts`. All chart components must be client components (`'use client'`). Define score API response shape for the chart data.
2. Build interview API routes
3. Build `/interview-prep` SKILL.md
4. Build `/mock-interview` SKILL.md (with inline interview-grader rubric)
5. Build `/interview-debrief` SKILL.md
6. Build `/thank-you-note` SKILL.md
7. Build Interviewing page: upcoming timeline, history, score trends
8. Wire interview actions to agent spawns
9. Add interview follow-ups to Command Center urgency
10. Add transcript detection to Vault page
11. End-to-end test: add interview → prep → mock → debrief → scores update → trends visible

---

## Testing Criteria

### Automated Tests

| Test | Command/Method | Pass Criteria |
|------|----------------|---------------|
| T4.1: Interview YAML parse | Unit test parsers | Parse/write/roundtrip for interviews |
| T4.2: Prep status tracking | Add interview with no prep | Status shows "not-started", changes to "ready" after prep agent runs |
| T4.3: Score history | Add 3 debriefed interviews | Score API returns sorted history with per-dimension scores |
| T4.4: Interview follow-up creation | Add completed interview | Thank-you follow-up created (Day 1), status-check (Day 7) |
| T4.5: Interview follow-ups in urgency | Add interview with thank-you due today | `getUrgencyItems()` includes it |
| T4.6: Pattern extraction | After 3 debriefs with low system-design scores | `interview-history.yaml` patterns show system-design as weak area |
| T4.7: Build passes | `npm run build` | Exit code 0 |

### Manual Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| T4.M1: Interview prep | Click "Prep for Interview", select Stripe system-design | Prep package generated with: company-specific questions, weakness game plan, STAR mappings |
| T4.M2: Mock interview | Click "Mock Interview", do behavioral round | Agent asks questions one at a time, grades each, provides rewrites, gives final debrief |
| T4.M3: Three Laws scoring | Answer a mock question | Score shown for Structure, Specificity, Skill Demonstration (each 1-10) |
| T4.M4: Interview debrief | Paste interview transcript | Every question categorized, every answer scored, rewrites for weak moments |
| T4.M5: Thank-you note | Generate after debrief | References specific conversation moments from the actual interview |
| T4.M6: Score trends | After 3+ debriefs, check Interviewing page | Line chart shows scores improving/declining over time |
| T4.M7: Weak area detection | After debriefs with consistent weakness | Weak areas section highlights the pattern |
| T4.M8: Prep status on timeline | Add interview, then prep for it | Status changes from 🔴 to 🟢 on the timeline |
| T4.M9: Transcript from vault | Drop transcript in `vault/transcripts/` | Vault page shows it, "Run Debrief" action available |
| T4.M10: Session resume — Interview | Run mock twice | Second mock targets weak areas identified in first mock |
| T4.M11: Compound learning | After 5 mocks, run prep for new company | Prep mentions specific weak areas to practice based on history |

---

## Acceptance Criteria

- [ ] User can generate a company-specific prep package with questions, weakness plan, and STAR mappings
- [ ] Mock interview runs in CLI with interactive one-question-at-a-time Three Laws grading
- [ ] Mock interview rewrites answers using user's real experience, not fabrications
- [ ] Dashboard "Mock Interview" button directs user to CLI command
- [ ] Three Laws rubric has calibration examples and anchor point definitions
- [ ] Interview debrief categorizes every question and scores every answer
- [ ] Debrief identifies specific moments where value was left on the table
- [ ] Thank-you notes reference actual conversation moments
- [ ] `interview-history.yaml` accumulates scores and patterns across interviews with `source: real | mock` field
- [ ] Transcript format guide documented (Markdown with speaker labels)
- [ ] `interview-history.yaml` entry schema matches defined spec (per-question scores, patterns section)
- [ ] Interviewing page shows upcoming interviews with prep status
- [ ] Score trends chart shows Three Laws dimensions over time
- [ ] Weak areas are auto-detected and surfaced
- [ ] Interview follow-ups (thank-you, status-check) appear in Command Center
- [ ] Vault transcript detection works
- [ ] Session resume works: Interview agent remembers prior mocks and targets weak areas
- [ ] `npm run build` passes

---

## UX Review

| Criterion | Expected | Check |
|-----------|----------|-------|
| Prep package scannability | Key info (format, questions, weaknesses) findable in under 60 seconds | [ ] |
| Mock interview flow | Feels like a real practice session, not a form-fill | [ ] |
| Three Laws scoring clarity | User understands what Structure, Specificity, Skill Demonstration mean | [ ] |
| Debrief actionability | User can immediately see which answers to improve and how | [ ] |
| Score trends usefulness | Chart shows clear trajectory — user knows if they're getting better | [ ] |
| Weak area specificity | "System design estimation" not just "system design" — specific enough to practice | [ ] |
| Timeline readability | Upcoming interviews scannable: date, company, round, prep status | [ ] |
| Thank-you personalization | Note feels genuine, not AI-generated template | [ ] |
| Mock interview UX | The interactive Q&A format works well in the dashboard (or clear CLI redirect) | [ ] |

---

## Gate Criteria (must pass before Phase 5)

1. All T4.* automated tests pass
2. All T4.M* manual tests pass (especially T4.M2, T4.M4, T4.M10)
3. All acceptance criteria checked
4. Compound learning demonstrated: Interview agent improves targeting after 3+ sessions
5. Score trends chart shows real data from test debriefs
6. UX review completed — interview workflow supports deliberate practice
7. `git commit` with clean working tree
