#!/usr/bin/env bash
# Rotate events.jsonl when it gets too large

EVENTS_FILE="$HOME/.claude-agency/events.jsonl"
MAX_SIZE=$((100 * 1024 * 1024)) # 100MB
ARCHIVE_DIR="$HOME/.claude-agency/archive"

if [[ ! -f "$EVENTS_FILE" ]]; then
  echo "No events file to rotate"
  exit 0
fi

SIZE=$(stat -f%z "$EVENTS_FILE" 2>/dev/null || stat -c%s "$EVENTS_FILE")

if [[ $SIZE -gt $MAX_SIZE ]]; then
  mkdir -p "$ARCHIVE_DIR"
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  ARCHIVE_FILE="$ARCHIVE_DIR/events-$TIMESTAMP.jsonl"

  echo "Rotating $EVENTS_FILE to $ARCHIVE_FILE"
  mv "$EVENTS_FILE" "$ARCHIVE_FILE"
  touch "$EVENTS_FILE"

  # Keep only last 30 days of archives
  find "$ARCHIVE_DIR" -name "events-*.jsonl" -mtime +30 -delete
fi
