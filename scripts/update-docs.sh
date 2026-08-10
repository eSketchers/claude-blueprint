#!/usr/bin/env bash
# update-docs.sh — the single integration seam for the auto-docs pipeline.
#
# The pre-push hook calls this to generate docs that travel WITH the code.
# Other triggers (n8n, orchestrator, cron) can also call it.
#
# Usage:
#   ./scripts/update-docs.sh --range <A>..<B> --in-place     # stage docs onto current branch
#   ./scripts/update-docs.sh --local --in-place               # default HEAD~1..HEAD
#   ./scripts/update-docs.sh --range A..B --in-place --dry-run
#   ./scripts/update-docs.sh --range A..B --no-prompt          # headless, no operator questions

set -euo pipefail

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BLUEPRINT_DIR"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

RANGE=""
DRY_RUN=0
MODE="local"
IN_PLACE=0
NO_PROMPT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --range) RANGE="$2"; shift 2 ;;
    --ci)    MODE="ci"; shift ;;
    --local) MODE="local"; shift ;;
    --in-place) IN_PLACE=1; shift ;;
    --no-prompt) NO_PROMPT="--no-prompt"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

# Resolve the range.
if [[ -z "$RANGE" ]]; then
  if [[ "$MODE" == "ci" && -n "${GITHUB_EVENT_BEFORE:-}" && -n "${GITHUB_SHA:-}" ]]; then
    BEFORE="$GITHUB_EVENT_BEFORE"
    if [[ "$BEFORE" =~ ^0+$ ]]; then RANGE="HEAD~1..HEAD"; else RANGE="${BEFORE}..${GITHUB_SHA}"; fi
  else
    RANGE="HEAD~1..HEAD"
  fi
fi

CLAUDE_BIN="$(command -v claude || true)"
if [[ -z "$CLAUDE_BIN" ]]; then echo "error: 'claude' CLI not found on PATH" >&2; exit 127; fi

BASE_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

run() { if [[ $DRY_RUN -eq 1 ]]; then printf 'DRY: %s\n' "$*"; else eval "$@"; fi; }

mkdir -p reports
echo "===== update-docs: $(date -u +%Y-%m-%dT%H:%M:%SZ) range=$RANGE base=$BASE_BRANCH in-place=$IN_PLACE =====" | tee -a reports/update-docs.log

# Run the doc generation headless.
if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY: $CLAUDE_BIN -p \"/update-docs --report-only --range $RANGE $NO_PROMPT\""
else
  "$CLAUDE_BIN" -p "/update-docs --range $RANGE $NO_PROMPT" >> reports/update-docs.log 2>&1 || true
fi

# Check if docs actually changed.
if [[ $DRY_RUN -eq 0 ]] && git diff --quiet -- docs/; then
  echo "No docs changes — nothing to deliver." | tee -a reports/update-docs.log
  exit 0
fi

# --in-place: stage docs onto the CURRENT branch (for the pre-push hook) so
# they travel with the developer's own push. No separate branch, no PR.
if [[ $IN_PLACE -eq 1 ]]; then
  run "git add \"$(git rev-parse --show-toplevel)/docs\""
  echo "Staged docs/ onto $BASE_BRANCH (in-place)." | tee -a reports/update-docs.log
  exit 0
fi

# Fallback: standalone commit on the current branch (for manual / cron runs).
run "git add docs/"
run "git -c user.name='claude-docs-bot' -c user.email='noreply@anthropic.com' commit -m \"docs: auto-update for $RANGE\" -m \"Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>\""
echo "Committed docs/ onto $BASE_BRANCH." | tee -a reports/update-docs.log
