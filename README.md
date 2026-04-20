# Claude Agency Blueprint

Reusable Claude Code baseline for all agency projects. Clone into a new project root, or copy `.claude/` + the appropriate `CLAUDE.md` template.

**👉 New here? Start with [SETUP.md](./SETUP.md) — full step-by-step onboarding, from host install to shipping your first PR via the `/ticket` workflow.**

## Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| **Plugin** | [superpowers](https://github.com/obra/superpowers) | TDD, git-worktrees, code-review skills |
| **Skill** | [graphify](https://github.com/safishamsi/graphify) | Post-commit codebase knowledge graph |
| **MCP** | [serena](https://github.com/oraios/serena) | Fast semantic code search (LSP-based) |
| **MCP** | [context7](https://github.com/upstash/context7) | Live library docs |
| **MCP** | sequential-thinking | Structured reasoning |
| **MCP** | memory | Persistent knowledge graph |
| **MCP** | playwright | Browser E2E tests |
| **MCP** | github | PRs / issues |
| **CLI** | [claude-flow](https://github.com/ruvnet/claude-flow) | Multi-agent swarm orchestration |
| **CLI** | [ast-grep](https://ast-grep.github.io/) | Structural refactors |
| **Hooks** | pre-commit + Flake8 / ESLint / Prettier | Lint on commit |

## Quick Start

```bash
# 1. One-time global install (MCPs, plugins)
./scripts/bootstrap.sh

# 2. Spin up a new project from this blueprint
./scripts/new-project.sh <project-name> <python|node|nextjs|nestjs>
```

## Layout

```
.claude/
  settings.json         Baseline permissions + hooks + MCP config
  agents/               architect, frontend-dev, backend-dev, qa-lead, devops, data-engineer
                        + code-reviewer (symlinked from superpowers)
  commands/             ticket.md (agency feature-ticket workflow)
                        + brainstorm/write-plan/execute-plan (symlinked from superpowers)
  hooks/                detect-ticket.sh (UserPromptSubmit)
  skills/               14 superpowers skills (symlinked): brainstorming, writing-plans,
                        executing-plans, test-driven-development, using-git-worktrees,
                        dispatching-parallel-agents, requesting-code-review,
                        finishing-a-development-branch, systematic-debugging, etc.

templates/
  CLAUDE.md.python      Python + Flake8 template
  CLAUDE.md.node        Node / TS template
  CLAUDE.md.nextjs      Next.js template
  CLAUDE.md.nestjs      NestJS microservice template

pre-commit/
  .pre-commit-config.python.yaml
  .pre-commit-config.node.yaml

vendor/                 External tools vendored as git submodules
  superpowers/          Plugin: TDD + worktree + review skills (obra)
  graphify/             Skill: knowledge-graph indexing (safishamsi)
  claude-flow/          MCP: multi-agent swarm orchestration (ruvnet)
  awesome-claude-code/  Reference: curated index of skills/hooks/agents

scripts/
  bootstrap.sh          Install plugins + MCPs globally
  new-project.sh        Clone blueprint into a new project dir
```

## Working with `vendor/`

These are **read-only reference copies** pinned to a known-good commit. Team members can:

- **Inspect source** to understand how a skill/plugin works before trusting it
- **Fork** any of them by adding their own remote
- **Update** via `git submodule update --remote vendor/<name>`
- **Clone the blueprint with submodules**: `git clone --recurse-submodules <blueprint-url>` (or `git submodule update --init` after a plain clone)

Installation still happens via the official marketplaces / registries through `bootstrap.sh` — the vendored copies are for inspection, not installation targets.

## Agent roster

We keep only **role-specialist** agents that add real value over upstream:

| Agent | Purpose | Why custom (vs upstream) |
|---|---|---|
| `architect` | System design, ADRs, tradeoffs | Upstream stubs are too thin |
| `frontend-dev` | React / Next / RN, a11y, Tailwind | No upstream equivalent |
| `backend-dev` | Node/Nest/FastAPI, DB, migrations, security | Upstream `*-specialist.md` are 6 lines |
| `qa-lead` | Test strategy, release gates, bug triage | No upstream equivalent |
| `devops` | Docker / CI / IaC / secrets | Upstream `devops/ci-cd/` is stubs |
| `data-engineer` | Pipelines, warehouse, dbt, streaming | No upstream equivalent |
| `code-reviewer` | **Symlinked from superpowers** | Theirs is already excellent |

Workflow verbs (plan, review, execute, TDD, worktree, finish branch) come from **superpowers skills** — we don't reinvent them.

## Feature-ticket workflow

Paste a ticket URL (ClickUp / Linear / GitHub / Jira) in the prompt — the `UserPromptSubmit` hook detects it and nudges Claude to run `/ticket <url>`.

```
/ticket https://app.clickup.com/t/abc123
  → [0] fetch + classify (feature/bug/chore/spike)
  → [1] architect writes plan
  → [2] code-reviewer adversarially reviews the plan
  → [3] architect produces v2 plan addressing blockers
  → [4] approval gate  (skip with --auto)
  → [5] scripts/workflow/feature.sh creates worktree + branch
  → [6] dispatch parallel: backend-dev / frontend-dev / data-engineer / devops (as needed)
       each writes failing test first (TDD skill)
  → [7] scripts/workflow/finish.sh — lint + typecheck + tests
  → [8] auto-fix loop (max 3 iterations)
  → [9] commit + push + gh pr create, return PR URL
```

Files driving this:
- `.claude/commands/ticket.md` — the slash command
- `.claude/hooks/detect-ticket.sh` — auto-detects ticket URLs in user messages
- `scripts/workflow/feature.sh` — worktree + branch creation
- `scripts/workflow/finish.sh` — runs the release gate

## Orchestrator (`orchestrator/`) — unattended intake + budget + Slack

Run it as a daemon to pick up tickets without a human kicking off each one:

```bash
cp config/orchestrator.example.json config/orchestrator.json    # edit: sources, caps, Slack
./scripts/start-orchestrator.sh                                   # background daemon
```

What it does every tick (default 60s):

1. **Polls sources** (GitHub via `gh` CLI in v1; ClickUp/Linear drop-in)
2. **Spawns a headless Claude Code session per new ticket** — runs `/ticket <url> --auto`
3. **Tails** `~/.claude-agency/events.jsonl` for blocker / completion events from every session
4. **Enforces budget** — per-ticket cap, daily cap, kill-switch via `touch ~/.claude-agency/KILLSWITCH`
5. **Notifies Slack** on blocker / budget cap / ticket complete / error

Full docs: `orchestrator/README.md`. **Start with `spawn.dry_run: true`** — it prints the command without executing so you can verify the template before going live.

## Dashboard (`dashboard/`)

Lightweight web UI to see every active agent across every project you have open. No deps, no build step — plain Node + vanilla JS.

```bash
node dashboard/server.mjs   # http://127.0.0.1:7842
```

Zones: **Meeting Room** (waiting for you — click to reply), **Office** (working), **Cafeteria** (idle), **Tickets** (per-branch activity).

Data flow:
```
Claude Code hooks → ~/.claude-agency/events.jsonl → server → dashboard polls /api/state.json (2s)
                                                      └── /api/unblock → ~/.claude-agency/inbox/<session>.txt
```

Hooks are registered in `.claude/settings.json` (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`) and all funnel through `.claude/hooks/agency-emit.sh`.

**Self-resume**: agents that block on `/wait-for-reply "<question>"` show up in the dashboard **Meeting Room**; your reply in the dashboard lands in `~/.claude-agency/inbox/<session>.txt`, the poll picks it up, agent continues in the same turn. `/check-inbox` is the non-blocking variant for start-of-turn pulls. See `dashboard/README.md` for the full loop.

## Customizing per Team

Projects extend this baseline by adding a `.claude/settings.local.json` and a project-specific `CLAUDE.md`. Do not edit this blueprint for project-specific tweaks — PR changes back here only when they should apply agency-wide.
