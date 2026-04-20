#!/usr/bin/env bash
# finish.sh — run the release gate on the current worktree: lint + test + typecheck.
# Used by /ticket Phase 7-8. Returns non-zero if any gate fails; stdout lists failures.
#
# Usage:  scripts/workflow/finish.sh

set -uo pipefail

log() { printf '\033[1;34m[finish]\033[0m %s\n' "$*" >&2; }
warn(){ printf '\033[1;33m[finish]\033[0m %s\n' "$*" >&2; }
fail(){ printf '\033[1;31m[finish]\033[0m %s\n' "$*" >&2; }

failures=()

run_gate() {
  local name="$1"; shift
  log "Running: $name"
  if "$@"; then
    log "  ✓ $name"
  else
    failures+=("$name")
    fail "  ✗ $name"
  fi
}

# Detect stack
HAS_NODE=false
HAS_PYTHON=false
[[ -f package.json ]]   && HAS_NODE=true
[[ -f pyproject.toml || -f requirements.txt || -f setup.py ]] && HAS_PYTHON=true

# Pick the package manager
if $HAS_NODE; then
  if   command -v pnpm >/dev/null 2>&1 && [[ -f pnpm-lock.yaml ]]; then PM=pnpm
  elif command -v yarn >/dev/null 2>&1 && [[ -f yarn.lock ]];      then PM=yarn
  else PM=npm; fi
fi

# Pre-commit (covers lint, format, gitleaks)
if command -v pre-commit >/dev/null 2>&1 && [[ -f .pre-commit-config.yaml ]]; then
  run_gate "pre-commit run --all-files" pre-commit run --all-files
else
  # Fallbacks if no pre-commit
  if $HAS_PYTHON && command -v flake8 >/dev/null 2>&1; then
    run_gate "flake8" flake8 .
  fi
  if $HAS_NODE; then
    run_gate "$PM lint" $PM run lint --if-present
  fi
fi

# Typecheck
if $HAS_NODE && [[ -f tsconfig.json ]]; then
  run_gate "$PM typecheck" $PM run typecheck --if-present
fi
if $HAS_PYTHON && command -v mypy >/dev/null 2>&1 && [[ -d src ]]; then
  run_gate "mypy src" mypy src
fi

# Tests
if $HAS_NODE; then
  run_gate "$PM test" $PM test --if-present -- --run
fi
if $HAS_PYTHON && command -v pytest >/dev/null 2>&1; then
  run_gate "pytest" pytest -x
fi

# Report
if [[ ${#failures[@]} -eq 0 ]]; then
  log "All gates passed."
  exit 0
fi

fail "Failed gates:"
for f in "${failures[@]}"; do fail "  - $f"; done
exit 1
