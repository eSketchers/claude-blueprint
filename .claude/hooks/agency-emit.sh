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

# Build the whole event object in a single python3 call instead of one
# `python3 -c` subprocess per field (was up to 7 spawns per invocation — this
# hook fires on both PreToolUse and PostToolUse for every tool call in every
# session, so that overhead was on the hottest path in the whole system;
# measured ~793ms -> ~135ms per invocation with every field populated, an
# ~83% reduction — see tests/hooks/agency-emit.test.mjs for the benchmark).
# Conditional/truncation logic that used to live in bash ([[ -n ]] checks,
# trunc()) now lives in Python too, so there's exactly one place that decides
# the event shape.
if command -v python3 >/dev/null 2>&1; then
  python3 -c '
import json, sys

ts, kind, session_id, repo, repo_path, branch, ticket, tool, file, agent, agent_id, prompt, notif, extra = sys.argv[1:]

event = {
    "ts": int(ts),
    "kind": kind,
    "session_id": session_id,
    "repo": repo,
    "repo_path": repo_path,
    "branch": branch,
    "ticket": ticket,
}
for key, value in (("tool", tool), ("file", file), ("agent", agent), ("agent_id", agent_id)):
    if value:
        event[key] = value
for key, value in (("prompt", prompt), ("notif", notif), ("extra", extra)):
    if value:
        event[key] = value[:500]

print(json.dumps(event))
' "$TS_MS" "$KIND" "$SESSION_ID" "$(basename "$REPO")" "$REPO" "$BRANCH" "$TICKET" "$TOOL" "$FILE" "$SUB_TYPE" "$SUB_ID" "$PROMPT" "$NOTIF" "$EXTRA" >> "$EVENTS"
else
  # No python3 at all (rare) — minimal bash fallback, single-line-only
  # fields assumed (best-effort; python3 is effectively always present).
  trunc() { printf '%s' "${1:0:500}"; }
  # Backslash must be escaped before the quote — escaping in the other order
  # would double-escape the backslashes this step itself just inserted.
  esc() { local v="${1:-}"; v="${v//\\/\\\\}"; printf '%s' "${v//\"/\\\"}"; }
  {
    printf '{"ts":%d,"kind":"%s","session_id":"%s","repo":"%s","repo_path":"%s","branch":"%s","ticket":"%s"' \
      "$TS_MS" "$(esc "$KIND")" "$(esc "$SESSION_ID")" "$(esc "$(basename "$REPO")")" "$(esc "$REPO")" "$(esc "$BRANCH")" "$(esc "$TICKET")"
    [[ -n "$TOOL" ]]     && printf ',"tool":"%s"' "$(esc "$TOOL")"
    [[ -n "$FILE" ]]     && printf ',"file":"%s"' "$(esc "$FILE")"
    [[ -n "$SUB_TYPE" ]] && printf ',"agent":"%s"' "$(esc "$SUB_TYPE")"
    [[ -n "$SUB_ID" ]]   && printf ',"agent_id":"%s"' "$(esc "$SUB_ID")"
    [[ -n "$PROMPT" ]]   && printf ',"prompt":"%s"' "$(esc "$(trunc "$PROMPT")")"
    [[ -n "$NOTIF" ]]    && printf ',"notif":"%s"' "$(esc "$(trunc "$NOTIF")")"
    [[ -n "$EXTRA" ]]    && printf ',"extra":"%s"' "$(esc "$(trunc "$EXTRA")")"
    printf '}\n'
  } >> "$EVENTS"
fi

# For blocking events, also create an inbox slot the user can fill.
# Use noclobber (set -C) so the create is a single atomic syscall rather than
# a check-then-act (`[[ -f ]] || ...`) that could race with the dashboard's
# /api/unblock already having written a reply here — that race could truncate
# an operator's reply that landed between the check and the create.
if [[ "$KIND" == "notification" ]]; then
  SLOT="$INBOX/${SESSION_ID}.txt"
  ( set -C; : > "$SLOT" ) 2>/dev/null || true
fi

exit 0
