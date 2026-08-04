#!/usr/bin/env bash
# log-triage-cron.sh — headless wrapper that runs the /log-triage command on a schedule.
#
# Designed for launchd/cron on the machine that already has your log-source creds, `gh` auth,
# and the service repo checkouts (see log-triage/README.md). Logs each run to
# reports/log-triage-cron.log.
#
# Usage:
#   ./scripts/log-triage-cron.sh                 # real run (fix + draft PR)
#   ./scripts/log-triage-cron.sh --report-only   # scan + report, no code changes
#
# Any extra args are passed through to the /log-triage command.

set -euo pipefail

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BLUEPRINT_DIR"

# launchd/cron run with a minimal PATH — add the usual locations for claude/aws/gh/node.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

CLAUDE_BIN="$(command -v claude || true)"
if [ -z "$CLAUDE_BIN" ]; then
  echo "error: 'claude' CLI not found on PATH. Install Claude Code or fix PATH in this wrapper." >&2
  exit 127
fi

mkdir -p reports
LOG="$BLUEPRINT_DIR/reports/log-triage-cron.log"

{
  echo "===== log-triage run: $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="
  "$CLAUDE_BIN" -p "/log-triage $*"
  echo "===== end run: $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="
  echo
} >> "$LOG" 2>&1
