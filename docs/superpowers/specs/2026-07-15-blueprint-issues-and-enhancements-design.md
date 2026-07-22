# Claude Agency Blueprint: Comprehensive Issues & Enhancements Analysis

**Date:** 2026-07-15
**Analysis Type:** Component-by-Component
**Scope:** Entire claude-agency-blueprint system
**Last Updated:** 2026-07-22 (restructured into Completed / To-Do only — see "Note on document structure" below)

---

## Note on document structure (2026-07-22)

This document previously carried the same information in five or six overlapping places — a top "Implementation Status" summary, per-issue writeups, a "Remaining Work — Flat Priority List," an "Implementation Roadmap," and a "Conclusion" with its own progress summary and six separate "Key Accomplishments" sub-sections that had drifted out of sync with each other over time. It has been restructured into exactly two sections, **Completed** and **To-Do**, with every duplicate removed. Nothing substantive was deleted — each issue's full writeup (what was implemented, what was deliberately scoped out, real bugs found along the way, test coverage) is kept exactly once, in the Completed section if done, or as the original problem/solution sketch in the To-Do section if not.

**Note on prioritization scheme (2026-07-20, retained for history):** this document previously used a risk-ranked "Tier 0–6" system layered on top of the original CRITICAL/HIGH/MEDIUM/LOW labels. That system was retired by explicit user decision on 2026-07-20 — it served its purpose while safety- and confidence-critical fixes were the priority, but the remaining work didn't map cleanly onto it anymore. Priority is the flat CRITICAL/HIGH/MEDIUM/LOW scheme throughout this document. Three items were explicitly downgraded from MEDIUM to LOW as part of that change (Orchestrator Issue 4, Token Optimization Issue 1, Token Optimization Issue 6); Orchestrator Issue 4 has since been completed (see below).

**Status count (verified by re-scanning every issue's own status line, not by incrementing a summary counter):**
- **29/45 complete** — 27 fully done + 2 deliberately partial-scope completions (Orchestrator Issue 6, Adoption Issue 2 — both closed by explicit decision to ship a narrower fix rather than the original full spec; see their entries below)
- **16/45 remaining** — all LOW priority
- Full test suite: `node --test tests/` → **194/194 passing**

---

## Executive Summary

This document analyzes the claude-agency-blueprint system component-by-component:

1. **Cross-Cutting Issues** - Affect multiple components
2. **Orchestrator** - Autonomous ticket processing
3. **Dashboard** - Agent visibility & control
4. **Agent System** - Role-specialist agents
5. **Adoption & Bootstrap** - Setup experience
6. **Token Optimization** - Context reduction strategies
7. **Hooks & Integration** - Workflow automation
8. **Documentation & Developer Experience**

45 issues were identified across these 8 areas. Each is listed once below, under Completed or To-Do.

---

# Completed (29/45)

## Cross-Cutting Issues

### Issue 1: No actual token tracking system-wide

**Priority:** HIGH
**Status:** ✅ COMPLETED — PR #6 (Commit: a43694a)

**Problem:** Budget uses event-count proxy; no visibility into real costs across orchestrator/agents.

**What was implemented:** Parse Claude Code's `--output-format json`/`stream-json` for `total_cost_usd`; `orchestrator/spawn.mjs` captures real costs; `budget.mjs` got an `addRealCost(ticketId, costUsd)` method.

---

### Issue 2: Adoption overwrites existing CLAUDE.md

**Priority:** CRITICAL
**Status:** ✅ COMPLETED — PR #6 (Commit: d821fd6)

**Problem:** Users lost their custom CLAUDE.md configuration when adopting the blueprint.

**What was implemented:** Smart merge in `adopt.sh` — detects an existing CLAUDE.md, preserves the user's existing content, appends blueprint sections with `### BEGIN BLUEPRINT` / `### END BLUEPRINT` markers, backs up the original before touching it.

---

### Issue 3: Configuration backup files not gitignored

**Priority:** CRITICAL (Quick Fix)
**Status:** ✅ COMPLETED — PR #6 (Commit: 334f450)

**Problem:** `settings.json.backup-*`, `agents.backup/` added clutter to the repo.

**What was implemented:** Added `*.backup-*`, `agents.backup/`, `.claude/settings.json.backup-*` to `.gitignore`.

---

### Issue 4: Leftover .claude-flow/ directory

**Priority:** CRITICAL (Quick Fix)
**Status:** ✅ COMPLETED — PR #5 (Commit: 5a133e1), already merged to master

**Problem:** Leftover from a removed submodule; contained a stale daemon.pid and logs.

**What was implemented:** Directory removed; documented as obsolete in CHANGELOG.

---

### Issue 5: No integration tests

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 as a force-multiplier protecting the other safety fixes, under the now-retired tier system)
**Status:** ✅ COMPLETED (2026-07-19), combined with Adoption Issue 2 (monorepo auto-detection) since both are test-coverage work over the same script

**Problem:** Bootstrap, adoption, orchestrator, and dashboard had no automated testing beyond the pre-existing `scripts/test-adopt.sh` (single-framework only).

**What was implemented** (`node --test` rather than more bash scripts, matching the pattern already used elsewhere, plus a GitHub Actions workflow):
- `tests/adopt/monorepo-detection.test.mjs` (15 tests) — root-level detection for all 4 frameworks, subdirectory scanning, multi-framework monorepo detection with dedup, `--frameworks` explicit list, unknown-framework rejection, plus 3 tests locking in real limitations as documented facts (no recursion past one subdirectory level, no non-standard subdirectory names, no nx/lerna/pnpm-workspace marker recognition).
- `tests/bootstrap/bootstrap.test.mjs` (7 tests) — `bootstrap.sh` installs real global tools with network dependencies, so a real run is never exercised in CI; covers `--dry-run` side-effect-freedom, `--help`, flag combination/override behavior, and CLI presence checks.
- `.github/workflows/tests.yml` — new CI workflow: `unit-and-integration` runs the full `node --test tests/` suite, `adopt-shell-tests` runs `scripts/test-adopt.sh`.
- Did **not** write separate `test-orchestrator.sh`/`test-dashboard.sh` scripts — that ground was already covered by `tests/orchestrator/` and `tests/dashboard/`.

**Two pre-existing `adopt.sh` bugs found while adding this coverage, fixed as an immediate follow-up (2026-07-20):**
1. **macOS-only:** nested-mode detection failed with "Cannot resolve blueprint location" when the OS temp directory was reached through a symlink (`/var` → `/private/var`) — `SCRIPT_PATH` resolved via a non-canonicalizing `cd && pwd` while `PROJECT_ROOT` always canonicalized, so the two never string-matched. **Fix:** both now resolve via `pwd -P`.
2. **OS-agnostic:** `adopt.sh --uninstall`/`--doctor` validated `FRAMEWORKS.length > 0` unconditionally before dispatching on `ACTION`, dying with "No frameworks specified" even though neither action's logic references frameworks. **Fix:** the auto-detect/validate block is now gated on `[[ "$ACTION" == "adopt" ]]`.

**Tests:** `tests/adopt/known-bugs.test.mjs` (5 tests, rewritten from `test.todo()` trackers to real assertions) covering both bugs plus a guard confirming the default `adopt` action still correctly requires a framework flag. `scripts/test-adopt.sh` now passes all 37 assertions (previously 5 failing).

---

## 1. Orchestrator (Autonomous Ticket Processing)

### Issue 1: Budget enforcement uses event-count proxy

**Priority:** HIGH
**Status:** ✅ COMPLETED — PR #6 (Commit: a43694a)

**Problem:** Budget used an event-count proxy, not actual token costs, requiring manual calibration of `cost_per_event_usd`.

**What was implemented:** `spawn.mjs` uses `claude -p --output-format stream-json`, parses the final result event for `total_cost_usd`, and calls `budget.addRealCost(ticketId, costUsd)`. Event-based proxy kept as fallback for non-JSON modes. (See Cross-Cutting Issue 1.)

---

### Issue 2: No force-kill on halt

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 under the now-retired tier system)
**Status:** ✅ COMPLETED (2026-07-19)

**Problem:** The kill switch marked tickets halted but never actually terminated the spawned process.

**Location:** `orchestrator/server.mjs`, new `orchestrator/killer.mjs`

**What was implemented** (PID tracking already existed via `registry.update()` in the intake tick — only the "actually kill it" half was missing):
- New `orchestrator/killer.mjs` (`Killer` class), kept separate from `server.mjs` so it's independently unit-testable.
- `Killer.kill(ticketId, pid, reason)` sends `SIGTERM` to **the negative pid** (the process group) — `spawn.mjs` launches agents with `detached: true`, so signaling only the top-level pid would leave subprocesses (git, test runners) alive. Escalates to `SIGKILL` after `budget.kill_grace_ms` (default 30000ms) if still alive.
- Wired into two places: `onEvent()`'s halt check now calls `killer.kill()` immediately, and a new `killer.sweep(budget)` runs every tick regardless of whether a fresh hook event arrived — this is what catches a **hung** agent that stops emitting events entirely, not just one that keeps talking after being halted.
- Did **not** add a `--force-kill` flag to `stop-orchestrator.sh` — that stops the daemon itself, a different concern from killing spawned ticket agents; the kill switch already covers the latter.

**Tests:** `tests/orchestrator/killer.test.mjs` (10 unit tests against injected fakes), `killer.integration.test.mjs` (2 tests using real detached child-process trees, proving the group signal reaches a grandchild and that SIGKILL lands on a process that traps SIGTERM), `killer.wiring.test.mjs` (1 smoke test against the real `Registry`/`Budget` classes). All 13 pass.

**Known gap (acceptable):** no PID-liveness verification across orchestrator restarts — in-memory grace-period tracking is lost on daemon restart, matching existing "lost on restart" behavior already documented for stuck-detection's event window. Low risk since a restart is a rare, operator-driven event.

---

### Issue 3: No retry logic

**Priority:** HIGH
**Status:** ✅ COMPLETED — PR #6 (Commit: eba1167)

**Problem:** If a spawn crashed early, the ticket stayed stuck in `in_progress` forever.

**What was implemented:** Retry config in `orchestrator.json` (`max_attempts`, exponential `backoff_ms`), attempt count tracked in the registry, Slack notification after final failure, ticket marked `failed` after max attempts.

---

### Issue 4: ClickUp/Linear/Jira sources not implemented

**Priority:** ~~MEDIUM~~ → ~~LOW~~ (downgraded 2026-07-20) → completed 2026-07-21/22
**Status:** ✅ COMPLETED (2026-07-21/22)

**Problem:** ClickUp/Linear/Jira mentioned in docs but not implemented. (Correction 2026-07-19: the orchestrator was never strictly "GitHub-only" — `orchestrator/sources/filesystem.mjs` already existed for local JSON-file tickets — but no real issue-tracker API integration beyond GitHub existed.)

**Location:** `orchestrator/sources/`

**What was implemented:**
- `sources/clickup.mjs` — `fetchClickUp(cfg)`, polling ClickUp's v2 REST API (`GET /team/{team_id}/task`, team-scoped). Built and empirically verified against a real live ClickUp workspace (real API token, real tasks) — confirmed exact pagination (`page=N` + `last_page` boolean), that `statuses[]`/`assignees[]` must be repeated query params, and real 401 behavior on a bad token. The original design sketch for this wasn't usable as-is (`fetch()` doesn't take a `params` option, and it never called `.json()`).
- `sources/linear.mjs` — `fetchLinear(cfg)`, polling Linear's GraphQL API. Linear's docs were unavailable/redirected during development, so the schema (`identifier`/`url`/`state.name`/`labels.nodes.name`, `IssueFilter.team.key.eq`, Relay-style `pageInfo.hasNextPage`/`endCursor` pagination) was confirmed via live, unauthenticated schema introspection directly against `https://api.linear.app/graphql`. A fake API key against the real endpoint confirmed auth failures return an actual HTTP 401 with a GraphQL `errors[]` body.
- `sources/jira.mjs` — `fetchJira(cfg)`, polling Jira Cloud's REST API v3 `/search` with JQL, Basic auth (email + API token, base64). Verified the response envelope and field shape (`key`, `fields.summary`, `fields.labels` as a plain string array, `fields.status.name`) against a real, public Jira instance (issues.apache.org) — that instance runs Jira Server/Data Center on the v2 endpoint, not Cloud v3, since no private Cloud account was available; flagged explicitly rather than silently assumed identical. Known gap: Jira Cloud v3 can return `fields.description` as an Atlassian Document Format object rather than a plain string — this module treats any non-string description as absent rather than guess at ADF-to-text extraction.
- All three wired into `intakeTick()`'s source dispatch, read-only (no claim/close write-back — unlike `beads`, none of these have a dependency-graph concept to keep in sync).
- Documented in `orchestrator/README.md` and `config/orchestrator.example.json` (disabled-by-default examples, tokens always by env-var name, never inline).

**Tests:** `clickup-source.test.mjs` (13), `linear-source.test.mjs` (10), `jira-source.test.mjs` (12) — 35 total, mocking `global.fetch` with response shapes copied from real API calls/introspection. Covers shape mapping, pagination, limit-truncation short-circuiting, filter construction, and error paths.

**Unplanned addition, same pickup:** `sources/beads.mjs` — integrates [beads](https://github.com/gastownhall/beads), a dependency-graph task tracker, as an orchestrator source. Not one of the original 45 tracked issues; added because the user asked about using beads as a task-management backend. Unlike ClickUp/Linear/Jira, includes claim/close write-back (`bd update <id> --claim`, `bd close <id> --reason`) so beads' own graph stays in sync — a ticket only shows as "ready" once its dependencies are closed. Verified end-to-end against a real local `bd` install: created two dependent tasks, confirmed only the unblocked one showed as ready, claimed and closed it, confirmed the dependent then became ready. `beads-source.test.mjs` (13 tests, mocked `bd` binary). Also surfaced two real bugs while documenting this for end users: `bd init` (without `--stealth`) auto-commits its own files to the target repo unreviewed — the blueprint's own README now documents `bd init --quiet --stealth` instead; and `bd dep add <blocked-id> <blocker-id>`'s argument order is the reverse of the intuitive reading, confirmed via live testing before documenting it.

---

### Issue 6: Stuck detection may false-positive

**Priority:** MEDIUM (fixed ahead of schedule, partially, 2026-07-19 under the now-retired tier system)
**Status:** ✅ PARTIALLY COMPLETED (2026-07-19) — whitelist only, by deliberate scope decision (user chose to keep this ticket small rather than build all 4 original sub-items)

**Problem:** 10-minute idle timeout too aggressive for complex tasks.

**Location:** `orchestrator/stuck-detector.mjs`

**Scope decision — what was implemented vs. deferred:**
- ✅ Configurable whitelist to exclude specific tickets from stuck detection — implemented.
- ❌ Raise default idle_timeout_ms to 20min — not done; a separate judgment call about noise tolerance, left for a future ticket if still wanted.
- ❌ Near-stuck warnings at 50%/80% of threshold — not done; would add Slack noise, working against the goal of this fix.
- ❌ Operator "mark as working normally" reset endpoint — not done; bigger scope, needs a new dashboard API route.

**What was implemented:**
- New `isWhitelisted(ticket, whitelist)` export — glob-pattern matching against **both** the ticket id and its labels (not just id as the original example implied — real ticket ids like `gh:org/repo#42` or `fs:name:ticket-id` have no natural glob-able prefix, so labels are the more robust match target).
- `detectStuck()` short-circuits to `null` if the ticket matches `config.stuck.whitelist`, checked right after the terminal-status skip.
- `config/orchestrator.example.json` and `orchestrator/README.md` document the new field.

**Incidental finding, not fixed (out of scope):** `last_event_at: 0` is treated as "no timestamp yet" by the idle-rule guard (`0` is falsy), so a ticket whose timestamp is ever persisted as exactly `0` would never trigger idle detection. Pre-existing behavior, now locked in as documented/tested rather than silently fixed.

**Tests:** `tests/orchestrator/stuck-detector.test.mjs` (19 tests) — 8 for `isWhitelisted()` alone, whitelist integration into `detectStuck()`, plus full regression coverage of the 4 pre-existing rules.

---

## 2. Dashboard (Agent Visibility & Control)

### Issue 1: Not real-time

**Priority:** HIGH
**Status:** ✅ COMPLETED — PR #6 (Commit: 793dc5e)

**Problem:** Polled every 2s, rebuilding entire state from `events.jsonl`.

**What was implemented:** WebSocket server in `dashboard/server.mjs`, watching `events.jsonl` with `fs.watch()` and pushing new events to connected clients incrementally, with polling fallback if the WebSocket connection is lost.

---

### Issue 3: File-based inbox/outbox race conditions

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 under the now-retired tier system — the last of that system's safety/silent-failure-class fixes)
**Status:** ✅ COMPLETED (2026-07-19)

**Problem:** Investigation found three distinct races, not one generic "concurrency" concern:
1. `/api/unblock` wrote the inbox file via a direct `writeFileSync` — not atomic, a concurrent reader could observe a torn write.
2. `agency-emit.sh` created the empty inbox placeholder via check-then-act (`[[ -f "$SLOT" ]] || : > "$SLOT"`) — a TOCTOU race.
3. `inbox-check.sh`/`inbox-wait.sh` **read the inbox before archiving it** — a reply written in the gap between read and archive was silently lost. This was the most operator-visible failure mode (a quick follow-up correction vanishing).

**What was implemented** (no `lockfile`/`flock` needed — POSIX `rename()` is already atomic):
- New `writeFileAtomic()` helper in `dashboard/server.mjs` (temp file + `renameSync`), used by `/api/unblock`.
- `agency-emit.sh`'s placeholder create now uses noclobber (`( set -C; : > "$SLOT" ) 2>/dev/null || true`).
- `inbox-check.sh`/`inbox-wait.sh` reordered to **claim (mv to outbox) before reading**. A reply landing after the claim now just creates a fresh file for the next poll.
- **Found and fixed a second bug while testing the reorder:** the archive filename used only `date +%s` (1-second resolution) — once claim-then-read made rapid consumption normal, two claims within the same second collided and silently overwrote each other's archived reply. Fixed with `date +%s%N` (nanoseconds) plus the shell's `$$` (PID).
- Did **not** add file locking or pursue a Redis-based multi-operator inbox — out of scope, no evidence multi-operator support is needed.

**Tests:** `tests/dashboard/inbox-race.test.mjs` (9 tests) and `tests/dashboard/unblock-atomic-write.test.mjs` (4 tests, against a real spawned server instance) — 13 total, including a dedicated regression guard hammering 5 rapid back-to-back claims to prove the archive-filename fix holds.

---

### Issue 4: O(n) performance degradation

**Priority:** HIGH
**Status:** ✅ COMPLETED — PR #6 (Commit: 9c71c31)

**Problem:** Re-read the entire `events.jsonl` per request (slow above ~50MB).

**What was implemented:** In-memory last-read offset tracked per client, `fs.createReadStream` with a `start` option reads only new bytes, state updates incrementally.

---

### Issue 5: No agent output preview

**Priority:** MEDIUM
**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** Couldn't see what an agent was doing without manually tailing logs.

**What was implemented** (one deliberate scope cut — live WebSocket streaming — discussed with the user first):
- New `GET /api/agent-log/:ticket` endpoint — reads the last N lines (default 100, capped 1000) from `agent-logs/<sanitized-ticket-id>.log`. Keyed by **ticket id**, not session id (that's what `spawn.mjs` actually writes per-file). Sanitization regex copied verbatim from `spawn.mjs`, which as a side effect makes path traversal impossible.
- "View Logs" button in the dashboard's Tickets table, opening a modal that polls the endpoint every 2s while open.
- Did **not** build live WebSocket streaming — a 2s polling refresh while the panel is open satisfies the actual need without the added complexity of per-ticket file watchers and client subscription bookkeeping.

**Tests:** `tests/dashboard/agent-log-and-stats.test.mjs` (7 tests, against a real spawned server) — last-N-lines correctness, 404 handling, path-traversal safety (verified with a real `../../../etc/passwd` request), the 1000-line cap.

---

## 3. Agent System (Role Specialists)

### Issue 1: Profile switching is destructive

**Priority:** MEDIUM (fixed 2026-07-20 under the now-retired tier system)
**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** Switching profiles did `rm` then `cp` from an `agents.backup/` copy — an interrupted run between those steps left `.claude/agents/` empty, recoverable only by hand.

**Location:** `scripts/switch-agents.sh`

**What was implemented:**
- `.claude/agents-all/` now holds canonical real `.md` files; `.claude/agents/` contains only symlinks into it.
- One-time, idempotent migration built into the script itself — on first run, real files in `.claude/agents/` are moved into `agents-all/` automatically.
- Switching profiles only ever adds/removes symlinks — real content is never touched, so an interrupted run at worst leaves `.claude/agents/` empty, and re-running any profile fully repairs it.
- Safety guard not in the original spec: the symlink-clearing step checks `[ -L "$f" ]` first — a real (non-symlink) file found in `.claude/agents/` is left alone with a warning, never silently deleted.

**Critical follow-up bug, found via CI (2026-07-21/22):** the original symlink target was `$AGENT_FILE`, an **absolute path** (`$PROJECT_ROOT/.claude/agents-all/<name>.md`). Committed to git, this baked in the local dev machine's absolute path and broke the moment the repo was checked out anywhere else (e.g. a CI runner at `/home/runner/...` vs. local `/Users/mac/...`) — `cp` against the broken symlink failed outright. **Fixed** by symlinking to the literal relative path `../agents-all/<name>.md` instead. Re-generated all 6 committed symlinks. Two regression tests added: one asserting the literal relative-path string, one that actually renames the whole project directory and confirms symlinks still resolve.

**Tests:** `tests/agents/switch-agents.test.mjs` (10 tests) — first-run migration, content preservation, profile-switch correctness, the core interrupted-run recovery fix, the non-symlink safety guard, unknown-profile rejection, idempotency, the two relative-symlink regression tests.

---

### Issue 4: No agent performance metrics

**Priority:** MEDIUM
**Status:** ✅ COMPLETED (2026-07-20), with one honest scope cut from the original spec

**Problem:** No visibility into which agents succeed/fail most.

**Important finding before implementing:** the original spec's "agent_results: {status: success}" sketch assumes a per-agent success/failure signal that **does not exist anywhere in the event stream** — a failed subagent looks event-for-event identical to a succeeded one. Discussed with the user, who agreed to skip it rather than ship a misleading proxy number.

**What was implemented instead** (real, honestly-derivable usage stats, computed live from the existing event stream, matching the pattern `orchestrator/digest.mjs` already uses):
- New `orchestrator/agent-stats.mjs` — `buildAgentStats({events, since})` derives per-agent: distinct session count, distinct ticket count, tool-call volume (+ top-5 tools), average session duration. `--since` supports `24h`/`7d`/`30d`/`all`.
- `./scripts/agent-stats.sh` — thin wrapper CLI.
- New `GET /api/agent-stats?since=` endpoint reusing the same module.
- The formatted table output explicitly notes no success/failure rate is shown and why.

**Tests:** `tests/orchestrator/agent-stats.test.mjs` (12 tests) — counting correctness, duration averaging, window filtering, and an explicit "HONESTY CHECK" test asserting no `success`/`status`/`fail` field ever appears in the output.

---

## 4. Adoption & Bootstrap (Setup Experience)

### Issue 1: Bootstrap doesn't verify success

**Priority:** HIGH
**Status:** ✅ COMPLETED — PR #6 (Commit: 02f6319)

**Problem:** Used `|| warn` fallbacks but continued regardless, risking a silently broken setup.

**What was implemented:** `--strict` mode (default; exits on any failure), `--permissive` to continue on warnings, post-install verification of each installed tool, and a final ✓/✗/⚠ summary.

**Follow-up fix (2026-07-20, found via CI):** `bootstrap.sh` required the `claude`/`npx` CLIs to be present even under `--dry-run` — exactly the case `--dry-run` exists to support on a fresh machine with nothing installed yet. Fixed by gating the prerequisite checks on `[[ "$DRY_RUN" == "false" ]]`. The pre-existing test asserting the old (buggy) behavior was rewritten to assert the fix instead.

---

### Issue 2: Monorepo auto-detection untested

**Priority:** MEDIUM (test coverage added 2026-07-19 under the now-retired tier system)
**Status:** ✅ PARTIALLY COMPLETED (2026-07-19) — test coverage added; detection heuristic itself unchanged, by deliberate scope decision (this was a coverage-only ticket)

**Problem:** Detection heuristics might fail in deeply nested or unusual repo structures.

**Location:** `scripts/adopt.sh` (`detect_frameworks()`)

**What was found, confirmed by test, and left as documented limitations (not fixed):**
- Detection is a single-level scan of 6 hardcoded subdirectory names — no recursion; a framework 2+ levels deep is invisible to it.
- Non-standard subdirectory names are never scanned.
- nx (`nx.json`), lerna (`lerna.json`), and pnpm-workspace (`pnpm-workspace.yaml`) markers are not recognized at all — an nx monorepo's root `package.json` (with a `workspaces` field but no `next`/`@nestjs/core` dependency) just falls through to the generic "node" bucket, missing the actual monorepo structure entirely.

**What already worked and is now locked in by test** (the original "may fail" framing undersold this): `--frameworks "python,nextjs"` was already implemented before this ticket touched the file; root+subdirectory combination detection with dedup works correctly for the 6 supported names.

**Not done:** a `--debug-detection` flag — deferred, since the new tests already document detection behavior precisely without needing a new CLI flag. Actually making nx/lerna/pnpm-workspace/deep-nesting work is a separate, larger fix left as a finding for a future ticket.

**Tests:** combined with Cross-Cutting Issue 5's `tests/adopt/monorepo-detection.test.mjs` (15 tests) above.

---

### Issue 3: No adoption preview mode

**Priority:** MEDIUM
**Status:** ✅ COMPLETED (2026-07-20), one scope cut discussed with the user before implementing

**Problem:** No way to see what would change before applying adoption.

**What was implemented:**
- New `--diff` flag on `adopt.sh`, combined with `--dry-run` — computes the real merge/overwrite result into a temp buffer even during a dry run and shows a real `diff -u` against the existing file for CLAUDE.md (all three merge strategies).
- Fixed an adjacent bug found while implementing this: "Adoption complete" messages printed even during `--dry-run`, falsely implying something had been written. Now prints "DRY RUN complete — nothing was written."
- Did **not** add the "Would create:/Would modify:/Would symlink:" categorized summary — existing per-operation `DRY:` lines (now with diffs attached) already communicate this.
- Did **not** add a "Proceed? [y/N]" confirmation prompt — discussed with the user first: `adopt.sh` is invoked non-interactively by the CI test suite with no bypass flag, so a blocking prompt would hang every automated invocation. `--dry-run --diff` was judged sufficient.

**Tests:** part of `tests/adopt/precommit-and-preview.test.mjs`'s 10 tests (5 for this issue, 5 for Issue 6 below) — no-diff behavior unchanged, real diff shown for the CLAUDE.md merge case (file on disk confirmed untouched), diff for `--merge-strategy overwrite`, corrected completion messages.

---

### Issue 6: Pre-commit config selection manual

**Priority:** MEDIUM
**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** 6 different pre-commit templates, user had to choose correctly by hand.

**Important finding before implementing:** most of this was already done — `generate_precommit_config()` already auto-detects from the framework(s) passed to `adopt.sh`, including a real merged config with workspace-path filters for monorepos. The only genuinely missing piece was an override for when auto-detection guesses wrong.

**What was implemented:** New `--precommit-template <python|node|merged>` flag, overriding auto-detection. Warns (doesn't block) on a mismatch with detected frameworks, since an explicit override is intentional. `merged` forces the multi-framework generator even for a single detected framework.

**Tests:** the other 5 of `precommit-and-preview.test.mjs`'s 10 tests — forcing a mismatched template (with warning), forcing a matching template (no warning), forcing `merged` on a single-framework project, rejecting an invalid value, regression guards for plain auto-detection.

---

## 5. Token Optimization (Context Reduction)

### Issue 2: No automatic profile detection

**Priority:** MEDIUM (fixed 2026-07-20, worked on ahead of Token Optimization Issues 1 and 6 by explicit user decision)
**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** User had to manually choose a profile; a wrong choice wasted tokens or broke the workflow.

**Important finding before implementing:** the CHANGELOG already *claimed* profile detection was done. Investigation found `.claude/commands/ticket.md` actually had two separate, contradictory prose-only mechanisms — a soft Phase 0 warning, and a completely different Phase 1 instruction to hard-STOP the entire workflow if the profile looked insufficient. Neither was backed by real detection logic; both were freeform text with no test coverage and no logging.

**What was implemented** (a real, testable script, replacing both prose mechanisms with one clear step):
- New `.claude/hooks/detect-profile.sh <ticket-text> [current-profile]` — keyword-based, deterministic. Categories: frontend, backend, devops, data. Single category → that profile; frontend+backend → `fullstack`; 0 categories → `minimal`; any other combo → `ticket`.
- Emits a `profile_detected` event to `events.jsonl` with the recommendation and match/mismatch against the current profile.
- `ticket.md` rewritten: one profile check in Phase 0, calling the script; Phase 1's duplicate hard-STOP removed. On mismatch, now asks the user to `switch` or `continue` rather than force-exiting.
- **Two real logic bugs found via testing, fixed before shipping:** a greedy `pipeline.*deploy` regex that swallowed most of a sentence as a "keyword" (removed as redundant); a branch-ordering bug where single-category checks ran before the "exactly 2 categories" check, silently dropping a matched category (e.g. a frontend+devops ticket losing its devops signal).

**Tests:** `tests/hooks/detect-profile.test.mjs` (17 tests) — one per named profile outcome, edge cases, both regression tests for the bugs found, stdout/stderr separation, event logging, missing-argument handling.

---

### Issue 3: Graphify not incremental by default

**Priority:** LOW
**Status:** ✅ COMPLETED (2026-07-21)

**Problem:** Had to manually re-index after large changes.

**Important finding before implementing:** the vendored `graphify` tool already ships exactly what this issue asks for, better than the original spec assumed — `graphify hook install` installs **both** post-commit and post-checkout git hooks (not just post-commit), is idempotent, respects `core.hooksPath` (Husky compatibility), and calls an AST-only, no-LLM, per-file-cached rebuild. `docs/ADVANCED.md` already explained *why* this was practical but never mentioned one was actually available — that was the real, narrow gap.

**What was implemented:**
- `adopt.sh` now calls `graphify hook install` during adoption, non-fatal if graphify is absent or the call fails, skipped in `--dry-run`.
- New `--no-graphify-hook` opt-out flag, mirroring `--no-precommit`.
- `docs/ADVANCED.md` updated with the new default behavior and opt-out flag.
- Did **not** implement the spec's literal `graphify update --incremental` command — it doesn't exist in the real CLI; the real equivalent (`graphify hook install`) does more, with battle-tested logic already in place.
- Did **not** implement a file-count threshold or a dedicated log file — the real hook already exits on zero changed files and per-file SHA256 caching handles any commit size; stdout progress output was judged sufficient.

**Verification note:** this environment's Python (3.9.6) predates graphify's own `>=3.10` requirement, so the real CLI couldn't be pip-installed here. Verified via a Python-3.9-compatibility monkeypatch of the real vendored hook-install logic, plus a shell-script mock `graphify` binary for the automated test suite.

**Tests:** `tests/adopt/graphify-hook.test.mjs` (6 tests) — real invocation during adoption, `--dry-run` never invokes it, `--no-graphify-hook` suppresses it, adoption succeeds with graphify absent or failing, correct pointer message when not installed.

---

## 6. Hooks & Integration (Workflow Automation)

### Issue 1: Pre-commit hook error handling fixed but undeployed

**Priority:** CRITICAL (Already Fixed)
**Status:** ✅ COMPLETED — PR #6 (Commit: 21b3c29)

**Problem:** A fix existed for `.claude/hooks/run-pre-commit.sh` but needed testing/deployment.

**What was implemented:** Tested across scenarios (clean pass, failures, auto-fixes, pre-commit not installed), deployed to the blueprint repo, adoption script updated to use the new hook.

---

### Issue 4: No hook failure recovery

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 under the now-retired tier system)
**Status:** ✅ COMPLETED (2026-07-19)

**Problem:** If a hook crashed or exited non-zero, the agent proceeded unaware, with no durable cross-session record — only Claude Code's own ephemeral transcript notice.

**Research note:** confirmed Claude Code's actual hook exit-code semantics first — exit 1 (and any non-zero except 2) is already non-blocking (transcript notice, execution continues); only exit 2 blocks. This meant the fix had to be a **transparent wrapper**, not new error-handling inside each hook — anything that altered a hook's actual exit code would silently break Claude Code's own blocking behavior.

**What was implemented:**
- New `.claude/hooks/guard.sh <hook-name> <real-script> [args...]` — runs the wrapped hook, captures and replays stdout/stderr byte-for-byte, re-exits with the **exact original exit code**. On non-zero exit, appends a structured JSON line to `~/.claude-agency/hook-errors.log`.
- Every registered hook in `.claude/settings.json` now routes through `guard.sh`.
- `scripts/doctor.sh` — new "Hook errors" line + a recommendation if more than 10 have accumulated.
- Did **not** add a second agent-facing error-surfacing mechanism — Claude Code already does this in-transcript; the gap closed here is specifically the durable, cross-session record.

**Tests:** `tests/hooks/guard.test.mjs` (8 tests, including the critical invariant that exit 2 is preserved exactly), `tests/hooks/settings-wiring.test.mjs` (3 tests confirming every registered hook actually routes through `guard.sh`). Manually verified against the real `detect-ticket.sh`, `run-pre-commit.sh`, and `agency-emit.sh` with a scratch `CLAUDE_AGENCY_HOME`, and re-ran the existing `run-pre-commit.sh` scenario/integration test scripts to confirm no behavior change — 4 pre-existing failures in `test-pre-commit-scenarios.sh` traced to a sandbox `PATH` quirk resolving `bash`/`grep`, unrelated to this change (confirmed via `git diff` showing zero modifications to that file).

---

## 7. Documentation & Developer Experience

### Issue 1: 50+ markdown files hard to navigate

**Priority:** MEDIUM
**Status:** ✅ COMPLETED — PR #6 (Commits: 90ccf4b, 4bc103a, a1d03c3)

**What was implemented:** Consolidated MONOREPO-*/TOKEN-OPTIMIZATION/phases/ (11 files) into `docs/ADVANCED.md`; setup guides into `docs/SETUP.md`; changelog history into `docs/CHANGELOG.md`. 15 files archived to `docs/archive/` with deprecation notices, preserving git history. All cross-references updated.

---

### Issue 2: Multiple similar docs

**Priority:** MEDIUM
**Status:** ✅ COMPLETED — PR #6 (Commit: 890eac1)

**What was implemented:** MONOREPO-SUMMARY/MONOREPO-SUPPORT-SOLUTION/MONOREPO-QUICK-START merged into one "Monorepo Support" section in `docs/ADVANCED.md`.

---

### Issue 3: Setup guides fragmented

**Priority:** MEDIUM
**Status:** ✅ COMPLETED — PR #6 (Commits: e72853b, d6efb52)

**What was implemented:** Restructured into README.md (overview + quick start), SETUP.md (detailed new-user walkthrough, consolidating LOCAL-ADOPTION.md), ADVANCED.md (orchestrator/profiles/monorepo/token optimization).

---

### Issue 4: No changelog

**Priority:** LOW
**Status:** ✅ COMPLETED — PR #6 (Commit: 6ec10ff)

**What was implemented:** `CHANGELOG.md` following keepachangelog.com format, 6 version entries, referenced from README's "Getting Help" section.

---

### Issue 5: No troubleshooting guide

**Priority:** HIGH
**Status:** ✅ COMPLETED — PR #6 (Commit: e4c4f3b)

**What was implemented:** `docs/TROUBLESHOOTING.md` covering bootstrap/adoption/orchestrator/dashboard/agent failure modes with diagnostic CLI commands, linked from README's "Getting Help" section.

---

# To-Do (16/45, all LOW priority)

Every remaining issue is LOW priority — no CRITICAL, HIGH, or MEDIUM issues remain. Two items below were explicitly downgraded from MEDIUM to LOW on 2026-07-20 by user decision (marked below); everything else was always LOW.

## Orchestrator

### Issue 5: Session→ticket correlation approximate

**Priority:** LOW

**Problem:** Relies on branch slug if `CLAUDE_SESSION_ID` isn't set early enough. Narrow blast radius — only matters when spawn doesn't set the session ID before the hook fires.

**Solution:**
- Modify `spawn.mjs` to set `CLAUDE_SESSION_ID` before spawn, using ticket_id as the session ID for predictable correlation.
- Update the event tailer to match on session_id first, branch as fallback.
- Log which correlation method was used, for debugging.

**Note:** adopting `beads` as a ticket source does **not** resolve this — beads has no concept of a live Claude Code session/process; this is purely a `spawn.mjs`/event-tailer correlation problem, orthogonal to which ticket source feeds the orchestrator.

---

## Dashboard

### Issue 2: No authentication

**Priority:** LOW

**Problem:** Binds 127.0.0.1 only, assumes a single operator on localhost. Mitigated today by the localhost-only bind; only matters if someone exposes the port, which would be a separate mistake.

**Solution:**
- Optional basic auth via env vars (`AGENCY_DASHBOARD_AUTH=user:pass`), middleware checking the Authorization header.
- Document: "Leave unset for localhost-only, set for team use."
- Consider OAuth2/SSO in a future version.

---

### Issue 6: No search/filter capability

**Priority:** LOW

**Problem:** Can't filter by ticket, agent type, or time range. Pure UX; matters more as `events.jsonl` grows.

**Solution:**
- Filter UI controls (agent role, status dropdowns; date range picker) applied in `buildState()`.
- Search box filtering events by keyword in tool/file/prompt.
- Save filter preferences in localStorage.

---

## Agent System

### Issue 2: No agent version tracking

**Priority:** LOW

**Problem:** Can't tell which version of a custom agent is active.

**Solution:**
- Version metadata comments in agent files (`<!-- agent-version: 2.1.0 -->`).
- `./scripts/agent-version.sh` to show current versions, list history, and roll back.
- Track agent versions in the registry when a ticket completes.

---

### Issue 3: Agent profiles hardcoded in JSON

**Priority:** LOW

**Problem:** Can't customize which agents are available per profile without editing code.

**Solution:**
- Make `.claude/agents.profiles.json` more directly user-editable, with validation in `switch-agents.sh` that referenced agents exist.
- `./scripts/customize-profile.sh frontend --add security-specialist`.
- Document in `docs/AGENT-PROFILES.md`.

---

### Issue 5: Code-reviewer is superpowers symlink

**Priority:** LOW

**Problem:** If upstream superpowers updates break compatibility, the workflow breaks. Mitigation is a process/pinning decision, not a code change.

**Solution:**
- Pin the superpowers version in `bootstrap.sh`.
- Test superpowers updates in staging before production.
- Warn if the installed version exceeds the tested version.
- Consider vendoring `code-reviewer.md` if stability becomes critical.

---

## Adoption & Bootstrap

### Issue 4: Adopt script is complex

**Priority:** LOW

**Problem:** 482 lines originally, now 899 as of 2026-07-21 — growing, not shrinking, partly from this session's own additions (`--precommit-template`, `--diff`, `--no-graphify-hook`).

**Solution:**
- Refactor into smaller single-responsibility functions.
- Extract validation logic into `lib/validate-adoption.sh`, symlink logic into `lib/create-symlinks.sh`.
- Add `--verbose` step-by-step debug logging with timing.
- Add unit tests per extracted function.

---

### Issue 5: No uninstall validation

**Priority:** LOW

**Problem:** Doesn't verify all blueprint artifacts were actually removed after `--uninstall`.

**Solution:**
- Post-uninstall checks (`.claude` gone, pre-commit hook unlinked, `.gitignore` cleaned of blueprint entries).
- Summary: "✓ Removed X files, ✗ Y files remain."
- `--force` to remove even user-modified files, with confirmation.

---

## Token Optimization

### Issue 1: Savings projections unvalidated

**Priority:** LOW *(downgraded from MEDIUM 2026-07-20 by explicit user decision)*

**Problem:** The README's "70-90% reduction" claim is theoretical, never measured in practice. Public, checkable claim, but low urgency.

**Solution:**
- Add token tracking to measure actual before/after savings.
- Run a benchmark suite on sample tasks.
- Update docs with real measured numbers; track per-project savings in the registry.

---

### Issue 4: Template library (Phase 2) incomplete

**Priority:** LOW

**Problem:** Mentioned in docs but no templates exist.

**Solution:**
- Create `templates/code-patterns/` (API endpoint, React component, DB migration, Dockerfile templates).
- `claude "create API endpoint" --use-template api-endpoint.py`.
- Document template variables and usage.

---

### Issue 5: Module batching not implemented

**Priority:** LOW

**Problem:** Phase 2 feature incomplete.

**Solution:**
- Document the batching pattern in agent prompts (single `Read` call with multiple paths instead of separate calls for related files).
- Add an example to agent definitions.
- Measure savings once token tracking (Issue 1) exists.

---

### Issue 6: No token usage analytics

**Priority:** LOW *(downgraded from MEDIUM 2026-07-20 by explicit user decision)*

**Problem:** Can't measure which optimization strategies actually work. Would be the prerequisite for Issue 1 above if that's ever picked up.

**Note:** `orchestrator/agent-stats.mjs` (built for the now-completed Agent System Issue 4) provides real per-agent *usage* stats — sessions, tool-call volume, duration — a partial step toward this, but doesn't track token counts specifically.

**Solution:**
- `./scripts/token-analytics.sh` — breakdown of tokens by category (files read, MCP calls, agent prompts, system instructions) and top savings opportunities.
- Suggest optimizations based on the breakdown.

---

## Hooks & Integration

### Issue 2: Ticket detection regex may miss formats

**Priority:** LOW

**Problem:** Only tested against ClickUp/Linear/GitHub/Jira URL patterns.

**Location:** `.claude/hooks/detect-ticket.sh`

**Solution:**
- Make the regex configurable in `settings.json` (a `ticket_patterns` array), so teams can add patterns without code changes.
- Log matched patterns for debugging; warn if a pattern is too broad.

---

### Issue 3: Agency-emit.sh writes to events.jsonl always

**Priority:** LOW

**Problem:** Writes even for non-agency personal sessions.

**Location:** `.claude/hooks/agency-emit.sh`

**Solution:**
- Session tagging via `CLAUDE_SESSION_TYPE=agency|personal` (env var or settings.json).
- Only write to `events.jsonl` when tagged `agency`.
- Document how to set the session type.

---

### Issue 5: Dynamic-context.sh purpose unclear

**Priority:** LOW

**Problem:** The script exists but is undocumented. Per earlier investigation (Hooks Issue 4's writeup above), it isn't even wired into `settings.json` — it takes positional args that don't match how any registered hook is invoked, so it's currently dead code.

**Location:** `.claude/hooks/dynamic-context.sh`

**Solution:**
- Document what it does, when it runs, and how to configure it in `.claude/hooks/README.md` — or, given it's dead code, consider removing it instead of documenting a no-op.
- Add inline comments and an example in `docs/`.

---

## Documentation & Developer Experience

### Issue 6: ASCII diagrams brittle

**Priority:** LOW

**Problem:** Workflow diagrams in markdown break easily and are hard to maintain.

**Solution:**
- Convert to Mermaid.js diagrams (renders natively in GitHub, VS Code, docs sites).
- Keep ASCII only where Mermaid isn't supported (e.g. code comments).

---

# Additional Enhancements (not tracked as numbered issues)

Ideas noted during the original analysis, kept for reference — none of these are scoped or prioritized; pick up only if there's a concrete need.

**Orchestrator:** cost alerts at 80%/90% of cap; ticket prioritization by label; spawn queueing instead of skipping when budget is hit; graceful SIGTERM shutdown.

**Dashboard:** CSV event export; Chart.js metrics (tickets over time, cost trends); mobile-responsive layout; multi-user operator assignment tracking.

**Agent System:** agent marketplace (share custom agents via gists); conditional agent loading based on the implementation plan; framework-specific agent variants; `./scripts/new-agent.sh` scaffolding; agent composition (architect spawning a sub-agent).

**Adoption:** interactive setup wizard; stack-specific templates (`--stack django-react`); timestamped adoption snapshots with restore; enhanced `doctor.sh` checks for orphaned symlinks/version mismatches.

**Token Optimization:** HTML context-usage visualization; adaptive `.claudeignore` learning; per-project optimization profiles; cost/benefit reporting per profile.

**Hooks:** per-team configurable ticket detection; hook marketplace; a `./scripts/test-hook.sh` testing framework; hook performance/slow-hook monitoring.

**Documentation:** interactive docs server with search; video walkthroughs; REST API reference for orchestrator/dashboard; Architecture Decision Records.

---

## Success Metrics

- **Adoption rate:** % of users who successfully adopt without issues.
- **Token tracking accuracy:** <5% variance from actual costs.
- **Orchestrator uptime:** >99% (no stuck spawns).
- **Dashboard performance:** <500ms state updates even at 50MB events.jsonl.
- **Documentation clarity:** <2 support requests per issue after consolidation.
- **Test coverage:** >80% for critical paths (bootstrap, adoption, orchestrator).

---

**Document Status:** In Progress — 29/45 issues completed (64%), 16/45 remaining (36%, all LOW priority), as of 2026-07-22.
**Author:** Claude (Sonnet 4.5 / Sonnet 5, across sessions)
**Last Review:** 2026-07-22
