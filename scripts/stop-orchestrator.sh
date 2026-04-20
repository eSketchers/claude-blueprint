#!/usr/bin/env bash
# stop-orchestrator.sh — halt the orchestrator daemon.

set -euo pipefail

PIDFILE="$HOME/.claude-agency/orchestrator.pid"

if [[ ! -f "$PIDFILE" ]]; then
  echo "[stop-orchestrator] not running (no pidfile)"
  exit 0
fi

pid="$(cat "$PIDFILE")"
if kill -0 "$pid" 2>/dev/null; then
  kill -TERM "$pid"
  sleep 1
  kill -0 "$pid" 2>/dev/null && { echo "[stop-orchestrator] force killing $pid"; kill -KILL "$pid"; }
  echo "[stop-orchestrator] stopped (pid $pid)"
else
  echo "[stop-orchestrator] stale pidfile (process $pid not found)"
fi
rm -f "$PIDFILE"
