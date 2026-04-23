# Shared Libraries

Server-side modules used by the Next.js API routes and agent system.

## Files

| File | Purpose |
|------|---------|
| `process-manager.ts` | Spawns and manages Claude agent child processes. Handles persistent sessions, oneOff workers, message queuing, and output recovery. |
| `parsers.ts` | Pipeline data CRUD — applications, interviews, offers. Zod schemas with agent field alias normalization. |
| `context.ts` | Context file read/write — experience library, career plan, interview answers, etc. |
| `paths.ts` | Path helpers — `getSearchDir()`, `getGeneratedDir()`, `getUploadsDir()`. |
| `profile-schema.ts` | Reads `profile-schema.yaml` and checks field completion for the coach page profile panel. |
| `profile-schema.yaml` | Defines profile sections, required fields, and display labels. |
| `resume-types.ts` | Resume data types — section-based architecture (v2) with migration from v1. |
| `playbook.ts` | Playbook CRUD — lessons, decisions, checklists. |
| `agent-utils.ts` | Shared agent utilities — `postToBlackboard`, `waitForCompletion`, `getProcessManager`, `appendRolesToOpenRoles`. |
| `file-lock.ts` | Generic file-level locking using .lock files. Prevents concurrent write corruption. |
| `scanner/` | Zero-token ATS scanner module (adapted from CareerOps). |
| `scanner/ats-scanner.ts` | Main scanner — parallel fetch from 6 ATS platforms with title filtering and dedup. |
| `scanner/detect-ats.ts` | Detect ATS platform from careers URL (Greenhouse, Ashby, Lever, Workday, BambooHR, Teamtailor). |
| `scanner/parsers.ts` | ATS API response parsers — JSON for most, RSS/XML for Teamtailor, POST+pagination for Workday. |
| `scanner/known-ats.ts` | Registry of ~70 companies with known ATS endpoints. Enables zero-token scanning without manual config. |
| `scanner/title-filter.ts` | Broad title filter derived from career plan. Removes clearly irrelevant roles before agent triage. |
| `scanner/dedup.ts` | Deduplication against open-roles.yaml and applications.yaml. |
| `scanner/liveness.ts` | URL liveness classification — active/expired/uncertain with multilingual patterns. |
| `scanner/broad-discovery.ts` | Generates WebSearch queries from career plan for discovering roles at non-target companies. |
