#!/usr/bin/env bash
# test-adopt.sh — integration tests for scripts/adopt.sh.
set -uo pipefail   # NOT -e: keep going to see all failures

BLUEPRINT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

assert() {
  if eval "$2"; then printf '  ok    %s\n' "$1"
  else               printf '  FAIL  %s\n' "$1"; FAILED=1
  fi
}

test_sibling_python_adopt() {
  echo "== test_sibling_python_adopt =="
  local tmp rc
  tmp=$(mktemp -d)
  rc=0
  (
    cd "$tmp"
    git init -q
    git commit -q --allow-empty -m "init"
    BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python >/dev/null
  ) || rc=$?
  assert "adopt exits 0" "[[ $rc -eq 0 ]]"
  assert "marker file exists" "[[ -f '$tmp/.claude/.adopted-from-blueprint' ]]"
  assert "marker is valid JSON" "jq . '$tmp/.claude/.adopted-from-blueprint' > /dev/null 2>&1"
  assert "backend-dev agent copied (regular file)" "[[ -f '$tmp/.claude/agents/backend-dev.md' && ! -L '$tmp/.claude/agents/backend-dev.md' ]]"
  assert "brainstorming skill symlinked" "[[ -L '$tmp/.claude/skills/brainstorming' && -e '$tmp/.claude/skills/brainstorming/SKILL.md' ]]"
  assert ".gitignore has /.claude/" "grep -qxF '/.claude/' '$tmp/.gitignore'"
  rm -rf "$tmp"
}

test_sibling_python_adopt
exit $FAILED
