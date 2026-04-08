# Search Party — Workflow Map

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                         JOB SEARCH OS — SYSTEM WORKFLOW                        ║
╚══════════════════════════════════════════════════════════════════════════════════╝


 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                          1. FIRST RUN                                       │
 │                                                                             │
 │   $ job-search start                                                        │
 │     ├── Blackboard Server (:8790) ✅                                        │
 │     ├── Dashboard (:8791) ✅                                                │
 │     └── Opens browser → localhost:8791                                      │
 │                           │                                                 │
 │                     context empty?                                          │
 │                      ╱          ╲                                           │
 │                   YES             NO                                        │
 │                    │               │                                        │
 │              /onboarding      Command Center                                │
 │                    │                                                        │
 └────────────────────┼────────────────────────────────────────────────────────┘
                      │
                      ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      2. ONBOARDING WIZARD                                   │
 │                                                                             │
 │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                          │
 │  │ Experience  │ │ Career Plan │ │ Q&A Master  │                          │
 │  │ Library     │ │             │ │             │                          │
 │  │ ⚪ upload   │ │ ⚪ form     │ │ ⚪ form     │                          │
 │  │ or CLI      │ │ (dashboard) │ │ (dashboard) │                          │
 │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                          │
 │         │               │               │                                  │
 │  ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐                          │
 │  │ Target      │ │ Connections │ │ Interview   │                          │
 │  │ Companies   │ │             │ │ History     │                          │
 │  │ ⚪ CLI      │ │ ⚪ form     │ │ ⚪ auto     │                          │
 │  │ /setup cos  │ │ (dashboard) │ │ (debriefs)  │                          │
 │  └─────────────┘ └─────────────┘ └─────────────┘                          │
 │                                                                             │
 │  Progress: ████████░░░░░░░░ 3/6          [ Get Started → ] (needs 2/6)    │
 │                                                                             │
 │  Three paths to fill each file:                                            │
 │    📁 Drop file in search/vault/ → Scan → Agent parses                    │
 │    📤 Upload via browser → writes to vault/                                │
 │    ✏️  Type in dashboard form → writes to context/                         │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘
                      │
                      ▼ (experience + career-plan filled)
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                     3. COMMAND CENTER (Daily View)                           │
 │                                                                             │
 │  ┌─ 🔴 OVERDUE (2) ──────────────────────────────────────────────────────┐ │
 │  │  • Follow up with Stripe recruiter (3 days overdue)     [Dismiss]     │ │
 │  │  • Send thank-you to Anthropic interviewer (1 day)      [Dismiss]     │ │
 │  └───────────────────────────────────────────────────────────────────────┘ │
 │  ┌─ 🟡 DUE TODAY (3) ────────────────────────────────────────────────────┐ │
 │  │  • Prep for Figma onsite tomorrow                       [Prep →]      │ │
 │  │  • 5 connection follow-ups at Day 3                     [View →]      │ │
 │  │  • Weekly retro due                                     [Run →]       │ │
 │  └───────────────────────────────────────────────────────────────────────┘ │
 │  ┌─ 🟢 UPCOMING (5) ─────────────────────────────────────────────────────┐ │
 │  │  • Stripe onsite in 3 days — prep: ✅ ready                           │ │
 │  │  • 12 connection requests ready to send                               │ │
 │  └───────────────────────────────────────────────────────────────────────┘ │
 │                                                                             │
 │  ┌─ Pipeline Funnel ──────────────────────────────────────────────────────┐ │
 │  │  Researching ████░░░░░░  4                                            │ │
 │  │  Applied     ██████████  10                                           │ │
 │  │  Phone       ████░░░░░░  3                                            │ │
 │  │  Onsite      ██░░░░░░░░  2                                            │ │
 │  │  Offer       █░░░░░░░░░  1                                            │ │
 │  └───────────────────────────────────────────────────────────────────────┘ │
 │                                                                             │
 │  🔥 Streak: 15 days  |  📊 This week: 5 apps, 33% callback rate           │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                        LIFECYCLE STAGES (Sidebar Nav)                           ║
╚══════════════════════════════════════════════════════════════════════════════════╝


 ┌─ FINDING ROLES ─────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  ┌─ Score a JD ───────────────────────┐   ┌─ Target Companies ───────────┐ │
 │  │ ┌─────────────────────────────────┐│   │ Stripe        82  🟢 Intel  │ │
 │  │ │ Paste JD here...               ││   │ Anthropic     91  🟢 Intel  │ │
 │  │ │                                ││   │ Figma         74  🟡 No intel│ │
 │  │ └─────────────────────────────────┘│   │ Notion        68  ⚪ New    │ │
 │  │         [ Score JD ]               │   │                              │ │
 │  └────────────────────────────────────┘   │ [Research Co] [Gen Targets]  │ │
 │                     │                     └──────────────────────────────┘ │
 │                     ▼                                                      │
 │  ┌─ Score Result ─────────────────────────────────────────────────────────┐ │
 │  │  Stripe — Staff Engineer             Fit Score: 82/100 → APPLY        │ │
 │  │  ✅ Level match  ✅ Function  ✅ Industry  ⚠️ Gap: consumer payments  │ │
 │  │  Salary estimate: $380-450K    │  [Tailor Resume →]                   │ │
 │  └────────────────────────────────┼──────────────────────────────────────┘ │
 └───────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
 ┌─ APPLYING ──────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  Kanban Board                                                               │
 │  ┌──────────┬───────────┬──────────┬──────────┬──────────┬──────────┐      │
 │  │Research  │ Applied   │ Phone    │ Onsite   │ Offer    │ Rejected │      │
 │  │          │           │          │          │          │          │      │
 │  │┌────────┐│┌─────────┐│┌────────┐│┌────────┐│┌────────┐│          │      │
 │  ││Notion  │││Stripe   │││Figma   │││Anthro  │││Stripe  ││          │      │
 │  ││Staff   │││Staff Eng│││Senior  │││Staff   │││Staff   ││          │      │
 │  ││────────│││─────────│││────────│││────────│││────────││          │      │
 │  ││Day 2   │││Day 7    │││Day 3   │││Day 14  │││Day 1   ││          │      │
 │  ││        │││⚠️ F/U   │││🟢 Prep │││✅ Done │││💰      ││          │      │
 │  │└────────┘│└─────────┘│└────────┘│└────────┘│└────────┘│          │      │
 │  └──────────┴───────────┴──────────┴──────────┴──────────┴──────────┘      │
 │                                                                             │
 │  [ + Add Application ]  [ Tailor Resume ]                                   │
 │                                                                             │
 │  ┌─ Resume Output ────────────────────────────────────────────────────────┐ │
 │  │  stripe-staff-v2.md                                                    │ │
 │  │  ┌── Recruiter Review: ✅ PASS (strong first impression) ───────────┐ │ │
 │  │  │   ATS Check: ✅ PASS (keyword coverage: 78%)                     │ │ │
 │  │  └──────────────────────────────────────────────────────────────────┘ │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 └─────────────────────────────────────────────────────────────────────────────┘

 ┌─ NETWORKING ────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  Contacts by Company                    Stats                               │
 │  ┌────────────────────────────────┐    ┌──────────────────────────────┐    │
 │  │ Stripe (3 contacts)           │    │ Total contacts: 34           │    │
 │  │  Jane D.  🟢 Referred         │    │ Reply rate: 28%              │    │
 │  │  Bob S.   🟡 Connected        │    │ Referrals: 4                 │    │
 │  │  Ali M.   ⚪ Cold             │    └──────────────────────────────┘    │
 │  │                                │                                        │
 │  │ Anthropic (2 contacts)        │    Actions                              │
 │  │  Sam K.   🟡 Connected        │    ┌──────────────────────────────┐    │
 │  │  Wei L.   🟢 Referred         │    │ [Generate Connection Batch]  │    │
 │  └────────────────────────────────┘    │ [LinkedIn Audit]            │    │
 │                                        └──────────────────────────────┘    │
 │  Outreach Timeline (Jane D.)                                               │
 │  ├─ Mar 15: Connection request sent                                        │
 │  ├─ Mar 18: Replied ✅                                                     │
 │  ├─ Mar 22: Referral requested                                             │
 │  ├─ Mar 25: Referral confirmed 🎉                                         │
 │  └─ Apr 01: Follow-up due [Send] [Dismiss]                                │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘

 ┌─ INTERVIEWING ──────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  Upcoming                                                                   │
 │  ┌────────────────────────────────────────────────────────────────────────┐ │
 │  │ Apr 10  Stripe    System Design    Prep: 🟢 Ready     [View Prep]    │ │
 │  │ Apr 14  Figma     Behavioral       Prep: 🔴 Not done  [Prep Now]     │ │
 │  │ Apr 18  Anthropic Hiring Manager   Prep: 🟡 Started   [Continue]     │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 │                                                                             │
 │  Score Trends (Three Laws)                                                  │
 │  10│                                    ── Structure                        │
 │   8│    ╱──────╲    ╱────               ── Specificity                      │
 │   6│───╱        ╲──╱                    ── Skill Demo                       │
 │   4│  ╱                                                                     │
 │   2│╱                                                                       │
 │   0└───────────────────────                                                 │
 │     Mock1 Mock2 Real1 Mock3 Real2                                           │
 │                                                                             │
 │  Weak Areas                              Actions                            │
 │  • System design estimation (5.1/10)     [Prep Interview]                   │
 │  • Behavioral: conflict (6.2/10)         [Mock Interview] → opens CLI       │
 │                                          [Debrief Interview]                │
 │  History                                 [Send Thank You]                   │
 │  ├─ Apr 5  Stripe Phone     Score: 7.8                                     │
 │  ├─ Apr 3  Mock Behavioral  Score: 6.5                                     │
 │  └─ Mar 28 Anthropic Tech   Score: 8.2                                     │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘

 ┌─ CLOSING ───────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  Active Offers                                                              │
 │  ┌────────────────────────────────────────────────────────────────────────┐ │
 │  │ Stripe — Staff Engineer                        Deadline: Apr 30      │ │
 │  │ ┌──────────┬───────────┬────────┬─────────┬──────────┐               │ │
 │  │ │ Base     │ Equity/yr │ Bonus  │ Sign-on │ Total    │               │ │
 │  │ │ $250K    │ $100K     │ $25K   │ $50K    │ $375K/yr │               │ │
 │  │ └──────────┴───────────┴────────┴─────────┴──────────┘               │ │
 │  │ Market percentile: 65th (estimated)                                  │ │
 │  │ Status: 🟡 Negotiating                                               │ │
 │  │ [Research Salary]  [Analyze Offer]  [View Negotiation Strategy]      │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                           META PAGES (Sidebar Nav)                             ║
╚══════════════════════════════════════════════════════════════════════════════════╝

 ┌─ ANALYTICS ─────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  Response Rate                    Pipeline Velocity                         │
 │  40%│       ╱╲                    Avg days per stage:                       │
 │  30%│    ╱╱╱  ╲                    Researching → Applied: 3 days           │
 │  20%│  ╱╱      ╲╲                  Applied → Phone: 8 days                 │
 │  10%│╱╱                            Phone → Onsite: 5 days                  │
 │   0%└──────────────                                                         │
 │     Wk1 Wk2 Wk3 Wk4             Networking Funnel                         │
 │                                    Sent: 48 → Replied: 14 → Referred: 4   │
 │  [Run Weekly Retro]                                                         │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘

 ┌─ PLAYBOOK ──────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  Lessons Learned                     Strategy Decisions                     │
 │  • Metrics-heavy resumes get 2x      • Apr 1: Focus on fintech only       │
 │    more callbacks than narrative        (devtools callbacks too low)        │
 │  • "Shared interest" connection       • Mar 25: Switch to chronological    │
 │    requests: 35% reply rate vs          resume format (better callbacks)   │
 │    12% for generic                                                         │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘

 ┌─ VAULT ─────────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  📁 search/vault/                    (drop files here or upload below)      │
 │                                                                             │
 │  resumes/          (2 files)    📤 Upload                                  │
 │    resume_2026.pdf       ✅ Parsed                                         │
 │    resume_draft.md       🆕 New                                            │
 │                                                                             │
 │  job-descriptions/ (3 files)    📤 Upload                                  │
 │    stripe-staff.txt      ✅ Scored (82)                                    │
 │    anthropic-plat.md     🆕 Not scored                                     │
 │    figma-senior.txt      🆕 Not scored                                     │
 │                                                                             │
 │  transcripts/      (1 file)     📤 Upload                                  │
 │    stripe-round2.txt     🆕 Not debriefed                                  │
 │                                                                             │
 │  [🔄 Scan Vault]                                                           │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘

 ┌─ CONTEXT ───────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │  Your Search Profile                                                        │
 │                                                                             │
 │  ┌────────────────────────────────────────────────────────────────────────┐ │
 │  │ 📋 Experience Library        3 roles, 7 projects     ✅ 2 days ago   │ │
 │  │                                                        [Edit →]       │ │
 │  ├────────────────────────────────────────────────────────────────────────┤ │
 │  │ 🎯 Career Plan               Staff · backend · fintech ✅ 5 days ago │ │
 │  │                                                        [Edit →]       │ │
 │  ├────────────────────────────────────────────────────────────────────────┤ │
 │  │ 🏢 Target Companies          47 companies · avg fit 72 ⚠️ 12 days   │ │
 │  │   Archivist: "5 companies inactive 3 weeks"            [Edit →]       │ │
 │  ├────────────────────────────────────────────────────────────────────────┤ │
 │  │ 🤝 Connections                34 contacts · 8 companies ✅ 1 day ago  │ │
 │  │                                                        [Edit →]       │ │
 │  ├────────────────────────────────────────────────────────────────────────┤ │
 │  │ 💬 Q&A Master                 4 core + 3 custom         ⚠️ 14 days  │ │
 │  │                                                        [Edit →]       │ │
 │  ├────────────────────────────────────────────────────────────────────────┤ │
 │  │ 📊 Interview History          6 interviews · avg 7.2    🔄 Auto      │ │
 │  │   Weak: system design estimation                       [View →]       │ │
 │  └────────────────────────────────────────────────────────────────────────┘ │
 │                                                                             │
 └─────────────────────────────────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                        AGENT SPAWN FLOW (Behind the Scenes)                    ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  User clicks                    Dashboard                Process Manager
  "Score JD"                     (Next.js)                (Singleton)
      │                              │                         │
      ▼                              ▼                         ▼
  ┌────────┐    POST /api/     ┌──────────┐   spawn()   ┌──────────────┐
  │ Button │───agent/spawn────▶│ API Route│────────────▶│ claude       │
  │ click  │                   │          │             │ --agent      │
  └────────┘                   └──────────┘             │   research   │
      │                              │                   │ --resume {id}│
      │                              │                   │ -p           │
      ▼                              │                   └──────┬───────┘
  ┌────────┐                         │                          │
  │Loading │                         │                          ▼
  │spinner │                         │                   ┌──────────────┐
  │ ···    │                         │                   │ Agent reads: │
  └────────┘                         │                   │ career-plan  │
      │                              │                   │ experience   │
      │                              │                   │ JD text      │
      │                              │                   └──────┬───────┘
      │                              │                          │
      │                              │                          ▼
      │                              │                   ┌──────────────┐
      │                              │                   │ Agent writes:│
      │                              │                   │ entries/     │
      │                              │                   │ blackboard   │
      │                         WebSocket                └──────┬───────┘
      │                         broadcast                       │
      │                              │◀─────────────────────────┘
      ▼                              ▼
  ┌────────┐    state update   ┌──────────┐
  │ Result │◀──────────────────│Blackboard│
  │ appears│                   │ Server   │
  └────────┘                   └──────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                         MEMORY ARCHITECTURE                                    ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  Tier 1: WORKING MEMORY (ephemeral — gone when agent exits)            │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │ Current directive + loaded context files + JD being processed     │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                              │                                          │
  │                        agent exits                                      │
  │                              │                                          │
  │  Tier 2: SESSION MEMORY (Claude Code --resume, persists across spawns) │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │ "User prefers 2-line summaries"                                  │  │
  │  │ "Dislikes 'spearheaded' — use plain language"                    │  │
  │  │ "Stripe resume v2 was approved after removing leadership section"│  │
  │  │ → Carries forward on every future spawn of this agent            │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                              │                                          │
  │                     100+ interactions                                   │
  │                              │                                          │
  │  Archivist rotates: preferences.md → context YAML promotion            │
  │                              │                                          │
  │  Tier 3: STRUCTURED CONTEXT (YAML files on disk, permanent)            │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │ experience-library.yaml  career-plan.yaml  qa-master.yaml        │  │
  │  │ target-companies.yaml    connection-tracker.yaml                  │  │
  │  │ interview-history.yaml   pipeline/*.yaml   intel/*.yaml          │  │
  │  │ → Shared across ALL agents. Updated by agents + dashboard.       │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════════════════════╗
║                         DAILY WORKFLOW                                          ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  7:00 AM                    Throughout Day                     Friday
  ┌──────────┐              ┌──────────────┐              ┌──────────────┐
  │ Open     │              │ Score JDs    │              │ Weekly Retro │
  │ Dashboard│              │ Tailor       │              │              │
  │          │              │  resumes     │              │ Apps: 12     │
  │ Check    │              │ Send batch   │              │ Callbacks: 4 │
  │ Command  │──── do ─────▶│  connections │──── run ────▶│ Rate: 33%    │
  │ Center   │   actions    │ Prep for     │   retro     │              │
  │          │              │  interviews  │              │ Coaching:    │
  │ 20 min   │              │ Debrief past │              │ "Increase    │
  │          │              │  interviews  │              │  follow-up   │
  └──────────┘              └──────────────┘              │  cadence"    │
                                                          └──────────────┘

  ════════════════════════════════════════════════════════════════════════
   Day 1 ──▶ Day 30: Agents get BETTER. Session memory accumulates.
   Same /resume-tailor produces pre-calibrated output. No re-corrections.
  ════════════════════════════════════════════════════════════════════════
```
