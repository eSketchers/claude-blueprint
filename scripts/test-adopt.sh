#!/usr/bin/env bash
# test-adopt.sh — integration tests for scripts/adopt.sh.
# Covers 2 layouts (sibling, nested) × 4 frameworks + idempotency, force, uninstall, doctor.
set -uo pipefail   # NOT -e: we want to keep running after failures

BLUEPRINT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
TESTS_RUN=0

assert() {
  TESTS_RUN=$((TESTS_RUN+1))
  if eval "$2"; then printf '  ok    %s\n' "$1"
  else               printf '  FAIL  %s\n' "$1"; FAILED=1
  fi
}

fresh_project() {
  local tmp; tmp=$(mktemp -d)
  (cd "$tmp" && git init -q && git commit -q --allow-empty -m init) >/dev/null
  printf '%s' "$tmp"
}

# ---------- Sibling layout, all frameworks ----------
for fw in python node nextjs nestjs; do
  echo "== sibling / $fw =="
  tmp=$(fresh_project)
  (cd "$tmp" && BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework "$fw") >/dev/null
  assert "[$fw] marker exists"              "[[ -f '$tmp/.claude/.adopted-from-blueprint' ]]"
  assert "[$fw] backend-dev copied"         "[[ -f '$tmp/.claude/agents/backend-dev.md' && ! -L '$tmp/.claude/agents/backend-dev.md' ]]"
  assert "[$fw] brainstorming symlinked"    "[[ -L '$tmp/.claude/skills/brainstorming' && -e '$tmp/.claude/skills/brainstorming/SKILL.md' ]]"
  assert "[$fw] .gitignore has /.claude/"   "grep -qxF '/.claude/' '$tmp/.gitignore'"
  assert "[$fw] .gitignore NO /.agency/"    "! grep -qxF '/.agency/' '$tmp/.gitignore'"
  assert "[$fw] settings.json valid JSON"   "jq . '$tmp/.claude/settings.json' > /dev/null"
  if [[ "$fw" == "python" || "$fw" == "nestjs" ]]; then
    assert "[$fw] backend deny merged"      "jq -e '.permissions.deny | index(\"Bash(alembic upgrade:*)\")' '$tmp/.claude/settings.json' > /dev/null"
  else
    assert "[$fw] no backend deny merged"   "! jq -e '.permissions.deny | index(\"Bash(alembic upgrade:*)\")' '$tmp/.claude/settings.json' > /dev/null"
  fi
  rm -rf "$tmp"
done

# ---------- Nested layout, python only ----------
echo "== nested / python =="
tmp=$(fresh_project)
mkdir -p "$tmp/.agency"
cp -R "$BLUEPRINT"/. "$tmp/.agency/"
(cd "$tmp" && "$tmp/.agency/scripts/adopt.sh" --framework python) >/dev/null
assert "[nested] marker mode=nested"          "jq -e '.mode == \"nested\"' '$tmp/.claude/.adopted-from-blueprint' > /dev/null"
assert "[nested] brainstorming is relative"   "[[ \"\$(readlink '$tmp/.claude/skills/brainstorming')\" == ../* ]]"
assert "[nested] .gitignore has /.agency/"    "grep -qxF '/.agency/' '$tmp/.gitignore'"
rm -rf "$tmp"

# ---------- Idempotency: re-adopt should not duplicate .gitignore lines ----------
echo "== idempotency =="
tmp=$(fresh_project)
(cd "$tmp" && BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python) >/dev/null
(cd "$tmp" && BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python) >/dev/null
dupes=$(grep -cxF '/.claude/' "$tmp/.gitignore")
assert "[idem] single /.claude/ line after re-adopt" "[[ $dupes -eq 1 ]]"
rm -rf "$tmp"

# ---------- --force backs up existing .claude/ ----------
echo "== force backs up =="
tmp=$(fresh_project)
mkdir -p "$tmp/.claude" && echo junk > "$tmp/.claude/old.txt"
(cd "$tmp" && BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python --force) >/dev/null
assert "[force] .claude.bak-* created"  "compgen -G '$tmp/.claude.bak-*' > /dev/null"
assert "[force] new marker exists"      "[[ -f '$tmp/.claude/.adopted-from-blueprint' ]]"
rm -rf "$tmp"

# ---------- --uninstall restores .gitignore ----------
echo "== uninstall =="
tmp=$(fresh_project)
(cd "$tmp" && BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python) >/dev/null
(cd "$tmp" && BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --uninstall) >/dev/null
assert "[uninstall] .claude/ removed"           "[[ ! -e '$tmp/.claude' ]]"
assert "[uninstall] /.claude/ gone from gitignore" "! grep -qxF '/.claude/' '$tmp/.gitignore' 2>/dev/null"
rm -rf "$tmp"

# ---------- --doctor exits non-zero on dead symlinks ----------
echo "== doctor =="
tmp=$(fresh_project)
blueprint_copy=$(mktemp -d)
cp -R "$BLUEPRINT"/. "$blueprint_copy/"
(cd "$tmp" && BLUEPRINT_DIR="$blueprint_copy" "$blueprint_copy/scripts/adopt.sh" --framework python) >/dev/null
rm -rf "$blueprint_copy"
rc=0
# NOTE on the --framework flag below: it's a harmless no-op now that adopt.sh
# skips framework validation entirely for non-adopt actions (fixed 2026-07-20 —
# previously --doctor alone would die with "No frameworks specified" before its
# own dead-symlink logic ever ran, which made this assertion pass for the wrong
# reason). Left in place for clarity/parity with the adopt call above; a bare
# `--doctor --quiet` now works correctly too — see tests/adopt/known-bugs.test.mjs.
(cd "$tmp" && BLUEPRINT_DIR="$BLUEPRINT" "$BLUEPRINT/scripts/adopt.sh" --framework python --doctor --quiet) 2>/dev/null || rc=$?
assert "[doctor] non-zero on dead symlinks" "[[ $rc -ne 0 ]]"
rm -rf "$tmp"

# ---------- Summary ----------
echo
echo "Ran $TESTS_RUN assertions."
if [[ $FAILED -eq 0 ]]; then
  echo "ALL PASS"
  exit 0
else
  echo "FAILURES present"
  exit 1
fi
