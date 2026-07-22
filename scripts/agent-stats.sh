#!/usr/bin/env bash
# agent-stats.sh — wrapper for orchestrator/agent-stats.mjs.
# Usage:
#   ./scripts/agent-stats.sh                  # last 7 days, table output
#   ./scripts/agent-stats.sh --since 24h      # last 24 hours
#   ./scripts/agent-stats.sh --since all --json  # full history, machine-readable

set -euo pipefail

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$BLUEPRINT_DIR/orchestrator/agent-stats.mjs" "$@"
