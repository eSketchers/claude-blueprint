#!/usr/bin/env bash
# daily-digest.sh — wrapper for orchestrator/digest.mjs.
# Usage:
#   ./scripts/daily-digest.sh                  # print today's markdown
#   ./scripts/daily-digest.sh --send           # also post to Slack
#   ./scripts/daily-digest.sh --date 2026-04-19 --write  # past date, persist

set -euo pipefail

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$BLUEPRINT_DIR/orchestrator/digest.mjs" "$@"
