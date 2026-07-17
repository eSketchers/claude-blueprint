# Local-Only Adoption

Adopt the agency blueprint into an existing repo on your laptop — no shared infra, no team rollout. Everything the script generates is gitignored and yours alone.

## Prerequisites

- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- `git`, `jq`, `pre-commit`, Node 20+, Python 3.11+
- Global MCPs installed once: run the blueprint's `scripts/bootstrap.sh`

## Pick a layout

### Layout A — sibling (recommended)

Blueprint lives outside your project. One clone, many adopted projects.

```bash
git clone --recurse-submodules <blueprint-url> ~/work/claude-agency-blueprint
~/work/claude-agency-blueprint/scripts/bootstrap.sh
echo 'export BLUEPRINT_DIR=~/work/claude-agency-blueprint' >> ~/.zshrc   # or .bashrc
source ~/.zshrc
```

### Layout B — nested

Blueprint lives inside the project. Self-contained, no env var.

```bash
cd ~/work/my-backend-project
git clone --recurse-submodules <blueprint-url> .agency
./.agency/scripts/bootstrap.sh
```

## Adopt

```bash
cd ~/work/my-backend-project
git switch -c chore/agency-adopt-local            # isolate, even though files are gitignored

# Layout A (sibling)

# Single framework
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python

# Monorepo (multiple frameworks)
"$BLUEPRINT_DIR/scripts/adopt.sh" --frameworks "python,nextjs"

# Monorepo (auto-detect)
"$BLUEPRINT_DIR/scripts/adopt.sh" --detect

# Layout B (nested)
./.agency/scripts/adopt.sh --framework python
./.agency/scripts/adopt.sh --frameworks "python,nextjs"
./.agency/scripts/adopt.sh --detect

claude                                            # start a session
```

**Framework options:**
- `--framework F` — Single framework (python|node|nextjs|nestjs)
- `--frameworks F1,F2` — Multiple frameworks (comma-separated, for monorepos)
- `--detect` — Auto-detect all frameworks in the repo

For `python` and `nestjs`, the backend deny-list is merged automatically (`--profile backend`).

## What ends up committed vs gitignored

**Committed to your repo** (small, reviewable):
- `CLAUDE.md` — project context for Claude.
- `.pre-commit-config.yaml` — team-shared lint rules.
- `.gitignore` — two new lines: `/.claude/` and (nested only) `/.agency/`.

**Gitignored** (per-developer, local only):
- `.claude/` — everything adopt creates.
- `.agency/` (nested only) — the blueprint clone.
- `$HOME/.claude-agency/` — event log and inbox, already per-user.

## CLAUDE.md merge strategies

When you re-run adoption (e.g., to update blueprint content), the script intelligently handles your existing `CLAUDE.md`:

### Strategy: `merge` (default)

Preserves your customizations while updating blueprint sections.

```bash
scripts/adopt.sh --framework python  # uses merge by default
```

**How it works:**
- Blueprint sections are wrapped in `<!-- BEGIN BLUEPRINT -->` / `<!-- END BLUEPRINT -->` markers
- Content **before** the first marker is preserved (e.g., project-specific context)
- Content **between** markers is updated from the blueprint
- Content **after** the last marker is preserved (e.g., custom conventions)
- Creates timestamped backup: `CLAUDE.md.backup-YYYY-MM-DD-HHMMSS`

**Example custom sections:**

```markdown
# Claude Code Configuration — Python Project

## Our Team Context
- Sprint cadence: 2 weeks
- Architecture decisions: see docs/ADRs/
- Production access: read-only via AWS SSO

<!-- BEGIN BLUEPRINT -->
[Blueprint-maintained content here]
<!-- END BLUEPRINT -->

## Our Custom Tools
- Use our internal CLI: `mycorp-cli` for deployments
- Monitoring dashboard: https://grafana.mycorp.com
```

### Strategy: `overwrite`

Replaces the entire file with the fresh blueprint version.

```bash
scripts/adopt.sh --framework python --merge-strategy overwrite
```

**Use when:**
- You want to start fresh with blueprint defaults
- Your customizations are outdated or no longer needed
- Always creates a backup first

### Strategy: `backup-only`

Creates a backup without modifying `CLAUDE.md`.

```bash
scripts/adopt.sh --framework python --merge-strategy backup-only
```

**Use when:**
- You want to preserve a snapshot before manual edits
- You're testing adoption changes without affecting the file

### First adoption behavior

If no `CLAUDE.md` exists, all strategies behave identically: the blueprint version is copied as-is (with markers already included).

### Re-adoption without markers

If you adopted before markers were added (or manually removed them), the script treats your file as fully custom and uses `overwrite` strategy with a warning:

```
[warn] Existing CLAUDE.md has no blueprint markers — treating as overwrite
[adopt] Created backup: CLAUDE.md.backup-2026-07-16-143022
```

### Backup retention

Backups are never auto-deleted. Review and clean them manually:

```bash
ls -la CLAUDE.md.backup-*
rm CLAUDE.md.backup-2026-07-15-*  # after verifying merge succeeded
```

## Updates

Layout A:
```bash
git -C "$BLUEPRINT_DIR" pull
git -C "$BLUEPRINT_DIR" submodule update --remote
# Symlinked content (skills/commands) propagates automatically.
# Refresh copied files (agents, hooks, settings):
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python --force
```

Layout B:
```bash
cd ~/work/my-backend-project
git -C .agency pull
git -C .agency submodule update --remote
./.agency/scripts/adopt.sh --framework python --force
```

## Uninstall

```bash
"$BLUEPRINT_DIR/scripts/adopt.sh" --uninstall
```

Removes `.claude/` and the two `.gitignore` lines adopt added. Leaves backups (`.claude.bak-*`) and `.agency/` (nested) untouched — delete manually if you want them gone.

## Troubleshooting

**"Cannot resolve blueprint location."** — `BLUEPRINT_DIR` is unset and you're not running from a nested `.agency/`. Export the variable or `cd` into a project with a `.agency/` sibling.

**"Working tree is dirty."** — `git status` shows changes. Stash or commit first, or pass `--force`.

**"`.claude/` exists and was not created by adopt."** — You have a prior Claude Code config. Back it up yourself, or pass `--force` (adopt will move it to `.claude.bak-<timestamp>/`).

**"Dead symlink" warning at session start (Layout A)** — You moved the blueprint folder. Run `"$BLUEPRINT_DIR/scripts/adopt.sh" --framework <fw> --force` to repair.

**`jq: command not found`** — `brew install jq` or `apt install jq`. Required for `--profile backend` and the `--doctor` hook.

## Safety notes

- `--profile backend` (default for python/nestjs) blocks: direct DB shells (`psql`, `mysql`, `redis-cli`), migration apply (`alembic upgrade`, `prisma migrate deploy`, etc.), cluster CLIs (`kubectl`, `terraform apply`, `aws`, `gcloud`), pushes to `main|master|staging|production`.
- Claude Code cannot edit your `.env*`, `*credentials*`, `*secret*` files — hard-denied in `settings.json`.
- Nothing adopt writes leaves your laptop. The `.claude-agency/` event log is local too.
