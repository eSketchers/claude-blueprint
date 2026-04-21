# Local-Only Per-Developer Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `adopt.sh` plus supporting helpers, templates, and docs so any developer can adopt the blueprint into an existing backend repo locally, via one command, in either sibling or nested layout.

**Architecture:** A single `scripts/adopt.sh` detects sibling-vs-nested mode from `$BASH_SOURCE` and `$BLUEPRINT_DIR`, then provisions a gitignored `.claude/` in the target repo using a shared symlink helper (`scripts/lib/symlinks.sh`). Upstream-managed content (superpowers skills/commands/code-reviewer) is symlinked; project-local content (role agents, hooks, settings, CLAUDE.md, pre-commit) is copied. A marker file enables safe `--force`, `--uninstall`, and `--doctor`. `new-project.sh` is refactored to share the same symlink helper.

**Tech Stack:** Bash (the blueprint's existing scripting lang), POSIX tools (`git`, `ln`, `realpath`, `mktemp`), `jq` for JSON emit/parse in marker file. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-04-21-local-only-adoption-design.md`

---

## File structure

### New files
- `scripts/lib/symlinks.sh` — shared helper: `link_absolute`, `link_relative`, `compute_relative_path`.
- `scripts/adopt.sh` — the adoption entry point.
- `scripts/uninstall-adopt.sh` — standalone, also called via `adopt.sh --uninstall`.
- `scripts/test-adopt.sh` — integration tests covering 2 layouts × 4 frameworks + idempotency + force/uninstall/doctor paths.
- `scripts/lib/backend-deny.json` — the backend-profile deny-list fragment merged into `settings.json`.
- `pre-commit/.pre-commit-config.python.yaml` — currently missing but referenced; needed for adopt.
- `pre-commit/.pre-commit-config.node.yaml` — same.
- `docs/LOCAL-ADOPTION.md` — developer-facing guide.
- `docs/TEAM-ONBOARDING.md` — one-page handoff.

### Modified files
- `scripts/new-project.sh` — replace inline `ln -sfn` calls with helper from `scripts/lib/symlinks.sh`.
- `SETUP.md` — replace `~/work/claude-agency-blueprint` literals with `$BLUEPRINT_DIR`; shrink Path B to a pointer.
- `.claude/settings.json` — add default `"env": { "CLAUDE_AGENCY_DASHBOARD": "0" }`.
- `.gitignore` (blueprint's own) — append `/.agency/`.
- `templates/CLAUDE.md.python` — append "Backend guardrails" block.
- `templates/CLAUDE.md.nestjs` — append "Backend guardrails" block.

### Untouched
- `.claude/hooks/agency-emit.sh` (already per-user via `$HOME/.claude-agency`).
- `vendor/*` (read-only upstream).
- `orchestrator/*`, `dashboard/*` (not installed by adopt; dev opts in).
- `scripts/bootstrap.sh` (already global per-user, idempotent).

---

## Task 1: Create the symlink helper library

**Files:**
- Create: `scripts/lib/symlinks.sh`
- Test: inline in `scripts/test-adopt.sh` (Task 11), but validate manually here

- [ ] **Step 1: Create `scripts/lib/symlinks.sh`**

```bash
#!/usr/bin/env bash
# symlinks.sh — shared helpers for creating symlinks in adopted projects.
#
# Sourced by scripts/adopt.sh and scripts/new-project.sh. Provides two
# link modes (absolute for sibling layout, relative for nested) and a
# path-math helper.
#
# Usage:
#   source "$BLUEPRINT_DIR/scripts/lib/symlinks.sh"
#   link_absolute /abs/src /abs/dst
#   link_relative /abs/src /abs/dst
#   compute_relative_path /abs/from /abs/to   # echoes relative path
#
# All functions are idempotent: re-running replaces existing symlinks.

set -u

link_absolute() {
  local src="$1" dst="$2"
  [[ -e "$src" ]] || { printf 'link_absolute: source missing: %s\n' "$src" >&2; return 1; }
  mkdir -p "$(dirname "$dst")"
  ln -sfn "$src" "$dst"
}

link_relative() {
  local src="$1" dst="$2"
  [[ -e "$src" ]] || { printf 'link_relative: source missing: %s\n' "$src" >&2; return 1; }
  mkdir -p "$(dirname "$dst")"
  local rel
  rel="$(compute_relative_path "$(dirname "$dst")" "$src")"
  ln -sfn "$rel" "$dst"
}

# compute_relative_path FROM_DIR TO_PATH
# Pure-bash relpath — portable, no python/perl dependency.
compute_relative_path() {
  local from="$1" to="$2"
  # Normalize by resolving . and .. where possible (but keep missing paths ok)
  from="$(cd "$from" 2>/dev/null && pwd || printf '%s' "$from")"
  # Don't require "to" to exist (symlink target may be a file we're about to create)
  local to_dir to_base
  to_dir="$(dirname "$to")"
  to_base="$(basename "$to")"
  to_dir="$(cd "$to_dir" 2>/dev/null && pwd || printf '%s' "$to_dir")"
  to="$to_dir/$to_base"

  # Split paths into arrays
  local -a from_parts to_parts
  IFS='/' read -ra from_parts <<< "${from#/}"
  IFS='/' read -ra to_parts <<< "${to#/}"

  # Strip common prefix
  local i=0
  while [[ $i -lt ${#from_parts[@]} && $i -lt ${#to_parts[@]} && "${from_parts[$i]}" == "${to_parts[$i]}" ]]; do
    ((i++))
  done

  # Up from `from` to common ancestor
  local up=""
  local j=$i
  while [[ $j -lt ${#from_parts[@]} ]]; do
    up="../$up"
    ((j++))
  done

  # Down from common ancestor to `to`
  local down=""
  while [[ $i -lt ${#to_parts[@]} ]]; do
    down="$down${to_parts[$i]}/"
    ((i++))
  done
  down="${down%/}"

  printf '%s%s' "$up" "$down"
}
```

- [ ] **Step 2: Manually verify `compute_relative_path` with a smoke test**

Run:
```bash
bash -c 'source scripts/lib/symlinks.sh
echo "$(compute_relative_path /a/b/c /a/b/d/e)"   # expected: ../d/e
echo "$(compute_relative_path /a/b /a/b/c)"       # expected: c
echo "$(compute_relative_path /a/b/c /x/y)"       # expected: ../../../x/y'
```
Expected output:
```
../d/e
c
../../../x/y
```

- [ ] **Step 3: Manually verify `link_absolute` and `link_relative`**

Run:
```bash
tmpdir=$(mktemp -d) && cd "$tmpdir"
mkdir -p blueprint/skills/foo proj/.claude/skills
echo hi > blueprint/skills/foo/SKILL.md
bash -c 'source '"$PWD"'/../scripts/lib/symlinks.sh
  link_absolute '"$PWD"'/blueprint/skills/foo '"$PWD"'/proj/.claude/skills/foo
  ls -L proj/.claude/skills/foo/SKILL.md'
```
Expected: `proj/.claude/skills/foo/SKILL.md` prints. (If `../scripts/lib/symlinks.sh` path is wrong in your shell, substitute the blueprint root.)

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/symlinks.sh
git commit -m "feat(scripts): shared absolute/relative symlink helper"
```

---

## Task 2: Create missing pre-commit config templates

**Files:**
- Create: `pre-commit/.pre-commit-config.python.yaml`
- Create: `pre-commit/.pre-commit-config.node.yaml`

These are referenced by `new-project.sh:97-100` and `adopt.sh` (Task 5) but the `pre-commit/` directory is empty today. Fix prerequisite.

- [ ] **Step 1: Create `pre-commit/.pre-commit-config.python.yaml`**

```yaml
# pre-commit config for Python projects using the agency blueprint.
# Fast, opinionated defaults. Projects may replace any block.
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.5.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/PyCQA/flake8
    rev: 7.1.0
    hooks:
      - id: flake8
        additional_dependencies: ["flake8-bugbear"]
```

- [ ] **Step 2: Create `pre-commit/.pre-commit-config.node.yaml`**

```yaml
# pre-commit config for Node / TS / Next / Nest projects using the agency blueprint.
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v3.1.0
    hooks:
      - id: prettier
        types_or: [javascript, jsx, ts, tsx, json, yaml, markdown, css]

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.5.0
    hooks:
      - id: eslint
        files: \.(js|jsx|ts|tsx)$
        additional_dependencies:
          - eslint@9.5.0
          - "@typescript-eslint/eslint-plugin@7.14.1"
          - "@typescript-eslint/parser@7.14.1"
```

- [ ] **Step 3: Verify the files are valid YAML**

Run:
```bash
python3 -c 'import yaml; yaml.safe_load(open("pre-commit/.pre-commit-config.python.yaml"))'
python3 -c 'import yaml; yaml.safe_load(open("pre-commit/.pre-commit-config.node.yaml"))'
```
Expected: both commands succeed silently (exit 0).

- [ ] **Step 4: Commit**

```bash
git add pre-commit/.pre-commit-config.python.yaml pre-commit/.pre-commit-config.node.yaml
git commit -m "feat(pre-commit): ship python + node default configs"
```

---

## Task 3: Create the backend deny-list fragment

**Files:**
- Create: `scripts/lib/backend-deny.json`

Standalone JSON file — lets `adopt.sh` `jq`-merge it into `settings.json`, rather than embedding a long literal in bash.

- [ ] **Step 1: Create `scripts/lib/backend-deny.json`**

```json
{
  "deny": [
    "Bash(psql:*)",
    "Bash(mysql:*)",
    "Bash(redis-cli:*)",
    "Bash(alembic upgrade:*)",
    "Bash(alembic downgrade:*)",
    "Bash(prisma migrate deploy:*)",
    "Bash(django-admin migrate:*)",
    "Bash(manage.py migrate:*)",
    "Bash(kubectl:*)",
    "Bash(terraform apply:*)",
    "Bash(terraform destroy:*)",
    "Bash(aws:*)",
    "Bash(gcloud:*)",
    "Bash(git push:* origin main*)",
    "Bash(git push:* origin master*)",
    "Bash(git push:* origin staging*)",
    "Bash(git push:* origin production*)",
    "Write(**/migrations/*)",
    "Write(**/alembic/versions/*)"
  ]
}
```

- [ ] **Step 2: Verify JSON is valid**

Run:
```bash
jq . scripts/lib/backend-deny.json > /dev/null
```
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/backend-deny.json
git commit -m "feat(adopt): backend-profile deny-list fragment"
```

---

## Task 4: Add "Backend guardrails" to framework templates

**Files:**
- Modify: `templates/CLAUDE.md.python` (append)
- Modify: `templates/CLAUDE.md.nestjs` (append)

- [ ] **Step 1: Read current `CLAUDE.md.python`** to confirm we append and don't replace

Run:
```bash
tail -5 templates/CLAUDE.md.python
```
Expected: shows the last 5 lines; note if there's a trailing newline.

- [ ] **Step 2: Append guardrails block to both templates**

Append (identical block) to `templates/CLAUDE.md.python` and `templates/CLAUDE.md.nestjs`:

```markdown

## Backend guardrails (non-negotiable)
- Never run migrations against any DB. Generate migration files only; humans apply them.
- Never run queries against prod/staging. Read-only local replicas only, referenced by `DATABASE_URL`.
- Never modify CI workflows without a linked ticket. CI changes are blast-radius.
- PRs touching `migrations/`, `auth/`, `billing/`, or `*_consumer.py` require a human architect review before merge, even if tests pass.
```

- [ ] **Step 3: Verify both files end with the new block**

Run:
```bash
tail -6 templates/CLAUDE.md.python
tail -6 templates/CLAUDE.md.nestjs
```
Expected: both show the "Backend guardrails (non-negotiable)" heading and 4 bullets.

- [ ] **Step 4: Commit**

```bash
git add templates/CLAUDE.md.python templates/CLAUDE.md.nestjs
git commit -m "feat(templates): backend guardrails block for python/nestjs"
```

---

## Task 5: Implement the adopt.sh skeleton (flags, mode detection, preflight)

**Files:**
- Create: `scripts/adopt.sh`

This task establishes the script shell — arg parsing, mode detection, preflight checks. No filesystem mutation yet; subsequent tasks add the mutations.

- [ ] **Step 1: Create `scripts/adopt.sh`** with flags + mode detection only

```bash
#!/usr/bin/env bash
# adopt.sh — adopt the agency blueprint into an existing repo, locally.
#
# See docs/LOCAL-ADOPTION.md for developer-facing usage.
# See docs/superpowers/specs/2026-04-21-local-only-adoption-design.md for design.
#
# Two layouts (auto-detected):
#   sibling — $BLUEPRINT_DIR set, blueprint lives outside the project (absolute symlinks)
#   nested  — script lives under <project>/.agency/scripts/ (relative symlinks)

set -euo pipefail

# ---------- Utilities ----------
log()  { printf '\033[1;34m[adopt]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- Parse flags ----------
FRAMEWORK=""
PROFILE=""
FORCE=0
NO_PRECOMMIT=0
DRY_RUN=0
ACTION="adopt"   # adopt | uninstall | doctor
QUIET=0

usage() {
  cat <<'USAGE'
Usage: adopt.sh --framework <python|node|nextjs|nestjs> [options]

Options:
  --framework F       Required. Picks CLAUDE.md template and pre-commit config.
  --profile P         'backend' merges a stricter deny-list. Default for python/nestjs.
  --force             Overwrite existing .claude/. Moves it to .claude.bak-<ts>/.
  --no-precommit      Skip `pre-commit install`.
  --dry-run           Print every op, change nothing.
  --uninstall         Remove everything adopt created, restore .gitignore.
  --doctor [--quiet]  Health-check: validate marker and symlinks.
  -h, --help          This help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --framework)   FRAMEWORK="${2:?}"; shift 2 ;;
    --profile)     PROFILE="${2:?}"; shift 2 ;;
    --force)       FORCE=1; shift ;;
    --no-precommit) NO_PRECOMMIT=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --uninstall)   ACTION="uninstall"; shift ;;
    --doctor)      ACTION="doctor"; shift ;;
    --quiet)       QUIET=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             die "Unknown flag: $1" ;;
  esac
done

# ---------- Resolve mode + blueprint dir ----------
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_BLUEPRINT="$(cd "$SCRIPT_PATH/.." && pwd)"

# Project root = first git dir walking up from $PWD
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$PROJECT_ROOT" ]] || die "Not inside a git repo. Run 'git init' first or cd into the target project."

MODE=""
if [[ "$SCRIPT_PATH" == "$PROJECT_ROOT/.agency/scripts" ]]; then
  MODE="nested"
  BLUEPRINT_RESOLVED="$PROJECT_ROOT/.agency"
elif [[ -n "${BLUEPRINT_DIR:-}" && -d "$BLUEPRINT_DIR/.claude" ]]; then
  MODE="sibling"
  BLUEPRINT_RESOLVED="$(cd "$BLUEPRINT_DIR" && pwd)"
  [[ "$BLUEPRINT_RESOLVED" == "$PROJECT_ROOT"* ]] && die "BLUEPRINT_DIR points inside the target project ($PROJECT_ROOT). Clone it to a sibling directory, or use nested mode."
else
  cat >&2 <<EOF
[error] Cannot resolve blueprint location. Pick one:

  Sibling layout:
    export BLUEPRINT_DIR=/path/to/claude-agency-blueprint
    "\$BLUEPRINT_DIR/scripts/adopt.sh" --framework <fw>

  Nested layout:
    git clone --recurse-submodules <blueprint-url> .agency
    ./.agency/scripts/adopt.sh --framework <fw>
EOF
  exit 1
fi

log "Mode: $MODE"
log "Blueprint: $BLUEPRINT_RESOLVED"
log "Project:   $PROJECT_ROOT"

# ---------- Default profile ----------
if [[ -z "$PROFILE" && ("$FRAMEWORK" == "python" || "$FRAMEWORK" == "nestjs") ]]; then
  PROFILE="backend"
fi

# ---------- Dispatch ----------
case "$ACTION" in
  adopt)     log "TODO: adopt action pending implementation (Task 6)"; exit 0 ;;
  uninstall) log "TODO: uninstall action pending implementation (Task 9)"; exit 0 ;;
  doctor)    log "TODO: doctor action pending implementation (Task 10)"; exit 0 ;;
esac
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/adopt.sh
```

- [ ] **Step 3: Smoke-test mode detection**

Run (from inside the blueprint repo):
```bash
export BLUEPRINT_DIR="$PWD"
cd /tmp && mkdir -p adopt-test-sibling && cd adopt-test-sibling
git init -q
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python
```
Expected output includes `Mode: sibling`, `Blueprint: <blueprint path>`, `Project: /tmp/adopt-test-sibling`, `TODO: adopt action pending implementation (Task 6)`.

- [ ] **Step 4: Smoke-test the error path**

Run:
```bash
unset BLUEPRINT_DIR
cd /tmp/adopt-test-sibling
# Call a path that isn't nested and has no env
/bin/bash -c 'unset BLUEPRINT_DIR; '"$(git -C $OLDPWD rev-parse --show-toplevel)"'/scripts/adopt.sh --framework python' && echo SHOULD_HAVE_FAILED || echo EXPECTED_FAIL
```
Expected: error message with both setup paths, and `EXPECTED_FAIL` printed.

- [ ] **Step 5: Cleanup + commit**

```bash
rm -rf /tmp/adopt-test-sibling
git add scripts/adopt.sh
git commit -m "feat(adopt): skeleton — flag parsing + mode detection + preflight"
```

---

## Task 6: Implement the adopt action — provision .claude/

**Files:**
- Modify: `scripts/adopt.sh` — replace `adopt)` TODO with full logic

- [ ] **Step 1: Write the failing test first**

Create `scripts/test-adopt.sh` with one test case that exercises sibling + python adopt and asserts `.claude/.adopted-from-blueprint` exists. Full test file is fleshed out in Task 11 — for now, minimum viable:

```bash
#!/usr/bin/env bash
# test-adopt.sh — integration tests for scripts/adopt.sh.
set -euo pipefail

BLUEPRINT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

assert() {
  if eval "$2"; then printf '  ok    %s\n' "$1"
  else               printf '  FAIL  %s\n' "$1"; FAILED=1
  fi
}

test_sibling_python_adopt() {
  echo "== test_sibling_python_adopt =="
  local tmp; tmp=$(mktemp -d)
  (
    cd "$tmp"
    git init -q
    git commit -q --allow-empty -m "init"
    BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python >/dev/null
  )
  assert "marker file exists" "[[ -f '$tmp/.claude/.adopted-from-blueprint' ]]"
  assert "backend-dev agent copied (regular file)" "[[ -f '$tmp/.claude/agents/backend-dev.md' && ! -L '$tmp/.claude/agents/backend-dev.md' ]]"
  assert "brainstorming skill symlinked" "[[ -L '$tmp/.claude/skills/brainstorming' && -e '$tmp/.claude/skills/brainstorming/SKILL.md' ]]"
  assert ".gitignore has /.claude/" "grep -qxF '/.claude/' '$tmp/.gitignore'"
  rm -rf "$tmp"
}

test_sibling_python_adopt
exit $FAILED
```

Make executable: `chmod +x scripts/test-adopt.sh`

- [ ] **Step 2: Run test — expect it to FAIL**

Run:
```bash
./scripts/test-adopt.sh
```
Expected: test prints `FAIL  marker file exists` (the adopt action is still a TODO).

- [ ] **Step 3: Implement the adopt action**

Replace the `adopt)` line in `scripts/adopt.sh` with the full implementation. Find the `# ---------- Dispatch ----------` block and replace the `adopt)` case with:

```bash
  adopt)
    [[ -n "$FRAMEWORK" ]] || die "--framework is required"
    case "$FRAMEWORK" in python|node|nextjs|nestjs) ;; *) die "Unknown framework: $FRAMEWORK" ;; esac

    # Preflight: working tree clean (unless --force)
    if [[ $FORCE -eq 0 ]]; then
      if ! git -C "$PROJECT_ROOT" diff --quiet || ! git -C "$PROJECT_ROOT" diff --cached --quiet; then
        die "Working tree is dirty. Commit or stash first, or pass --force."
      fi
    fi

    # Blueprint submodules must be initialized
    if [[ ! -d "$BLUEPRINT_RESOLVED/vendor/superpowers/skills" ]]; then
      log "Initializing blueprint submodules..."
      git -C "$BLUEPRINT_RESOLVED" submodule update --init --recursive
    fi

    # Existing .claude/ protection
    CLAUDE_DIR="$PROJECT_ROOT/.claude"
    if [[ -e "$CLAUDE_DIR" ]]; then
      if [[ -f "$CLAUDE_DIR/.adopted-from-blueprint" ]]; then
        log "Found prior adoption — refreshing."
      elif [[ $FORCE -eq 1 ]]; then
        local ts; ts="$(date +%Y%m%d-%H%M%S)"
        log "Existing .claude/ backed up to .claude.bak-$ts/"
        mv "$CLAUDE_DIR" "$PROJECT_ROOT/.claude.bak-$ts"
      else
        die ".claude/ exists and was not created by adopt. Re-run with --force to back it up and proceed."
      fi
    fi

    # --- Source helper ---
    # shellcheck source=scripts/lib/symlinks.sh
    source "$BLUEPRINT_RESOLVED/scripts/lib/symlinks.sh"

    # --- Layout ---
    if [[ $DRY_RUN -eq 1 ]]; then log "DRY RUN — no changes will be written"; fi

    run() { if [[ $DRY_RUN -eq 1 ]]; then printf '  DRY: %s\n' "$*"; else eval "$@"; fi; }

    run "mkdir -p \"$CLAUDE_DIR/agents\" \"$CLAUDE_DIR/commands\" \"$CLAUDE_DIR/skills\" \"$CLAUDE_DIR/hooks\""

    # Copies
    for f in "$BLUEPRINT_RESOLVED"/.claude/agents/*.md; do
      run "cp \"$f\" \"$CLAUDE_DIR/agents/$(basename "$f")\""
    done
    for f in "$BLUEPRINT_RESOLVED"/.claude/commands/*.md; do
      run "cp \"$f\" \"$CLAUDE_DIR/commands/$(basename "$f")\""
    done
    for f in "$BLUEPRINT_RESOLVED"/.claude/hooks/*.sh; do
      run "cp \"$f\" \"$CLAUDE_DIR/hooks/$(basename "$f")\""
      run "chmod +x \"$CLAUDE_DIR/hooks/$(basename "$f")\""
    done
    run "cp \"$BLUEPRINT_RESOLVED/.claude/settings.json\" \"$CLAUDE_DIR/settings.json\""

    # Symlinks (mode-dependent)
    local LINK=link_absolute
    [[ "$MODE" == "nested" ]] && LINK=link_relative

    SP="$BLUEPRINT_RESOLVED/vendor/superpowers"
    for skill_dir in "$SP"/skills/*/; do
      [[ -d "$skill_dir" ]] || continue
      sname="$(basename "$skill_dir")"
      if [[ $DRY_RUN -eq 1 ]]; then printf '  DRY: %s %s %s\n' "$LINK" "$skill_dir" "$CLAUDE_DIR/skills/$sname"
      else "$LINK" "${skill_dir%/}" "$CLAUDE_DIR/skills/$sname"
      fi
    done
    for cmd_file in "$SP"/commands/*.md; do
      [[ -f "$cmd_file" ]] || continue
      cname="$(basename "$cmd_file")"
      [[ -e "$CLAUDE_DIR/commands/$cname" ]] && continue   # don't clobber blueprint-owned commands
      if [[ $DRY_RUN -eq 1 ]]; then printf '  DRY: %s %s %s\n' "$LINK" "$cmd_file" "$CLAUDE_DIR/commands/$cname"
      else "$LINK" "$cmd_file" "$CLAUDE_DIR/commands/$cname"
      fi
    done
    if [[ -f "$SP/agents/code-reviewer.md" ]]; then
      if [[ $DRY_RUN -eq 1 ]]; then printf '  DRY: %s %s %s\n' "$LINK" "$SP/agents/code-reviewer.md" "$CLAUDE_DIR/agents/code-reviewer.md"
      else "$LINK" "$SP/agents/code-reviewer.md" "$CLAUDE_DIR/agents/code-reviewer.md"
      fi
    fi

    # Marker file
    if [[ $DRY_RUN -eq 0 ]]; then
      local sha; sha="$(git -C "$BLUEPRINT_RESOLVED" rev-parse --short HEAD 2>/dev/null || echo unknown)"
      cat > "$CLAUDE_DIR/.adopted-from-blueprint" <<EOF
{
  "blueprint_sha": "$sha",
  "blueprint_dir": "$BLUEPRINT_RESOLVED",
  "mode": "$MODE",
  "framework": "$FRAMEWORK",
  "profile": "$PROFILE",
  "adopted_at": "$(date -Iseconds)"
}
EOF
    fi

    # CLAUDE.md — only if project has none
    if [[ ! -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
      run "cp \"$BLUEPRINT_RESOLVED/templates/CLAUDE.md.$FRAMEWORK\" \"$PROJECT_ROOT/CLAUDE.md\""
    else
      log "Existing CLAUDE.md preserved. See $BLUEPRINT_RESOLVED/templates/CLAUDE.md.$FRAMEWORK for reference."
    fi

    # Gitignore append (idempotent)
    ensure_gitignore_line() {
      local line="$1"
      local gi="$PROJECT_ROOT/.gitignore"
      [[ -f "$gi" ]] || run "touch \"$gi\""
      if ! grep -qxF "$line" "$gi" 2>/dev/null; then
        run "printf '\n%s\n' \"$line\" >> \"$gi\""
      fi
    }
    ensure_gitignore_line "/.claude/"
    [[ "$MODE" == "nested" ]] && ensure_gitignore_line "/.agency/"

    # pre-commit
    if [[ $NO_PRECOMMIT -eq 0 ]]; then
      PC_SRC=""
      case "$FRAMEWORK" in
        python) PC_SRC="$BLUEPRINT_RESOLVED/pre-commit/.pre-commit-config.python.yaml" ;;
        node|nextjs|nestjs) PC_SRC="$BLUEPRINT_RESOLVED/pre-commit/.pre-commit-config.node.yaml" ;;
      esac
      if [[ -n "$PC_SRC" && -f "$PC_SRC" && ! -f "$PROJECT_ROOT/.pre-commit-config.yaml" ]]; then
        run "cp \"$PC_SRC\" \"$PROJECT_ROOT/.pre-commit-config.yaml\""
      fi
      if [[ $DRY_RUN -eq 0 ]] && command -v pre-commit >/dev/null 2>&1; then
        (cd "$PROJECT_ROOT" && pre-commit install >/dev/null 2>&1 || warn "pre-commit install failed")
      fi
    fi

    # Self-test: one symlink must resolve
    if [[ $DRY_RUN -eq 0 ]]; then
      if [[ ! -e "$CLAUDE_DIR/skills/brainstorming/SKILL.md" ]]; then
        warn "Self-test failed: .claude/skills/brainstorming/SKILL.md does not resolve"
        die "Adoption self-test failed — .claude/ may be partially provisioned. Run --uninstall to roll back."
      fi
    fi

    log "Adoption complete."
    log "  Gitignored: .claude/$([[ $MODE == nested ]] && echo ', .agency/')"
    log "  Committed:  CLAUDE.md, .pre-commit-config.yaml, .gitignore"
    log ""
    log "Next: run 'claude' in this project."
    ;;
```

- [ ] **Step 4: Re-run the test — expect PASS**

Run:
```bash
./scripts/test-adopt.sh
```
Expected output includes all `ok` lines and exits 0:
```
  ok    marker file exists
  ok    backend-dev agent copied (regular file)
  ok    brainstorming skill symlinked
  ok    .gitignore has /.claude/
```

- [ ] **Step 5: Commit**

```bash
git add scripts/adopt.sh scripts/test-adopt.sh
chmod +x scripts/test-adopt.sh
git commit -m "feat(adopt): implement adopt action — provision gitignored .claude/"
```

---

## Task 7: Merge backend-profile deny-list into settings.json

**Files:**
- Modify: `scripts/adopt.sh` — after settings.json copy, `jq`-merge the backend fragment when profile is set

- [ ] **Step 1: Write the failing test** — append to `scripts/test-adopt.sh` inside the existing file, after `test_sibling_python_adopt`:

```bash
test_backend_profile_merged() {
  echo "== test_backend_profile_merged =="
  local tmp; tmp=$(mktemp -d)
  (
    cd "$tmp"
    git init -q
    git commit -q --allow-empty -m "init"
    BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python >/dev/null
  )
  assert "deny contains alembic upgrade" "jq -e '.permissions.deny | index(\"Bash(alembic upgrade:*)\")' '$tmp/.claude/settings.json' > /dev/null"
  assert "deny contains kubectl"         "jq -e '.permissions.deny | index(\"Bash(kubectl:*)\")'         '$tmp/.claude/settings.json' > /dev/null"
  assert "deny still contains .env*"     "jq -e '.permissions.deny | index(\"Write(.env*)\")'            '$tmp/.claude/settings.json' > /dev/null"
  rm -rf "$tmp"
}

test_backend_profile_merged
```

- [ ] **Step 2: Run — expect FAIL** (the merge step isn't implemented yet)

```bash
./scripts/test-adopt.sh
```
Expected: failures on the three new `deny contains ...` assertions.

- [ ] **Step 3: Implement the merge**

In `scripts/adopt.sh`, inside the `adopt)` case, immediately after the `run "cp \"$BLUEPRINT_RESOLVED/.claude/settings.json\" \"$CLAUDE_DIR/settings.json\""` line, add:

```bash
    # Profile merge
    if [[ "$PROFILE" == "backend" ]]; then
      command -v jq >/dev/null 2>&1 || die "jq required for --profile backend merge. Install jq or pass --profile none."
      local FRAG="$BLUEPRINT_RESOLVED/scripts/lib/backend-deny.json"
      [[ -f "$FRAG" ]] || die "Missing deny fragment: $FRAG"
      if [[ $DRY_RUN -eq 0 ]]; then
        tmp_settings="$(mktemp)"
        jq --slurpfile frag "$FRAG" '
          .permissions.deny = ((.permissions.deny // []) + ($frag[0].deny // []) | unique)
        ' "$CLAUDE_DIR/settings.json" > "$tmp_settings"
        mv "$tmp_settings" "$CLAUDE_DIR/settings.json"
        log "Merged backend deny-list ($(jq '.deny | length' "$FRAG") rules)."
      else
        printf '  DRY: jq-merge backend deny-list into settings.json\n'
      fi
    fi
```

- [ ] **Step 4: Re-run — expect PASS**

```bash
./scripts/test-adopt.sh
```
Expected: all `ok` across both tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/adopt.sh scripts/test-adopt.sh
git commit -m "feat(adopt): merge --profile backend deny-list into settings.json"
```

---

## Task 8: Default CLAUDE_AGENCY_DASHBOARD=0 in settings.json

**Files:**
- Modify: `.claude/settings.json`

- [ ] **Step 1: Read current settings.json env block**

Run:
```bash
jq .env .claude/settings.json
```
Expected: `{"BLUEPRINT_VERSION":"1.0.0"}`.

- [ ] **Step 2: Edit `.claude/settings.json`** — change the `"env"` object:

```json
  "env": {
    "BLUEPRINT_VERSION": "1.0.0",
    "CLAUDE_AGENCY_DASHBOARD": "0"
  }
```

- [ ] **Step 3: Verify JSON is still valid**

Run:
```bash
jq . .claude/settings.json > /dev/null
```
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "chore(settings): default dashboard off; adopt explicitly opts in"
```

---

## Task 9: Implement --uninstall

**Files:**
- Modify: `scripts/adopt.sh` — replace `uninstall)` TODO
- Create: `scripts/uninstall-adopt.sh` — thin wrapper

- [ ] **Step 1: Write the failing test** — append to `scripts/test-adopt.sh`:

```bash
test_uninstall_is_clean() {
  echo "== test_uninstall_is_clean =="
  local tmp; tmp=$(mktemp -d)
  (
    cd "$tmp"
    git init -q
    git commit -q --allow-empty -m "init"
    BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python >/dev/null
    BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --uninstall >/dev/null
  )
  assert ".claude/ removed"          "[[ ! -e '$tmp/.claude' ]]"
  assert ".gitignore /.claude/ removed" "! grep -qxF '/.claude/' '$tmp/.gitignore' 2>/dev/null"
  rm -rf "$tmp"
}

test_uninstall_is_clean
```

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/test-adopt.sh
```

- [ ] **Step 3: Replace the `uninstall)` case** in `scripts/adopt.sh`:

```bash
  uninstall)
    CLAUDE_DIR="$PROJECT_ROOT/.claude"
    if [[ -d "$CLAUDE_DIR" && -f "$CLAUDE_DIR/.adopted-from-blueprint" ]]; then
      log "Removing $CLAUDE_DIR"
      rm -rf "$CLAUDE_DIR"
    elif [[ -d "$CLAUDE_DIR" ]]; then
      die ".claude/ exists but has no adopt marker. Not touching it. Inspect manually."
    fi
    # Remove .claude.bak-* created by --force runs (optional — only if interactive or --force)
    for bak in "$PROJECT_ROOT"/.claude.bak-*; do
      [[ -e "$bak" ]] || continue
      log "Leaving backup dir in place: $(basename "$bak")"
    done

    # Strip the two lines adopt appended to .gitignore
    GI="$PROJECT_ROOT/.gitignore"
    if [[ -f "$GI" ]]; then
      tmp_gi="$(mktemp)"
      grep -vxF -e "/.claude/" -e "/.agency/" "$GI" > "$tmp_gi" || true
      mv "$tmp_gi" "$GI"
      # If .gitignore is now empty, leave the empty file (user can delete)
    fi

    log "Uninstalled. .agency/ (if present) untouched — delete manually if desired."
    ;;
```

- [ ] **Step 4: Create the thin wrapper `scripts/uninstall-adopt.sh`**

```bash
#!/usr/bin/env bash
# uninstall-adopt.sh — convenience wrapper; equivalent to `adopt.sh --uninstall`.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/adopt.sh" --uninstall "$@"
```

Make executable: `chmod +x scripts/uninstall-adopt.sh`

- [ ] **Step 5: Re-run tests — expect PASS**

```bash
./scripts/test-adopt.sh
```

- [ ] **Step 6: Commit**

```bash
git add scripts/adopt.sh scripts/uninstall-adopt.sh
git commit -m "feat(adopt): --uninstall + standalone wrapper"
```

---

## Task 10: Implement --doctor

**Files:**
- Modify: `scripts/adopt.sh` — replace `doctor)` TODO

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-adopt.sh`:

```bash
test_doctor_reports_dead_symlink() {
  echo "== test_doctor_reports_dead_symlink =="
  local tmp blueprint_copy
  tmp=$(mktemp -d)
  blueprint_copy=$(mktemp -d)
  cp -R "$BLUEPRINT"/. "$blueprint_copy/"
  (
    cd "$tmp"
    git init -q
    git commit -q --allow-empty -m "init"
    BLUEPRINT_DIR="$blueprint_copy" "$blueprint_copy/scripts/adopt.sh" --framework python >/dev/null
  )
  # Move the blueprint — symlinks now dead
  rm -rf "$blueprint_copy"
  set +e
  (cd "$tmp" && BLUEPRINT_DIR=/nonexistent "$BLUEPRINT/scripts/adopt.sh" --doctor --quiet) 2>/dev/null
  local rc=$?
  set -e
  assert "doctor exits non-zero on broken symlinks" "[[ $rc -ne 0 ]]"
  rm -rf "$tmp"
}

test_doctor_reports_dead_symlink
```

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/test-adopt.sh
```

- [ ] **Step 3: Replace the `doctor)` case** in `scripts/adopt.sh`:

```bash
  doctor)
    CLAUDE_DIR="$PROJECT_ROOT/.claude"
    MARKER="$CLAUDE_DIR/.adopted-from-blueprint"
    [[ -f "$MARKER" ]] || { [[ $QUIET -eq 1 ]] || warn "No adopt marker in $CLAUDE_DIR"; exit 2; }

    # Walk symlinks under .claude/skills/ and .claude/commands/ and report dead ones
    DEAD=0
    while IFS= read -r link; do
      if [[ ! -e "$link" ]]; then
        [[ $QUIET -eq 1 ]] || warn "Dead symlink: $link"
        DEAD=$((DEAD+1))
      fi
    done < <(find "$CLAUDE_DIR" -type l 2>/dev/null)

    if [[ $DEAD -gt 0 ]]; then
      [[ $QUIET -eq 1 ]] || warn "$DEAD dead symlink(s). Re-run adopt.sh --force to repair."
      exit 1
    fi
    [[ $QUIET -eq 1 ]] || log "All $(find "$CLAUDE_DIR" -type l | wc -l) symlinks OK."
    ;;
```

- [ ] **Step 4: Install `--doctor` as a SessionStart hook (sibling mode only)**

In `scripts/adopt.sh`, inside the `adopt)` case, right before the final "Adoption complete" log, add:

```bash
    # Install --doctor hook (sibling mode only — nested uses relative links, immune to blueprint moves)
    if [[ "$MODE" == "sibling" && $DRY_RUN -eq 0 ]]; then
      SETTINGS="$CLAUDE_DIR/settings.json"
      tmp_settings="$(mktemp)"
      jq --arg cmd "$BLUEPRINT_RESOLVED/scripts/adopt.sh --doctor --quiet" '
        .hooks.SessionStart += [ { "hooks": [ { "type": "command", "command": $cmd } ] } ]
      ' "$SETTINGS" > "$tmp_settings"
      mv "$tmp_settings" "$SETTINGS"
    fi
```

- [ ] **Step 5: Re-run tests — expect PASS**

```bash
./scripts/test-adopt.sh
```

- [ ] **Step 6: Commit**

```bash
git add scripts/adopt.sh scripts/test-adopt.sh
git commit -m "feat(adopt): --doctor + SessionStart hook for dead-symlink detection"
```

---

## Task 11: Expand the test suite — 2 layouts × 4 frameworks + idempotency

**Files:**
- Modify: `scripts/test-adopt.sh`

- [ ] **Step 1: Replace `scripts/test-adopt.sh`** with the full matrix:

```bash
#!/usr/bin/env bash
# test-adopt.sh — integration tests for scripts/adopt.sh.
# Covers 2 layouts (sibling, nested) × 4 frameworks + idempotency, force, uninstall, doctor.
set -uo pipefail   # NOT -e: we want to keep running after failures

BLUEPRINT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
TESTS_RUN=0

assert() {
  TESTS_RUN=$((TESTS_RUN+1))
  if eval "$2"; then printf '  ok    %s\n' "$1"
  else               printf '  FAIL  %s\n' "$1"; FAILED=1
  fi
}

fresh_project() {
  local tmp; tmp=$(mktemp -d)
  (cd "$tmp" && git init -q && git commit -q --allow-empty -m init) >/dev/null
  printf '%s' "$tmp"
}

# ---------- Sibling layout, all frameworks ----------
for fw in python node nextjs nestjs; do
  echo "== sibling / $fw =="
  tmp=$(fresh_project)
  BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework "$fw" >/dev/null
  assert "[$fw] marker exists"              "[[ -f '$tmp/.claude/.adopted-from-blueprint' ]]"
  assert "[$fw] backend-dev copied"         "[[ -f '$tmp/.claude/agents/backend-dev.md' && ! -L '$tmp/.claude/agents/backend-dev.md' ]]"
  assert "[$fw] brainstorming symlinked"    "[[ -L '$tmp/.claude/skills/brainstorming' && -e '$tmp/.claude/skills/brainstorming/SKILL.md' ]]"
  assert "[$fw] .gitignore has /.claude/"   "grep -qxF '/.claude/' '$tmp/.gitignore'"
  assert "[$fw] .gitignore NO /.agency/"    "! grep -qxF '/.agency/' '$tmp/.gitignore'"
  assert "[$fw] settings.json valid JSON"   "jq . '$tmp/.claude/settings.json' > /dev/null"
  if [[ "$fw" == "python" || "$fw" == "nestjs" ]]; then
    assert "[$fw] backend deny merged"      "jq -e '.permissions.deny | index(\"Bash(alembic upgrade:*)\")' '$tmp/.claude/settings.json' > /dev/null"
  else
    assert "[$fw] no backend deny merged"   "! jq -e '.permissions.deny | index(\"Bash(alembic upgrade:*)\")' '$tmp/.claude/settings.json' > /dev/null"
  fi
  rm -rf "$tmp"
done

# ---------- Nested layout, python only ----------
echo "== nested / python =="
tmp=$(fresh_project)
mkdir -p "$tmp/.agency"
cp -R "$BLUEPRINT"/. "$tmp/.agency/"
(cd "$tmp" && "$tmp/.agency/scripts/adopt.sh" --framework python) >/dev/null
assert "[nested] marker mode=nested"          "jq -e '.mode == \"nested\"' '$tmp/.claude/.adopted-from-blueprint' > /dev/null"
assert "[nested] brainstorming is relative"   "[[ \"$(readlink '$tmp/.claude/skills/brainstorming')\" == ../* ]]"
assert "[nested] .gitignore has /.agency/"    "grep -qxF '/.agency/' '$tmp/.gitignore'"
rm -rf "$tmp"

# ---------- Idempotency: re-adopt should not duplicate .gitignore lines ----------
echo "== idempotency =="
tmp=$(fresh_project)
BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python >/dev/null
BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python >/dev/null
dupes=$(grep -cxF '/.claude/' "$tmp/.gitignore")
assert "[idem] single /.claude/ line after re-adopt" "[[ $dupes -eq 1 ]]"
rm -rf "$tmp"

# ---------- --force backs up existing .claude/ ----------
echo "== force backs up =="
tmp=$(fresh_project)
mkdir -p "$tmp/.claude" && echo junk > "$tmp/.claude/old.txt"
BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python --force >/dev/null
assert "[force] .claude.bak-* created"  "compgen -G '$tmp/.claude.bak-*' > /dev/null"
assert "[force] new marker exists"      "[[ -f '$tmp/.claude/.adopted-from-blueprint' ]]"
rm -rf "$tmp"

# ---------- --uninstall restores .gitignore ----------
echo "== uninstall =="
tmp=$(fresh_project)
BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python >/dev/null
BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --uninstall >/dev/null
assert "[uninstall] .claude/ removed"           "[[ ! -e '$tmp/.claude' ]]"
assert "[uninstall] /.claude/ gone from gitignore" "! grep -qxF '/.claude/' '$tmp/.gitignore' 2>/dev/null"
rm -rf "$tmp"

# ---------- --doctor exits non-zero on dead symlinks ----------
echo "== doctor =="
tmp=$(fresh_project)
blueprint_copy=$(mktemp -d)
cp -R "$BLUEPRINT"/. "$blueprint_copy/"
BLUEPRINT_DIR="$blueprint_copy" "$blueprint_copy/scripts/adopt.sh" --framework python >/dev/null
rm -rf "$blueprint_copy"
(cd "$tmp" && BLUEPRINT_DIR=/nonexistent "$BLUEPRINT/scripts/adopt.sh" --doctor --quiet) 2>/dev/null
rc=$?
assert "[doctor] non-zero on dead symlinks" "[[ $rc -ne 0 ]]"
rm -rf "$tmp"

# ---------- Summary ----------
echo
echo "Ran $TESTS_RUN assertions."
if [[ $FAILED -eq 0 ]]; then
  echo "ALL PASS"
  exit 0
else
  echo "FAILURES present"
  exit 1
fi
```

- [ ] **Step 2: Run the full suite — expect ALL PASS**

```bash
./scripts/test-adopt.sh
```
Expected final line: `ALL PASS`. Any failures must be fixed before proceeding.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-adopt.sh
git commit -m "test(adopt): full 2×4 matrix + idempotency + force + uninstall + doctor"
```

---

## Task 12: Refactor new-project.sh to use the shared helper

**Files:**
- Modify: `scripts/new-project.sh`

- [ ] **Step 1: Read the current symlink block** (`scripts/new-project.sh:46-82`) and confirm what to replace.

- [ ] **Step 2: Replace the three `ln -sfn` blocks** in `scripts/new-project.sh` with helper calls.

Find the block starting at `# --- Superpowers: symlink skills + commands + code-reviewer agent ---` (line ~46) and ending after `ln -sfn "$BLUEPRINT_DIR/dashboard" ...` (line ~82). Replace with:

```bash
# --- Superpowers: symlink skills + commands + code-reviewer agent ---
# shellcheck source=./lib/symlinks.sh
source "$BLUEPRINT_DIR/scripts/lib/symlinks.sh"

SP="$BLUEPRINT_DIR/vendor/superpowers"

for skill in "$SP"/skills/*/; do
  [[ -d "$skill" ]] || continue
  link_absolute "${skill%/}" "$TARGET/.claude/skills/$(basename "$skill")"
done

for cmd in "$SP"/commands/*.md; do
  [[ -f "$cmd" ]] || continue
  link_absolute "$cmd" "$TARGET/.claude/commands/$(basename "$cmd")"
done

link_absolute "$SP/agents/code-reviewer.md" "$TARGET/.claude/agents/code-reviewer.md"

# --- Our workflow commands (ticket.md, etc.) ---
if [[ -d "$BLUEPRINT_DIR/.claude/commands" ]]; then
  for cmd in "$BLUEPRINT_DIR"/.claude/commands/*.md; do
    [[ -f "$cmd" ]] || continue
    cname="$(basename "$cmd")"
    [[ -e "$TARGET/.claude/commands/$cname" ]] && continue
    cp "$cmd" "$TARGET/.claude/commands/$cname"
  done
fi

# --- Hooks ---
if [[ -d "$BLUEPRINT_DIR/.claude/hooks" ]]; then
  mkdir -p "$TARGET/.claude/hooks"
  cp -R "$BLUEPRINT_DIR"/.claude/hooks/. "$TARGET/.claude/hooks/"
  chmod +x "$TARGET"/.claude/hooks/*.sh 2>/dev/null || true
fi

# --- Dashboard (absolute symlink — shared across projects) ---
link_absolute "$BLUEPRINT_DIR/dashboard" "$TARGET/.claude/dashboard"
```

- [ ] **Step 3: Smoke-test `new-project.sh`**

Run:
```bash
cd /tmp && rm -rf np-test && "$OLDPWD/scripts/new-project.sh" np-test python
ls -L /tmp/np-test/.claude/skills/brainstorming/SKILL.md
```
Expected: `SKILL.md` path prints (symlink resolves).

- [ ] **Step 4: Cleanup + commit**

```bash
rm -rf /tmp/np-test
git add scripts/new-project.sh
git commit -m "refactor(new-project): use shared symlinks helper; drops dead-path footgun"
```

---

## Task 13: Write docs/LOCAL-ADOPTION.md

**Files:**
- Create: `docs/LOCAL-ADOPTION.md`

- [ ] **Step 1: Create the file** with complete developer-facing content:

````markdown
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

# Layout A
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python

# Layout B
./.agency/scripts/adopt.sh --framework python

claude                                            # start a session
```

## What ends up committed vs gitignored

**Committed to your repo** (small, reviewable):
- `CLAUDE.md` — project context for Claude.
- `.pre-commit-config.yaml` — team-shared lint rules.
- `.gitignore` — two new lines: `/.claude/` and (nested only) `/.agency/`.

**Gitignored** (per-developer, local only):
- `.claude/` — everything adopt creates.
- `.agency/` (nested only) — the blueprint clone.
- `$HOME/.claude-agency/` — event log and inbox, already per-user.

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

- `--profile backend` (default for python/nestjs) blocks: direct DB shells, migration apply, `kubectl`/`terraform apply`/`aws`/`gcloud`, pushes to `main|master|staging|production`.
- Claude Code cannot edit your `.env*`, `*credentials*`, `*secret*` files — hard-denied in `settings.json`.
- Nothing adopt writes leaves your laptop. The `.claude-agency/` event log is local too.
````

- [ ] **Step 2: Commit**

```bash
git add docs/LOCAL-ADOPTION.md
git commit -m "docs(adopt): local-only adoption guide"
```

---

## Task 14: Write docs/TEAM-ONBOARDING.md

**Files:**
- Create: `docs/TEAM-ONBOARDING.md`

The one-page handoff the user shares with other backend projects' developers.

- [ ] **Step 1: Create the file**:

````markdown
# Team Onboarding — Claude Agency Blueprint

Welcome. You're about to get the blueprint running against your backend project, locally, on your laptop. This takes ~10 minutes.

## What you get

- Consistent Claude Code setup across every project (role agents, slash commands, skills).
- `/ticket` workflow — paste a ClickUp/Linear/GitHub/Jira URL, Claude plans → reviews → implements → opens PR.
- Backend guardrails — Claude cannot run migrations, touch prod DBs, or push to main.
- Pre-commit hooks (lint on commit).

## What you don't get (and why)

- No shared dashboard or orchestrator. Those are opt-in extras; see `orchestrator/README.md` if you want them later.
- No committed `.claude/` in your backend repo. Each dev adopts locally; your team's config stays per-developer.

## Setup (once per machine)

### 1. Install prereqs

```bash
# macOS
brew install git jq pre-commit node python@3.11 gh
npm install -g @anthropic-ai/claude-code pnpm
pip install --user pre-commit

# Ubuntu
sudo apt install git jq python3-pip nodejs npm gh
npm install -g @anthropic-ai/claude-code pnpm
pip install --user pre-commit
```

Run `claude` once and sign in.

### 2. Clone the blueprint (sibling layout)

```bash
git clone --recurse-submodules <blueprint-url> ~/work/claude-agency-blueprint
~/work/claude-agency-blueprint/scripts/bootstrap.sh     # installs global MCPs + plugins
echo 'export BLUEPRINT_DIR=~/work/claude-agency-blueprint' >> ~/.zshrc   # or .bashrc
source ~/.zshrc
```

(Prefer nested? See `docs/LOCAL-ADOPTION.md` Layout B.)

## Adopt your project (once per repo)

```bash
cd ~/work/my-backend-project
git switch -c chore/agency-adopt-local
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python   # or node|nextjs|nestjs
```

That's it. Run `claude` in the project. Paste a ticket URL. Work.

## What shows up in your PR

- `CLAUDE.md` — new file or unchanged (adopt won't overwrite yours).
- `.pre-commit-config.yaml` — new file or unchanged.
- `.gitignore` — two lines added.
- Nothing else.

Review with your team, merge.

## Daily loop

- Edit code. `pre-commit` runs on commit.
- Paste ticket URLs. `/ticket` drives plan → review → implement → PR.
- Update the blueprint occasionally: `git -C "$BLUEPRINT_DIR" pull && git -C "$BLUEPRINT_DIR" submodule update --remote`.

## Getting help

- Full guide: `docs/LOCAL-ADOPTION.md`.
- Design rationale: `docs/superpowers/specs/2026-04-21-local-only-adoption-design.md`.
- Troubleshooting section in `docs/LOCAL-ADOPTION.md`.
- Uninstall: `"$BLUEPRINT_DIR/scripts/adopt.sh" --uninstall`.
````

- [ ] **Step 2: Commit**

```bash
git add docs/TEAM-ONBOARDING.md
git commit -m "docs(adopt): one-page team onboarding handoff"
```

---

## Task 15: Rewrite SETUP.md Path B as a pointer

**Files:**
- Modify: `SETUP.md` (lines 208–294, the "Path B — Adopt into an existing project" section)

- [ ] **Step 1: Replace the Path B section** entirely.

Find the line `## Path B — Adopt into an existing project` (around line 208). Replace everything from that heading up to (but not including) `## Running the dashboard` with:

```markdown
## Path B — Adopt into an existing project

See **[docs/LOCAL-ADOPTION.md](./docs/LOCAL-ADOPTION.md)** for the full adoption guide, or use the one-command flow:

```bash
export BLUEPRINT_DIR=~/work/claude-agency-blueprint
cd ~/path/to/existing-app
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python    # or node|nextjs|nestjs
```

The script is idempotent, detects sibling vs nested layout automatically, gitignores its output, and supports `--uninstall` and `--doctor`.

For team rollout see **[docs/TEAM-ONBOARDING.md](./docs/TEAM-ONBOARDING.md)**.

```

- [ ] **Step 2: Replace `~/work/claude-agency-blueprint` literals elsewhere in SETUP.md with `$BLUEPRINT_DIR`**

Use `grep -n` to locate them:
```bash
grep -n '~/work/claude-agency-blueprint' SETUP.md
```
Expected hits are on lines like `cd ~/work/claude-agency-blueprint` — change the context (command vs prose) as follows:
- **In code blocks**: leave one hit in the initial clone step (line ~86, `git clone ... ~/work/claude-agency-blueprint`) — devs need to see the concrete path once. Replace every subsequent command-block occurrence with `"$BLUEPRINT_DIR"`.
- **In prose**: change to `your blueprint clone (commonly at ~/work/claude-agency-blueprint)`.

- [ ] **Step 3: Verify SETUP.md still renders as valid Markdown**

Run:
```bash
head -c 500 SETUP.md
wc -l SETUP.md
```
Expected: starts with `# Agency Blueprint — Developer Setup Guide`; line count lower than before (Path B shrank).

- [ ] **Step 4: Commit**

```bash
git add SETUP.md
git commit -m "docs(setup): shrink Path B to pointer; use \$BLUEPRINT_DIR in commands"
```

---

## Task 16: Update blueprint's own .gitignore

**Files:**
- Modify: `.gitignore` (blueprint repo root)

- [ ] **Step 1: Check if a `.gitignore` exists at blueprint root**

Run:
```bash
ls -la .gitignore 2>/dev/null
cat .gitignore 2>/dev/null
```

- [ ] **Step 2: Add defensive entries**

Append to blueprint `.gitignore` (or create if missing):

```
# A dev may accidentally nest this blueprint inside another project.
.agency/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(gitignore): defensively ignore .agency/ at blueprint root"
```

---

## Task 17: Final end-to-end manual verification

No code changes — a human smoke-test before declaring done. Run through the exact flow a new team dev will follow, and write the results into the plan.

- [ ] **Step 1: Fresh sibling adoption against a throwaway repo**

```bash
export BLUEPRINT_DIR="$(pwd)"
tmp=$(mktemp -d)
cd "$tmp" && git init -q && git commit --allow-empty -m init -q
time "$BLUEPRINT_DIR/scripts/adopt.sh" --framework python
```
Expected: finishes in under 10 seconds. Marker file present. `ls -L .claude/skills/brainstorming/SKILL.md` resolves.

- [ ] **Step 2: Launch Claude Code and verify `/ticket` works**

```bash
claude
```
In Claude: type `/help`, verify `/ticket` appears. Paste any dummy URL (not a real ticket) — verify detect-ticket hook fires. Exit.

- [ ] **Step 3: Verify deny-list blocks a migration command**

Start `claude` again, ask: "Run `alembic upgrade head`." — verify Claude refuses / the permission prompt surfaces.

- [ ] **Step 4: Move blueprint folder, verify `--doctor` warns**

```bash
cd "$tmp"
mv "$BLUEPRINT_DIR" "${BLUEPRINT_DIR}.moved"
bash "${BLUEPRINT_DIR}.moved/scripts/adopt.sh" --doctor || echo "doctor exited non-zero (expected)"
mv "${BLUEPRINT_DIR}.moved" "$BLUEPRINT_DIR"
```
Expected: `--doctor` emits "Dead symlink:" lines and exits non-zero.

- [ ] **Step 5: Uninstall + verify clean**

```bash
cd "$tmp"
"$BLUEPRINT_DIR/scripts/adopt.sh" --uninstall
git status
```
Expected: no `.claude/` directory. `git status` is clean (or shows only the `.gitignore` file with a single `/.claude/` line removed — acceptable).

- [ ] **Step 6: Cleanup + final commit**

```bash
rm -rf "$tmp"
# No code change here. If smoke test surfaces any issue, fix it and commit per the affected task above.
```

---

## Self-review

**Spec coverage:**
- §1 Goal — Tasks 5–12 implement `adopt.sh`; Task 17 verifies under-10-minute dev flow.
- §2 Non-goals — respected; orchestrator/dashboard/CI untouched.
- §3 Layouts — sibling mode in Task 5 (BLUEPRINT_DIR); nested mode in Task 5 + matrix test in Task 11.
- §4 Script flags + 11-step execution — Task 5 (skeleton), Task 6 (adopt), Task 7 (profile merge), Task 9 (uninstall), Task 10 (doctor + SessionStart hook).
- §5 Copy-vs-symlink split — Task 6 step 3, matrix-verified in Task 11.
- §6 Committed-vs-gitignored — Task 6 gitignore append; Task 11 checks `.gitignore` idempotency.
- §7 Backend deny-list + guardrails — Task 3 (fragment), Task 4 (template lines), Task 7 (merge).
- §8 Blueprint edits — Task 8 (env), Task 12 (new-project.sh), Task 15 (SETUP.md), Task 16 (.gitignore).
- §9 Dev workflow — Task 13 (LOCAL-ADOPTION.md), Task 14 (TEAM-ONBOARDING.md).
- §10 Safety ladder — Task 6 (force-moves-to-bak, self-test rollback), Task 9 (uninstall), Task 10 (doctor).
- §11 Testing — Task 11 (automated matrix), Task 17 (manual smoke).
- §12 Out-of-scope — nothing in the plan violates it.

**Placeholder scan:** searched for "TODO"/"TBD"/"implement later" — the two `TODO: ... pending implementation` lines in Task 5 are placeholders that Tasks 6/9/10 replace with real code. No plan-level placeholders.

**Type consistency:** all function names (`link_absolute`, `link_relative`, `compute_relative_path`, `assert`, `fresh_project`, `run`, `ensure_gitignore_line`) are used consistently across tasks.

All spec requirements mapped to tasks. Plan ready.

---

## Notes for the implementer

- Tasks 5–10 build on each other; run `./scripts/test-adopt.sh` after each to catch regressions.
- The `run`/`DRY_RUN` indirection in Task 6 is awkward but keeps `--dry-run` fully honest without duplicating every op.
- Nested-mode relative-symlink math is the subtlest part of Task 1; the unit-level sanity check in Step 2 is worth the 30 seconds.
- If `jq` isn't on the target machine, `--profile backend` fails loudly (intentional — we don't want to silently skip security deny-list).
- The `set -euo pipefail` in `adopt.sh` means an early failure leaves a partial `.claude/`. The self-test at end catches this; the `--uninstall` path cleans up afterwards.
