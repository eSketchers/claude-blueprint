# Agency Blueprint — Developer Setup Guide

This guide takes a new team member from **zero** to **shipping their first PR via the `/ticket` workflow**. Follow top to bottom the first time; later you can jump to the section you need.

If any step fails, skip to **[Troubleshooting](#troubleshooting)** at the bottom — don't guess.

---

## Table of contents

1. [Who this is for](#who-this-is-for)
2. [Prerequisites (host setup)](#prerequisites-host-setup)
3. [Clone the blueprint](#1-clone-the-blueprint)
4. [Bootstrap (one-time global install)](#2-bootstrap-one-time-global-install)
5. [Verify your install](#3-verify-your-install)
6. [Path A — Scaffold a brand-new project](#path-a--scaffold-a-brand-new-project)
7. [Path B — Adopt into an existing project](#path-b--adopt-into-an-existing-project)
8. [Running the dashboard](#running-the-dashboard)
9. [First ticket walkthrough](#first-ticket-walkthrough)
10. [Daily development loop](#daily-development-loop)
11. [Customizing per team / per project](#customizing-per-team--per-project)
12. [Keeping in sync with the blueprint](#keeping-in-sync-with-the-blueprint)
13. [Troubleshooting](#troubleshooting)
14. [Uninstall / rollback](#uninstall--rollback)

---

## Who this is for

You're a developer on the agency who will be shipping work through Claude Code. You've either:

- been handed a **new project** and want the blueprint as the starting point, **or**
- been asked to **adopt** the blueprint into a project that already exists.

You don't need prior Claude Code experience — but you do need the basics: a terminal, git, and either Node 20+ or Python 3.11+ installed.

---

## Prerequisites (host setup)

Install the following once per machine. Skip anything you already have.

### Required

| Tool | Why | Install |
|---|---|---|
| **Claude Code CLI** | The thing that drives everything | `npm install -g @anthropic-ai/claude-code` — then run `claude` once and sign in |
| **Git 2.5+** | Needed for `git worktree` | `git --version` should print `>= 2.5` |
| **Node.js 20+** | Runs MCPs, the dashboard, and most projects | [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use 20` |
| **Python 3.11+** | Runs pre-commit, graphify, Python projects | `python3 --version` |
| **pre-commit** | Wires Flake8/ESLint/Prettier into the commit flow | `pip install --user pre-commit` |

### Strongly recommended

| Tool | Why |
|---|---|
| **uv** | Faster Python package manager. `pip install --user uv`. |
| **pnpm** | Faster npm. `npm install -g pnpm`. |
| **GitHub CLI (`gh`)** | `/ticket` workflow uses it to open PRs. `brew install gh` / [download](https://cli.github.com/). Run `gh auth login` once. |
| **Docker** | Many of our projects run in docker-compose. [Install](https://docs.docker.com/engine/install/). |
| **ripgrep (`rg`)** | Used internally for fast search. `brew install ripgrep` or `apt install ripgrep`. |

### Quick check

Run this block — **every line should print a version**, not an error:

```bash
claude --version
git --version
node --version
python3 --version
pre-commit --version
gh --version
```

If any of those fail, install the missing tool before continuing.

---

## 1. Clone the blueprint

Pick a permanent location on your machine. We recommend `~/work/claude-agency-blueprint/` or similar — **don't** put it inside another project.

```bash
# Replace with your org's URL if we're self-hosting the blueprint
git clone --recurse-submodules <BLUEPRINT-REPO-URL> ~/work/claude-agency-blueprint
cd ~/work/claude-agency-blueprint
```

If you forgot `--recurse-submodules`, do this after the fact:

```bash
git submodule update --init --recursive
```

You should now see:

```
claude-agency-blueprint/
├── .claude/
├── dashboard/
├── pre-commit/
├── scripts/
├── templates/
└── vendor/
    ├── awesome-claude-code/
    ├── graphify/
    └── superpowers/
```

If `vendor/` is empty, the submodule init didn't run — fix it with the command above.

---

## 2. Bootstrap (one-time global install)

This registers Superpowers (plugin), the 6 core MCP servers, ast-grep, graphify, and pre-commit on your user account. It's idempotent — safe to re-run.

```bash
./scripts/bootstrap.sh
```

What happens, step by step:

1. Installs the **Superpowers** plugin marketplace + the plugin itself via `claude plugin install`
2. Registers MCP servers: `serena`, `context7`, `sequential-thinking`, `memory`, `playwright`, `github`
3. Installs host CLIs: `ast-grep`, `graphify`, `pre-commit` (skipped if already present)

Expect the full run to take 2–5 minutes depending on your network. Warnings are tolerable; hard errors are not — scroll up and read them.

---

## 3. Verify your install

Run these sanity checks:

```bash
# Plugins
claude plugin list
# Expect: superpowers listed

# MCPs
claude mcp list
# Expect: serena, context7, sequential-thinking, memory, playwright, github

# Dashboard (boot briefly, then stop with Ctrl-C)
node dashboard/server.mjs
# Expect: "http://127.0.0.1:7842" in the terminal. Open it in a browser — you should see empty zones.

# Submodules
git submodule status
# Expect: 3 lines with SHAs, no "(missing)" markers
```

If any check fails, jump to **[Troubleshooting](#troubleshooting)**.

---

## Path A — Scaffold a brand-new project

Use this when you're starting fresh.

### Step 1 — Pick a framework

The blueprint ships templates for:

| Keyword | Produces |
|---|---|
| `python` | Python 3.11 + Flake8 + Black + pytest |
| `node`   | Node 20 + TypeScript + ESLint + Prettier + Vitest |
| `nextjs` | Next.js 15 App Router + Tailwind + Vitest + Playwright |
| `nestjs` | NestJS 10 + Sequelize/TypeORM + Jest |

### Step 2 — Run the generator

```bash
cd ~/your/projects/parent-directory
"$BLUEPRINT_DIR/scripts/new-project.sh" my-new-app nextjs
```

What it does:

1. Creates `./my-new-app/` with:
   - `.claude/agents/` — 6 role specialists **+ symlinked** `code-reviewer` from superpowers
   - `.claude/commands/` — `/ticket`, `/brainstorm`, `/write-plan`, `/execute-plan`
   - `.claude/skills/` — 14 superpowers skills, symlinked
   - `.claude/hooks/` — dashboard telemetry + ticket detector
   - `.claude/dashboard` — symlink to the blueprint's dashboard
   - `CLAUDE.md` — framework-specific, opinionated
   - `.pre-commit-config.yaml` — matching the framework
   - `.gitignore` — sensible defaults
2. Runs `git init` + the first commit
3. Runs `pre-commit install`

### Step 3 — Enter the project and start

```bash
cd my-new-app
claude              # launches Claude Code in this project
```

Inside Claude Code, type `/ticket <ticket-url>` to start your first piece of work (see [First ticket walkthrough](#first-ticket-walkthrough)).

---

## Path B — Adopt into an existing project

See **[docs/LOCAL-ADOPTION.md](./docs/LOCAL-ADOPTION.md)** for the full adoption guide, or use the one-command flow:

```bash
export BLUEPRINT_DIR=~/work/claude-agency-blueprint
cd ~/path/to/existing-app
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python    # or node|nextjs|nestjs
```

The script is idempotent, detects sibling vs nested layout automatically, gitignores its output, and supports `--uninstall` and `--doctor`.

For rolling this out across a team, see **[docs/TEAM-ONBOARDING.md](./docs/TEAM-ONBOARDING.md)** — a one-page handoff you can share.

---

## Running the dashboard

The dashboard is **shared across all your projects** — you run it once and it watches every project that has the blueprint's hooks wired up.

```bash
node "$BLUEPRINT_DIR/dashboard/server.mjs"
# → http://127.0.0.1:7842
```

To run it as a background service on Linux / macOS:

```bash
nohup node "$BLUEPRINT_DIR/dashboard/server.mjs" \
  > ~/.claude-agency/server.log 2>&1 &
```

Zones:

- **🛑 Meeting Room** — agents waiting for your input. Click a card, type your unblock message, send.
- **💻 Office** — agents actively working (last tool call < 60s ago).
- **☕ Cafeteria** — agents idle (session open, no recent activity).
- **🎟️ Tickets** — one row per branch / ticket across all your projects.

### Self-resume: how agents pick up your replies

Two slash commands close the loop between the dashboard and the agent:

- `/check-inbox` — non-blocking; reads + archives any pending reply. Use at the start of a turn.
- `/wait-for-reply "<question>"` — blocking; notifies the dashboard (agent shows up in **Meeting Room** with the question), polls for up to 120s, resumes in the same turn when you reply.

**Typical parallel-agent flow:**

1. Agent A in project X hits a decision, runs `/wait-for-reply "Which database should this pipeline use?"`
2. Dashboard flips A's card to Meeting Room with the question visible.
3. Meanwhile, Agent B in project Y is still working in the Office zone — no delay.
4. You click A's card in the dashboard, type your answer, send.
5. A's `/wait-for-reply` sees the inbox file, picks up the reply, continues its turn.

For a full breakdown see `dashboard/README.md`.

---

## First ticket walkthrough

Here's the full flow end-to-end for your first feature.

### Step 1 — Have a ticket

Get a URL from ClickUp / Linear / GitHub Issues / Jira. Anything with:
- A title
- Acceptance criteria
- (Ideally) a bit of context on why

### Step 2 — Start Claude Code in the project

```bash
cd ~/projects/my-app
claude
```

### Step 3 — Paste or invoke

Either paste the ticket URL anywhere in a message — the `detect-ticket.sh` hook will suggest the workflow — or invoke it directly:

```
/ticket https://app.clickup.com/t/abc123
```

### Step 4 — Watch the flow

The command runs in 9 phases:

| Phase | What happens | Your role |
|---|---|---|
| 0 | Fetch ticket + classify (feature / bug / chore / spike) | None |
| 1 | `architect` writes `docs/plans/<slug>.md` | None |
| 2 | `code-reviewer` adversarially reviews the plan | None |
| 3 | `architect` produces v2 plan addressing blockers | None |
| 4 | **Approval gate** — summary + `y/N` prompt | **You type `y` to proceed** |
| 5 | `scripts/workflow/feature.sh` creates branch + worktree | None |
| 6 | Parallel dispatch of relevant role agents (TDD per the plan) | None — or answer if one gets blocked |
| 7 | `scripts/workflow/finish.sh` runs lint + typecheck + tests | None |
| 8 | Auto-fix loop (up to 3 iterations) | None |
| 9 | Commits + push + `gh pr create` → returns PR URL | Review the PR |

Skip the approval gate with `/ticket <url> --auto` if you trust the flow for chores.

### Step 5 — Review + merge

The PR body will contain the v2 plan as its description. Review as usual, request changes on the PR, Claude will address them on the same branch.

---

## Daily development loop

After your first ticket, the typical day looks like:

1. `node "$BLUEPRINT_DIR/dashboard/server.mjs" &` — dashboard runs in the background.
2. `cd ~/projects/my-app && claude` — open Claude Code in one or more projects.
3. Paste a ticket URL or `/ticket <url>` for each piece of work.
4. Check the dashboard when you want a cross-project view of what's in-flight or waiting on you.
5. When the dashboard shows an agent in the **Meeting Room**, click the card, answer, carry on.

Tips:
- **Multiple tickets in parallel**: each `/ticket` creates its own git worktree at `../<repo>-<slug>`. Run `claude` in each worktree's directory to have separate Claude Code sessions per ticket. The dashboard shows all of them.
- **Pair with superpowers skills**: in any session, invoke `/brainstorm` before a fuzzy task, `/write-plan` for anything non-trivial, `/execute-plan` to run a saved plan.

---

## Customizing per team / per project

### Project-local overrides

Put a `.claude/settings.local.json` in your project to add permissions or hooks **on top of** the baseline. This file is git-ignored by default — great for personal tweaks.

### Agency-wide changes

If a convention should apply to **every** agency project, don't edit individual project `.claude/` dirs. Instead:

1. Open a PR against the blueprint
2. Once merged, teams run `git submodule update --remote` (if they vendored the blueprint) or re-copy the relevant files (if they adopted via Path B)

### Adding a new role agent

Any new agent markdown file in `.claude/agents/` becomes invokable via the `Task` tool. Use the existing agents (e.g. `frontend-dev.md`) as a template:

```markdown
---
name: security-auditor
description: …
tools: Read, Grep, Bash
---

Role-specific rules here.
```

After adding, copy it to any projects that need it, or PR it into the blueprint for agency-wide availability.

### Framework variants

If your team uses a framework not in `templates/` (e.g. Rails, Go, Rust, Django), add a new `CLAUDE.md.<name>` following the pattern of the existing ones and wire it into `scripts/new-project.sh`.

---

## Keeping in sync with the blueprint

Vendored submodules in the blueprint lag behind upstream. Refresh periodically:

```bash
cd "$BLUEPRINT_DIR"

# Update all 4 vendor submodules to their latest tracked branch
git submodule update --remote

# Review the diff
git diff --submodule=log

# Commit the bump
git commit -am "chore(vendor): bump upstream submodules"
```

For projects that **adopted** via Path B (copy / symlink), the symlinked files (superpowers skills, code-reviewer, dashboard) automatically pick up changes next time you re-run the blueprint's bootstrap. The copied files (role agents, hooks) don't — re-copy them when you want updates.

---

## Troubleshooting

### `claude` command not found

You didn't install Claude Code, or your shell's PATH doesn't include `~/.npm-global/bin` (or wherever npm global bins live).

```bash
npm install -g @anthropic-ai/claude-code
# If install succeeds but command still not found:
npm bin -g          # shows the install dir; add to PATH in your ~/.bashrc or ~/.zshrc
```

### `claude plugin install` fails

Usually means you haven't authenticated Claude Code yet. Run `claude` bare once, sign in, then retry bootstrap.

### `claude mcp add` says "already registered"

Harmless — `bootstrap.sh` is idempotent but doesn't pre-check. The MCP is registered; continue.

### `git submodule update --init` is stuck / very slow

Usually a network issue or a rate limit on `github.com`. Try again, or shallow-clone manually:

```bash
cd "$BLUEPRINT_DIR"
git submodule update --init --depth 1
```

### Dashboard shows nothing

Three possible causes:

1. **Hooks aren't firing.** Confirm `.claude/settings.json` in the project includes the blueprint's hooks block. Run `cat .claude/settings.json | grep agency-emit`.
2. **Hook paths are wrong.** If you adopted via Path B, the hook path is relative to the project root. Ensure `.claude/hooks/agency-emit.sh` exists and is executable (`ls -l .claude/hooks/agency-emit.sh`).
3. **No events yet.** The dashboard only shows agents that have emitted at least one event. Fire any tool call in Claude Code and refresh.

Quick manual test — this should light up the dashboard:

```bash
CLAUDE_SESSION_ID=manual-test CLAUDE_TOOL_NAME=Read CLAUDE_TOOL_FILE_PATH=/tmp/x \
  .claude/hooks/agency-emit.sh pre_tool
```

Then reload http://127.0.0.1:7842 — you should see `_root` in the Office zone.

### `pre-commit` fails on first run

Expected on existing projects — the blueprint's lint config is stricter than most repos' baseline. Two options:

- Fix the findings in a standalone PR before adopting: `pre-commit run --all-files` and fix what it reports.
- Temporarily relax the config (edit `.pre-commit-config.yaml`) and tighten it over sprints.

### `/ticket` says it can't find the ticket

Check:
- Is the relevant MCP installed? `claude mcp list` — you need the MCP matching the ticket source (ClickUp / Linear / GitHub).
- Are you authenticated? Some MCPs require one-off auth. Inside Claude Code: `/mcp` then pick the server and follow the auth prompt.
- Is the URL shape supported? See `.claude/hooks/detect-ticket.sh` for the patterns it recognizes.

### Pre-commit hook runs on every Edit and slows Claude down

The `PostToolUse` hook runs `pre-commit run --files $FILE` after every Edit/Write. If that's too much, remove or gate the hook in `.claude/settings.json`. It's there to catch issues early; disable with care.

### Running Claude Code in Docker / remote dev container

The blueprint's hooks assume `git` and `pre-commit` are available in the environment that runs Claude Code. If you're in a container, install those tools inside it — and make sure `~/.claude-agency/` is mounted in if you want dashboard events to survive container restarts.

---

## Uninstall / rollback

### Remove from a single project

```bash
cd ~/projects/my-app
rm -rf .claude .pre-commit-config.yaml
git checkout -- CLAUDE.md   # if you'd replaced it
# Optional: remove the dashboard symlink
rm -f .claude/dashboard
```

### Unregister MCPs globally

```bash
for m in serena context7 sequential-thinking memory playwright github; do
  claude mcp remove "$m"
done
```

### Remove the Superpowers plugin

```bash
claude plugin uninstall superpowers
```

### Wipe dashboard state

```bash
rm -rf ~/.claude-agency
```

---

## Help

- **Blueprint-specific questions**: open an issue in the blueprint repo.
- **Claude Code questions**: `/help` inside Claude Code, or https://docs.claude.com/claude-code
- **Superpowers / Graphify questions**: see `vendor/<name>/README.md` — they're vendored verbatim for inspection.
