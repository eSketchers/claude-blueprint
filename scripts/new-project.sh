#!/usr/bin/env bash
# new-project.sh — scaffold a new project from the blueprint.
# Usage:  ./scripts/new-project.sh <project-name> <python|node|nextjs|nestjs>
#
# What it does:
#   1. Copies our custom role agents (frontend-dev / backend-dev / devops / architect / qa-lead / data-engineer)
#   2. Symlinks superpowers skills, commands, and code-reviewer agent into the project
#   3. Symlinks the ticket workflow command
#   4. Copies the framework CLAUDE.md template + pre-commit config
#   5. Inits git, installs pre-commit hooks

set -euo pipefail

log()  { printf '\033[1;34m[new-project]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ $# -eq 2 ]] || die "Usage: $0 <project-name> <python|node|nextjs|nestjs>"

NAME="$1"
FRAMEWORK="$2"

case "$FRAMEWORK" in
  python|node|nextjs|nestjs) ;;
  *) die "Unknown framework: $FRAMEWORK" ;;
esac

# Ensure submodules are present before symlinking
if [[ ! -d "$BLUEPRINT_DIR/vendor/superpowers/skills" ]]; then
  log "Initializing blueprint submodules..."
  (cd "$BLUEPRINT_DIR" && git submodule update --init --recursive)
fi

TARGET="$(pwd)/$NAME"
[[ -e "$TARGET" ]] && die "Target already exists: $TARGET"

log "Scaffolding $TARGET ..."
mkdir -p "$TARGET/.claude/agents" "$TARGET/.claude/commands" "$TARGET/.claude/skills"

# --- Our custom role agents (copied, not symlinked — these are the project's baseline) ---
cp "$BLUEPRINT_DIR"/.claude/agents/*.md "$TARGET/.claude/agents/"
cp "$BLUEPRINT_DIR"/.claude/settings.json "$TARGET/.claude/settings.json"

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

# --- Workflow scripts (feature-ticket pipeline) ---
if [[ -d "$BLUEPRINT_DIR/scripts/workflow" ]]; then
  mkdir -p "$TARGET/scripts/workflow"
  cp -R "$BLUEPRINT_DIR"/scripts/workflow/. "$TARGET/scripts/workflow/"
  chmod +x "$TARGET"/scripts/workflow/*.sh 2>/dev/null || true
fi

# --- CLAUDE.md from framework template ---
cp "$BLUEPRINT_DIR/templates/CLAUDE.md.$FRAMEWORK" "$TARGET/CLAUDE.md"

# --- pre-commit config ---
case "$FRAMEWORK" in
  python)
    cp "$BLUEPRINT_DIR/pre-commit/.pre-commit-config.python.yaml" "$TARGET/.pre-commit-config.yaml"
    ;;
  node|nextjs|nestjs)
    cp "$BLUEPRINT_DIR/pre-commit/.pre-commit-config.node.yaml" "$TARGET/.pre-commit-config.yaml"
    ;;
esac

# --- .gitignore baseline ---
cat > "$TARGET/.gitignore" <<'GITIGNORE'
# Secrets
.env
.env.*
!.env.example
*credentials*
*secret*

# Node
node_modules/
dist/
.next/
.turbo/
coverage/

# Python
.venv/
venv/
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
.ruff_cache/
htmlcov/

# Editor
.idea/
.vscode/
*.swp
.DS_Store

# Claude — keep symlinks in git so collaborators get the same layout.
# Only ignore per-user local overrides.
.claude/settings.local.json
GITIGNORE

# --- git init + first commit ---
(
  cd "$TARGET"
  git init -q
  git add -A
  git commit -q -m "chore: scaffold from claude-agency-blueprint ($FRAMEWORK)" || true

  if command -v pre-commit >/dev/null 2>&1; then
    pre-commit install >/dev/null 2>&1 || true
  fi
)

log "Done. Symlinked into $TARGET/.claude/:"
log "  - $(ls "$TARGET/.claude/skills/" | wc -l) skills from superpowers"
log "  - $(ls "$TARGET/.claude/commands/" | wc -l) commands"
log "  - $(ls "$TARGET/.claude/agents/" | wc -l) agents"
log ""
log "Next:"
log "  cd $NAME"
log "  claude    # launch Claude Code in this project"
