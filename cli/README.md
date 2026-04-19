# CLI Launcher

Single entry point for starting and managing all Search Party services.

## Usage

```bash
bun cli/job-search.ts start    # Start blackboard (:8790) + dashboard (:8791)
bun cli/job-search.ts stop     # Graceful shutdown of all services
bun cli/job-search.ts status   # Show running services, agent counts
```

## What `start` does

1. Starts the blackboard server on port 8790
2. Waits for it to be ready (health check)
3. Starts the Next.js dashboard on port 8791
4. Stores PIDs in `search/.pids/` for shutdown
5. Opens browser to the dashboard

## Process management

PIDs are tracked in `search/.pids/blackboard` and `search/.pids/dashboard`. The `stop` command reads these and sends SIGTERM.
