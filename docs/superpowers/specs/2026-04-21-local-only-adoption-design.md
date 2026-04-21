# Local-Only Per-Developer Adoption — Design Spec

**Date:** 2026-04-21
**Status:** Draft — awaiting user review
**Scope:** Make `claude-agency-blueprint` adoptable into existing backend repos (starting with `searchatlas/Backend`) by a single developer, on their own laptop, without touching shared infrastructure.

---

## 1. Goal

A developer on any backend project can, from scratch, get the blueprint working against their repo in under ten minutes by running one script. No team-wide rollout, no shared orchestrator, no committed `.claude/` directory in the backend repo.

## 2. Non-goals

- Team-wide config sharing via git. (The backend repo's `.claude/` is gitignored; see §6.)
- Orchestrator, dashboard, or Slack integration. These stay in the blueprint untouched but are not installed or started by the adoption flow.
- Changes to CI, branch protection, or any shared backend infrastructure.
- Changes to vendored upstream code under `vendor/`.

## 3. Target layouts

Two layouts are supported; `adopt.sh` auto-detects which.

### Layout A — sibling (recommended for devs with multiple projects)

```
~/work/claude-agency-blueprint/        ← cloned once
~/work/searchatlas-backend-api/
  ├── .claude/                         ← gitignored, created by adopt.sh
  ├── CLAUDE.md                        ← committed
  ├── .pre-commit-config.yaml          ← committed (if absent pre-adopt)
  └── .gitignore                       ← committed, adopt appends `/.claude/`
```

Dev exports `BLUEPRINT_DIR=~/work/claude-agency-blueprint` once in their shell rc. Symlinks inside `.claude/` use absolute paths pointing into the blueprint.

### Layout B — nested (self-contained, one project)

```
~/work/searchatlas-backend-api/
  ├── .agency/                         ← blueprint cloned here, gitignored
  ├── .claude/                         ← gitignored, created by adopt.sh
  ├── CLAUDE.md                        ← committed
  └── .gitignore                       ← committed, adopt appends `/.claude/` and `/.agency/`
```

Symlinks inside `.claude/` use relative paths pointing into `.agency/`. No env var required. Survives project folder rename.

## 4. The `adopt.sh` script

New file: `scripts/adopt.sh`. Replaces the manual steps in `SETUP.md` "Path B."

### 4.1 Invocation

```bash
# Layout A
export BLUEPRINT_DIR=~/work/claude-agency-blueprint
cd ~/work/searchatlas-backend-api
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python

# Layout B
cd ~/work/searchatlas-backend-api
git clone --recurse-submodules <blueprint-url> .agency
./.agency/scripts/adopt.sh --framework python
```

### 4.2 Flags

| Flag | Meaning |
|---|---|
| `--framework <python\|node\|nextjs\|nestjs>` | Required. Picks `CLAUDE.md.<fw>` template and `.pre-commit-config.<fw>.yaml`. |
| `--profile backend` | Merges backend-specific deny-list into `settings.json` (see §7). Default when `--framework` is `python` or `nestjs`. |
| `--force` | Overwrite an existing `.claude/`. Existing dir is moved to `.claude.bak-<timestamp>/`, not deleted. |
| `--no-precommit` | Skip `pre-commit install`. |
| `--dry-run` | Print every file op, change nothing. |
| `--uninstall` | Remove everything adopt created. Restores `.gitignore` lines it added. |
| `--doctor` | Health-check: verify symlinks resolve, marker file is valid, blueprint SHA matches. |

### 4.3 Execution order

1. **Preflight.** Must be inside a git repo. Working tree must be clean (`git status` empty) unless `--force`. Blueprint submodules must be initialized — auto-run `git submodule update --init --recursive` if not.
2. **Detect mode.** Resolve `$BASH_SOURCE` to an absolute path. If it lives under `<project-root>/.agency/scripts/`, mode is **nested**. Else if `$BLUEPRINT_DIR` is set and points to a valid blueprint clone, mode is **sibling**. Else error with both setup paths shown.
3. **Refuse to clobber.** If `.claude/` exists and lacks `.claude/.adopted-from-blueprint` marker, abort unless `--force`.
4. **Create `.claude/`** using the copy-vs-symlink split in §5.
5. **Write marker** `.claude/.adopted-from-blueprint` — JSON with fields: `blueprint_sha`, `blueprint_dir`, `mode` (`sibling`|`nested`), `framework`, `profile`, `adopted_at`.
6. **Template `CLAUDE.md`** only if the project has none. If it does, print a diff hint and skip.
7. **Gitignore.** Append `/.claude/` (always) and `/.agency/` (nested mode). Idempotent — no duplicate lines.
8. **pre-commit.** Copy `.pre-commit-config.<fw>.yaml` only if project has no `.pre-commit-config.yaml`. Run `pre-commit install` unless `--no-precommit`.
9. **Self-test.** Resolve one symlink (`ls -L .claude/skills/brainstorming/SKILL.md`) and assert the target exists. Fail loudly if not.
10. **Install `--doctor` hook (sibling mode only).** Append a `SessionStart` hook entry to `.claude/settings.json` that runs `adopt.sh --doctor --quiet` and prints a warning if symlinks are dead. Nested mode skips this — relative symlinks don't break on folder moves.
11. **Summary.** Print files created, what is committed vs gitignored, and the next command (`claude`).

### 4.4 Failure modes handled

| Condition | Behavior |
|---|---|
| Not in a git repo | Abort with instructions. |
| Dirty working tree | Abort unless `--force`; suggest `git stash`. |
| Neither `BLUEPRINT_DIR` set nor nested | Print both setup paths, exit 1. |
| Blueprint submodules missing | Auto-init; warn if offline. |
| Existing `.claude/` without marker | Abort; require explicit `--force`. |
| Symlink self-test fails | Rollback `.claude/`, restore backup if present, exit 1. |
| `.gitignore` missing | Create it with the needed lines. |

## 5. Copy-vs-symlink split

| Path | Treatment | Rationale |
|---|---|---|
| `.claude/agents/{architect,backend-dev,frontend-dev,devops,qa-lead,data-engineer}.md` | Copy | Dev may tweak per project. |
| `.claude/agents/code-reviewer.md` | Symlink → `vendor/superpowers/agents/code-reviewer.md` | Upstream-managed; shared quality. |
| `.claude/skills/*` | Symlink → `vendor/superpowers/skills/*` | Upstream-managed; `git pull` in blueprint propagates. |
| `.claude/commands/{brainstorm,write-plan,execute-plan}.md` | Symlink → `vendor/superpowers/commands/*` | Upstream-managed. |
| `.claude/commands/ticket.md` (and other blueprint-owned commands) | Copy | Agency-maintained; dev may tweak. |
| `.claude/hooks/*.sh` | Copy | Must be executable and repo-local. |
| `.claude/settings.json` | Copy (with optional backend profile merge) | Dev may need project-specific permissions. |
| `.claude/.adopted-from-blueprint` | Written by adopt | Marker for safe overwrite. |

Symlink mode depends on layout: Layout A uses absolute paths; Layout B uses relative paths computed by `scripts/lib/symlinks.sh`.

## 6. What the backend repo commits (tiny, reviewable diff)

- `CLAUDE.md` — project-level context for Claude.
- `.pre-commit-config.yaml` — team-shared lint rules.
- `.gitignore` — two lines added: `/.claude/` and (nested layout) `/.agency/`.

Everything else — `.claude/`, `.agency/` — is gitignored and per-developer.

## 7. Backend-specific deny-list (the `--profile backend` merge)

Merged into `settings.json` `deny` when `--profile backend` is active (default for `--framework python|nestjs`):

```json
[
  "Bash(psql:*)", "Bash(mysql:*)", "Bash(redis-cli:*)",
  "Bash(alembic upgrade:*)", "Bash(alembic downgrade:*)",
  "Bash(prisma migrate deploy:*)",
  "Bash(django-admin migrate:*)", "Bash(manage.py migrate:*)",
  "Bash(kubectl:*)", "Bash(terraform apply:*)", "Bash(terraform destroy:*)",
  "Bash(aws:*)", "Bash(gcloud:*)",
  "Bash(git push:* origin main*)",
  "Bash(git push:* origin master*)",
  "Bash(git push:* origin staging*)",
  "Bash(git push:* origin production*)",
  "Write(**/migrations/*)",
  "Write(**/alembic/versions/*)"
]
```

Rationale: these commands produce irreversible or cross-environment side effects. Claude can *generate* migration files via PR workflow, but cannot *apply* them.

The framework `CLAUDE.md` templates also get these four lines appended under a `## Backend guardrails (non-negotiable)` heading:

- Never run migrations against any DB. Generate migration files only; humans apply them.
- Never run queries against prod/staging. Read-only local replicas only, referenced by `DATABASE_URL`.
- Never modify CI workflows without a linked ticket.
- PRs touching `migrations/`, `auth/`, `billing/`, or `*_consumer.py` require human architect review before merge.

## 8. Changes inside the blueprint repo

### New files
- `scripts/adopt.sh`
- `scripts/lib/symlinks.sh` — shared absolute/relative symlink helper, used by both `adopt.sh` and `new-project.sh`.
- `scripts/test-adopt.sh` — automated tests; see §10.
- `docs/LOCAL-ADOPTION.md` — developer-facing guide.
- `docs/TEAM-ONBOARDING.md` — one-page handoff for sharing with other backend projects.

### Edited files
- `scripts/new-project.sh` — switch from absolute-symlink `ln -sfn` calls to `scripts/lib/symlinks.sh`. Behavior unchanged for green-field; removes dead-symlink footgun.
- `SETUP.md` — replace `~/work/claude-agency-blueprint` literals with `$BLUEPRINT_DIR`. Path B section shrinks to a link to `docs/LOCAL-ADOPTION.md`.
- `.claude/settings.json` — add default `"env": { "CLAUDE_AGENCY_DASHBOARD": "0" }`. Dashboard becomes opt-in for adopted projects.
- `.gitignore` (blueprint's own) — add `/.agency/` defensively.
- `templates/CLAUDE.md.python`, `templates/CLAUDE.md.nestjs` — add "Backend guardrails" block.

### Untouched
- `.claude/hooks/agency-emit.sh` — already per-user via `$HOME/.claude-agency`.
- `vendor/*` — read-only upstream.
- `orchestrator/*`, `dashboard/*` — still present, still usable by devs who opt in, not touched by adopt.
- All MCP registration (`bootstrap.sh`) — already global per-user.

## 9. Developer workflow

### Day 0 — one-time setup

Layout A:
```bash
git clone --recurse-submodules <blueprint-url> ~/work/claude-agency-blueprint
~/work/claude-agency-blueprint/scripts/bootstrap.sh
echo 'export BLUEPRINT_DIR=~/work/claude-agency-blueprint' >> ~/.zshrc
```

Layout B:
```bash
cd ~/work/searchatlas-backend-api
git clone --recurse-submodules <blueprint-url> .agency
./.agency/scripts/bootstrap.sh
```

### Day 1 — adopt into a repo

```bash
cd ~/work/searchatlas-backend-api
git switch -c chore/agency-adopt-local
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python
claude
```

### Updates

- Layout A: `git -C "$BLUEPRINT_DIR" pull && git -C "$BLUEPRINT_DIR" submodule update --remote`. Symlinked content propagates automatically. Re-run adopt with `--force` to refresh copied files.
- Layout B: same, but inside `.agency/`.

### Uninstall

```bash
"$BLUEPRINT_DIR/scripts/adopt.sh" --uninstall
```

Removes `.claude/`, `.claude.bak-*`, the two `.gitignore` lines adopt added. Nothing else.

## 10. Safety & rollback

| Threat | Mitigation |
|---|---|
| Teammates who haven't adopted see breakage | `.claude/` is gitignored. Only shared diff is `CLAUDE.md` + `.pre-commit-config.yaml` + two `.gitignore` lines, all inert without Claude Code. |
| adopt corrupts an existing `.claude/` | Aborts without marker file. `--force` moves existing `.claude/` to `.claude.bak-<timestamp>/`; never deletes. |
| Uncommitted work mixed into adopt output | Aborts on dirty working tree unless `--force`. |
| Dead symlinks after blueprint folder moves (Layout A) | `adopt.sh --doctor` detects; wired as `SessionStart` hook so next `claude` invocation prints a loud warning. Layout B is immune (relative symlinks). |
| Secrets/creds leak | Existing `Write(.env*)`, `Write(**/*credentials*)`, `Write(**/*secret*)` deny-list preserved. `.claude/` gitignored, so nothing adopt writes can reach remote. |
| Hooks fire unexpectedly in unrelated projects | Hooks live in project-local `.claude/hooks/`. Projects without adoption have nothing. |
| Backend ops run directly against prod | `--profile backend` deny-list blocks migrations, DB shells, cloud CLIs, pushes to protected branches. |

### Rollback ladder
1. `adopt.sh --uninstall` — cheapest, targeted.
2. Manual: `rm -rf .claude/ .claude.bak-*` + `git checkout .gitignore CLAUDE.md .pre-commit-config.yaml`.
3. Delete the blueprint clone — all references go dead, nothing else affected.
4. `claude plugin uninstall superpowers && claude mcp remove ...` — fully reverse bootstrap.

## 11. Testing & verification

### Layer 1 — automated (`scripts/test-adopt.sh`)

For each of 8 combinations (2 layouts × 4 frameworks):

1. Create ephemeral test project via `mktemp -d`. `git init`. One commit.
2. Run `adopt.sh --framework <fw>` in the appropriate layout.
3. Assert:
   - `.claude/.adopted-from-blueprint` exists and is valid JSON.
   - `ls -L .claude/skills/brainstorming/SKILL.md` resolves.
   - `.claude/agents/backend-dev.md` is a regular file (not a symlink).
   - `.gitignore` contains `/.claude/` exactly once (idempotent — re-run must not duplicate).
   - `git status` shows only the expected files as changed.
4. Run `adopt.sh --uninstall`. Assert `.claude/` gone, `.gitignore` lines removed.
5. Re-run adopt. Run `adopt.sh --force` to overwrite. Assert `.claude.bak-*` created.

### Layer 2 — manual smoke test

One volunteer dev, one real backend repo, on their branch:

1. Timed end-to-end Layout A setup from `docs/LOCAL-ADOPTION.md`. Target: under 10 minutes.
2. Paste a real ticket URL. Verify `/ticket` fires and walks through to PR creation (don't merge).
3. Ask Claude to run `alembic upgrade head`. Verify deny.
4. Move blueprint folder. Run `adopt.sh --doctor`. Verify actionable error.
5. `adopt.sh --uninstall`. Verify `git status` clean and repo identical to pre-adopt state.

### Release gate

All 8 automated cases pass + smoke test passes on a volunteer's real backend repo. Only then does `docs/TEAM-ONBOARDING.md` get shared with other projects.

## 12. Out of scope for this spec

- Automating MCP installation on the team's behalf. `bootstrap.sh` stays a manual run.
- Centralized telemetry/observability across devs. Events remain per-user in `$HOME/.claude-agency/`.
- Team-wide config sync. If the team later wants shared config, that's a separate spec — likely a committed `.claude/shared/` layer.
- Windows support. Current design assumes POSIX shells and symlinks. Windows support is a separate spec.

## 13. Open questions

None — design is ready for implementation planning.
