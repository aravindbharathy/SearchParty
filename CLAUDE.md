# Search Party

## Project Overview

AI-powered job search system. A Next.js 16 dashboard with a blackboard coordination server for multi-agent workflows. Agents are ephemeral Claude Code sessions spawned on demand.

## Architecture

- **Dashboard**: Next.js 16 on port 8791. Warm cream theme, sidebar navigation.
- **Blackboard Server**: Bun HTTP + WebSocket on port 8790. Single YAML file as source of truth for live coordination state.
- **MCP Shim**: Thin stdio proxy (`blackboard/shim.ts`) that Claude Code sessions use to read/write the blackboard.
- **Process Manager**: Singleton module inside Next.js (`lib/process-manager.ts`) that spawns and tracks Claude agent child processes.
- **CLI Launcher**: `bun cli/job-search.ts` starts/stops all services.

## Key Directories

```
search/                         <- Operations state directory
  vault/                        <- All files (uploads + generated)
    uploads/                    <- User-provided files (survive reset)
      resumes/                  <- Original resume PDFs/DOCXs
      jds/                      <- Job descriptions
      transcripts/              <- Interview transcripts
      portfolio/                <- Portfolio pieces, work samples
      templates/                <- Resume CSS/HTML templates
    generated/                  <- Agent-produced artifacts (cleared on reset)
      resumes/                  <- Tailored resumes (JSON + MD)
      cover-letters/            <- Cover letters
      outreach/                 <- Hiring manager msgs, insight briefs
      prep/                     <- Interview prep packages
      messages/                 <- Networking messages
      closing/                  <- Salary research, negotiation strategies
  context/                      <- User context (experience library, career plan, preferences)
  pipeline/                     <- Application tracking (applications, interviews, offers)
  intel/                        <- Company research files (one YAML per company)
  entries/                      <- Log entries (findings, decisions, etc.)
  agents/                       <- Agent session tracking
  archive/                      <- Archived items

app/                            <- Next.js dashboard
  _components/                  <- Shared components (sidebar, layout shell)
  hooks/                        <- React hooks (useBlackboard WebSocket)
  api/                          <- API routes (agent spawn, context status)

blackboard/                     <- Blackboard server + MCP shim (Bun, excluded from Next.js build)
lib/                            <- Shared modules (process manager)
cli/                            <- CLI launcher
```

## Development Commands

```bash
npm run dev              # Start Next.js dev server on :8791
npm run build            # Production build (must pass before commits)
bun cli/job-search.ts start   # Start all services (blackboard + dashboard)
bun cli/job-search.ts stop    # Stop all services
bun cli/job-search.ts status  # Show service status
```

## Blackboard Protocol

Agents coordinate via the blackboard server. Every agent session gets `read_blackboard` and `write_to_blackboard` MCP tools.

On startup:
1. `read_blackboard` to see current state
2. `write_to_blackboard` to register under `agents.<name>` with role, status
3. Check `directives:` for assigned work

On `<channel>` notification:
1. `read_blackboard` to see what changed
2. Check directives for tasks assigned to you
3. Do the work
4. `write_to_blackboard` to update status and log results

Rules:
- Only write to your own section under `agents.<your_name>`
- Always add a `log_entry` when writing
- Read before writing to avoid stale state

## Context Files

Context files live in `search/context/`. Both `experience-library.yaml` and `career-plan.yaml` must have non-empty arrays for the system to consider setup complete.

- `experience-library.yaml` — Work experiences, projects, accomplishments
- `career-plan.yaml` — Goals, target roles, preferences
- `target-companies.yaml` — Companies of interest
- `resume-master.yaml` — Master resume sections
- `preferences.yaml` — Search preferences (location, comp, etc.)
- `network.yaml` — Professional contacts

## Agent Model Configuration

Configure in `project.config.ts`:

```typescript
// Default model for all agents
export const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Per-agent overrides (agents not listed use DEFAULT_MODEL)
export const AGENT_MODELS: Record<string, string> = {
  // interview: 'claude-opus-4-6',    // deeper reasoning for mocks
  // archivist: 'claude-haiku-4-5-20251001',  // fast/cheap for maintenance
}
```

Available models: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001`

The process manager reads this config when spawning agents. Each agent `.md` file also has a `model:` frontmatter field used when agents are invoked directly via `claude --agent {name}`.

## Conventions

- No dark theme. Warm cream palette defined in `app/globals.css`.
- All pages follow the pattern: server data via API routes, live updates via WebSocket.
- Agent processes are ephemeral. The process manager tracks sessions in `search/agents/sessions.yaml`.
- The `blackboard/` directory is excluded from the Next.js TypeScript build (see `tsconfig.json`).
- Ports: 8790 (blackboard), 8791 (dashboard).
