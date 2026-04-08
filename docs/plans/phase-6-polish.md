# Phase 6: Polish + Integration

## Goal
Ship a complete, production-quality system. Playbook page, comprehensive empty state handling, Archivist integration for memory maintenance, and a full end-to-end test across the entire job search lifecycle. Everything works together.

## Prerequisites
- Phase 5 gate criteria met
- All 20 skills from Phases 1-5 built and working (3 additional archivist skills are built in this phase)
- All dashboard pages functional
- Accumulated real data from testing prior phases

### Agent Prompt Pattern (applies to all dashboard-triggered skills)
Agents spawned via the dashboard run in -p (print) mode and CANNOT read files.
All context data must be fetched server-side via `POST /api/agent/build-prompt`
and embedded in the prompt before spawning. The process manager routes agent
stdout to the target file via the `write_to` directive field.

Archivist skills in this phase must also follow this pattern. The build-prompt
API reads context YAML files, preferences files, and interview history
server-side and embeds them in the prompt.

## Deliverables

### D1: Playbook Page (`app/playbook/page.tsx`)
- **Lessons learned**: renders `search/lessons.md` as formatted cards
- **Strategy decisions**: renders `search/decisions.yaml` as decision cards
  - Each decision: date, context, decision, consequences, status (active/superseded)
  - Searchable/filterable by topic
- "Add Lesson" button → form or CLI prompt
- "Add Decision" button → form or CLI prompt
- Shows Archivist suggestions (promoted patterns from agent session rotations)

### D2: Empty State Handling (all pages)

**Note**: The empty state messages in this plan are draft copy. Add a review step after implementation: dedicated copy review pass across all 14 states for tone consistency. Consider a constants file (`lib/empty-states.ts`) for easy updates.

Every page must handle its empty state gracefully:

| Page | Empty State | CTA |
|------|-------------|-----|
| Command Center | "Welcome! Complete setup to get started." | → /onboarding |
| Command Center (post-setup) | "No activity yet. Score your first JD to get started." | → /finding with "Score JD" highlighted |
| Finding Roles | "No target companies yet." | "Complete setup" or "Generate Target List" button |
| Finding (no JDs scored) | "Drop a JD in vault/job-descriptions/ or paste one below." | Inline JD paste area |
| Applying | "No applications yet." | "Score a JD first, then tailor a resume." → /finding |
| Applying (no resumes) | Companies in pipeline but no resumes | "Tailor Resume" button per application |
| Networking | "No contacts yet." | "Generate Connection Batch" button |
| Networking (contacts, no outreach) | Contacts exist but nothing sent | "These contacts have no outreach. Generate messages?" |
| Interviewing | "No interviews scheduled." | "Add Interview" form visible |
| Interviewing (no scores) | Interviews exist but no debriefs | "Debrief your interviews to start tracking scores." |
| Closing | "No offers yet. Keep going!" | Motivational + pipeline stats |
| Analytics | "Not enough data yet." | "Run your first weekly retro after a week of activity." |
| Playbook | "No lessons or decisions recorded yet." | "Lessons accumulate from debriefs and retros." |
| Vault (empty subfolder) | "No files in resumes/." | "Drop files here or use the upload button." |
| Context (unfilled file) | "Experience library not set up." | "Run `/setup experience` or fill in the dashboard." |

Implementation: each page component checks data availability before rendering main content. Empty state component is reusable with customizable message + CTA.

### D3: Archivist Integration

The Archivist agent (`archivist.md`) is wired into the system:

**Auto-trigger scenarios** (spawned by process manager):
- After each `/interview-debrief`: Archivist updates `interview-history.yaml` patterns (strong/weak areas, avg scores)
- After each `/weekly-retro`: Archivist checks all context files for staleness
- On explicit request: `POST /api/agent/rotate { agent: "resume" }` → Archivist extracts memory primer, archives session, starts fresh

**Archivist suggestions** surfaced in UI:
- Command Center: banner with pending suggestions ("5 companies inactive 3 weeks — still targeting?")
- Context page: per-file suggestions ("Interview scores show weakness in estimation — add to career plan weaknesses?")
- Suggestions have Accept/Dismiss buttons → Accept updates the relevant context file

**Session rotation** (redesigned — Claude Code handles session memory compression internally, so the Archivist NEVER reads Claude Code session internals):
- Each agent maintains its own preferences file (`search/agents/{name}-preferences.md`) — SKILL.md instructions tell the agent to append new preferences after each spawn.
- On rotation: Archivist reads the preferences file (a normal file on disk), promotes durable patterns to context YAML files, then archives the preferences file and starts fresh.
- New session is started with `--session-id {new-uuid}`. On the first spawn with the new session ID, the process manager includes the memory primer text as part of the directive/prompt context. The agent's SKILL.md also includes: "On startup, read `search/agents/{name}-preferences.md` if it exists and load those preferences."
- Promotes durable patterns to context YAML files (e.g., resume preferences → career-plan.yaml)

### D3A: `/archivist-update` Skill
Post-debrief pattern extraction. Reads `interview-history.yaml`, extracts strong/weak area patterns, updates patterns section.

### D3B: `/archivist-audit` Skill
Staleness check. Reads all 6 context files, checks last-modified dates, flags stale entries, generates suggestions.

### D3C: `/archivist-rotate` Skill
Session rotation. Reads `search/agents/{name}-preferences.md`, promotes patterns to context YAML, archives preferences file, starts fresh session. On the first spawn with the new session ID, the process manager includes the memory primer text as part of the directive/prompt context. The agent's SKILL.md also includes: "On startup, read `search/agents/{name}-preferences.md` if it exists and load those preferences."

### D4: Archivist API Routes
- `GET /api/archivist/suggestions` — pending suggestions for all context files
- `POST /api/archivist/accept` — accept a suggestion (updates context file)
- `POST /api/archivist/dismiss` — dismiss a suggestion
- `POST /api/archivist/rotate` — trigger session rotation for an agent

### D5: Reusable Empty State Component
```typescript
// app/_components/empty-state.tsx
<EmptyState
  icon="📋"
  title="No applications yet"
  description="Score a JD first, then tailor a resume."
  action={{ label: "Score a JD", href: "/finding" }}
/>
```

### D6: End-to-End Integration Test
The end-to-end test has two layers: (a) Automated integration tests (Vitest + Playwright): verify data flow — create YAML files, verify API reads them, verify dashboard routes render without crash, verify DOM elements present. (b) Manual Acceptance Test Checklist: the 9-step script for a human to follow.

```
1. Setup: /setup experience (parse test resume)
         /setup career-plan (fill career plan form)
         /setup qa (fill Q&A answers)

2. Find:  Score a test JD via dashboard → verify score appears
         /company-research for the company → verify intel created

3. Apply: Tailor resume via dashboard → verify resume in output/
         Add application via dashboard → verify in pipeline
         Verify follow-up auto-created

4. Network: Generate connection batch → verify 25 messages
           Add referral request → verify 3-message sequence
           Verify follow-ups in connection-tracker

5. Interview: Add interview to pipeline
             Generate prep package → verify output
             Run mock interview (abbreviated — 2 questions)
             Debrief with test transcript → verify scores in history
             Generate thank-you note → verify references conversation

6. Close:  Research salary for the company
          Input offer details → verify in offers.yaml
          Run negotiation analysis → verify counter-offer generated

7. Analytics: Run weekly retro → verify snapshot updated
             Check analytics page → verify charts render with data

8. Memory:  Verify session resume works (resume agent remembers prefs from step 3)
           Check that interview-history patterns updated after debrief

9. Cleanup: Verify all output files exist in correct locations
           Verify all YAML files parse correctly
           Verify dashboard shows correct data on all pages
```

### D7B: Known Limitations Document
Include: no mobile access, no calendar integration, no email/LinkedIn integration (copy-paste only), no push notifications, no PDF export (Markdown only), no multi-user, no data backup. Add a Phase 7 Roadmap section listing: PDF export (md-to-pdf), mobile PWA, calendar .ics export, data backup strategy.

### D7: Documentation
- `CLAUDE.md`: Complete project instructions, blackboard protocol, skill conventions, context file docs
- `README.md`: User-facing setup guide, architecture overview, feature list
- Update PLAN.md with final implementation notes

---

## Implementation Steps (ordered)

1. Build reusable empty state component
2. Add empty state handling to all 11 pages (draft copy — review pass later)
3. Build Playbook page (lessons + decisions)
4. Build `/archivist-update` skill (D3A)
5. Build `/archivist-audit` skill (D3B)
6. Build `/archivist-rotate` skill (D3C)
7. Build Archivist API routes
8. Wire Archivist auto-triggers (post-debrief, post-retro)
9. Build Archivist suggestions UI in Command Center and Context page
10. Implement session rotation flow (preferences-file-based, not session-internal)
11. Write Known Limitations document (D7B)
12. Run automated integration tests (Vitest + Playwright), fix issues
13. Run Manual Acceptance Test Checklist, fix issues
14. Empty state copy review pass across all 14 states for tone consistency (consider `lib/empty-states.ts`)
15. Polish: loading states, error messages, transitions
16. Write documentation (CLAUDE.md, README.md)
17. Final build verification

---

## Testing Criteria

### Automated Tests

| Test | Command/Method | Pass Criteria |
|------|----------------|---------------|
| T6.1: Empty state rendering | Unit test EmptyState component | Renders icon, title, description, CTA correctly |
| T6.2: Every page empty state | Visit each page with empty data | No crashes, appropriate message shown |
| T6.3: Playbook — lessons render | Add entries to lessons.md | Cards render correctly |
| T6.4: Playbook — decisions render | Add entries to decisions.yaml | Decision cards render with all fields |
| T6.5: Archivist suggestions API | `GET /api/archivist/suggestions` | Returns array of suggestions with accept/dismiss actions |
| T6.6: Archivist accept | `POST /api/archivist/accept` with suggestion | Context file updated accordingly |
| T6.7: Session rotation | Trigger rotation for agent | Preferences file archived, new session created with primer from preferences + context YAML |
| T6.7B: Archivist update skill | Run `/archivist-update` after debrief | `interview-history.yaml` patterns section updated |
| T6.7C: Archivist audit skill | Run `/archivist-audit` | Stale context files flagged with suggestions |
| T6.7D: Archivist rotate skill | Run `/archivist-rotate resume` | Preferences file archived, patterns promoted to context YAML |
| T6.7E: Agent preferences file | Spawn agent twice | Preferences file (`search/agents/{name}-preferences.md`) has entries from both spawns |
| T6.8: All YAML files valid | Parse every YAML in search/ | All parse without errors |
| T6.9: Build passes | `npm run build` | Exit code 0, zero warnings |
| T6.10: No Kapi references | Grep for "kapi" in all non-kapi-sprints files | Zero matches (except plan docs referencing it intentionally) |

### Manual Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| T6.M1: End-to-end lifecycle | Follow the 9-step Manual Acceptance Test Checklist | All steps complete, all data flows correctly |
| T6.M2: Empty → populated | Start with clean state, complete setup, score 1 JD | Transition from empty states to populated gracefully on all pages |
| T6.M3: Archivist suggestions | After debriefs show a weakness pattern | Suggestion appears in Command Center: "Add X to career plan weaknesses?" |
| T6.M4: Accept suggestion | Click Accept on Archivist suggestion | Context file updated, suggestion dismissed |
| T6.M5: Session rotation | Manually trigger rotation for resume agent | Preferences file archived, new session pre-loaded with primer, agent still knows preferences |
| T6.M6: Playbook useful | After 2 weeks of usage (simulated) | Lessons and decisions provide actionable history |
| T6.M7: Full dashboard walkthrough | Navigate every page, click every major action | No broken links, no missing data, no crashes |
| T6.M8: Error recovery | Kill blackboard server, refresh dashboard | Graceful degradation, reconnection on server restart |
| T6.M9: Documentation completeness | Follow README setup guide from scratch | A new user can get running without asking questions |

---

## Acceptance Criteria

- [ ] Playbook page renders lessons and decisions correctly
- [ ] Every page has appropriate empty state with clear CTA
- [ ] No page crashes or shows blank content with empty data
- [ ] Archivist suggestions surface in Command Center and Context page
- [ ] Archivist suggestions can be accepted (updates context) or dismissed
- [ ] Session rotation works: reads preferences file, promotes patterns, archives, starts fresh (never reads Claude Code session internals)
- [ ] Rotated agent maintains learned preferences via memory primer derived from preferences file
- [ ] Archivist `/archivist-update`, `/archivist-audit`, and `/archivist-rotate` skills are functional
- [ ] Each agent writes to its own preferences file (`search/agents/{name}-preferences.md`)
- [ ] Known Limitations document is complete and accurate
- [ ] Automated integration tests pass (Vitest + Playwright: data flow, API reads, route rendering)
- [ ] Manual Acceptance Test Checklist completes: setup → find → apply → network → interview → close → analytics
- [ ] All output files in correct locations with valid content
- [ ] All YAML files parse correctly
- [ ] Dashboard shows accurate data on all pages
- [ ] Session resume demonstrated across 2+ spawns for at least 3 agents
- [ ] CLAUDE.md and README.md are complete and accurate
- [ ] `npm run build` passes with zero warnings
- [ ] No hardcoded "kapi" references remain

---

## UX Review

| Criterion | Expected | Check |
|-----------|----------|-------|
| Empty states are helpful, not frustrating | User knows exactly what to do next | [ ] |
| Empty states have personality | Messages are encouraging, not robotic ("No offers yet. Keep going!") | [ ] |
| Playbook is browsable | Lessons and decisions are scannable, filterable | [ ] |
| Archivist suggestions are non-intrusive | Banners can be dismissed, don't block workflow | [ ] |
| Error messages are actionable | User knows what went wrong and what to try | [ ] |
| Loading → loaded transitions | No flash of empty state before data loads | [ ] |
| Overall visual consistency | All pages use same component library, spacing, typography | [ ] |
| Color palette consistent | Warm theme applied uniformly, no rogue styles | [ ] |
| Navigation complete | User can reach every feature within 2 clicks from any page | [ ] |
| First-run experience | New user goes from `job-search start` to first scored JD in under 30 min | [ ] |
| Documentation clarity | README answers: what is this, how to install, how to use | [ ] |

---

## Gate Criteria (project complete)

1. All T6.* automated tests pass
2. All T6.M* manual tests pass (especially T6.M1: full end-to-end lifecycle)
3. All acceptance criteria checked
4. UX review completed with no blockers
5. Full end-to-end lifecycle tested with realistic data
6. Session resume + rotation demonstrated
7. Documentation complete (CLAUDE.md + README.md)
8. `npm run build` passes with zero errors and zero warnings
9. `git commit` with clean working tree — ready for release
