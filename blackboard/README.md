# Blackboard Server

Coordination layer for multi-agent communication. Runs on port **8790**.

## Components

- **`server.ts`** — Bun HTTP + WebSocket server. Single YAML file as source of truth.
- **`shim.ts`** — MCP stdio proxy. Claude Code sessions use this to read/write the blackboard via `read_blackboard` and `write_to_blackboard` tools.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/state` | Full blackboard state as JSON |
| POST | `/read` | Read state (used by MCP shim) |
| POST | `/write` | Write to a path (triggers WebSocket broadcast) |
| POST | `/register` | Agent shim registration |
| POST | `/unregister` | Agent shim deregistration |
| POST | `/sweep` | Remove stale agents (last_seen > 10 min) |
| GET | `/ws` | WebSocket for live dashboard updates |

## State Structure

```yaml
blackboard:
  project: search
agents:
  research: { status: active, current_task: "..." }
directives: []        # Cross-agent work assignments
findings: {}          # Shared discoveries
log: []               # Activity log
```

## Running

```bash
bun blackboard/server.ts    # Standalone
bun cli/job-search.ts start # As part of full system
```
