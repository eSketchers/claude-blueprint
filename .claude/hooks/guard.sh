#!/usr/bin/env bash
# guard.sh — wraps a hook invocation so failures are logged persistently
# instead of vanishing after the transcript's ephemeral "hook error" notice.
#
# Claude Code already treats a non-zero, non-2 exit as a "non-blocking error"
# (transcript note + debug log) and exit 2 as a blocking error fed back to
# Claude — see https://code.claude.com/docs/en/hooks.md. This wrapper does
# NOT change that: it re-exits with the wrapped hook's exact original exit
# code and passes stdout/stderr through untouched. It only adds a durable,
# cross-session record at ~/.claude-agency/hook-errors.log so an operator (or
# the dashboard/orchestrator) can see repeated hook failures, which today
# leave no trace once the transcript scrolls past.
#
# Usage (from .claude/settings.json):
#   .claude/hooks/guard.sh <hook-name> <real-script> [args...]
#
# <hook-name> is a short label for the log (e.g. "detect-ticket"), not a path.

set -u

HOOK_NAME="${1:?guard.sh: missing <hook-name>}"
shift
REAL_SCRIPT="${1:?guard.sh: missing <real-script>}"
shift

AGENCY_HOME="${CLAUDE_AGENCY_HOME:-$HOME/.claude-agency}"
ERROR_LOG="$AGENCY_HOME/hook-errors.log"

STDOUT_FILE="$(mktemp)"
STDERR_FILE="$(mktemp)"
cleanup() { rm -f "$STDOUT_FILE" "$STDERR_FILE"; }
trap cleanup EXIT

"$REAL_SCRIPT" "$@" >"$STDOUT_FILE" 2>"$STDERR_FILE"
CODE=$?

# Pass output through untouched regardless of outcome — guard.sh must be
# transparent to Claude Code's own hook semantics (stdout context injection
# for UserPromptSubmit/SessionStart, exit-2 blocking behavior, etc.).
cat "$STDOUT_FILE"
cat "$STDERR_FILE" >&2

if [[ "$CODE" -ne 0 ]]; then
  mkdir -p "$AGENCY_HOME" 2>/dev/null || true
  TS="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)"
  STDERR_HEAD="$(head -c 500 "$STDERR_FILE" | tr '\n' ' ')"
  {
    if command -v python3 >/dev/null 2>&1; then
      python3 -c '
import json, sys
ts, hook, code, script, stderr = sys.argv[1:6]
print(json.dumps({"ts": ts, "hook": hook, "exit_code": int(code), "script": script, "stderr": stderr}))
' "$TS" "$HOOK_NAME" "$CODE" "$REAL_SCRIPT" "$STDERR_HEAD"
    else
      printf '{"ts":"%s","hook":"%s","exit_code":%s,"script":"%s"}\n' "$TS" "$HOOK_NAME" "$CODE" "$REAL_SCRIPT"
    fi
  } >> "$ERROR_LOG" 2>/dev/null || true
fi

exit "$CODE"
