#!/usr/bin/env bash
# inbox-wait.sh — blocking: wait up to N seconds for an operator reply.
# Usage:  .claude/hooks/inbox-wait.sh "<question>" [timeout-seconds] [session-id]
#
# Behavior:
#   1. Emits a `notification` event so the dashboard flips this agent to "waiting"
#      (with the question as the notification text).
#   2. Polls ~/.claude-agency/inbox/<session>.txt every 2s.
#   3. On reply: prints it, archives the file, returns 0.
#   4. On timeout: prints a timeout notice on stderr, returns 1.

set -u

QUESTION="${1:-Operator input required}"
TIMEOUT="${2:-120}"
SESSION="${3:-${CLAUDE_SESSION_ID:-$$}}"

AGENCY_HOME="${CLAUDE_AGENCY_HOME:-$HOME/.claude-agency}"
INBOX_DIR="$AGENCY_HOME/inbox"
OUTBOX_DIR="$AGENCY_HOME/outbox"
INBOX="$INBOX_DIR/$SESSION.txt"
mkdir -p "$INBOX_DIR" "$OUTBOX_DIR"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Announce the block to the dashboard by firing a `notification` event
CLAUDE_SESSION_ID="$SESSION" \
CLAUDE_NOTIFICATION_MESSAGE="$QUESTION" \
  "$HOOK_DIR/agency-emit.sh" notification >/dev/null 2>&1 || true

echo "[inbox-wait] waiting up to ${TIMEOUT}s for operator reply via dashboard"
echo "[inbox-wait] question: $QUESTION"
echo "[inbox-wait] (dashboard: http://127.0.0.1:7842  ·  inbox file: $INBOX)"

# 2. Poll
END=$((SECONDS + TIMEOUT))
while (( SECONDS < END )); do
  if [[ -s "$INBOX" ]]; then
    body="$(cat "$INBOX")"
    mv "$INBOX" "$OUTBOX_DIR/${SESSION}-$(date +%s).txt"
    printf '\n===== operator reply =====\n%s\n===== end reply =====\n' "$body"
    exit 0
  fi
  sleep 2
done

# 3. Timeout
echo "" >&2
echo "[inbox-wait] timed out after ${TIMEOUT}s — no reply from operator" >&2
exit 1
