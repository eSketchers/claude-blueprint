# Design: Fold Auto-Docs into HEAD Commit via Pre-Push Amend

**Date:** 2026-08-11
**Status:** Approved

## Problem

The current pre-push hook generates updated docs and delivers them as a **separate commit** on top of the developer's code commits. This pollutes the git log with a mechanical docs commit that is visually separate from the code change that produced it.

```
# current git log
abc1234  docs: auto-update for a1b2..HEAD   ← unwanted separate commit
def5678  feat: add game logic               ← developer's actual commit
```

## Goal

Docs are silently folded into the developer's last commit. The git log stays clean — one commit, code + docs together.

```
# desired git log
def5678  feat: add game logic               ← same commit, now includes docs/
```

## Approach

Amend HEAD in the pre-push hook instead of creating a new commit. Pre-push fires before anything reaches the remote, so amending local history is safe and has no effect on shared history.

## Change

**File:** `hooks/pre-push.sample`

The delivery block (currently lines 43–47) changes from:

```bash
git commit -m "docs: auto-update for $RANGE" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
  --no-verify
```

To:

```bash
git commit --amend --no-edit --no-verify
```

- `--amend` — folds staged docs/ changes into the existing HEAD commit
- `--no-edit` — preserves the developer's original commit message exactly
- `--no-verify` — already present; prevents hook recursion

The log message is updated from `"committed updated docs"` → `"amended HEAD with updated docs"`.

The comment block at the top of the hook is updated to describe the new behavior.

## Scope

| File | Change |
|------|--------|
| `hooks/pre-push.sample` | Amend instead of new commit; update comments and log message |
| Everything else | No change |

`scripts/update-docs.sh` and all collector/extractor scripts are untouched — staging (`git add docs/`) already works correctly; only the delivery step changes.

## Edge Cases

| Case | Handled by |
|------|-----------|
| Doc generation fails | Hook already exits 0 (non-blocking); no amend attempted |
| No doc changes | `git diff --cached --quiet -- docs/` check skips the amend |
| Rebase in progress / detached HEAD | Existing guard on line 19 of the hook exits early |
| Docs-only branch push | Existing `docs/*` branch guard exits early |
| First commit on a new branch | Amend works on any HEAD commit; safe |

## Testing

No shell-level tests exist for the hook. Manual verification: push a branch, confirm git log shows one commit (not two), confirm docs/ changes are present in that commit.
