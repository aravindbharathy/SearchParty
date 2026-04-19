# Skills

Markdown instruction files that control agent behavior. Each skill is a self-contained workflow — agents read these files via `cat .claude/skills/{name}/SKILL.md` and follow the instructions.

## Editing Skills

Skills are plain markdown. Edit them to change agent behavior without touching code. Each skill has:
- **Frontmatter** — name, description, allowed tools
- **Prerequisites** — context files to read first
- **Steps** — numbered workflow instructions
- **Output** — where to write results
- **Blackboard** — what to post (skipped by oneOff agents)

## Writing Style Guide

All content-generating skills reference `writing-style-guide.md` for voice, tone, and anti-patterns. This prevents AI-sounding output.

## Skills by Agent

### Coach
| Skill | Purpose |
|-------|---------|
| `setup/` | Profile onboarding — guided fill of all context files |
| `daily-briefing/` | Morning priorities, pipeline check, action items |
| `weekly-retro/` | End-of-week analysis, pattern extraction, strategy |

### Research
| Skill | Purpose |
|-------|---------|
| `scan-roles/` | Find open roles at target companies (ATS APIs + web search) |
| `score-jd/` | 4-block JD evaluation (role analysis, experience match, fit score, legitimacy) |
| `company-research/` | Build structured intel profiles (culture, interview, comp) |
| `generate-targets/` | Rank and expand target company list |
| `batch-target-search/` | Used by batch pipeline for category-based search |

### Resume
| Skill | Purpose |
|-------|---------|
| `resume-tailor/` | Tailored resume in flexible JSON sections format |
| `cover-letter/` | Map top 3 experiences to top 3 JD requirements |
| `hiring-manager-msg/` | Outreach with product insight |
| `company-insight/` | 1-2 page product analysis brief |
| `recruiter-review/` | Rubric: 6-second scan test (used by resume-tailor) |
| `ats-check/` | Rubric: ATS compatibility check (used by resume-tailor) |

### Networking
| Skill | Purpose |
|-------|---------|
| `connection-request/` | Personalized LinkedIn outreach batch |
| `referral-request/` | 3-message referral sequence |
| `linkedin-audit/` | Profile positioning for target roles |

### Interview
| Skill | Purpose |
|-------|---------|
| `interview-prep/` | Company-specific prep packages |
| `mock-interview/` | Interactive Q&A with Three Laws scoring |
| `interview-debrief/` | Post-interview analysis + pattern tracking |
| `thank-you-note/` | Personalized, references conversation moments |

### Negotiation
| Skill | Purpose |
|-------|---------|
| `salary-research/` | Market comp from Levels.fyi, Glassdoor, Blind |
| `negotiate/` | Offer analysis + counter-offer strategy |
