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
