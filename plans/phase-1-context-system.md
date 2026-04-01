# Phase 1: Context System + Setup

## Goal
The foundation that every skill depends on. User can run `/setup` to fill 6 context files, or fill them via dashboard forms. Agent definitions exist. Onboarding wizard guides the user. Vault page manages source documents.

## Prerequisites
- Phase 0 gate criteria met
- All services boot cleanly via `job-search start`

## Deliverables

### D1: Context YAML Schemas (6 files with documented fields)

**`search/context/experience-library.yaml`**
```yaml
contact:
  name: ""
  email: ""
  phone: ""
  linkedin: ""
  location: ""
summary: ""                     # 2-3 sentence career summary
experiences:
  - id: exp-001
    company: ""
    role: ""
    dates: ""                   # "2022-2024"
    projects:
      - name: ""
        metrics: []             # ["Reduced latency from 200ms to 45ms"]
        skills: []              # [distributed-systems, kafka, golang]
        star_stories:
          - situation: ""
            task: ""
            action: ""
            result: ""
education:
  - institution: ""
    degree: ""
    field: ""
    year: ""
certifications: []
skills:
  technical:
    - name: ""
      proficiency: ""           # "expert" | "advanced" | "intermediate" | "beginner"
      years: 0
  leadership: []
```

**`search/context/career-plan.yaml`**
```yaml
target:
  level: ""                     # "Staff Engineer"
  functions: []                 # ["backend", "platform"]
  industries: []                # ["fintech", "developer-tools"]
  locations: []                 # ["SF Bay Area", "Remote"]
  comp_floor: 0                 # minimum total comp
deal_breakers: []               # ["No visa sponsorship", "< 50% remote"]
addressing_weaknesses:
  - weakness: ""
    mitigation: ""
resume_preferences:             # promoted from session memory over time
  format: ""                    # "chronological"
  summary_length: ""            # "2 lines"
  tone: ""                      # "conversational"
  avoid_words: []               # ["spearheaded", "leveraged"]
```

**`search/context/qa-master.yaml`**
```yaml
salary_expectations: ""
why_leaving: ""
greatest_weakness: ""
visa_status: ""                 # "US Citizen" / "H1B" / etc.
custom_qa:
  - q: ""
    a: ""
```

**`search/context/target-companies.yaml`**
```yaml
companies:
  - name: ""
    slug: ""                    # URL-friendly name
    fit_score: 0                # 0-100
    status: ""                  # "researching" | "targeting" | "applied" | "archived"
    priority: ""                # "high" | "medium" | "low"
    notes: ""
```

**`search/context/connection-tracker.yaml`**
```yaml
contacts:
  - id: ""
    name: ""
    company: ""
    role: ""
    relationship: ""            # "cold" | "connected" | "warm" | "referred"
    linkedin_url: ""
    outreach:
      - date: ""
        type: ""                # "connection-request" | "referral-request" | "follow-up"
        status: ""              # "sent" | "replied" | "no-response"
        message_summary: ""
    follow_ups:
      - due: ""
        type: ""                # "connection-nudge" | "referral-step-2" | "referral-step-3"
        outreach_ref: ""        # links back to originating outreach event
        status: ""              # "pending" | "sent" | "skipped" | "dismissed" | "auto-resolved"
    notes: ""
```

**`search/context/interview-history.yaml`**
```yaml
interviews: []                  # populated by /interview-debrief
patterns:
  strong_areas: []
  weak_areas: []
  avg_score: 0
  total_interviews: 0
```

### D2: `/setup` Skill (`.claude/skills/setup/SKILL.md`)
Conversational guided fill of context files. Subcommands:
- `/setup` — full guided setup (all 6 files)
- `/setup experience` — experience library only (parses resume from vault)
- `/setup career-plan` — career plan only
- `/setup qa` — Q&A master only
- `/setup companies` — target companies (AI-generated list from career plan)
- `/setup connections` — connection tracker
- `/setup reset` — archive current search, start fresh

Key behaviors:
- Detects files in `vault/resumes/`, offers to parse them
- Reads PDFs via Claude's Read tool, converts DOCX via `pandoc`/`textutil`
- Pushes for specificity: flags vague bullets, suggests metrics
- Writes structured YAML to `search/context/` files
- Updates `vault/.manifest.yaml` with processed file status

### D3: 7 Agent Definitions (`.claude/agents/*.md`)
Each agent file follows the template from `kapi-sprints/.claude/agents/pm.md`:
- YAML frontmatter: `name`, `description`, `model`, `tools`
- Startup instructions: what to read on start
- Role description: what the agent does
- Context files: what to load
- Write protocol: what to update on the blackboard
- Completion: what to do when done

Agents: `coach.md`, `resume.md`, `strategist.md`, `networking.md`, `interview.md`, `research.md`, `archivist.md`

### D4: 4 Reviewer Rubric Files (`.claude/agents/reviewers/*.md`)
Each reviewer defines:
- What artifact it evaluates (resume, work product, interview answer)
- The evaluation rubric (criteria, scoring, pass/fail)
- Output format (findings posted to blackboard)

Each rubric file must be structured for inline consumption: clear scoring criteria, concrete examples of pass/fail, and output format. The SKILL.md for skills like `/resume-tailor` will include an instruction: "After generating the resume, read `.claude/agents/reviewers/recruiter-reviewer.md` and evaluate your output against the rubric. Report findings." This works because the skill runs within a single Claude Code session that can read files.

Reviewers: `recruiter-reviewer.md`, `ats-checker.md`, `hiring-manager-reviewer.md`, `interview-grader.md`

### D5: `lib/context.ts` — Context File Helpers
```typescript
// Read and validate a context file
readContext(name: string): Promise<object>
// Write structured data to a context file (acquires file lock before writing)
writeContext(name: string, data: object): Promise<void>
// Check if a context file has been filled (non-empty)
isContextFilled(name: string): Promise<boolean>
// Get freshness info (last modified date)
getContextFreshness(name: string): Promise<{ filled: boolean, lastModified: Date | null }>
// Get all context statuses for onboarding progress
getAllContextStatus(): Promise<Record<string, { filled: boolean, lastModified: Date | null }>>
// Acquire file-level lock (.lock file) with 5-second timeout
acquireLock(name: string): Promise<() => void>  // returns release function
```

**Concurrency handling**: Include a simple file-level lock: acquire `.lock` file before writing with 5-second timeout. Both dashboard API routes and agent write protocols use this lock. Known limitation: concurrent writes from multiple agents to the same file will queue, not merge.

### D6: Onboarding Wizard Page (`app/onboarding/page.tsx`)
- Detects context file status via `GET /api/context/status`
- Shows 6 cards (one per context file) with status: ✅ Filled / ⚪ Not started
- **Experience Library is the FIRST card, prominently shown.**
  - If `vault/resumes/` has files, show "Resume detected — click Process to parse it" with a button that triggers agent spawn via process manager (spawns the Research agent to parse the resume — this is not CLI-only).
  - If no files, show upload area + "Or run `/setup experience` in terminal for a conversational walkthrough."
- Dashboard-native steps (Career Plan, Q&A Master, Connections) have inline forms
- CLI-required steps (Target Companies) show upload area + "Run `/setup companies` in terminal" prompt
- Auto-populated step (Interview History) shows "Will populate automatically"
- Progress bar: N/6 complete
- "Get Started" button when minimum context is filled (experience + career plan)
- **CLI pre-setup option**: `job-search setup` CLI command runs `/setup experience` conversationally BEFORE opening the dashboard, so users arrive with 1/6 already complete.

### D7: Context Page (`app/context/page.tsx`)
Settings-style editor showing all 6 context files:
- Card per file: name, one-line summary of contents, last modified date, freshness indicator (✅/⚠️/🔴)
- Click "Edit" → expands to structured form editor
- Dashboard-native files editable inline
- CLI-required files show "Run `/setup experience` to update" + vault status

### D8: Vault Page (`app/vault/page.tsx`)
- Shows `search/vault/` subfolders with file counts
- File list per folder with processing status (🆕 New / ✅ Parsed / 🔄 Re-scan needed)
- Upload button (browser file picker → `POST /api/vault/upload`)
- "Scan Vault" button → `GET /api/vault/scan` → shows new files detected
- Shows absolute path to vault folder for local file drops
- Per-folder actions: "Score All New" (JDs), "Run Debrief on New" (transcripts) — stubs for Phase 2+

### D9: Vault API Routes
- `POST /api/vault/upload` — Accepts multipart form, writes to `search/vault/{subfolder}/`
- `GET /api/vault/scan` — Reads vault, compares against `.manifest.yaml`, returns new/unprocessed files

### D10: Context API Routes
- `GET /api/context/status` — Returns filled/empty status + freshness for all 6 files
- `GET /api/context/[name]` — Returns parsed content of a specific context file
- `PUT /api/context/[name]` — Writes structured data to a context file (for dashboard forms). The API route validates incoming data against Zod schemas before writing. Returns 400 with field-level errors on invalid data. Each context file has a corresponding Zod schema in `lib/context.ts`.

**Note on agent spawning**: The dashboard triggers agent spawns via `POST /api/agent/spawn` through the process manager. The statement "dashboard cannot spawn agents" in the vault section means the Next.js server process cannot directly run Claude AI inference, but it CAN trigger agent spawns through the process manager API.

### D11: Root Page Update (`app/page.tsx`)
Update Command Center to redirect to `/onboarding` when context is empty (experience-library + career-plan not filled).

---

## Implementation Steps (ordered)

1. Create `lib/context.ts` with read/write/validate helpers
2. Design and document all 6 YAML schemas (write to `search/context/` as examples)
3. Create context API routes (`/api/context/`)
4. Create vault API routes (`/api/vault/`)
5. Write all 7 agent definition `.md` files
6. Write all 4 reviewer rubric `.md` files
7. Build `/setup` SKILL.md with full instructions
8. Build onboarding wizard page
9. Build context editor page
10. Build vault manager page
11. Update root page with onboarding redirect
12. Test full setup flow: drop resume → `/setup experience` → check context page

---

## Testing Criteria

### Automated Tests

| Test | Command/Method | Pass Criteria |
|------|----------------|---------------|
| T1.1: Context read/write | Unit test `lib/context.ts` | Read returns valid typed object, write persists to disk, roundtrip preserves data |
| T1.2: Context validation | Unit test with invalid data | Returns clear error for missing required fields |
| T1.3: Context status API | `GET /api/context/status` | Returns 6 entries with `filled: boolean` and `lastModified` for each |
| T1.4: Context CRUD API | `PUT /api/context/career-plan`, then `GET` | Written data matches read data |
| T1.5: Vault upload API | `POST /api/vault/upload` with test file | File appears in `search/vault/{subfolder}/` |
| T1.6: Vault scan API | Add file to vault, `GET /api/vault/scan` | Returns list including new file with status "new" |
| T1.7: Manifest tracking | Upload file, scan, parse, re-scan | Status changes: new → parsed. Already-parsed files not re-listed. |
| T1.8: Build passes | `npm run build` | Exit code 0 |
| T1.9: Agent files exist | Check filesystem | All 7 agent `.md` files exist in `.claude/agents/` with valid YAML frontmatter |
| T1.10: Reviewer files exist | Check filesystem | All 4 reviewer `.md` files exist in `.claude/agents/reviewers/` |
| T1.11: Setup skill exists | Check filesystem | `.claude/skills/setup/SKILL.md` exists with valid frontmatter |
| T1.12: Reviewer rubric inline | Manually run `/resume-tailor` | Verify the skill reads and applies a reviewer rubric — review findings appear in the output |
| T1.13: Schema conformance | Unit test `lib/context.ts` with sample filled context file | Parse a sample filled context file — all fields present and typed correctly |
| T1.14: Round-trip via API | `PUT /api/context/{name}` then read via `lib/context.ts` | Data is consistent between API write and lib read |
| T1.15: Golden sample fixtures | Unit test with YAML fixtures | Golden sample YAML test fixtures parse without error and match expected types |
| T1.16: Agent smoke test | Script checking all 7 agent `.md` files | Each agent file has valid YAML frontmatter (name, description, model, tools) and all referenced file paths (context files) match actual file locations in `search/` |

### Manual Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| T1.M1: Onboarding redirect | Open dashboard with empty context | Redirects to `/onboarding` |
| T1.M2: Onboarding cards | View onboarding page | 6 cards visible with correct statuses, progress shows 0/6 |
| T1.M3: Dashboard form — Career Plan | Fill career plan form on onboarding page, submit | `career-plan.yaml` updated on disk, card shows ✅ |
| T1.M4: Dashboard form — Q&A Master | Fill Q&A form, submit | `qa-master.yaml` updated, card shows ✅ |
| T1.M5: Dashboard form — Connections | Add 2 contacts, submit | `connection-tracker.yaml` updated, card shows ✅ |
| T1.M6: Vault upload | Upload a .txt file via vault page | File appears in vault folder and file list |
| T1.M7: Vault drop | Place file directly in `search/vault/resumes/`, click Scan | File detected as new |
| T1.M8: `/setup experience` | Drop resume PDF in vault, run `/setup experience` in Claude Code | Experience library populated with structured data |
| T1.M9: Context page | After filling 3+ context files, visit `/context` | Cards show correct fill status and freshness |
| T1.M10: Onboarding progress | After filling experience + career plan, check onboarding | Progress shows 2/6, "Get Started" button appears |
| T1.M11: Post-setup redirect | Complete minimum context (experience + career plan), go to `/` | Command Center shows (not onboarding redirect) |

---

## Acceptance Criteria

- [ ] All 6 context YAML schemas documented with clear field descriptions
- [ ] `/setup` skill runs in Claude Code and can parse a resume PDF into `experience-library.yaml`
- [ ] `/setup career-plan` fills `career-plan.yaml` conversationally
- [ ] Dashboard onboarding wizard detects empty context and shows 6-step cards
- [ ] Career Plan, Q&A Master, and Connections forms work entirely in the dashboard (no CLI needed)
- [ ] Experience Library and Target Companies correctly direct user to CLI
- [ ] Vault page shows files with processing status
- [ ] File upload via browser works
- [ ] File drop detection (Scan Vault) works
- [ ] Context page shows all 6 files with freshness indicators
- [ ] All 7 agent definitions follow consistent template
- [ ] All 4 reviewer rubrics define clear evaluation criteria and are structured for inline consumption
- [ ] Reviewer rubric can be read and applied by a skill within a single Claude Code session
- [ ] Context API validates input against Zod schemas and returns 400 with field-level errors on invalid data
- [ ] File-level locking works for concurrent context writes
- [ ] All 7 agent definitions have valid YAML frontmatter and referenced context file paths exist
- [ ] Golden sample YAML fixtures parse correctly through `lib/context.ts`
- [ ] Onboarding redirects to Command Center once minimum context is filled
- [ ] `npm run build` passes

---

## UX Review

| Criterion | Expected | Check |
|-----------|----------|-------|
| Onboarding clarity | User immediately understands what to do (6 steps, any order) | [ ] |
| Progress visibility | Progress bar updates in real-time as files are filled | [ ] |
| Form usability | Career plan form has good labels, appropriate input types (dropdowns, multi-select, text) | [ ] |
| CLI handoff | When step requires CLI, the message is clear and includes the exact command to run | [ ] |
| Vault path visibility | User can see the absolute filesystem path where to drop files | [ ] |
| Upload feedback | After upload, user sees the file appear in the list immediately | [ ] |
| Context freshness | Freshness indicators use clear colors (✅ green, ⚠️ amber for >7 days, 🔴 red for >30 days) | [ ] |
| Form validation | Required fields are marked, errors are shown inline | [ ] |
| Mobile/responsive | Onboarding and context pages work on narrow screens | [ ] |

---

## Gate Criteria (must pass before Phase 2)

1. All T1.* automated tests pass (T1.1-T1.16)
2. All T1.M* manual tests pass (T1.M1-T1.M11, especially T1.M8: `/setup experience` can parse a real resume)
3. All acceptance criteria checked
4. UX review completed — onboarding flow is clear and intuitive
5. At least one "test user" can complete setup without getting stuck
6. `git commit` with clean working tree
