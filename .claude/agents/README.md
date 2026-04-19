# Agent Definitions

Each `.md` file defines a specialist agent — its role, context files, blackboard protocol, and directive rules.

## How Agents Work

1. First spawn: `claude --agent {name}` loads the `.md` file as the system prompt
2. Subsequent messages: `claude --resume {session_id}` continues the conversation
3. Agents have MCP tools for blackboard read/write (persistent sessions only)
4. OneOff agents (`-p` flag) don't load agent definitions or have blackboard access

## Agents

| Agent | File | Domain | Context Files |
|-------|------|--------|---------------|
| **Coach** | `coach.md` | Orchestration, onboarding, briefings | All pipeline + context files |
| **Research** | `research.md` | JD scoring, company intel, role scanning | career-plan, experience-library, target-companies, open-roles |
| **Resume** | `resume.md` | Resumes, cover letters, outreach materials | experience-library, career-plan |
| **Networking** | `networking.md` | LinkedIn outreach, referrals, connections | connection-tracker, target-companies, open-roles |
| **Interview** | `interview.md` | Prep, mocks, debriefs, thank-you notes | interview-history, experience-library, interview-answers, open-roles |
| **Negotiation** | `negotiation.md` | Salary research, offer analysis, strategy | career-plan, offers, open-roles, applications |

## Directive Rules

Each agent has a `## Directive Rules` section — a table defining exactly when to post cross-agent work. Only triggers listed in the table are allowed.

Example (research agent):
| Trigger | Directive to | Text |
|---------|-------------|------|
| JD scored >= 75 | resume | "Tailor resume for {company} {role}. Role ID: {id}" |
| Company intel created | NONE | Just update status |

## Reviewers

The `reviewers/` subdirectory contains rubric files for quality checks:
- `recruiter-reviewer.md` — 6-second scan test
- `ats-checker.md` — ATS formatting compatibility
- `hiring-manager-reviewer.md` — Real product insight test
- `interview-grader.md` — Three Laws scoring framework
