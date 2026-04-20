#!/usr/bin/env bash
# start-orchestrator.sh — boot the orchestrator daemon in the background.

set -euo pipefail

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/.claude-agency"
PIDFILE="$LOG_DIR/orchestrator.pid"
LOGFILE="$LOG_DIR/orchestrator.log"

mkdir -p "$LOG_DIR"

if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "[start-orchestrator] already running (pid $(cat "$PIDFILE"))"
  exit 0
fi

if [[ ! -f "$BLUEPRINT_DIR/config/orchestrator.json" ]]; then
  echo "[start-orchestrator] config/orchestrator.json not found."
  echo "  Copy config/orchestrator.example.json to config/orchestrator.json and edit it first."
  exit 1
fi

nohup node "$BLUEPRINT_DIR/orchestrator/server.mjs" \
  > "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

sleep 0.5
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "[start-orchestrator] started (pid $(cat "$PIDFILE"))"
  echo "[start-orchestrator] log: $LOGFILE"
else
  echo "[start-orchestrator] failed to start — check $LOGFILE"
  rm -f "$PIDFILE"
  exit 1
fi
