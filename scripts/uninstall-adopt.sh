#!/usr/bin/env bash
# uninstall-adopt.sh — convenience wrapper; equivalent to `adopt.sh --uninstall`.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/adopt.sh" --uninstall "$@"
