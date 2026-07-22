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

# Claim (atomic rename) BEFORE reading. If we read first and archive after,
# a reply that lands from the dashboard between the read and the archive is
# silently lost (archived without ever being seen). Claiming first means any
# such late write instead creates a fresh $INBOX file that a later
# inbox-check/inbox-wait run will pick up.
#
# Archive name includes PID + nanoseconds (falls back to seconds if the date
# binary doesn't support %N, e.g. macOS /bin/date): two claims for the same
# session within the same wall-clock second must not collide and silently
# overwrite each other's archived reply — `date +%s` alone isn't unique enough
# once claim-then-read makes back-to-back consumption a normal pattern.
STAMP="$(date +%s%N 2>/dev/null || date +%s)"
ARCHIVE="$OUTBOX_DIR/${SESSION}-${STAMP}-$$.txt"
mv "$INBOX" "$ARCHIVE"
cat "$ARCHIVE"
