#!/usr/bin/env bash
# agency-emit.sh — hook helper. Appends a JSON event to ~/.claude-agency/events.jsonl.
#
# Usage (from .claude/settings.json hooks):
#   .claude/hooks/agency-emit.sh <kind> [extra_json]
#
# kind: session_start | pre_tool | post_tool | notification | stop | subagent_stop | prompt_submit
#
# Hook env vars read (names vary across Claude Code versions — fall back gracefully):
#   CLAUDE_SESSION_ID, CLAUDE_TOOL_NAME, CLAUDE_TOOL_FILE_PATH,
#   CLAUDE_USER_PROMPT, CLAUDE_PROJECT_DIR, CLAUDE_SUBAGENT_TYPE, CLAUDE_SUBAGENT_ID,
#   CLAUDE_NOTIFICATION_MESSAGE

set -u

AGENCY_HOME="${CLAUDE_AGENCY_HOME:-$HOME/.claude-agency}"
EVENTS="$AGENCY_HOME/events.jsonl"
INBOX="$AGENCY_HOME/inbox"
mkdir -p "$AGENCY_HOME" "$INBOX"

KIND="${1:-unknown}"
EXTRA="${2:-}"

# JSON-safe quote via python (ubiquitous) — falls back to raw if python missing
qjson() {
  local v="${1:-}"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$v"
  else
    printf '"%s"' "${v//\"/\\\"}"
  fi
}

TS_MS=$(( $(date +%s%N) / 1000000 ))
CWD="$(pwd)"
REPO="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$CWD")"
BRANCH="$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
TICKET="$(printf '%s' "$BRANCH" | sed -E 's#^(feat|fix|chore|spike)/##')"

SESSION_ID="${CLAUDE_SESSION_ID:-$$}"
TOOL="${CLAUDE_TOOL_NAME:-}"
FILE="${CLAUDE_TOOL_FILE_PATH:-}"
SUB_TYPE="${CLAUDE_SUBAGENT_TYPE:-}"
SUB_ID="${CLAUDE_SUBAGENT_ID:-}"
PROMPT="${CLAUDE_USER_PROMPT:-}"
NOTIF="${CLAUDE_NOTIFICATION_MESSAGE:-}"

# Truncate long strings to keep the event log small
trunc() { printf '%s' "${1:0:500}"; }

{
  printf '{'
  printf '"ts":%d' "$TS_MS"
  printf ',"kind":"%s"' "$KIND"
  printf ',"session_id":%s' "$(qjson "$SESSION_ID")"
  printf ',"repo":%s' "$(qjson "$(basename "$REPO")")"
  printf ',"repo_path":%s' "$(qjson "$REPO")"
  printf ',"branch":%s' "$(qjson "$BRANCH")"
  printf ',"ticket":%s' "$(qjson "$TICKET")"
  [[ -n "$TOOL" ]]     && printf ',"tool":%s' "$(qjson "$TOOL")"
  [[ -n "$FILE" ]]     && printf ',"file":%s' "$(qjson "$FILE")"
  [[ -n "$SUB_TYPE" ]] && printf ',"agent":%s' "$(qjson "$SUB_TYPE")"
  [[ -n "$SUB_ID" ]]   && printf ',"agent_id":%s' "$(qjson "$SUB_ID")"
  [[ -n "$PROMPT" ]]   && printf ',"prompt":%s' "$(qjson "$(trunc "$PROMPT")")"
  [[ -n "$NOTIF" ]]    && printf ',"notif":%s' "$(qjson "$(trunc "$NOTIF")")"
  [[ -n "$EXTRA" ]]    && printf ',"extra":%s' "$(qjson "$(trunc "$EXTRA")")"
  printf '}\n'
} >> "$EVENTS"

# For blocking events, also create an inbox slot the user can fill
if [[ "$KIND" == "notification" ]]; then
  SLOT="$INBOX/${SESSION_ID}.txt"
  [[ -f "$SLOT" ]] || : > "$SLOT"
fi

exit 0
