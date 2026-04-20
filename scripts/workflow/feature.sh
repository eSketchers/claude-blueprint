#!/usr/bin/env bash
# feature.sh — create an isolated git worktree for a feature / bug / chore.
# Used by the /ticket slash command in Phase 5.
#
# Usage:  scripts/workflow/feature.sh <ticket-slug> <feature|fix|chore|spike>
# Output: prints the worktree path on stdout; the caller should `cd` into it.

set -euo pipefail

die() { printf '\033[1;31m[feature]\033[0m %s\n' "$*" >&2; exit 1; }
log() { printf '\033[1;34m[feature]\033[0m %s\n' "$*" >&2; }

[[ $# -eq 2 ]] || die "Usage: $0 <ticket-slug> <feature|fix|chore|spike>"

SLUG="$1"
KIND="$2"

case "$KIND" in
  feature) PREFIX="feat" ;;
  fix)     PREFIX="fix"  ;;
  chore)   PREFIX="chore" ;;
  spike)   PREFIX="spike" ;;
  *) die "Unknown kind: $KIND (feature|fix|chore|spike)" ;;
esac

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not inside a git repository"

REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
BRANCH="$PREFIX/$SLUG"
WORKTREE="$(dirname "$REPO_ROOT")/${REPO_NAME}-${SLUG}"

# Determine base branch: prefer staging → develop → main
BASE=""
for candidate in staging develop main master; do
  if git show-ref --verify --quiet "refs/heads/$candidate" || \
     git show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
    BASE="$candidate"; break
  fi
done
[[ -z "$BASE" ]] && die "Could not find base branch (tried: staging, develop, main, master)"

log "Base branch: $BASE"

# Refresh base
git fetch origin "$BASE" --quiet || log "(fetch skipped — offline?)"

# Create branch from base if it doesn't exist
if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  log "Creating branch: $BRANCH off origin/$BASE"
  git branch "$BRANCH" "origin/$BASE" 2>/dev/null || git branch "$BRANCH" "$BASE"
else
  log "Branch $BRANCH already exists — reusing"
fi

# Create worktree if missing
if [[ -d "$WORKTREE" ]]; then
  log "Worktree already exists at $WORKTREE — reusing"
else
  log "Adding worktree: $WORKTREE"
  git worktree add "$WORKTREE" "$BRANCH"
fi

# Emit the path so callers can cd into it
printf '%s\n' "$WORKTREE"
