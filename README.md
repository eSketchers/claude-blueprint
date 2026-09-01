# Claude Agency Blueprint

Reusable Claude Code baseline for all agency projects. Clone into a new project root, or copy `.claude/` + the appropriate `CLAUDE.md` template.

**👉 New here? Start with [SETUP.md](./docs/SETUP.md) — full step-by-step onboarding, from host install to shipping your first PR via the `/ticket` workflow.**

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
| **CLI** | [ast-grep](https://ast-grep.github.io/) | Structural refactors |
| **Hooks** | pre-commit + Flake8 / ESLint / Prettier | Lint on commit |
| **Hooks** | docs-sync | Auto-updates `docs/` on every `git push` (on by default) |
| **Optional** | [beads](https://github.com/gastownhall/beads) | Dependency-graph task tracker (orchestrator source) |

## Quick Start

```bash
# 1. One-time global install (MCPs, plugins)
./scripts/bootstrap.sh

# 2. Spin up a new project from this blueprint
./scripts/new-project.sh <project-name> <python|node|nextjs|nestjs>

# OR adopt into existing project (supports monorepos!)
cd ~/work/my-project
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python        # Single framework
"$BLUEPRINT_DIR/scripts/adopt.sh" --frameworks "python,nextjs"  # Monorepo
"$BLUEPRINT_DIR/scripts/adopt.sh" --detect                  # Auto-detect
# (adoption also installs a pre-push hook that auto-updates docs/ on every
#  push — see "Auto-Updating Documentation" below; opt out with --no-docs-updater)

# 3. Optional: Index your codebase for faster queries
./scripts/graphify-index.sh
```

## Tips for New Users

You don't need to touch the orchestrator or write config to get value from this blueprint day-to-day. Here's the minimum useful workflow:

**1. Start the dashboard once, and leave it open.**

```bash
cd dashboard && npm install    # first time only, installs the ws dependency
node server.mjs
```

Open **http://127.0.0.1:7842** in a browser tab and leave it there. It's read-only and localhost-only (no login, nothing to configure) — it just shows you what every Claude Code session on your machine is doing, live, across every project you have open. Think of it as a live status board, not something you have to actively drive.

**2. Work in Claude Code as normal — the dashboard fills in on its own.**

You don't call the dashboard from your prompts. Just use `claude` in your project like you always would. As you work, your session shows up in the dashboard automatically:
- **Office** — Claude is actively working (editing, running commands)
- **Cafeteria** — Claude is idle, waiting on you
- **Meeting Room** — Claude asked a question and is blocked waiting for your answer

**3. When an agent lands in "Meeting Room," reply from the dashboard.**

If you kick off a longer task (especially anything using `/ticket` or a subagent that calls `/wait-for-reply`) and it needs your input, you don't have to keep the terminal in focus. Just glance at the dashboard, click the blocked agent's card in **Meeting Room**, type your answer, and submit. The agent picks it up and keeps going — no need to switch back to the terminal at the exact right moment. (See "Self-resume" in the Dashboard section below, or `dashboard/README.md`, for how `/wait-for-reply` and the inbox handoff work under the hood.)

**4. Use `/check-inbox` if you're back at the terminal and want to check for a reply yourself.**

If you're already in the Claude Code session and want to see whether you (or a teammate) left a reply via the dashboard, just ask Claude to run `/check-inbox` — it's non-blocking, so it either surfaces the reply or tells you there's nothing waiting, no delay either way. Full loop explained in `dashboard/README.md`.

**5. Multiple projects open at once? One dashboard covers all of them.**

The dashboard isn't per-project — it watches `~/.claude-agency/events.jsonl`, which every adopted project's Claude Code session writes to. Run one dashboard instance and it'll show every session across every repo you have open, grouped by ticket/branch in the **Tickets** tab.

**6. Don't worry about the orchestrator unless you actually want unattended automation.**

The dashboard works fully standalone — it doesn't require `orchestrator/` to be running. Only set up the orchestrator (see below) if you want tickets picked up automatically without you starting each session by hand; for day-to-day interactive use, the dashboard + your normal `claude` sessions is all you need.

**7. If you do turn on the orchestrator, we recommend feeding it from beads rather than a plain issue tracker.**

The orchestrator can pull tickets from GitHub, ClickUp, Linear, or Jira, but none of those understand *dependencies* between tasks — it'll happily try to spawn an agent on a ticket that's blocked on another one not being done yet. [beads](https://github.com/gastownhall/beads) (`bd`) is a small, purpose-built dependency-graph task tracker: it only ever reports a task as "ready" once everything it depends on is closed. For unattended automation specifically — which is the whole point of running the orchestrator — that's a meaningfully better fit than a flat issue list, so it's the source we'd suggest reaching for first.

Setup:

```bash
# 1. Install the bd CLI
brew install beads   # or: npm install -g @beads/bd

# 2. Initialize a beads database in your project (run once, from the repo root)
# --stealth is important here: plain `bd init` also auto-commits its own
# files to git and installs its own CLAUDE.md section, .claude/settings.json
# hook, and Codex integration — unreviewed, on every run. --stealth (i.e.
# `no-git-ops: true`) skips all of that and only creates .beads/, which is
# all the orchestrator source needs.
cd ~/work/my-project
bd init --quiet --stealth

# 3. Quiet the one-time metrics prompt and a role warning you'll otherwise see on every bd call
bd metrics off
git config beads.role contributor   # or 'maintainer' if you're the primary owner

# 4. Create some tasks, wiring up dependencies as needed
bd create "Design the API schema" -p 1
bd create "Implement the endpoint" -p 1 --label backend
# ...then chain them: the second arg blocks the first (blocked-id first, blocker-id second)
bd dep add <implement-endpoint-id> <design-schema-id>
```

Then point the orchestrator at it in `config/orchestrator.json`:

```json
{
  "sources": [
    {
      "type": "beads",
      "name": "my-project",
      "enabled": true,
      "repo_path": "/Users/you/work/my-project",
      "limit": 30
    }
  ]
}
```

Once running, the orchestrator polls `bd ready` — tasks still blocked on an open dependency are automatically excluded, so you never get an agent spawned on work that isn't actually startable yet. When an agent finishes a ticket, the orchestrator calls `bd close` for you, so beads' own graph stays accurate and the next dependent task becomes "ready" without you touching anything by hand. Full details (claim/close behavior, `BEADS_DIR` for non-standard database locations): `orchestrator/README.md`.

## Getting Help

Having issues? Check our comprehensive [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for solutions to common problems:

- Bootstrap failures (Node/Python/CLI issues)
- Adoption problems (Git, framework detection)
- Orchestrator issues (config, budget, stuck tickets)
- Dashboard problems (blank page, performance)
- Agent crashes and profile errors
- Auto-docs (`docs-sync`) not updating — check `docs-sync/config.json` exists and `enabled` is true; see `docs-sync/README.md`

For additional support:
- Run diagnostics: `./scripts/doctor.sh`
- Check [Setup Guide](docs/SETUP.md) or [Advanced Guide](docs/ADVANCED.md)
- Review [recent changes](docs/CHANGELOG.md)
- Report issues: [GitHub Issues](https://github.com/your-org/claude-agency-blueprint/issues)

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

## Token Optimization

The blueprint includes built-in optimizations targeting 70-90% reduction in wasted context:

**Phase 1 (Core):**
- **`.claudeignore`** — Filters noise files (dependencies, build outputs)
- **Smart file reading** — Agents follow purposeful reading patterns
- **Haiku for exploration** — Cheaper model for discovery tasks
- **Graphify indexing** — Query graph instead of reading files repeatedly

**Phase 2 (Templates & Tools):**
- **Template library** — Reusable code patterns (2K-5K tokens per new file)
- **AST navigation** — Structural search without reading full files
- **Module batching** — Read related files together efficiently

**Phase 3 (Dynamic Context):**
- **Profile-based MCP loading** — Activate only needed MCPs per task (30-60% savings)
- **Conditional agent dispatch** — Load agents only when plan requires them (built-in)

```bash
# Switch to minimal profile for exploration
./scripts/switch-profile.sh minimal
claude  # Start new session

# Switch to frontend profile before UI work
./scripts/switch-profile.sh frontend
claude  # Playwright + context7 loaded, others excluded
```

See **[docs/ADVANCED.md](./docs/ADVANCED.md#token-optimization)** for the complete optimization guide, including all three phases and the profile system.

**Note:** Savings projections are based on theoretical analysis. Actual reduction depends on codebase structure and task types.

## Orchestrator (`orchestrator/`) — unattended intake + budget + Slack

Run it as a daemon to pick up tickets without a human kicking off each one:

```bash
cp config/orchestrator.example.json config/orchestrator.json    # edit: sources, caps, Slack
./scripts/start-orchestrator.sh                                   # background daemon
```

What it does every tick (default 60s):

1. **Polls sources** — GitHub (`gh` CLI), local filesystem, ClickUp, Linear, Jira, or [beads](https://github.com/gastownhall/beads) (dependency-graph task tracker); see `orchestrator/README.md` for setup per source
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
Claude Code hooks → ~/.claude-agency/events.jsonl → server → WebSocket push to dashboard (falls back to polling if disconnected)
                                                      └── /api/unblock → ~/.claude-agency/inbox/<session>.txt
```

Hooks are registered in `.claude/settings.json` (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`) and all funnel through `.claude/hooks/agency-emit.sh`.

**Self-resume**: agents that block on `/wait-for-reply "<question>"` show up in the dashboard **Meeting Room**; your reply in the dashboard lands in `~/.claude-agency/inbox/<session>.txt`, the agent picks it up, and continues in the same turn. `/check-inbox` is the non-blocking variant for start-of-turn pulls. See `dashboard/README.md` for the full loop.

## Auto-Updating Documentation (`docs-sync`)

On by default during adoption (opt out with `adopt.sh --no-docs-updater`). Keeps an in-repo `docs/` folder current so humans and Claude can understand the project, without a separate CI workflow or any secrets — it uses your local `claude` auth.

```bash
git push   # a pre-push hook does the rest, automatically
```

What happens on every push:
1. The pre-push hook diffs the commits being pushed and classifies changed files into backend / schema / frontend.
2. `/update-docs` regenerates the affected doc sections (inside `AUTO-DOC` markers) plus a module/function reference, and appends a changelog entry — only re-describing symbols whose body actually changed.
3. If anything under `docs/` changed, the hook amends it onto the commit you just made (`git commit --amend`) rather than creating a separate docs commit, so code and docs travel together with one clean history. This only touches local, not-yet-pushed history, so it's safe.
4. The push completes either way — doc generation failing never blocks a push.

A separate, **manually-invoked** command, `/update-product-docs`, generates audience-facing docs (feature guides, `docs/OVERVIEW.md`, `docs/WHATS-NEW.md`) — it does not run automatically on push.

Full docs: `docs-sync/README.md`. Config: copy `docs-sync/config.example.json` → `docs-sync/config.json` (gitignored) to adjust which sections are generated.

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

docs-sync/              Config + docs for the auto-doc pre-push hook (see above)
  config.example.json  Copy to config.json (gitignored) to adjust generated sections

hooks/                  Sample git hooks
  pre-push.sample       Runs /update-docs on every push — installed automatically by adopt.sh
  post-commit.sample    Manual-install-only example (adopt.sh uses `graphify hook install` instead for the real post-commit re-index — see Token Optimization above)

vendor/                 External tools vendored as git submodules
  superpowers/          Plugin: TDD + worktree + review skills (obra)
  graphify/             Skill: knowledge-graph indexing (safishamsi)
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

## Customizing per Team

Projects extend this baseline by adding a `.claude/settings.local.json` and a project-specific `CLAUDE.md`. Do not edit this blueprint for project-specific tweaks — PR changes back here only when they should apply agency-wide.
