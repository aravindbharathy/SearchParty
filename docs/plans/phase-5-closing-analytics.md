# Phase 5: Closing + Weekly Analytics

## Goal
Complete the job search lifecycle: cover letters, work products, hiring manager outreach, salary research, negotiation, and weekly retrospectives. The Closing and Analytics pages become functional. The system can now support a user from first JD to accepted offer.

## Prerequisites
- Phase 4 gate criteria met
- Full pipeline data exists (applications, interviews, contacts)
- All agents proven working with session resume

## Deliverables

### D1: `/cover-letter` Skill (`.claude/skills/cover-letter/SKILL.md`)
**Agent**: Resume
**Input**: JD text
**Reads**: `experience-library.yaml`, `career-plan.yaml`
**Output**: Cover letter written to `search/output/cover-letters/{company}-{role}.md`
- Maps top 3 experiences to JD's top 3 requirements
- Under 300 words
- Not generic — references specific company/role
- Inline recruiter-review pass

### D2: `/work-product` Skill (`.claude/skills/work-product/SKILL.md`)
**Agent**: Strategist
**Input**: company + type (`get-interview` | `in-process` | `recovery`)
**Reads**: `intel/{company}.yaml`, `career-plan.yaml`
**Output**: 1-pager written to `search/output/work-products/{company}-{type}.md`
- **get-interview**: Proactive analysis of company's product with recommendations, sent to get noticed before applying
- **in-process**: Deeper analysis delivered during interview loop to demonstrate depth
- **recovery**: Post-rejection/silence piece that reopens conversation ("I kept thinking about your X problem...")
- Inline hiring-manager-review pass (reads rubric from `hiring-manager-reviewer.md`)

### D3: `/hiring-manager-msg` Skill (`.claude/skills/hiring-manager-msg/SKILL.md`)
**Agent**: Strategist
**Input**: company + role
**Reads**: work-product output, `connection-tracker.yaml`
**Output**: Outreach message written to `search/output/messages/hm-{company}-{role}.md`
- Leads with the work product, not "I'm interested in your role"
- References the analysis done in the work product
- Short, specific, demonstrates understanding

### D4: `/salary-research` Skill (`.claude/skills/salary-research/SKILL.md`)
**Agent**: Research
**Input**: company + role + level + location
**Reads**: `intel/{company}.yaml`, `target-companies.yaml`
**Output**: Comp analysis written to `search/entries/salary-{company}-{level}.md`

Market data compiled from web search results (search snippets from levels.fyi, Glassdoor, Blind articles, and public salary discussions). This is NOT structured data from APIs — accuracy varies. Add confidence disclaimer to output. Also add manual input path: user can paste comp data from their own accounts. The skill uses LLM knowledge + search snippets + user-provided data to produce estimates, not authoritative percentile data.

- Breakdown: base, equity, bonus, total comp range
- Comparison to similar roles at competing companies
- Percentile positioning: "This offer is at the 65th percentile for Staff Eng in SF" (estimated, not authoritative)
- Updates `intel/{company}.yaml` comp section if data is newer

### D5: `/negotiate` Skill (`.claude/skills/negotiate/SKILL.md`)
**Agent**: Research
**Input**: company + offer details (base, equity, bonus, sign-on)
**Reads**: salary research output, `pipeline/offers.yaml`, `career-plan.yaml`
**Output**: Negotiation strategy written to `search/entries/negotiate-{company}.md`
- Offer analysis: how it compares to market, which components are below market
- Leverage points: competing offers, unique skills, market demand
- Counter-offer language: specific phrases and framing
- Walkaway analysis: minimum acceptable vs. target vs. aspirational
- Updates `pipeline/offers.yaml` with offer details + negotiation state

### D6: `/weekly-retro` Skill (`.claude/skills/weekly-retro/SKILL.md`)
**Agent**: Coach
**Input**: none
**Reads**: `pipeline/applications.yaml`, `pipeline/interviews.yaml`, `connection-tracker.yaml`, `interview-history.yaml`, `snapshot.yaml`
**Output**: Weekly report written to `search/entries/retro-{date}.md`
- Applications this week: count, response rate (callbacks / apps)
- Interview performance: scores this week vs. prior weeks
- Networking velocity: connection requests sent, replies, referrals secured
- Pipeline health: funnel leaks (where are applications stalling?)
- What worked: which approaches got callbacks/interviews
- Coaching recommendation: "Increase follow-up cadence for top 3 targets" or "Interview scores show improvement in behavioral, keep drilling system design"
- Updates `snapshot.yaml` with weekly summary

### D7: `/post` Skill (`.claude/skills/post/SKILL.md`)
Adapt from `kapi-sprints/.claude/skills/post/SKILL.md`:
- Change all paths from `kapi/` to `search/`
- Same signal types: finding, decision, blocker, available, handoff, queue

### D8: Closing Page (`app/closing/page.tsx`)
- Active offers list: company, role, comp breakdown, negotiation status
- "Research Salary" action → spawns Research agent
- "Analyze Offer" action → input offer details → spawns Research agent for negotiation analysis
- Offer comparison table: side-by-side if multiple offers
- Negotiation timeline: counter-offer sent, response received, final terms
- Decision log: link to decisions.yaml entries for offer-related decisions

**Offer input form fields**: base salary, equity grant value, equity type (RSU/ISO/options), vesting schedule (e.g. "4 years, 1 year cliff"), annual bonus target %, sign-on bonus, benefits notes, offer deadline date. `POST /api/pipeline/offers` route.

**Note**: Charting library (Recharts) installed in Phase 4. Phase 5 analytics charts use same library.

### D9: Analytics Page (`app/analytics/page.tsx`)
- **Response rate chart**: callbacks / applications per week (line chart)
- **Pipeline funnel**: how many apps at each stage (funnel/bar chart)
- **Interview score trends**: Three Laws scores over time (from Phase 4, rendered here as a larger chart)
- **Networking stats**: connection requests → replies → referrals (conversion funnel)
- **Time metrics**: avg days-to-response, avg days-in-stage
- **Weekly retro history**: list of past retros with key metrics
- "Run Weekly Retro" button → spawns Coach agent → new retro appears
- Data sourced from: `pipeline/*.yaml`, `interview-history.yaml`, `connection-tracker.yaml`, `search/entries/retro-*.md`

### D10: Offers Pipeline Schema
```yaml
# pipeline/offers.yaml
offers:
  - id: offer-001
    company: Stripe
    role: Staff Engineer
    date_received: "2026-04-20"
    status: negotiating       # received | negotiating | accepted | declined | expired
    comp:
      base: 250000
      equity: 400000          # 4-year value
      equity_type: RSU        # RSU | ISO | options
      vesting: "4 years, 1 year cliff"
      bonus: 25000            # annual bonus target
      sign_on: 50000
      # total is derived: base + equity/4 + bonus = 250000 + 100000 + 25000 = 375000
      # Do NOT manually enter total — compute it from components
    market_percentile: 65
    salary_research: "entries/salary-stripe-staff.md"
    negotiation: "entries/negotiate-stripe.md"
    deadline: "2026-04-30"
    notes: ""
```

---

## Implementation Steps (ordered)

1. Define `pipeline/offers.yaml` schema + add to parsers
2. Build offers API routes
3. Build `/cover-letter` SKILL.md
4. Build `/work-product` SKILL.md (with inline hiring-manager-review)
5. Build `/hiring-manager-msg` SKILL.md
6. Build `/salary-research` SKILL.md
7. Build `/negotiate` SKILL.md
8. Build `/weekly-retro` SKILL.md
9. Build `/post` SKILL.md (adapt from Kapi)
10. Build Closing page with offers list + negotiation actions
11. Build Analytics page with charts + retro history
12. End-to-end test: salary research → receive offer → negotiate → weekly retro captures it

---

## Testing Criteria

### Automated Tests

| Test | Command/Method | Pass Criteria |
|------|----------------|---------------|
| T5.1: Offers YAML parse | Unit test parsers | Parse/write/roundtrip for offers |
| T5.2: Offer API CRUD | POST + GET + PUT | Create offer, read, update status |
| T5.3: Weekly retro reads all sources | Mock populated pipeline + interviews + connections | Retro output mentions all relevant metrics |
| T5.4: Snapshot update | After retro | `snapshot.yaml` reflects current pipeline counts |
| T5.5: Cover letter word count | Generate cover letter | Under 300 words |
| T5.6: Work product types | Generate all 3 types | Each produces different tone/framing |
| T5.7: Build passes | `npm run build` | Exit code 0 |

### Manual Tests

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| T5.M1: Cover letter | Generate for a JD | Maps top experiences to top requirements, under 300 words, not generic |
| T5.M2: Work product — get-interview | Generate for Stripe | Analyzes actual product, specific recommendations, demonstrates insight |
| T5.M3: Work product — recovery | Generate post-rejection | Different tone, re-engagement framing, shows continued interest without desperation |
| T5.M4: Hiring manager msg | Generate after work product | Leads with the analysis, not "I'm interested in..." |
| T5.M5: Salary research | Research Stripe Staff SF | Returns comp range with percentile, sources cited |
| T5.M6: Negotiate | Input offer details | Counter-offer language, leverage points, walkaway analysis |
| T5.M7: Weekly retro | Run with real data | Accurate metrics, actionable coaching recommendation |
| T5.M8: Analytics charts | Visit analytics after retro | Charts render with real data, no placeholder text |
| T5.M9: Offer comparison | Add 2 offers | Side-by-side comparison visible on Closing page |
| T5.M10: Closing page flow | Add offer → research salary → negotiate | Full flow works, all data connected |
| T5.M11: Post skill | Run `/post finding "discovered new approach"` | Entry file created, board.md updated |
| T5.M12: Session resume — Strategist | Generate 2 work products | Second shows awareness of first (references prior analysis) |

---

## Acceptance Criteria

- [ ] User can generate cover letters under 300 words that map experience to JD requirements
- [ ] User can generate 3 types of work products (get-interview, in-process, recovery)
- [ ] Work products include inline hiring-manager review
- [ ] Hiring manager messages lead with the work product analysis
- [ ] Salary research returns market comp with estimated percentile positioning and confidence disclaimer
- [ ] Offer input form captures all comp fields (base, equity, equity type, vesting, bonus, sign-on, deadline)
- [ ] Offer total comp is derived/computed, not manually entered
- [ ] Negotiation analysis provides counter-offer language and leverage points
- [ ] Weekly retro accurately analyzes the week with actionable coaching
- [ ] `snapshot.yaml` updates after each retro
- [ ] Closing page shows offers with comp breakdown and negotiation state
- [ ] Analytics page shows charts for response rate, pipeline funnel, interview scores, networking stats
- [ ] Weekly retro history is browsable in Analytics
- [ ] `/post` skill works for all signal types
- [ ] `npm run build` passes

---

## UX Review

| Criterion | Expected | Check |
|-----------|----------|-------|
| Cover letter quality | Reads as human-written, not AI template. Specific to company. | [ ] |
| Work product insight | Demonstrates real understanding of the company's product | [ ] |
| Salary data presentation | Comp breakdown clear, percentile positioning immediately useful | [ ] |
| Negotiation language | Counter-offer phrasing is professional and specific, not generic advice | [ ] |
| Offer comparison | Side-by-side view makes differences clear at a glance | [ ] |
| Analytics scannability | User can assess search health in under 30 seconds | [ ] |
| Chart readability | Charts have clear labels, appropriate scales, meaningful colors | [ ] |
| Retro actionability | Coaching recommendation is specific enough to act on (not "keep going") | [ ] |
| Weekly cadence | The retro feels like a natural Friday activity | [ ] |

---

## Gate Criteria (must pass before Phase 6)

1. All T5.* automated tests pass
2. All T5.M* manual tests pass
3. All acceptance criteria checked
4. Full job search lifecycle demonstrated: find → apply → network → interview → close
5. Analytics shows meaningful trends from accumulated data
6. UX review completed — closing and analytics workflows are useful
7. `git commit` with clean working tree
