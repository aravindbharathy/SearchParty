# Phase 0: Infrastructure

## Goal
Get the skeleton running: CLI launcher boots everything, blackboard server manages state, dashboard shell loads with sidebar navigation, agent spawn API responds to requests. No skills, no agents, no content — just the plumbing.

## Prerequisites
- Node.js 18+, Bun runtime installed
- `kapi-sprints/` available as reference in project root

## Deliverables

### D1: Blackboard Server (`blackboard/server.ts`)
Copy from `kapi-sprints/blackboard/server.ts` and modify:
- Change `DIR` default from `kapi` to `search`
- Rewrite `ensureKapiStructure()` → creates: `vault/{resumes,job-descriptions,transcripts,offers,cover-letters,misc}`, `context/`, `pipeline/`, `output/{resumes,cover-letters,work-products,messages}`, `intel/`, `entries/`, `agents/`, `archive/`
- Bootstrap YAML files with initial content:
  - `snapshot.yaml`: `phase: 0\nstatus: setup\nupdated: ""`
  - `decisions.yaml`: `decisions: []`
  - `board.md`: `# Board\n\n_No directives yet._`
  - `lessons.md`: `# Lessons\n\n_No lessons yet._`
  - `pipeline/applications.yaml`: `applications: []`
  - `pipeline/interviews.yaml`: `interviews: []`
  - `pipeline/offers.yaml`: `offers: []`
  - 6 context files with empty schemas (reference Phase 1 schema definitions): e.g., `context/experience-library.yaml`: `experiences: []`, `context/career-plan.yaml`: `goals: []`, etc.
  - `vault/.manifest.yaml`: `files: []`
  - `agents/sessions.yaml`: `sessions: {}`

  D14's "context files are empty" check means: `experience-library.yaml` has `experiences: []` (empty array). Both `experience-library.yaml` and `career-plan.yaml` must have non-empty arrays to be considered "filled".
- Add `priority?: 'P0' | 'P1' | 'P2'` and `due?: string` to Directive interface
- Update directive creation endpoint to accept and store `priority`/`due`

**Source reference:** `kapi-sprints/blackboard/server.ts` (598 lines)

### D2: MCP Shim (`blackboard/shim.ts`)
Copy and modify from `kapi-sprints/blackboard/shim.ts`. Changes required at multiple locations:
- Line 469: rename `kapiDir` variable → `searchDir`, change default from `'kapi'` to `process.env.BLACKBOARD_DIR || 'search'`
- Line 471: update comment referencing kapi directory
- Line 485: update log message from kapi to search
- Line 41: update GCP project reference (remove or replace)
- Rename all internal `kapi` references to `search`

IMPORTANT: Strip out `ensureServerRunning()` and `ensureDashboardRunning()` functions entirely. The CLI launcher (`job-search start`) manages all service lifecycles. Keeping these would create zombie services that `job-search stop` cannot kill.

Remove all Gemini-related code from the shim: lines ~38-218 (Gemini config, detection, API calls), tool definitions (`gemini_query`, `gemini_review_code`, etc.), and tool handlers. Job Search OS does not use Gemini.

**Source reference:** `kapi-sprints/blackboard/shim.ts` (531 lines)

### D3: Blackboard package.json (`blackboard/package.json`)
Copy from `kapi-sprints/blackboard/package.json`. Rename any kapi references in package name/description to job-search-os.

### D4: Process Manager Singleton (`lib/process-manager.ts`)
New file. Singleton module (NOT a separate HTTP service) that lives inside the Next.js process. This eliminates the extra port (:8792), the proxy layer, and the extra failure mode. The singleton module manages:
- Child process spawning for Claude agents
- Session registry (reads/writes `search/agents/sessions.yaml`)
- Lifecycle tracking: start → monitor → capture output → update blackboard → mark complete
- For first spawn of an agent: creates new session, records ID
- For subsequent spawns: uses `--resume {session_id}` flag
- `POST /rotate` logic for session rotation

IMPORTANT: Verify Claude Code CLI flags before implementation. The correct invocation may be `claude --agent {name} --resume {session_id} -p` (not `--continue`). Also verify `--session-id {uuid}` for creating new named sessions (used during session rotation in Phase 6). Add Phase 0 validation step: run `claude --help` and verify that `--agent`, `--resume`, `--session-id`, and `-p` (print/non-interactive) compose correctly. If they do not, fallback: each spawn includes the agent definition in the prompt context instead of using `--agent`.

### D5: CLI Launcher (`cli/job-search.ts`)
New file. Bun script that provides:
```
job-search start   — Starts blackboard server (:8790) and Next.js dashboard (:8791). Opens browser.
job-search stop    — Graceful shutdown of all services
job-search status  — Shows running services, port allocations, agent spawn stats
job-search setup   — Launches /setup skill interactively (Phase 1 — stub for now)
```
Manages PID files in `search/.pids/` for stop/status. Only 2 services (no separate process manager — that is a singleton module inside Next.js, see D4).

CLI launcher creates `search/.pids/` on first run if it does not exist.

Error handling: (1) Check port availability before starting each service, (2) If service N fails, stop services 1..N-1 and report error, (3) Clear error messages for: missing `bun`, port in use, missing `node_modules`.

### D6: Project Configuration (`project.config.ts`)
Adapt from `kapi-sprints/project.config.ts`:
```typescript
import { resolve } from 'path'

export const PROJECT = {
  name: 'Job Search OS',
  short: 'JS',
  description: 'AI-powered job search system',
  repo: '',
  opsDir: 'search',
}

export const OPS_DIR = resolve(process.cwd(), PROJECT.opsDir)        // → search/
export const SEARCH_DIR = OPS_DIR                                     // alias — replaces KAPI_DIR
```
Acceptance criterion: "No references to `KAPI_DIR` in any import."

### D7: MCP Configuration (`.mcp.json`)
Adapt from `kapi-sprints/.mcp.json`:
```json
{
  "mcpServers": {
    "blackboard-channel": {
      "command": "bun",
      "args": ["blackboard/shim.ts"],
      "env": {
        "BLACKBOARD_SERVER": "http://127.0.0.1:8790",
        "BLACKBOARD_DIR": "search"
      }
    }
  }
}
```

### D8: Package Configuration (`package.json`)
Adapt from `kapi-sprints/package.json`:
- Name: `job-search-os`
- Same deps: Next.js 16, React 19, Tailwind CSS 4, yaml, marked. Note: Verify `next@16.1.6` is a stable release. If canary/experimental, pin to latest stable instead.
- Add `"job-search": "bun cli/job-search.ts"` to scripts

### D9: Next.js Config Files
Copy from Kapi:
- `next.config.ts` — as-is (empty config)
- `tsconfig.json` — as-is (path alias `@/*`, exclude `blackboard/`)
- `postcss.config.mjs` — as-is (Tailwind v4 `@tailwindcss/postcss`)

### D10: Global Styles (`app/globals.css`)
Rewrite for warm theme. Include `@theme inline` block to register CSS custom properties as Tailwind tokens:
```css
@import "tailwindcss";

@theme inline {
  --color-bg: #FDF8F4;
  --color-surface: #FFFFFF;
  --color-border: #E8DDD4;
  --color-text: #2D2419;
  --color-text-muted: #8B7E74;
  --color-accent: #B8845C;
  --color-accent-hover: #A06F45;
  --color-success: #4A8C5C;
  --color-warning: #C4943A;
  --color-danger: #C44A4A;
  --color-sidebar-bg: #2D2419;
  --color-sidebar-text: #E8DDD4;
  --color-sidebar-active: #B8845C;
}

:root {
  /* Warm command center palette */
  --color-bg: #FDF8F4;           /* warm cream */
  --color-surface: #FFFFFF;
  --color-border: #E8DDD4;       /* warm gray */
  --color-text: #2D2419;         /* dark brown */
  --color-text-muted: #8B7E74;   /* warm gray text */
  --color-accent: #B8845C;       /* warm brown accent */
  --color-accent-hover: #A06F45;
  --color-success: #4A8C5C;      /* green — on track */
  --color-warning: #C4943A;      /* amber — needs attention */
  --color-danger: #C44A4A;       /* red — overdue */
  --color-sidebar-bg: #2D2419;   /* dark sidebar */
  --color-sidebar-text: #E8DDD4;
  --color-sidebar-active: #B8845C;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, sans-serif;
}
```

### D11: Layout (`app/layout.tsx`)
Adapt from `kapi-sprints/app/layout.tsx`:
- Title: "Job Search OS"
- Description: "AI-powered job search system"
- Import globals.css
- Wrap children with sidebar layout
- Remove `Geist_Mono` import, remove `font-mono bg-zinc-950 text-zinc-100` classes from body, remove `/kapi_logo.png` favicon. Body className should be: `className='antialiased'` (warm theme colors come from globals.css :root variables, not body classes).

### D12: Sidebar (`app/_components/sidebar.tsx`)
Build a NEW simplified sidebar component (not adapted from Kapi's). Just nav items + connection badge. No agent team panel (agents are ephemeral in this architecture). Define prop interface: `{ connected: boolean, urgencyCount: number, activePage: string }`. Place sidebar in a client-side layout wrapper component that manages WebSocket state via `useBlackboard`.

Nav items:
```
Command Center  → /
─── Lifecycle ───
Finding Roles   → /finding
Applying        → /applying
Networking      → /networking
Interviewing    → /interviewing
Closing         → /closing
─── Meta ───
Analytics       → /analytics
Playbook        → /playbook
──────────
Vault           → /vault
Context         → /context
```
- Active state based on current pathname
- Warm dark sidebar theme (dark brown background, cream text)
- Notification badge on Command Center (placeholder — computes in Phase 2)

### D13: WebSocket Hook (`app/hooks/use-blackboard.ts`)
Copy from `kapi-sprints/app/hooks/use-blackboard.ts`. Rename any kapi references. Note: `use-blackboard.ts` may need modification to preserve last-known state on disconnect (see T0.13).

### D14: Command Center Shell (`app/page.tsx`)
Empty welcome page:
- If context files are empty → show "Welcome to Job Search OS. Run `job-search setup` to get started." with a getting-started guide
- If context files exist → show placeholder "Command Center coming in Phase 2"
- "Context files are empty" means: `experience-library.yaml` has `experiences: []` (empty array). Both `experience-library.yaml` and `career-plan.yaml` must have non-empty arrays to be considered "filled".

Pattern: Create an API route `GET /api/context/status` that checks context file fill status (server-side filesystem read). The Command Center page is a Client Component that calls this API on mount and uses `useBlackboard` for live updates. This pattern applies to ALL pages: server data via API routes, live updates via WebSocket.

### D15: Stub Pages for All Routes
Create empty `page.tsx` for each route showing "Coming in Phase N":
- `app/onboarding/page.tsx` → "Coming in Phase 1"
- `app/finding/page.tsx` → "Coming in Phase 2"
- `app/applying/page.tsx` → "Coming in Phase 2"
- `app/networking/page.tsx` → "Coming in Phase 3"
- `app/interviewing/page.tsx` → "Coming in Phase 4"
- `app/closing/page.tsx` → "Coming in Phase 5"
- `app/analytics/page.tsx` → "Coming in Phase 5"
- `app/playbook/page.tsx` → "Coming in Phase 6"
- `app/vault/page.tsx` → "Coming in Phase 1"
- `app/context/page.tsx` → "Coming in Phase 1"

### D16: Agent Spawn API Routes (`app/api/agent/`)
Next.js API routes that call the process manager singleton directly (no proxy layer):
- `POST /api/agent/spawn` → calls `processManager.spawn({ agent, directive })`
- `GET /api/agent/status` → calls `processManager.getStatus()`
- `POST /api/agent/rotate` → calls `processManager.rotateSession(agent)`

These routes import from `lib/process-manager.ts` (D4) — no separate HTTP service involved.

### D17: CLAUDE.md
Write project-specific Claude Code instructions for the job search workflow, blackboard protocol, skill conventions, and context file locations.

### D18: Company Intel Schema Template
Create ONE example intel file (`search/intel/stripe.yaml`) as a schema reference. This serves as the documented schema template. Do not seed 14 more files with fabricated data. Full company intel seeding moves to Phase 3 (when Research agent and /company-research skill exist).

---

## Implementation Steps (ordered)

1. Copy config files: `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` from Kapi
2. Create `package.json`, run `npm install`
3. Create `project.config.ts`, `.mcp.json`
4. Copy and modify `blackboard/server.ts` (D1)
5. Copy and modify `blackboard/shim.ts` (D2) — strip Gemini code, auto-start functions, rename kapi refs
6. Copy `blackboard/package.json`, run `cd blackboard && bun install`
7. Create `lib/process-manager.ts` (D4) — singleton module, no separate service
8. Create `cli/job-search.ts` (D5) — starts 2 services (blackboard + dashboard)
9. Create `app/globals.css` with warm theme + `@theme inline` block (D10)
10. Create `app/layout.tsx` (D11) — clean body className, no Geist_Mono
11. Create `app/_components/sidebar.tsx` (D12) — new simplified component
12. Copy and modify `app/hooks/use-blackboard.ts` (D13)
13. Create `app/page.tsx` and `app/api/context/status/route.ts` — Command Center shell (D14)
14. Create all stub pages (D15)
15. Create `app/api/agent/` routes (D16) — calls singleton process manager
16. Write `CLAUDE.md` (D17)
17. Create 1 company intel schema template (D18)
18. Validate Claude Code CLI flags: run `claude --help`, verify `--agent`, `--resume`, `-p` compose correctly
19. Test `job-search start`
20. Test `npm run build`

---

## Testing Criteria

### Automated Tests

| Test | Command | Pass Criteria |
|------|---------|---------------|
| T0.1: Build passes | `npm run build` | Exit code 0, no TypeScript errors |
| T0.2: Blackboard server starts | `bun blackboard/server.ts` | Logs "blackboard-server: http://localhost:8790", responds to `GET /state` |
| T0.3: Server creates directory structure | Start server, check filesystem | All dirs exist: `search/{vault/resumes, context, pipeline, output, intel, entries, agents, archive}` |
| T0.4: Server creates empty state files | Start server, read files | `snapshot.yaml`, `decisions.yaml`, `board.md`, `lessons.md`, `pipeline/*.yaml`, `context/*.yaml`, `vault/.manifest.yaml`, `agents/sessions.yaml` all exist with valid YAML and correct initial content |
| T0.5: Directives accept priority/due | `POST /directive { text: "test", priority: "P0", due: "2026-04-05" }` | Response `{ ok: true }`, directive in state has priority and due fields |
| T0.6: Process manager singleton loads | Import `lib/process-manager.ts` in a test script | `getStatus()` returns `{ active: 0, agents: {} }` |
| T0.7: Agent spawn endpoint responds | `POST /api/agent/spawn { agent: "test", directive: {} }` | Returns `{ ok: true, spawn_id: "..." }` (may fail to actually spawn Claude — that's fine for Phase 0) |
| T0.8: CLI launcher starts all services | `bun cli/job-search.ts start` | Both services start (blackboard + dashboard), PID files created in `search/.pids/` |
| T0.9: CLI launcher stops cleanly | `bun cli/job-search.ts stop` | All services stop, PID files removed |
| T0.10: Dashboard loads | Open `http://localhost:8791` | Page renders without errors |
| T0.11: WebSocket connects | Dashboard loads, check connection badge | Shows "live" or connected indicator |
| T0.12: Intel schema template valid | Parse `search/intel/stripe.yaml` | File parses as valid YAML with required fields: `company`, `slug`, `industry`, `interview`, `comp` |
| T0.13: WebSocket reconnects after server restart | Restart blackboard server while dashboard is open | Dashboard preserves last-known state during reconnection, no full page flash |
| T0.14: Context status API | `GET /api/context/status` | Returns JSON with fill status of context files |

### Manual Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| T0.M1: Full boot sequence | Run `job-search start` | Terminal shows all ✅, browser opens to dashboard |
| T0.M2: Sidebar navigation | Click each nav item | URL changes, correct stub page shows for each route |
| T0.M3: Welcome message | Open dashboard with empty context | Shows "Welcome to Job Search OS. Run `job-search setup` to get started." |
| T0.M4: Theme appearance | Visual inspection | Light background, warm brown accents, dark sidebar, readable text |

---

## Acceptance Criteria

- [ ] `job-search start` boots blackboard server (:8790) and dashboard (:8791) from a single command
- [ ] `job-search stop` cleanly shuts down all services
- [ ] `job-search status` shows running services and ports
- [ ] `npm run build` passes with zero errors
- [ ] Dashboard loads at `localhost:8791` with warm theme
- [ ] All 10 sidebar nav items render and navigate to correct routes
- [ ] WebSocket connection to blackboard server is live
- [ ] WebSocket preserves last-known state during reconnection (no full page flash)
- [ ] Command Center shows welcome message when context files are empty
- [ ] Blackboard server creates full `search/` directory structure on first run
- [ ] All bootstrapped state files are valid YAML with correct initial content
- [ ] `POST /directive` accepts `priority` and `due` fields
- [ ] `POST /api/agent/spawn` endpoint responds (agent spawn may fail — that's Phase 1)
- [ ] `GET /api/context/status` returns context file fill status
- [ ] 1 company intel schema template (`stripe.yaml`) exists and parses correctly
- [ ] Grep all project files (excluding `kapi-sprints/` and `plans/`) for 'kapi' — zero matches
- [ ] No references to `KAPI_DIR` in any import
- [ ] `search/.pids/` directory is created on first `job-search start`
- [ ] CLI reports clear errors for: missing `bun`, port in use, missing `node_modules`
- [ ] All 14 automated tests (T0.1–T0.14) pass
- [ ] All 4 manual tests (T0.M1–T0.M4) pass

---

## UX Review

| Criterion | Expected | Check |
|-----------|----------|-------|
| First impression | User sees a clean, warm dashboard with clear "get started" messaging | [ ] |
| Navigation clarity | All sidebar items have clear labels, active state is visible | [ ] |
| Theme consistency | No Kapi dark theme remnants, warm palette throughout | [ ] |
| Empty state messaging | Every stub page says "Coming in Phase N" — not a blank page or error | [ ] |
| Color contrast | Text is readable on all backgrounds (WCAG AA minimum) | [ ] |
| Responsive sidebar | Sidebar doesn't overflow, text doesn't wrap awkwardly | [ ] |
| Loading state | Dashboard doesn't flash white before rendering | [ ] |
| Connection indicator | WebSocket status visible (live badge in sidebar or footer) | [ ] |

---

## Gate Criteria (must pass before Phase 1)

1. All T0.* automated tests pass
2. All T0.M* manual tests pass
3. All acceptance criteria checked
4. UX review completed — no blockers
5. `git commit` with clean working tree — no uncommitted changes
