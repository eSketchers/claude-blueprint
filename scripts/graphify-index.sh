#!/usr/bin/env bash
# Graphify indexing script — builds knowledge graph for faster codebase queries
#
# Usage:
#   ./scripts/graphify-index.sh [--force] [--quiet]
#
# Flags:
#   --force   Re-index even if recent index exists
#   --quiet   Suppress output
#
# Exit codes:
#   0   Success
#   1   Graphify not installed
#   2   Not in a git repo

set -euo pipefail

FORCE=0
QUIET=0
GRAPHIFY_DIR=".graphify"
INDEX_AGE_THRESHOLD_HOURS=24

# Parse args
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --quiet) QUIET=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

log() {
  if [[ "$QUIET" -eq 0 ]]; then
    echo "[graphify-index] $*" >&2
  fi
}

# Check if graphify is installed
if ! command -v graphify &>/dev/null; then
  log "graphify not installed. Run: pip install --user graphifyy"
  exit 1
fi

# Check if we're in a git repo
if ! git rev-parse --git-dir &>/dev/null; then
  log "Not in a git repository"
  exit 2
fi

# Check if we should skip (recent index exists and --force not set)
if [[ -f "$GRAPHIFY_DIR/index.json" ]] && [[ "$FORCE" -eq 0 ]]; then
  # Get file age in hours
  if [[ "$(uname)" == "Darwin" ]]; then
    AGE_HOURS=$(( ($(date +%s) - $(stat -f %m "$GRAPHIFY_DIR/index.json")) / 3600 ))
  else
    AGE_HOURS=$(( ($(date +%s) - $(stat -c %Y "$GRAPHIFY_DIR/index.json")) / 3600 ))
  fi

  if [[ "$AGE_HOURS" -lt "$INDEX_AGE_THRESHOLD_HOURS" ]]; then
    log "Index is recent (${AGE_HOURS}h old), skipping. Use --force to re-index."
    exit 0
  fi
fi

# Run indexing
log "Indexing codebase..."
START_TIME=$(date +%s)

if [[ "$QUIET" -eq 1 ]]; then
  graphify index . &>/dev/null
else
  graphify index .
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log "Indexing complete in ${DURATION}s"

# Output stats if not quiet
if [[ "$QUIET" -eq 0 ]] && [[ -f "$GRAPHIFY_DIR/index.json" ]]; then
  NODE_COUNT=$(jq '.nodes | length' "$GRAPHIFY_DIR/index.json" 2>/dev/null || echo "?")
  EDGE_COUNT=$(jq '.edges | length' "$GRAPHIFY_DIR/index.json" 2>/dev/null || echo "?")
  log "Graph: ${NODE_COUNT} nodes, ${EDGE_COUNT} edges"
fi

exit 0
