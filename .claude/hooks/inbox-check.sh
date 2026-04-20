#!/usr/bin/env bash
# inbox-check.sh — non-blocking: pull any pending operator reply for this session.
# Usage:  .claude/hooks/inbox-check.sh [session-id]
#
# stdout: the reply body if present, OR "(inbox empty ...)" if not.
# Side effect: moves the inbox file to $AGENCY_HOME/outbox/<session>-<ts>.txt so we don't double-consume.

set -u

SESSION="${1:-${CLAUDE_SESSION_ID:-$$}}"
AGENCY_HOME="${CLAUDE_AGENCY_HOME:-$HOME/.claude-agency}"
INBOX="$AGENCY_HOME/inbox/$SESSION.txt"
OUTBOX_DIR="$AGENCY_HOME/outbox"
mkdir -p "$AGENCY_HOME/inbox" "$OUTBOX_DIR"

if [[ ! -s "$INBOX" ]]; then
  echo "(inbox empty for session $SESSION)"
  exit 0
fi

# Print then archive
cat "$INBOX"
mv "$INBOX" "$OUTBOX_DIR/${SESSION}-$(date +%s).txt"
