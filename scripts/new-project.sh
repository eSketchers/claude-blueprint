#!/usr/bin/env bash
# new-project.sh — copy the blueprint into a new project directory.
# Usage:  ./scripts/new-project.sh <project-name> <python|node|nextjs|nestjs>

set -euo pipefail

log() { printf '\033[1;34m[new-project]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ $# -eq 2 ]] || die "Usage: $0 <project-name> <python|node|nextjs|nestjs>"

NAME="$1"
FRAMEWORK="$2"

case "$FRAMEWORK" in
  python|node|nextjs|nestjs) ;;
  *) die "Unknown framework: $FRAMEWORK (expected: python, node, nextjs, nestjs)" ;;
esac

TARGET="$(pwd)/$NAME"
[[ -e "$TARGET" ]] && die "Target already exists: $TARGET"

log "Creating $TARGET ..."
mkdir -p "$TARGET"

# --- .claude/ baseline ---
cp -R "$BLUEPRINT_DIR/.claude" "$TARGET/.claude"

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

# Claude
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

log "Done."
log "Next:"
log "  cd $NAME"
log "  claude    # launch Claude Code in this project"
