# Phase 3: Networking + Company Research

## Goal
Build the outreach engine. User can research companies, generate batch connection requests, manage referral sequences, and get daily briefings — all from the dashboard. The Networking page becomes the relationship management hub.

## Prerequisites
- Phase 2 gate criteria met
- Pipeline and application tracking working
- Agent spawn loop proven end-to-end

## Deliverables

### D1: `/company-research` Skill (`.claude/skills/company-research/SKILL.md`)
**Agent**: Research
**Input**: Company name OR "generate-targets"
**Reads**: `target-companies.yaml`, `career-plan.yaml`
**Output**:
- Single company: creates/updates `search/intel/{company-slug}.yaml` with interview format, rounds, questions, comp data, culture notes. Sources: web search (Glassdoor, Blind, levels.fyi, company careers page).
- "generate-targets": reads career plan, web-searches for matching companies, generates ranked list of ~100 with fit scores. Writes to `target-companies.yaml`.

**Dashboard integration**: "Research Company" button on Finding page (single company input) + "Generate Target List" button (auto-generates from career plan).

### D2: `/connection-request` Skill (`.claude/skills/connection-request/SKILL.md`)
**Agent**: Networking
**Input**: batch-size (default 25)
**Reads**: `target-companies.yaml`, `connection-tracker.yaml`, `experience-library.yaml`
**Output**: Up to batch-size personalized LinkedIn connection requests, each under 300 characters

The agent web-searches each target company to discover contactable people (engineers, hiring managers, recruiters) before generating messages. Batch size is a soft cap: generates up to N messages, minimum 1 per targeted company. If fewer than batch-size contacts can be found, generate fewer. Write discovered contacts to `connection-tracker.yaml` as new entries. Note: execution time is 2-5 minutes for 25 contacts due to web search per company.

- Round-robin across target companies (not all messages to one company)
- Each message references something specific (shared background, mutual connection, company news)
- `experience-library.yaml` is read for "shared background" personalization. "Mutual connection" references require user-provided info in connection-tracker notes (no LinkedIn API access).
- Writes generated messages to `search/output/messages/connection-batch-{date}.md`
- Updates `connection-tracker.yaml` with new contacts and outreach records
- Creates follow-ups (Day 3, 7, 14) in connection-tracker with `type` field (`connection-nudge`) and `outreach_ref` linking back to the originating outreach event

**Dashboard integration**: "Generate Connection Batch" button on Networking page → shows generated messages for review → user copies to LinkedIn.

### D3: `/referral-request` Skill (`.claude/skills/referral-request/SKILL.md`)
**Agent**: Networking
**Input**: contact name + company
**Reads**: `connection-tracker.yaml`
**Output**: 3-message sequence
1. Initial warm-up / ask (Day 0)
2. Strong push with specifics (Day 3 if no response)
3. Hiring manager identification fallback (Day 7 if no response)
- Writes to `search/output/messages/referral-{company}-{contact}.md`
- Updates connection-tracker with outreach record + follow-up schedule
- Follow-ups include `type` field (`referral-step-2`, `referral-step-3`) and `outreach_ref` linking back to the originating outreach event

**Dashboard integration**: Click contact → "Request Referral" → generates sequence → user sends.

### D4: `/linkedin-audit` Skill (`.claude/skills/linkedin-audit/SKILL.md`)
**Agent**: Networking
**Input**: none (reads profile context)
**Reads**: `career-plan.yaml`, top 5 target JDs from `vault/job-descriptions/`
**Output**: Before/after suggestions for LinkedIn profile sections (headline, about, experience, skills)
- Compares profile positioning against target JDs
- Specific edits, not vague advice
- Writes to `search/output/messages/linkedin-audit-{date}.md`

### D5: `/daily-briefing` Skill (`.claude/skills/daily-briefing/SKILL.md`)
**Agent**: Coach
**Input**: none
**Reads**: `pipeline/applications.yaml`, `pipeline/interviews.yaml`, `connection-tracker.yaml`, `snapshot.yaml`, `board.md`
**Output**: Daily status written to `board.md` and posted to blackboard
- Overdue follow-ups (with exact names and actions)
- Interviews coming up (with prep status)
- Stale applications (no activity in 7+ days)
- Networking batch ready (if connection-request cadence is due)
- Pipeline summary (apps by stage)
- Suggested actions for today

**Dashboard integration**: Command Center auto-loads daily briefing data on page load. Optional: auto-spawn Coach agent on first dashboard visit of the day.

**Testing note**: For Phase 3 testing, seed `pipeline/interviews.yaml` with 2 test interview entries manually. Full interview integration testing happens in Phase 4.

### D6: Finding Page Enhancements (`app/finding/page.tsx`)
Add to Phase 2 stub:
- "Research Company" action: single company input → spawns Research agent → intel card appears
- "Generate Target List" action: spawns Research agent → target companies populate
- Company cards show: research status (🆕 No intel / ✅ Researched / 🔄 Needs update), fit score, industry
- Click company → detail modal with full intel (interview format, comp, culture)

### D7: Networking Page (`app/networking/page.tsx`)
- Contact list grouped by company
- Relationship stage badge: Cold → Connected → Warm → Referred (color-coded)
- Outreach timeline per contact (messages sent, replies, follow-ups due)
- "Generate Connection Batch" button → spawns Networking agent → shows generated messages
- "Request Referral" per contact → spawns Networking agent → shows 3-message sequence
- Follow-up tracking: overdue follow-ups highlighted, dismiss/skip buttons
- Stats bar: total contacts, reply rate, referrals secured
- Empty state: "No contacts yet. Run 'Generate Connection Batch' to start networking."

### D8: Networking Follow-up Integration
- Connection-tracker follow-ups surface in Command Center urgency sections
- Daily briefing includes networking follow-ups
- Follow-up dismiss/skip updates `connection-tracker.yaml`

**Urgency provider pattern**: Phase 2 defines a `UrgencyItem` interface and provider pattern: `getApplicationFollowUps()`, `getNetworkingFollowUps()` (added this phase), `getInterviewFollowUps()` (added Phase 4). Each returns `UrgencyItem[]` with: `{ type, source, entity, description, due, status, actionUrl }`. Phase 3 adds the networking provider.

---

## Implementation Steps (ordered)

1. Build `/company-research` SKILL.md
2. Build `/connection-request` SKILL.md
3. Build `/referral-request` SKILL.md
4. Build `/linkedin-audit` SKILL.md
5. Build `/daily-briefing` SKILL.md
6. Add company research actions to Finding page
7. Build Networking page with contact list + outreach timeline
8. Wire networking follow-ups into Command Center urgency
8b. Seed remaining ~14 company intel files from PLAN.md starter set (AI-generated via `/company-research` or manually). This fulfills the "full seeding is a Phase 3 task" promise from PLAN.md.
9. Integrate daily briefing data into Command Center
10. Create test fixtures: sample company intel response, sample set of 5-10 seed contacts in `connection-tracker.yaml`. For web-search-dependent tests, note that results will vary by run — test for structural correctness (output format, file writes) not content quality.
11. End-to-end test: research company → generate connections → track follow-ups → daily briefing surfaces them

---

## Testing Criteria

### Automated Tests

| Test | Command/Method | Pass Criteria |
|------|----------------|---------------|
| T3.1: Company intel YAML valid | Parse generated intel file | Valid YAML with required fields: company, slug, industry, interview, comp |
| T3.2: Target companies generation | After `/company-research generate-targets` | `target-companies.yaml` has entries with fit scores |
| T3.3: Connection batch size | Generate batch of 25 | Up to batch-size messages generated (minimum 1 per targeted company), each under 300 chars |
| T3.4: Round-robin distribution | Generate batch with 10 target companies | Messages distributed across companies, not all to one |
| T3.5: Referral sequence length | Generate referral for a contact | 3 messages generated (initial, push, fallback) |
| T3.6: Follow-up creation | After connection batch | Follow-ups created in connection-tracker (Day 3, 7, 14 for each) |
| T3.7: Daily briefing reads all sources | Run with populated pipeline + connections | Output mentions follow-ups, interviews, stale apps |
| T3.8: Networking follow-ups in urgency | Add connection follow-up due today | `getUrgencyItems()` includes it |
| T3.9: Build passes | `npm run build` | Exit code 0 |

### Manual Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| T3.M1: Company research | Click "Research Company", enter "Stripe" | Research agent spawns, intel file created, company card updates with data |
| T3.M2: Generate targets | Click "Generate Target List" | Research agent generates ~100 companies with fit scores, Finding page populates |
| T3.M3: Connection batch | Click "Generate Connection Batch" | 25 personalized messages appear, each mentions something specific about the recipient |
| T3.M4: Referral sequence | Click "Request Referral" on a contact | 3-message sequence generated with escalating urgency |
| T3.M5: LinkedIn audit | Click "Audit LinkedIn Profile" | Before/after suggestions for profile sections |
| T3.M6: Daily briefing | Visit Command Center after creating follow-ups | Briefing data shows follow-ups due, interviews coming, stale apps |
| T3.M7: Contact grouping | Have contacts at 3 companies | Networking page groups by company correctly |
| T3.M8: Relationship badges | Contacts at different stages | Correct color badges: Cold (gray), Connected (blue), Warm (amber), Referred (green) |
| T3.M9: Follow-up dismiss | Click dismiss on a follow-up | Follow-up disappears from urgency, status changes in YAML |
| T3.M10: Empty networking page | No contacts | Shows clear CTA to generate connection batch |
| T3.M11: Session resume — Networking | Run connection batch twice | Second run shows awareness of first (doesn't re-generate for same contacts) |

---

## Acceptance Criteria

- [ ] User can research a company and get structured intel (interview format, comp, culture)
- [ ] User can auto-generate a ranked target company list from their career plan
- [ ] User can generate a batch of up to batch-size personalized connection requests (minimum 1 per targeted company)
- [ ] Connection requests are under 300 chars each and round-robin across companies
- [ ] Follow-ups include `type` field and `outreach_ref` linking back to originating outreach
- [ ] User can generate a 3-message referral request sequence for any contact
- [ ] LinkedIn audit produces specific before/after suggestions
- [ ] Daily briefing surfaces all relevant action items (follow-ups, interviews, stale apps)
- [ ] Networking page shows contacts grouped by company with relationship badges
- [ ] Follow-ups from networking appear in Command Center urgency sections
- [ ] Follow-ups can be dismissed/skipped from the dashboard
- [ ] All generated messages are written to `search/output/messages/`
- [ ] `npm run build` passes

---

## UX Review

| Criterion | Expected | Check |
|-----------|----------|-------|
| Company research result | Intel card is scannable: rounds, format, comp at a glance | [ ] |
| Connection messages quality | Each message feels personalized, not template-ish | [ ] |
| Message review flow | User can review all 25 messages before acting on them | [ ] |
| Contact management | Easy to see who's been contacted, who replied, who needs follow-up | [ ] |
| Relationship progression | Visual flow from Cold → Connected → Warm → Referred is clear | [ ] |
| Daily briefing actionability | Each briefing item has a clear "do this next" action | [ ] |
| Follow-up cadence visibility | User can see when follow-ups are due without clicking into details | [ ] |
| Networking stats | Reply rate and referral count give useful signal on strategy effectiveness | [ ] |

---

## Gate Criteria (must pass before Phase 4)

1. All T3.* automated tests pass
2. All T3.M* manual tests pass
3. All acceptance criteria checked
4. Daily briefing tested with real data (populated pipeline + connections)
5. Session resume works for Networking agent
6. UX review completed — networking workflow feels natural
7. `git commit` with clean working tree
