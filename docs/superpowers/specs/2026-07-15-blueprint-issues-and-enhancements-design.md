# Claude Agency Blueprint: Comprehensive Issues & Enhancements Analysis

**Date:** 2026-07-15
**Analysis Type:** Component-by-Component
**Scope:** Entire claude-agency-blueprint system
**Last Updated:** 2026-07-21 (Token Optimization Issue 3, graphify incremental hooks, completed — see below; all remaining MEDIUM-priority issues completed 2026-07-20; risk-ranked tier system retired 2026-07-20, see "Note on prioritization scheme" below)

---

## Implementation Status

**Note on prioritization scheme (2026-07-20):** this document previously used a risk-ranked "Tier 0–6" system (see git history for that version) layered on top of the original CRITICAL/HIGH/MEDIUM/LOW labels. That tier system has been retired by explicit user decision — it served its purpose while safety- and confidence-critical fixes were the priority, but the remaining work doesn't map cleanly onto it anymore. **Priority is now the flat CRITICAL/HIGH/MEDIUM/LOW scheme only.** Three items were explicitly downgraded from MEDIUM to LOW as part of this change (Orchestrator Issue 4, Token Optimization Issue 1, Token Optimization Issue 6) — see "Remaining Work" below for the current list and rationale.

**✅ COMPLETED (28 issues):**
- 4 CRITICAL priority fixes (3 in PR #6, 1 in PR #5)
- 7 HIGH priority fixes (all in PR #6)
- 3 MEDIUM priority fixes (all in PR #6 - documentation consolidation)
- 1 LOW priority fix (PR #6 - changelog)
- 13 additional fixes (2026-07-19 to 2026-07-21): Orchestrator Issue 2 force-kill on halt; Hooks Issue 4 failure recovery; Orchestrator Issue 6 stuck-detection whitelist [partial]; Dashboard Issue 3 inbox/outbox race conditions; Cross-Cutting Issue 5 integration tests; Adoption Issue 2 monorepo detection tests [partial]; Agent System Issue 1 non-destructive profile switching; Token Optimization Issue 2 automatic profile detection; Dashboard Issue 5 agent output preview; Agent System Issue 4 agent performance metrics [scoped: no success/fail rate, no such signal exists]; Adoption Issue 3 adoption preview mode; Adoption Issue 6 pre-commit config auto-selection override (all 4 remaining MEDIUM-priority issues, completed 2026-07-20); Token Optimization Issue 3 graphify incremental hooks (2026-07-21, first LOW-priority item picked up after the MEDIUM sweep)

**📋 REMAINING (17 issues):**
- 0 CRITICAL priority issues
- 0 HIGH priority issues
- 0 MEDIUM priority issues
- 17 LOW priority issues

### Remaining Issues by Component

**Cross-Cutting Issues (0):**
- ~~Issue 5: No integration tests~~ ✅ COMPLETED 2026-07-19

**Orchestrator (2):**
- ~~Issue 2: No force-kill on halt~~ ✅ COMPLETED 2026-07-19
- Issue 4: ClickUp/Linear/Jira sources not implemented [LOW] *(downgraded from MEDIUM 2026-07-20)*
- Issue 5: Session→ticket correlation approximate [LOW]
- ~~Issue 6: Stuck detection may false-positive~~ ✅ PARTIALLY COMPLETED 2026-07-19 (whitelist only)

**Dashboard (2):**
- Issue 2: No authentication [LOW]
- ~~Issue 3: File-based inbox/outbox race conditions~~ ✅ COMPLETED 2026-07-19
- ~~Issue 5: No agent output preview~~ ✅ COMPLETED 2026-07-20
- Issue 6: No search/filter capability [LOW]

**Agent System (3):**
- ~~Issue 1: Profile switching is destructive~~ ✅ COMPLETED 2026-07-20
- Issue 2: No agent version tracking [LOW]
- Issue 3: Agent profiles hardcoded in JSON [LOW]
- ~~Issue 4: No agent performance metrics~~ ✅ COMPLETED 2026-07-20 (scoped: no success/fail rate)
- Issue 5: Code-reviewer is superpowers symlink [LOW]

**Adoption & Bootstrap (2):**
- ~~Issue 2: Monorepo auto-detection untested~~ ✅ PARTIALLY COMPLETED 2026-07-19 (test coverage added; detection itself unchanged)
- ~~Issue 3: No adoption preview mode~~ ✅ COMPLETED 2026-07-20
- Issue 4: Adopt script is complex (482 lines, now 899 as of 2026-07-21) [LOW]
- Issue 5: No uninstall validation [LOW]
- ~~Issue 6: Pre-commit config selection manual~~ ✅ COMPLETED 2026-07-20

**Token Optimization (4):**
- Issue 1: Savings projections unvalidated [LOW] *(downgraded from MEDIUM 2026-07-20)*
- ~~Issue 2: No automatic profile detection~~ ✅ COMPLETED 2026-07-20
- ~~Issue 3: Graphify not incremental by default~~ ✅ COMPLETED 2026-07-21
- Issue 4: Template library (Phase 2) incomplete [LOW]
- Issue 5: Module batching not implemented [LOW]
- Issue 6: No token usage analytics [LOW] *(downgraded from MEDIUM 2026-07-20)*

**Hooks & Integration (3):**
- Issue 2: Ticket detection regex may miss formats [LOW]
- Issue 3: Agency-emit.sh writes to events.jsonl always [LOW]
- ~~Issue 4: No hook failure recovery~~ ✅ COMPLETED 2026-07-19
- Issue 5: Dynamic-context.sh purpose unclear [LOW]

**Documentation & Developer Experience (1):**
- Issue 6: ASCII diagrams brittle [LOW]

See [Pull Request #6](https://github.com/eSketchers/claude-blueprint/pull/6) for completed implementations.

---

## Executive Summary

This document provides a comprehensive analysis of the claude-agency-blueprint, identifying issues and their solutions across all major components. The analysis follows a component-by-component approach, organizing findings by:

1. **Cross-Cutting Issues** - Affect multiple components
2. **Orchestrator** - Autonomous ticket processing
3. **Dashboard** - Agent visibility & control
4. **Agent System** - Role-specialist agents
5. **Adoption & Bootstrap** - Setup experience
6. **Token Optimization** - Context reduction strategies
7. **Hooks & Integration** - Workflow automation
8. **Documentation & Developer Experience**

Each issue is paired with its solution(s) for immediate actionability.

---

## Cross-Cutting Issues

### Issue 1: No actual token tracking system-wide

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: a43694a)

**Problem:** Budget uses event-count proxy; no visibility into real costs across orchestrator/agents

**Solution:**
- Parse Claude Code `--output-format json` for `total_cost_usd` (confirmed available)
- Update orchestrator/spawn.mjs to capture real costs
- Update budget.mjs with `addRealCost(ticketId, costUsd)` method
- Add cost reporting dashboard showing actual spend per ticket/agent/session

**Implementation Notes:**
```javascript
// spawn.mjs - Change command to JSON output mode
const args = ['-p', '--output-format', 'stream-json', '/ticket', ticketUrl];

// Parse final result event
const resultEvent = JSON.parse(lastLine);
const actualCost = resultEvent.total_cost_usd;

// Update budget with real cost
budget.addRealCost(ticketId, actualCost);
```

---

### Issue 2: ⚠️ Adoption overwrites existing CLAUDE.md

**Priority:** CRITICAL
**Status:** ✅ COMPLETED - PR #6 (Commit: d821fd6)

**Problem:** Users lose their custom configuration when adopting blueprint

**Solution:**
- Implement smart merge in adopt.sh:
  - Detect existing CLAUDE.md
  - Parse user's existing sections
  - Append blueprint sections with markers: `### BEGIN BLUEPRINT` / `### END BLUEPRINT`
  - Preserve user preferences (model, custom instructions, etc.)
- Add `--merge-strategy` flag: `overwrite` | `merge` | `backup-only`

**Implementation Notes:**
```bash
# adopt.sh enhancement
if [[ -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
    log "Existing CLAUDE.md found. Merging with blueprint..."

    # Backup original
    cp CLAUDE.md "CLAUDE.md.backup-$(date +%s)"

    # Parse user sections (everything before any blueprint markers)
    awk '/### BEGIN BLUEPRINT/,/### END BLUEPRINT/{next} {print}' CLAUDE.md > CLAUDE.user.tmp

    # Append blueprint sections with markers
    cat CLAUDE.user.tmp > CLAUDE.md.new
    echo "" >> CLAUDE.md.new
    echo "### BEGIN BLUEPRINT" >> CLAUDE.md.new
    cat "$BLUEPRINT_RESOLVED/templates/CLAUDE.md.$FRAMEWORK" >> CLAUDE.md.new
    echo "### END BLUEPRINT" >> CLAUDE.md.new

    mv CLAUDE.md.new CLAUDE.md
    rm CLAUDE.user.tmp

    log "✓ Merged CLAUDE.md (backup saved)"
fi
```

---

### Issue 3: Configuration backup files not gitignored

**Priority:** CRITICAL (Quick Fix)
**Status:** ✅ COMPLETED - PR #6 (Commit: 334f450)

**Problem:** `settings.json.backup-*`, `agents.backup/` add clutter to repo

**Solution:**
- Add to `.gitignore`: `*.backup-*`, `agents.backup/`
- Update adopt.sh to create backups in `~/.claude-agency/backups/` instead of project root
- Add cleanup command: `./scripts/cleanup-backups.sh --older-than 30d`

**Implementation:**
```bash
# .gitignore additions
*.backup-*
agents.backup/
.claude/settings.json.backup-*
```

---

### Issue 4: Leftover .claude-flow/ directory

**Priority:** CRITICAL (Quick Fix)
**Status:** ✅ COMPLETED - PR #5 (Commit: 5a133e1) - Already merged to master

**Problem:** From removed submodule, contains stale daemon.pid and logs

**Solution:**
- Remove the directory: `rm -rf .claude-flow/`
- Document in CHANGELOG that this directory is obsolete and was removed

**Action:** Can be fixed immediately

**Note:** No need to gitignore since the directory is being permanently removed and won't be recreated.

---

### Issue 5: No integration tests

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 — was briefly ranked under a risk-tier system since retired, where it was promoted above its original MEDIUM ranking as a force-multiplier protecting the other safety fixes; see "Remaining Work — Flat Priority List").

**Status:** ✅ COMPLETED (2026-07-19), combined with Adoption Issue 2 (monorepo auto-detection untested) since both are test-coverage work over the same script

**Problem:** Bootstrap, adoption, orchestrator, dashboard had no automated testing beyond the pre-existing `scripts/test-adopt.sh` (single-framework adoption only) and the hand-written test suites added during Tier 0/1 work this same day (`tests/orchestrator/`, `tests/hooks/`, `tests/dashboard/`).

**What was implemented** (differs from the original sketch — `node --test` rather than more bash scripts, since that's the pattern already established by the Tier 0/1 fixes, plus GitHub Actions, not `tests/integration/test-*.sh`):
- `tests/adopt/monorepo-detection.test.mjs` (15 tests) — covers `adopt.sh --detect` (root-level single-framework detection for all 4 frameworks, subdirectory scanning across all 6 documented subdirectory names, multi-framework monorepo detection, dedup when the same framework appears in two places, zero-detection failure) and `--frameworks` (explicit multi-framework list, unknown-framework rejection). Also includes 3 tests that **lock in current, real limitations** as documented facts rather than silent surprises: detection doesn't recurse past one subdirectory level, doesn't recognize non-standard subdirectory names, and doesn't recognize nx/lerna/pnpm-workspace monorepo markers at all.
- `tests/bootstrap/bootstrap.test.mjs` (7 tests) — `bootstrap.sh` actually installs real global tools (Claude plugins, MCP servers, npm/pip packages) with network dependencies, so a real run is never exercised in CI. Instead covers what's genuinely safe to test: `--dry-run` is confirmed side-effect-free (never reaches the real install branch), `--help` documents all flags, flag combination/override behavior, and the `claude` CLI presence check.
- `.github/workflows/tests.yml` — new CI workflow, two jobs: `unit-and-integration` runs the full `node --test tests/` suite (installs the dashboard's `ws` dependency first), `adopt-shell-tests` runs the pre-existing `scripts/test-adopt.sh`.
- **Did not** write `test-orchestrator.sh`/`test-dashboard.sh` as separate integration scripts per the original sketch — that ground is already covered by `tests/orchestrator/` and `tests/dashboard/` from the Tier 0/1 work (killer, stuck-detector, inbox-race, unblock-atomic-write), so writing new ones would duplicate existing coverage rather than fill a gap.

**Two pre-existing bugs found while adding this coverage, then fixed as an immediate follow-up (2026-07-20)** — originally documented via `test.todo()` in `tests/adopt/known-bugs.test.mjs` (deliberately deferred at the time to keep the coverage ticket in scope), then fixed once the user asked to close the gap properly:
1. **macOS-only, FIXED:** nested-mode detection failed with "Cannot resolve blueprint location" when the OS temp directory was reached through a symlink (`/var` → `/private/var` on macOS) — `SCRIPT_PATH` was resolved via a non-canonicalizing `cd && pwd`, while `PROJECT_ROOT` (via `git rev-parse --show-toplevel`) always canonicalizes through symlinks, so the two never string-matched. Invisible on Linux CI. **Fix:** both `SCRIPT_PATH`/`SCRIPT_BLUEPRINT` and `PROJECT_ROOT` now resolve via `pwd -P` (physical path), so they're always compared on equal footing.
2. **OS-agnostic, FIXED:** `adopt.sh --uninstall`/`--doctor` validated `FRAMEWORKS.length > 0` unconditionally, before dispatching on `ACTION` — so both died with "No frameworks specified" unless a framework flag was *also* passed, even though neither action's dispatch body ever references `FRAMEWORK`/`FRAMEWORKS`/`PROFILE`. This meant `scripts/test-adopt.sh`'s `--doctor` test had been passing for the wrong reason (any non-zero exit satisfied a bare `[[ $rc -ne 0 ]]` check, including the unrelated upstream "no frameworks" die). **Fix:** the entire auto-detect/validate/default-profile block is now gated on `[[ "$ACTION" == "adopt" ]]`, so `--uninstall` and `--doctor` skip it entirely and reach their own logic.

**Tests:** `tests/adopt/known-bugs.test.mjs` rewritten from `test.todo()` trackers to real passing assertions (5 tests): nested-mode adoption succeeds through a symlinked path (macOS-only, skipped elsewhere), `--uninstall` works with no framework flag and actually removes `.claude/`, `--doctor` works with no framework flag and its dead-symlink detection genuinely runs (verified by orphaning the blueprint copy's symlinks and confirming the failure message comes from doctor's own logic, not "No frameworks specified"), `--doctor` still reports healthy on a fresh non-orphaned adoption, and a guard test confirming the default `adopt` action still correctly requires a framework flag (the fix only exempts `uninstall`/`doctor`). `scripts/test-adopt.sh` now passes all 37 assertions (previously 5 failing) — the nested-layout and uninstall test blocks that failed before are now green. Removed the `continue-on-error: true` workaround from `.github/workflows/tests.yml`'s `adopt-shell-tests` job since it's no longer needed. Full repo suite: `node --test tests/` → **83 tests, 83 pass, 0 fail, 0 todo.**

---

## 1. Orchestrator (Autonomous Ticket Processing)

### Issue 1: Budget enforcement uses event-count proxy

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: a43694a)

**Problem:** Not actual token costs; must manually calibrate `cost_per_event_usd`

**Location:** `orchestrator/budget.mjs:55`

**Solution:**
- Modify spawn.mjs to use `claude -p --output-format stream-json`
- Parse final result event to extract `total_cost_usd`
- Update budget.mjs to track real costs: `addRealCost(ticketId, costUsd)`
- Keep event-based proxy as fallback for non-JSON modes
- Document calibration in README if fallback used

**Related:** Cross-Cutting Issue #1

---

### Issue 2: No force-kill on halt

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 — was briefly ranked under a risk-tier system since retired; see "Remaining Work — Flat Priority List").

**Status:** ✅ COMPLETED (2026-07-19)

**Problem:** Kill switch marked tickets halted but didn't terminate processes

**Location:** `orchestrator/server.mjs`, new `orchestrator/killer.mjs`

**What was actually implemented** (PID tracking already existed via `registry.update(t.id, { spawned_pid: result.pid, ... })` in `server.mjs`'s intake tick — only the "actually kill it" half was missing):
- New `orchestrator/killer.mjs` module (`Killer` class), kept separate from `server.mjs` so it's independently unit-testable without importing the daemon's top-level side effects (config load, `process.exit`, `setInterval`)
- `Killer.kill(ticketId, pid, reason)` sends `SIGTERM` to **the negative pid** (the process group), not the bare pid — `spawn.mjs` already launches agents with `detached: true`, making the spawned `claude` process its own group leader, so signaling only the top-level pid would leave behind any subprocesses it forks (git, test runners, etc.). Escalates to `SIGKILL` on the group after `budget.kill_grace_ms` (config, default 30000ms) if still alive.
- Wired into two places in `server.mjs`:
  - `onEvent()`'s existing per-event halt check now also calls `killer.kill(...)` immediately when a ticket crosses its cap
  - A new `killer.sweep(budget)` call added to the main `tick()` loop, which re-checks `budget.shouldHalt()` for every active ticket regardless of whether a fresh hook event arrived — this is what actually guarantees a **hung** agent (one that stops emitting events entirely) still gets killed, not just agents that keep talking after being halted
- Did not add a `--force-kill` flag to `stop-orchestrator.sh` — that script stops the orchestrator *daemon* process itself, which is a different concern from killing *spawned ticket agents*; the kill switch (`touch ~/.claude-agency/KILLSWITCH`) now fully covers the latter without a separate flag

**Tests:** `tests/orchestrator/killer.test.mjs` (10 unit tests against injected fakes: SIGTERM→SIGKILL escalation, no-op on already-dead pid, no double-kill, sweep behavior), `tests/orchestrator/killer.integration.test.mjs` (2 tests using real detached child-process trees — proves the group signal reaches a grandchild process, and that SIGKILL still lands on a process that traps/ignores SIGTERM), `tests/orchestrator/killer.wiring.test.mjs` (1 smoke test against the real `Registry`/`Budget` classes, not mocks). All 13 pass: `node --test tests/orchestrator/`.

**Not done (acceptable gap):** no PID-liveness verification across orchestrator restarts — if the daemon restarts while a ticket is mid-kill, the in-memory `sigkillTimers` grace-period tracking is lost (matches existing "lost on restart" behavior already documented for stuck-detection's event window). Low risk since a restart is a rare, operator-driven event, not a silent-failure path.

---

### Issue 3: No retry logic

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: eba1167)

**Problem:** If spawn crashes early, ticket stuck in `in_progress` forever

**Solution:**
- Add retry config to orchestrator.json:
  ```json
  "retry": {
    "max_attempts": 3,
    "backoff_ms": [5000, 30000, 300000]
  }
  ```
- Track attempt count in registry
- Exponential backoff between retries
- Notify Slack after final failure
- Mark ticket as `failed` after max attempts

---

### Issue 4: ClickUp/Linear/Jira sources not implemented

**Priority:** ~~MEDIUM~~ → **LOW** — downgraded 2026-07-20 by explicit user decision (see "Remaining Work" below for the current flat priority list).

**Problem:** ClickUp/Linear/Jira mentioned in docs but not implemented. (Correction 2026-07-19: the orchestrator is not strictly "GitHub-only" as originally stated — `orchestrator/sources/filesystem.mjs` already exists, picking up tickets from JSON files dropped in a local directory, for demos/offline/file-driven pipelines. It does not cover any real issue-tracker API, so ClickUp/Linear/Jira remain unimplemented.)

**Location:** `orchestrator/sources/`

**Solution:**
- Implement `sources/clickup.mjs` following github.mjs pattern
- Implement `sources/linear.mjs`
- Implement `sources/jira.mjs`
- Document API token setup for each in orchestrator/README.md
- Add example configs to orchestrator.example.json

**Implementation Pattern:**
```javascript
// sources/clickup.mjs
export async function fetchClickUp(config) {
  const response = await fetch(
    `https://api.clickup.com/api/v2/team/${config.team_id}/task`,
    {
      headers: { 'Authorization': config.api_token },
      params: { 'statuses[]': config.status_filter }
    }
  );

  return response.tasks.map(t => ({
    id: t.id,
    title: t.name,
    url: t.url,
    labels: t.tags.map(tag => tag.name),
    source: 'clickup',
    source_name: config.name
  }));
}
```

---

### Issue 5: Session→ticket correlation approximate

**Priority:** LOW

**Problem:** Relies on branch slug if `CLAUDE_SESSION_ID` not set early enough

**Solution:**
- Modify spawn.mjs to set `CLAUDE_SESSION_ID` env var before spawn
- Use ticket_id as session ID for predictable correlation
- Update event tailer to match on session_id first, branch as fallback
- Log correlation method used for debugging

---

### Issue 6: Stuck detection may false-positive

**Priority:** MEDIUM (fixed ahead of schedule, partially, 2026-07-19 — was briefly ranked under a risk-tier system since retired; see "Remaining Work — Flat Priority List").

**Status:** ✅ PARTIALLY COMPLETED (2026-07-19) — whitelist only, by deliberate scope decision (user chose to keep this ticket small rather than build all 4 original sub-items)

**Problem:** 10min idle timeout aggressive for complex tasks

**Location:** `orchestrator/stuck-detector.mjs`

**Scope decision:** the original spec below had 4 sub-items. Discussed with the user and deliberately narrowed to **whitelist only**:
- ✅ Configurable whitelist to exclude specific tickets from stuck detection — implemented
- ❌ Raise default idle_timeout_ms to 20min — not done; a separate judgment call about noise tolerance that doesn't depend on the whitelist, left for a future ticket if still wanted
- ❌ Near-stuck warnings at 50%/80% of threshold — not done; would add Slack noise, arguably working against the goal of this fix (reducing false-positive noise)
- ❌ Operator "mark as working normally" reset endpoint — not done; bigger scope, requires a new dashboard API route, is a different component than "tune the detector"

**What was implemented:**
- New `isWhitelisted(ticket, whitelist)` export in `stuck-detector.mjs` — glob-pattern (`*` wildcard) matching against **both** the ticket id and its labels, not just the id as the original example implied. This matters because real ticket ids in this codebase don't look like the doc's `"RESEARCH-*"` example — GitHub-sourced ids are `gh:org/repo#42` and filesystem-sourced ids are `fs:name:ticket-id`, neither of which has a natural glob-able prefix the way a Jira/Linear-style `RESEARCH-123` would. Labels (already populated by every source) are the more robust match target for "this category of ticket," with id matching available for excluding one specific ticket.
- `detectStuck()` now short-circuits to `null` (never flagged, for any rule) if the ticket matches `config.stuck.whitelist` — checked right after the existing terminal-status skip, before any of the four detection rules run.
- `config/orchestrator.example.json` documents the new `stuck.whitelist` field with examples.
- `orchestrator/README.md` gets a new "Whitelisting tickets" subsection explaining it's a full opt-out per ticket, not a threshold adjustment.

**Incidental finding, not fixed (out of scope for this ticket):** while writing tests, found that `last_event_at: 0` (a literal zero timestamp) is treated as "no timestamp yet" by the existing idle-rule guard (`if (lastAt && ...)` — `0` is falsy), so a ticket whose `last_event_at` is ever persisted as exactly `0` would never trigger idle detection, no matter how much time passes. This is pre-existing behavior, unrelated to the whitelist change, and is now locked in as documented/tested behavior (`tests/orchestrator/stuck-detector.test.mjs`) rather than silently fixed — flagging here in case it's worth its own ticket later.

**Tests:** `tests/orchestrator/stuck-detector.test.mjs` (19 tests) — 8 for `isWhitelisted()` alone (exact match, glob on id, glob on label, no partial-match without a wildcard, empty/missing whitelist, ticket with no id/labels, glob-special-character escaping), plus whitelist integration into `detectStuck()` across the idle and tool_loop rules, a check that non-whitelisted tickets are unaffected, and full regression coverage of the 4 pre-existing rules (idle, tool_loop, thrashing, stopped_no_changes) plus the terminal-status skip, so this change can't silently break what was already there. All pass: `node --test tests/orchestrator/stuck-detector.test.mjs`.

**Configuration Example (as implemented):**
```json
"stuck": {
  "idle_timeout_ms": 600000,
  "tool_loop_threshold": 5,
  "thrashing_window": 50,
  "whitelist": ["gh:your-org/your-repo#42", "research-*", "long-running"]
}
```

---

### Additional Enhancements

- **Cost optimization alerts:** Notify at 80%/90% of per-ticket cap
- **Ticket prioritization:** Process tickets with `priority:high` label first
- **Spawn queue:** Queue tickets when budget hit instead of skipping, process when cap resets
- **Graceful shutdown:** SIGTERM handler to cleanly stop all agents before exit

---

## 2. Dashboard (Agent Visibility & Control)

### Issue 1: Not real-time

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: 793dc5e)

**Problem:** Polls every 2s, rebuilds entire state from events.jsonl

**Location:** `dashboard/server.mjs:49` (buildState function)

**Solution:**
- Implement WebSocket server in dashboard/server.mjs
- Watch events.jsonl with fs.watch(), push new events to connected clients
- Clients update state incrementally instead of replacing
- Fallback to polling if WebSocket connection lost

**Implementation Notes:**
```javascript
// Add WebSocket support
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server: httpServer });

fs.watch(EVENTS, (eventType) => {
  if (eventType === 'change') {
    const newEvents = readNewEvents(); // Read only new lines
    wss.clients.forEach(client => {
      client.send(JSON.stringify({ type: 'events', data: newEvents }));
    });
  }
});
```

---

### Issue 2: No authentication

**Priority:** LOW

**Problem:** Binds 127.0.0.1 only, assumes single operator on localhost

**Solution:**
- Add optional basic auth: username/password from env vars
- Add `AGENCY_DASHBOARD_AUTH=user:pass` to config
- Add middleware to check Authorization header
- Document: "Leave unset for localhost-only, set for team use"
- Consider SSO integration (OAuth2) in v2

---

### Issue 3: File-based inbox/outbox race conditions

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 — was briefly ranked under a risk-tier system since retired; see "Remaining Work — Flat Priority List"). This was the last of the safety/silent-failure-class fixes done under that now-retired system.

**Status:** ✅ COMPLETED (2026-07-19)

**Problem:** Potential race conditions with concurrent access. Investigation found three distinct races, not just one generic "concurrency" concern:
1. `dashboard/server.mjs`'s `/api/unblock` wrote the inbox file via a direct `writeFileSync` — not atomic, so a concurrent reader could observe a torn/partial write.
2. `.claude/hooks/agency-emit.sh` created the empty inbox placeholder on a `notification` event via a check-then-act (`[[ -f "$SLOT" ]] || : > "$SLOT"`) — a TOCTOU race where an operator's reply landing between the check and the create would be truncated.
3. `.claude/hooks/inbox-check.sh` and `inbox-wait.sh` **read the inbox file before archiving it** (`cat "$INBOX"; mv "$INBOX" ...`) — a reply written by the dashboard in the gap between the read and the archive was silently lost: archived without ever being surfaced to the agent. This is the most operator-visible failure mode (an operator sends a quick follow-up correction right after their first reply, and it vanishes) and the one that best matches this fix's Tier 1 classification: state going silently wrong with no visible symptom beyond "the agent seems to be ignoring what I said."

**What was implemented** (differs from the original sketch — no `lockfile`/`flock` dependency needed, since POSIX `rename()` is already atomic and gives everything the fix actually requires):
- `dashboard/server.mjs`: new `writeFileAtomic()` helper — write to a uniquely-named temp file in the same directory (`<path>.tmp-<pid>-<random>`), then `renameSync` into place. Used by `/api/unblock`.
- `.claude/hooks/agency-emit.sh`: the placeholder create now uses noclobber (`( set -C; : > "$SLOT" ) 2>/dev/null || true`) — a single atomic syscall that silently no-ops if the file already exists, instead of a check-then-act.
- `.claude/hooks/inbox-check.sh` and `inbox-wait.sh`: **reordered to claim (atomically `mv` to the outbox) before reading**, not after. Any reply that lands after the claim simply creates a fresh `$INBOX` file for the next poll/check to pick up, rather than being silently overwritten-then-discarded.
- **Found and fixed a second, related bug while testing the reorder**: the archive filename used only `date +%s` (1-second resolution). Once claim-then-read makes rapid back-to-back consumption a normal pattern (not just a theoretical race), two claims within the same wall-clock second would collide on the archive filename and the second `mv` would silently overwrite the first claim's archived reply on disk. Fixed by using `date +%s%N` (nanoseconds, falls back to `+%s` if unsupported) plus the shell's own `$$` (PID) in the archive filename.
- Did **not** add file locking (`lockfile`/flock) or a retry-with-backoff loop — the atomic-rename approach makes both unnecessary for this access pattern (single writer per file at a time, one physical hand-off per reply). Did **not** pursue the "Redis-based inbox/outbox for true multi-operator support" v2 idea — out of scope for a race-condition fix, and no evidence multi-operator support is currently needed.

**Tests:** `tests/dashboard/inbox-race.test.mjs` (9 tests) — basic read/archive flow unaffected, empty-inbox reporting, claim-before-read ordering verified via matching stdout to archived content, the core race scenario (a second reply after a first claim is never lost), the `agency-emit.sh` noclobber fix (doesn't truncate an existing reply), `inbox-wait.sh` immediate-pickup and timeout paths, and a dedicated regression guard hammering 5 rapid back-to-back claims to prove the archive-filename collision fix holds. `tests/dashboard/unblock-atomic-write.test.mjs` (4 tests) — spawns the real `dashboard/server.mjs` on a scratch port against a scratch `CLAUDE_AGENCY_HOME` (can't safely import server.mjs directly, since it binds a real port as an import-time side effect): proves a large write is never truncated and leaves no leftover temp file, concurrent writes to different sessions never cross-contaminate, a second reply to the same session cleanly overwrites rather than corrupting, and malformed requests are rejected without touching disk. All 13 pass, plus the full repo suite (`node --test tests/`) stays green at 56/56.

---

### Issue 4: O(n) performance degradation

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: 9c71c31)

**Problem:** Re-reads entire events.jsonl per request (slow if >50MB)

**Location:** `dashboard/server.mjs:50`

**Solution:**
- Track last-read offset in memory: `Map<clientId, offset>`
- Use fs.createReadStream with `start` option to read only new bytes
- Parse only new lines, update state incrementally
- Add rotation: when events.jsonl > 100MB, archive old events to events-YYYY-MM.jsonl

**Implementation:**
```javascript
let lastReadOffset = 0;

function readNewEvents() {
  const stats = statSync(EVENTS);
  if (stats.size <= lastReadOffset) return [];

  const stream = createReadStream(EVENTS, {
    start: lastReadOffset,
    encoding: 'utf8'
  });

  const newLines = [];
  // Parse new lines...

  lastReadOffset = stats.size;
  return newLines;
}
```

---

### Issue 5: No agent output preview

**Priority:** MEDIUM

**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** Can't see what agent is doing without tailing logs manually

**What was implemented** (matches the spec closely, with one deliberate scope cut — live WebSocket streaming — made explicitly with the user before starting):
- New `GET /api/agent-log/:ticket` endpoint in `dashboard/server.mjs` — reads the last N lines (default 100, capped at 1000 via `?lines=`) from `agent-logs/<sanitized-ticket-id>.log`. Note: the endpoint is keyed by **ticket id**, not session id — `orchestrator/spawn.mjs` writes one log file per ticket (`agent-logs/<ticket_id>.log`), not per session, so ticket id is the identifier that actually maps to a real file. The sanitization regex (`[^a-zA-Z0-9._-]` → `_`) is copied verbatim from `spawn.mjs` so the dashboard always resolves the exact filename the orchestrator wrote, and — as a side effect — makes path traversal impossible (no `/` survives the substitution).
- New "View Logs" button added to each row in the dashboard's **Tickets** table (`dashboard/public/index.html`/`app.js`), opening a modal that fetches the endpoint and polls it every 2s while open (`dashboard/public/style.css` gets a `.modal-wide`/`.log-viewer` style).
- **Did not** build live WebSocket streaming of new log lines, per explicit user decision — that would require per-ticket file watchers and new client-side subscription bookkeeping on top of the existing WebSocket connection; a 2s polling refresh while the log panel is open satisfies the actual ask ("see what an agent is doing without shelling into logs") without that added complexity.

**Tests:** `tests/dashboard/agent-log-and-stats.test.mjs` (7 tests, run against a real spawned `dashboard/server.mjs` instance) — last-N-lines correctness, 404 for a ticket with no log file, path-traversal safety (verified with a real `../../../etc/passwd` HTTP request), missing-ticket-id rejection, the 1000-line cap, plus 2 tests for the `/api/agent-stats` endpoint added alongside (see Agent System Issue 4). All pass.

---

### Issue 6: No search/filter capability

**Priority:** LOW

**Problem:** Can't filter by ticket, agent type, or time range

**Solution:**
- Add filter UI controls: dropdowns for agent role, status; date range picker
- Filter state in buildState() before returning
- Add search box: filter events by keyword in tool/file/prompt
- Save filter preferences in localStorage

---

### Additional Enhancements

- **Event export:** Add "Download CSV" button, format events for analysis
- **Metrics dashboard:** Add charts using Chart.js: tickets over time, success rate, cost trends
- **Mobile-responsive:** Use CSS media queries, test on phone
- **Multi-user support:** Track operator assignments per ticket, show who replied

---

## 3. Agent System (Role Specialists)

### Issue 1: Profile switching is destructive

**Priority:** MEDIUM (fixed 2026-07-20 — was briefly ranked under a risk-tier system since retired; see "Remaining Work — Flat Priority List").

**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** Moved agents out of `.claude/agents/` via `rm` then `cp` from an `agents.backup/` copy — an interrupted run between those two steps left `.claude/agents/` empty, recoverable only by hand.

**Location:** `scripts/switch-agents.sh`

**What was implemented** (matches the doc's original design closely — `.claude/agents-all/` for canonical files, `.claude/agents/` as symlinks-only — with a few refinements found necessary during implementation):
- `.claude/agents-all/` now holds the canonical real `.md` files (previously they lived directly in `.claude/agents/`); `.claude/agents/` contains only symlinks into it, one per agent in the active profile.
- **One-time, idempotent migration built into the script itself**, not a separate adoption step: on first run, if `agents-all/` is empty but `.claude/agents/` has real (non-symlink) `.md` files, they're moved into `agents-all/` automatically. Safe to call every time — a no-op once migrated.
- Switching profiles now only ever adds/removes symlinks (`ln -sf` / `rm` on symlinks only) — the real content in `agents-all/` is never touched by a switch, so an interrupted run (Ctrl-C, jq failure, disk full) at worst leaves `.claude/agents/` empty, and re-running the script for *any* profile fully repairs it.
- **Added a safety guard not in the original spec:** the symlink-clearing step checks `[ -L "$f" ]` before removing anything — if a real (non-symlink) `.md` file is ever found in `.claude/agents/` (e.g. hand-added by a developer), it's left alone with a warning rather than silently deleted. The original design's `rm "$AGENTS_ACTIVE"/*.md` would have deleted such a file unconditionally.
- **Did not** update `scripts/adopt.sh` per the doc's "Update adoption to populate agents-all/ directory" — found this doesn't apply: `adopt.sh` never copies `switch-agents.sh` into adopted projects (it's a blueprint-repo-only tool), so adopted projects never invoke profile switching and never hit this bug. Separately confirmed `adopt.sh`'s existing `cp` calls (which read agent files out of *this* repo's `.claude/agents/`) work transparently against the new symlinks — plain `cp` follows a symlink and copies the target's real content, verified directly before making any change.
- Migrated this repository's own `.claude/agents/` to the new structure using the fixed script itself (`ticket` profile — all 6 agents — to exactly preserve current behavior with zero functional change).

**Tests:** `tests/agents/switch-agents.test.mjs` (8 tests) — first-run migration correctness, content preservation through migration, profile-switch symlink correctness, **the core fix** (simulating an interrupted run by manually clearing symlinks and confirming `agents-all/` survives untouched, then confirming a simple re-run fully recovers), the non-symlink-file safety guard, unknown-profile rejection, idempotency of re-running the same profile, and a clear failure message when there's nothing to migrate/activate. All pass. Full repo suite: `node --test tests/` → **91 tests, 91 pass, 0 fail.** Also re-ran `scripts/test-adopt.sh` (37/37 still pass) to confirm the migration doesn't break `adopt.sh`'s agent-copying behavior.

---

### Issue 2: No agent version tracking

**Priority:** LOW

**Problem:** Can't tell which version of custom agent is active

**Solution:**
- Add version metadata to agent files:
  ```markdown
  <!-- agent-version: 2.1.0 -->
  <!-- last-updated: 2026-06-15 -->
  ```
- Create `./scripts/agent-version.sh` to:
  - Show current version of all agents
  - List available versions from git history
  - Rollback to previous version: `./scripts/agent-version.sh backend-dev 2.0.0`
- Track agent versions in registry when ticket completes

---

### Issue 3: Agent profiles hardcoded in JSON

**Priority:** LOW

**Problem:** Can't customize which agents available per profile without editing code

**Solution:**
- Make `.claude/agents.profiles.json` user-editable
- Add validation in switch-agents.sh: verify all referenced agents exist
- Add profile customization command:
  ```bash
  ./scripts/customize-profile.sh frontend --add security-specialist
  ```
- Document profile customization in docs/AGENT-PROFILES.md

---

### Issue 4: No agent performance metrics

**Priority:** MEDIUM

**Status:** ✅ COMPLETED (2026-07-20), with one honest scope cut from the original spec

**Problem:** Don't know which agents succeed/fail most

**Important finding before implementing:** the original spec's "agents_used"/"agent_results: {status: success}" sketch assumes a per-agent success/failure signal that **does not exist anywhere in the event stream**. `.claude/hooks/agency-emit.sh` never emits a "kind" for a failed tool call or a crashed subagent — a subagent that fails looks event-for-event identical to one that succeeds (it just eventually stops emitting events, same as a normal completion). Building a "success rate" metric on top of that would mean inventing a proxy signal and presenting it as ground truth — discussed with the user, who agreed to skip it rather than ship a misleading number.

**What was implemented instead** (real, honestly-derivable usage stats, not registry.json changes — computed live from the existing event stream instead, following the same pattern `orchestrator/digest.mjs` already uses):
- New `orchestrator/agent-stats.mjs` — library + CLI, `buildAgentStats({events, since})` derives per-agent: distinct session count, distinct ticket count, tool-call volume (+ top-5 tools used), and average session duration (first-event-to-last-event span, averaged across sessions) — all directly observable, no invented signal. `--since` supports `24h`/`7d`/`30d`/`all`.
- `./scripts/agent-stats.sh` — thin wrapper CLI, exactly matching the spec's ask, following the existing `scripts/daily-digest.sh` wrapper pattern.
- New `GET /api/agent-stats?since=` endpoint in `dashboard/server.mjs`, reusing the same module — "show in dashboard" from the spec, via API (no dedicated UI panel built yet; the endpoint is the reusable building block).
- The formatted table output includes an explicit note that no success/failure rate is shown and why, so a future reader of the CLI output isn't left wondering why that column is missing.

**Tests:** `tests/orchestrator/agent-stats.test.mjs` (12 tests) — session/ticket/tool-call counting correctness, duration averaging, `--since` window filtering (including that `all` never excludes anything), sort order, empty-input handling, and an explicit "HONESTY CHECK" test asserting no `success`/`status`/`fail` field ever appears in the output shape. Plus 2 of the 7 tests in `tests/dashboard/agent-log-and-stats.test.mjs` cover the `/api/agent-stats` endpoint end-to-end against a real running server. All pass.

---

### Issue 5: Code-reviewer is superpowers symlink

**Priority:** LOW

**Problem:** If upstream updates break compatibility, workflow breaks

**Solution:**
- Pin superpowers version in bootstrap.sh
- Test superpowers updates in staging before production
- Add version check: warn if superpowers > tested version
- Consider vendoring code-reviewer.md if stability critical
- Document tested superpowers version in README

---

### Additional Enhancements

- **Agent marketplace:** Share custom agents via GitHub gists or dedicated repo
- **Conditional agent loading:** Parse implementation plan, load only mentioned agents
- **Framework-specific agents:** `backend-dev-python.md`, `backend-dev-node.md`
- **Custom agent scaffolding:** `./scripts/new-agent.sh <name>` generates template
- **Agent composition:** Allow architect to spawn tech-lead sub-agent

---

## 4. Adoption & Bootstrap (Setup Experience)

### Issue 1: Bootstrap doesn't verify success

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: 02f6319)

**Problem:** Uses `|| warn` fallbacks but continues; could result in broken setup

**Location:** `scripts/bootstrap.sh:19-48`

**Solution:**
- Add `--strict` mode: exit on any failure instead of warning
- Add `--verify` mode: after installation, test each tool:
  ```bash
  claude --version || die "Claude Code not working"
  ast-grep --version || die "ast-grep not working"
  pre-commit --version || die "pre-commit not working"
  graphify --version || die "graphify not working"
  ```
- Default to strict mode, add `--permissive` to continue on warnings
- Print summary at end: ✓ installed / ✗ failed / ⚠ skipped

---

### Issue 2: Monorepo auto-detection untested

**Priority:** MEDIUM (test coverage added 2026-07-19, partial — was briefly ranked under a risk-tier system since retired; see "Remaining Work — Flat Priority List").

**Status:** ✅ PARTIALLY COMPLETED (2026-07-19) — test coverage added (`tests/adopt/monorepo-detection.test.mjs`, 15 tests, see full writeup under Cross-Cutting Issue 5 above, which this was combined with). The `--debug-detection` flag was **not** added — out of scope for a coverage-only ticket, and the 15 new tests already make the detection heuristic's actual behavior fully visible without needing a new CLI flag.

**Problem:** Heuristics may fail in deeply nested or unusual structures

**Location:** `scripts/adopt.sh` (`detect_frameworks()`, around line 124)

**What was found, confirmed by test, and left as documented limitations (not fixed — this was a coverage ticket)**:
- Detection is a single-level scan of exactly 6 hardcoded subdirectory names (`backend frontend api web mobile apps services`) — no recursion. A framework 2+ levels deep (e.g. `apps/backend/api/pyproject.toml`) is invisible to it.
- Non-standard subdirectory names (e.g. `server/`) are never scanned.
- nx (`nx.json`), lerna (`lerna.json`), and pnpm-workspace (`pnpm-workspace.yaml`) markers are not recognized at all — an nx monorepo's root `package.json` (with a `workspaces` field but no `next`/`@nestjs/core` dependency) just falls through to the generic "node" bucket, missing the actual monorepo structure entirely.

**What already worked and is now locked in by test** (the doc's original "may fail" framing undersold this — `--frameworks` as an explicit override already existed and works correctly, and root+subdirectory combination detection with dedup works correctly for the 6 supported subdirectory names):
- `--frameworks "python,nextjs"` (the override this doc originally asked to "add") was **already implemented** before this ticket — confirmed via test, not net-new.
- Multi-framework detection across root + multiple subdirectories, with correct deduplication when the same framework is found in two places.

**Original solution items not done:** `--debug-detection` flag (deferred — the new tests already document detection behavior precisely; a debug flag would be a nice-to-have UX addition, not a coverage gap). Sample repos for nx/lerna/pnpm-workspace/nested-Django are covered as "known limitation" tests confirming they're NOT detected, rather than "sample repos" implying they should be — actually making them work is a separate, larger fix (recognizing monorepo tooling markers, adding recursive scanning), tracked here as a finding for a future ticket, not attempted.
- Document known limitations

---

### Issue 3: No adoption preview mode

**Priority:** MEDIUM

**Status:** ✅ COMPLETED (2026-07-20), one scope cut discussed with the user before implementing

**Problem:** Can't see what would change before applying

**What was implemented:**
- New `--diff` flag on `scripts/adopt.sh`, combined with the existing `--dry-run`. Previously, dry-run only printed the *command* that would run (`cp X Y`) for every file, including files being modified, not created — there was no way to see the actual content change. `--diff` now computes the real result (the CLAUDE.md merge, or a full overwrite) into a temp buffer even during a dry run, and shows a real `diff -u` against the existing file for anything that would be modified — `CLAUDE.md` (all three merge strategies: merge/overwrite/no-markers-treated-as-overwrite), matching the original spec's example directly.
- Fixed an adjacent, previously-misleading bug found while implementing this: the "Adoption complete." / "Next: run 'claude' in this project." messages were printed **even during `--dry-run`**, falsely implying something had been written. Dry-run now prints "DRY RUN complete — nothing was written. Re-run without --dry-run to apply." instead.
- **Did not** add the "Would create: / Would modify: / Would symlink:" categorized summary format from the spec's example — the existing per-operation `DRY: ...` lines (now with diffs attached where applicable) already communicate this, and reformatting every dry-run line into three buckets would be a larger, more invasive rewrite of `adopt.sh`'s existing dry-run plumbing for marginal added clarity.
- **Did not** add the "Proceed? [y/N]" confirmation prompt from the spec — discussed with the user first: `adopt.sh` is invoked non-interactively by the existing CI test suite (`scripts/test-adopt.sh` runs it dozens of times with no stdin and no `--yes`/`--auto` bypass flag anywhere), so a bare blocking prompt would hang every automated invocation. `--dry-run --diff` already lets an operator preview exactly what would happen before running for real, which was judged sufficient without adding a second gate that risks breaking non-interactive usage.

**Tests:** `tests/adopt/precommit-and-preview.test.mjs` includes 5 tests for this issue (of its 10 total, alongside Issue 6's tests — see below): no-diff dry-run behavior unchanged, a real unified diff shown for the CLAUDE.md merge case (and confirming the file on disk is untouched even with `--diff`), a diff shown correctly for `--merge-strategy overwrite`, and the corrected DRY RUN vs. real-adoption completion messages. All pass. `scripts/test-adopt.sh` re-run in full: still 37/37 passing.

---

### Issue 4: Adopt script is complex (482 lines)

**Priority:** LOW

**Problem:** Many edge cases, hard to debug

**Solution:**
- Refactor into smaller functions with single responsibilities
- Extract validation logic into separate script: `lib/validate-adoption.sh`
- Extract symlink logic into: `lib/create-symlinks.sh`
- Add debug logging: `--verbose` shows each step with timing
- Add unit tests for each function

---

### Issue 5: No uninstall validation

**Priority:** LOW

**Problem:** Doesn't verify all blueprint artifacts actually removed

**Solution:**
- After uninstall, verify:
  ```bash
  [[ ! -e .claude ]] || warn "/.claude still exists"
  [[ ! -L .git/hooks/pre-commit ]] || warn "pre-commit hook still linked"
  grep -q "claude-agency" .gitignore && warn ".gitignore still has blueprint entries"
  ```
- Show summary: "✓ Removed X files, ✗ Y files remain"
- Add `--force` to remove even user-modified files (with confirmation)

---

### Issue 6: Pre-commit config selection manual

**Priority:** MEDIUM

**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** 6 different templates, user must choose correctly

**Important finding before implementing:** most of this issue was already done. `generate_precommit_config()` in `scripts/adopt.sh` already auto-detects from the framework(s) passed to `adopt.sh` (single framework → direct template mapping; 2+ frameworks → a real merged config, including workspace-path filters like `files: ^backend/` when a `backend/`/`api/`/`frontend/`/`web/` directory is detected). The only genuinely missing piece was an override for when auto-detection guesses wrong.

**What was implemented:**
- New `--precommit-template <python|node|merged>` flag on `scripts/adopt.sh`, overriding auto-detection entirely. If the explicit template doesn't match any detected framework (e.g. `--framework python --precommit-template node`), a warning is printed but the override is still honored — the user explicitly asked for it, so it's not treated as an error.
- `merged` forces the multi-framework merge generator even for a single detected framework, useful for e.g. a Python backend that also wants the Node linter section pre-populated for an upcoming frontend.
- Validates the flag's value against the 3 known options (`python`/`node`/`merged`), rejecting anything else with a clear error.

**Not done, because already true:** the "validate template matches detected frameworks" bullet is satisfied by the mismatch warning above (warn, don't block, since an explicit override is intentional); "for monorepo, merge relevant sections" was already fully implemented before this session touched the file.

**Tests:** `tests/adopt/precommit-and-preview.test.mjs` includes 5 tests for this issue (of its 10 total, alongside Issue 3's tests): forcing `node` on a Python project (with the mismatch warning), forcing `python` with no warning (correct match), forcing `merged` on a single-framework project (both `black` and `eslint` present in the output), rejecting an invalid template value, and two regression guards confirming plain auto-detection (single and multi-framework) is unaffected when no override is passed. All pass. `scripts/test-adopt.sh` re-run in full: still 37/37 passing.

---

---

### Additional Enhancements

- **Interactive wizard:** CLI prompts guide through all choices with explanations
- **Stack-specific templates:** `--stack django-react` pre-configures both frameworks
- **Adoption snapshots:** Timestamped backup before changes, easy restore with `./scripts/restore-snapshot.sh <timestamp>`
- **Enhanced doctor:** Check for conflicting configs, orphaned symlinks, version mismatches

---

## 5. Token Optimization (Context Reduction)

### Issue 1: Savings projections unvalidated

**Priority:** ~~MEDIUM~~ → **LOW** — downgraded 2026-07-20 by explicit user decision (see "Remaining Work" below for the current flat priority list).

**Problem:** "70-90% reduction" is theoretical, not measured in practice

**Location:** `README.md:43`, `docs/TOKEN-OPTIMIZATION.md`

**Solution:**
- Add token tracking to measure actual savings:
  ```bash
  # Before optimization
  TOKENS_BEFORE=$(grep total_cost_usd session-before.json)
  # After optimization
  TOKENS_AFTER=$(grep total_cost_usd session-after.json)
  SAVINGS=$((100 * (TOKENS_BEFORE - TOKENS_AFTER) / TOKENS_BEFORE))
  echo "Saved: $SAVINGS%"
  ```
- Run benchmark suite on sample tasks
- Update docs with actual measured savings
- Add per-project savings tracking in registry

---

### Issue 2: No automatic profile detection

**Priority:** MEDIUM (fixed 2026-07-20, worked on ahead of Token Optimization Issues 1 and 6 — savings-projection validation and usage analytics — by explicit user decision; those two are now downgraded to LOW, see "Remaining Work — Flat Priority List").

**Status:** ✅ COMPLETED (2026-07-20)

**Problem:** User must manually choose profile; wrong choice wastes tokens or breaks workflow

**Important finding before implementing:** the CHANGELOG already *claimed* "Architect-driven profile detection in ticket workflow (Phase 0)" was done. Investigation found this was true only in the loosest sense — `.claude/commands/ticket.md` had **two separate, contradictory prose mechanisms**, neither of them real detection logic:
1. Phase 0 step 4: a soft, freeform "check MCP compatibility, maybe warn" instruction.
2. Phase 1: a *different* instruction telling the architect to independently re-check the profile and, if insufficient, **hard STOP the entire workflow** — forcing the user to manually exit, switch profiles by hand, and restart `/ticket` from scratch.

Neither was backed by an actual script — both were pure prompt instructions to Claude, meaning detection quality depended entirely on the model correctly following freeform text each time, with no way to test it and no logging to `events.jsonl` despite the doc's explicit ask for that.

**What was implemented** (a real, testable detection script, replacing both prose mechanisms with one clear step — differs from the doc's "architect reads and analyzes" framing, which put the logic inside a costly LLM call with no test coverage):
- New `.claude/hooks/detect-profile.sh <ticket-text> [current-profile]` — keyword-based, deterministic detection modeled on the existing (but unused/unwired) `dynamic-context.sh` pattern, mapped to actual `.claude/agents.profiles.json` profile names rather than raw MCP lists. Categories: frontend, backend, devops, data. Rule: single-category match → that profile; frontend+backend → `fullstack`; 0 categories → `minimal`; any other 2-category combo or 3+ categories → `ticket` (never guesses a partial profile that would be missing an agent it actually needs).
- Emits a `profile_detected` event to `~/.claude-agency/events.jsonl` (via `agency-emit.sh`) with the recommendation, and — when a current profile is passed — whether it matched, satisfying the doc's logging ask directly.
- `.claude/commands/ticket.md` rewritten: Phase 0 step 4 now calls the script once and is the **only** profile check in the workflow; Phase 1's duplicate re-check and hard-STOP-and-restart behavior removed entirely. On a mismatch, the workflow now asks the user to choose (`switch` or `continue`) rather than force-exiting — the original hard-stop design was a bigger workflow break than the problem it solved, especially for a heuristic (not a guarantee).
- **Two real logic bugs found via testing and fixed before shipping:**
  1. A `pipeline.*deploy` regex alternative in the devops keyword pattern used an unbounded `.*`, which greedily matched from "pipeline" to "deploy" across an entire ticket description, producing a garbled "keyword" that was actually most of the sentence — removed as redundant (the bare `deploy` keyword already covers it).
  2. A branch-ordering bug: single-category checks (`has_frontend == 1`) were evaluated before the "exactly 2 categories" check, so a ticket matching both frontend and devops keywords took the frontend-only branch and silently dropped the devops signal, recommending a profile missing an agent it needed. Fixed by checking `CATEGORY_COUNT` (0 / ≥3 / exactly 2 / exactly 1) before any single-category branch.

**Tests:** `tests/hooks/detect-profile.test.mjs` (17 tests) — one test per named profile outcome, the ≥3-category and 0-category edge cases, both regression tests for the two bugs found above (frontend+devops and backend+data combinations, verifying neither signal is silently dropped), stdout/stderr separation (so callers can safely capture just the profile name), event logging with and without a current-profile comparison, and a missing-argument error case. All pass. Full repo suite: `node --test tests/` → **108 tests, 108 pass, 0 fail.**

---

### Issue 3: Graphify not incremental by default

**Priority:** LOW

**Status:** ✅ COMPLETED (2026-07-21)

**Problem:** Must manually re-index after large changes

**Important finding before implementing:** the vendored `graphify` tool (`vendor/graphify/`) already ships exactly what this issue asks for — better, in fact, than the original spec assumed. `graphify hook install` (a real, mature CLI subcommand — see `vendor/graphify/graphify/hooks.py`) installs **both** `post-commit` and `post-checkout` git hooks (the original spec only asked for post-commit), is idempotent, appends to an existing hook rather than clobbering it, respects `core.hooksPath` (Husky compatibility), and calls `_rebuild_code()` — an AST-only, no-LLM, per-file-cached rebuild that preserves prior semantic annotations. `docs/ADVANCED.md` already documented that graphify's SHA256 per-file caching "makes post-commit hooks practical for keeping graph fresh automatically," but nothing had actually wired the hook into the adoption flow — that was the real, narrow gap.

**What was implemented** (wiring an existing capability into `adopt.sh`, not building new indexing logic):
- `scripts/adopt.sh` now calls `graphify hook install` during adoption (right after the pre-commit install step, same non-fatal `warn`-not-`die` pattern). Skipped entirely in `--dry-run` (prints a `DRY:` line instead).
- New `--no-graphify-hook` flag to opt out, mirroring the existing `--no-precommit` flag.
- If `graphify` isn't installed, adoption logs a note (pointing to `./scripts/bootstrap.sh` and the opt-out flag) and continues — never blocks adoption.
- If `graphify hook install` itself fails for any reason, adoption warns and continues rather than aborting.
- Updated `docs/ADVANCED.md`'s existing "Incremental Updates (Built-in)" section, which already explained *why* post-commit hooks are practical but never mentioned one was actually available — added a note on the new default behavior, the opt-out flag, and `graphify hook status`/`uninstall`.
- **Did not** implement the spec's literal `graphify update --incremental` command or hand-write a `.git/hooks/post-commit` script — that command doesn't exist in the real graphify CLI (verified directly against `vendor/graphify/graphify/__main__.py`'s command list); the real equivalent is `graphify hook install`, which does more than the spec asked (also handles branch switches) with battle-tested logic already in place, not a fix I should reimplement myself.
- **Did not** implement "skip if commit < 5 files changed" — the real hook script already exits immediately if `git diff --name-only` reports no changed files at all (`vendor/graphify/graphify/hooks.py`'s `_HOOK_SCRIPT`), and per-file SHA256 caching in `extract()` means an N-file commit only re-processes those N files regardless of count — there's no meaningful overhead to gate on a file-count threshold for.
- **Did not** implement "log updates to graphify.log" — the installed hook already prints progress to stdout during the commit (`"[graphify hook] N file(s) changed - rebuilding graph..."`); redirecting that to a dedicated log file wasn't judged necessary and would require modifying graphify's own hook script template rather than the blueprint's integration layer.

**Verification note:** this test environment's Python (3.9.6) is below graphify's own `>=3.10` requirement, so the real `graphify` CLI could not be pip-installed here to test end-to-end. Verified in two ways instead: (1) a Python-3.9-compatibility monkeypatch of the vendored `graphify.hooks.install()` confirmed the real hook-writing logic produces correct, executable `post-commit`/`post-checkout` hook files when run directly; (2) automated tests use a lightweight shell-script mock `graphify` binary on `PATH` to verify `adopt.sh`'s integration layer (that it's called, with what arguments, and that adoption succeeds whether the mock succeeds, fails, or graphify is absent entirely) without depending on the real package's Python version constraint.

**Tests:** `tests/adopt/graphify-hook.test.mjs` (6 tests) — confirms `adopt.sh` actually invokes `graphify hook install` during real adoption, that `--dry-run` never invokes it (just prints the DRY line), that `--no-graphify-hook` suppresses it entirely with zero mention of graphify in the output, that adoption succeeds when graphify is absent, that adoption succeeds even if the hook-install command itself fails, and that the "not installed" message correctly points to `bootstrap.sh` and the opt-out flag. All pass. Full repo suite: `node --test tests/` → **143 tests, 143 pass, 0 fail.** `scripts/test-adopt.sh` re-run in full: still 37/37 passing.

---

### Issue 4: Template library (Phase 2) incomplete

**Priority:** LOW

**Problem:** Mentioned in docs but no templates exist

**Location:** `docs/TOKEN-OPTIMIZATION.md:52`

**Solution:**
- Create `templates/code-patterns/`:
  - `api-endpoint.py` - FastAPI endpoint template
  - `api-endpoint.ts` - Express/NestJS endpoint template
  - `react-component.tsx` - React component with props/types
  - `db-migration.py` - Alembic migration template
  - `dockerfile.template` - Multi-stage Docker build
- Add command: `claude "create API endpoint" --use-template api-endpoint.py`
- Document template variables and usage

---

### Issue 5: Module batching not implemented

**Priority:** LOW

**Problem:** Phase 2 feature incomplete

**Solution:**
- Implement in agent prompts:
  ```markdown
  When reading related files (e.g., model + serializer + view),
  use a single Read tool call with multiple file paths instead of
  separate calls. This reduces tool-use overhead.
  ```
- Add example to agent definitions
- Measure savings in token tracking

---

### Issue 6: No token usage analytics

**Priority:** ~~MEDIUM~~ → **LOW** — downgraded 2026-07-20 by explicit user decision (see "Remaining Work" below for the current flat priority list).

**Problem:** Can't measure which strategies actually work

**Solution:**
- Add analytics command: `./scripts/token-analytics.sh`
- Show breakdown:
  ```
  Total tokens: 45,000
    Files read: 15,000 (33%)
    MCP calls: 8,000 (18%)
    Agent prompts: 12,000 (27%)
    System instructions: 10,000 (22%)

  Top savings opportunities:
    - 5 files read multiple times (3,000 tokens wasted)
    - graphify not used for 8 queries (2,000 tokens wasted)
  ```
- Suggest optimizations based on analysis

---

### Additional Enhancements

- **Context usage visualization:** Generate HTML report with charts
- **Adaptive .claudeignore:** Learn which files never useful, auto-add patterns
- **Per-project optimization profiles:** Save winning strategies per repo
- **Cost/benefit reporting:** "Profile X saved $Y but added Z minutes"

---

## 6. Hooks & Integration (Workflow Automation)

### Issue 1: Pre-commit hook error handling fixed but undeployed

**Priority:** CRITICAL (Already Fixed)
**Status:** ✅ COMPLETED - PR #6 (Commit: 21b3c29)

**Problem:** We fixed in this session (`.claude/hooks/run-pre-commit.sh`), needs testing in production

**Solution:**
- Test the new hook with various scenarios:
  - Pre-commit passes with no output
  - Pre-commit fails with errors
  - Pre-commit auto-fixes files
  - Pre-commit not installed
- Deploy to blueprint repo
- Update adoption script to use new hook
- Document in CHANGELOG

**Files Changed:**
- `.claude/hooks/run-pre-commit.sh` (new)
- `.claude/settings.json:82` (updated to call new script)

---

### Issue 2: Ticket detection regex may miss formats

**Priority:** LOW

**Problem:** Only tested on ClickUp/Linear/GitHub/Jira URL patterns

**Location:** `.claude/hooks/detect-ticket.sh`

**Solution:**
- Make regex configurable in settings.json:
  ```json
  "hooks": {
    "ticket_patterns": [
      "https://app.clickup.com/t/[a-z0-9]+",
      "https://linear.app/[^/]+/issue/[^/]+",
      "custom_pattern_here"
    ]
  }
  ```
- Add team-specific patterns without code changes
- Log matched patterns for debugging
- Add validation: warn if pattern too broad

---

### Issue 3: Agency-emit.sh writes to events.jsonl always

**Priority:** LOW

**Problem:** Even for non-agency personal sessions

**Location:** `.claude/hooks/agency-emit.sh`

**Solution:**
- Add session tagging:
  ```bash
  # Set in environment or settings.json
  CLAUDE_SESSION_TYPE=agency  # or "personal"
  ```
- Update agency-emit.sh to check `CLAUDE_SESSION_TYPE`
- Only write to events.jsonl if `agency`
- Document how to set session type

---

### Issue 4: No hook failure recovery

**Priority:** MEDIUM (fixed ahead of schedule 2026-07-19 — was briefly ranked under a risk-tier system since retired; see "Remaining Work — Flat Priority List").

**Status:** ✅ COMPLETED (2026-07-19)

**Problem:** If a hook (`detect-ticket.sh`, `run-pre-commit.sh`, `agency-emit.sh`) crashed or exited non-zero, the agent proceeded unaware and there was no durable record — only Claude Code's own ephemeral transcript notice (which scrolls away), and no way for an operator or the dashboard to see a pattern of repeated hook failures across sessions.

**Research note:** before implementing, confirmed Claude Code's actual hook exit-code semantics (https://code.claude.com/docs/en/hooks.md): exit codes 1 and other non-zero (except 2) are already "non-blocking errors" — transcript shows a `<hook name> hook error` notice, full stderr goes to the debug log, execution continues. Only exit code 2 blocks the action. This meant the fix needed to be a **transparent wrapper**, not new error-handling logic inside each hook — anything that changed a hook's actual exit code (e.g. accidentally converting exit 1 to exit 0, or swallowing exit 2) would silently break Claude Code's own blocking behavior.

**What was implemented** (differs from the sketch above — a wrapper script rather than editing each hook's internals, so the fix applies uniformly and can't drift out of sync hook-by-hook):
- New `.claude/hooks/guard.sh <hook-name> <real-script> [args...]` — runs the wrapped hook, captures stdout/stderr to temp files, replays both untouched (byte-for-byte) to the real stdout/stderr, and re-exits with **the exact original exit code**. On any non-zero exit, appends a structured JSON line (`ts`, `hook`, `exit_code`, `script`, truncated `stderr`) to `~/.claude-agency/hook-errors.log`. On success (exit 0), nothing is logged.
- `.claude/settings.json` updated so every currently-registered hook command routes through `guard.sh` (`detect-ticket`, `run-pre-commit`, and `agency-emit` for all 7 lifecycle events, each given a unique, event-specific name like `agency-emit:post_tool` for log disambiguation).
- `scripts/doctor.sh` — new "Hook errors" line under Agency State (count + last 3 entries), and a new recommendation (#5) if more than 10 hook errors have accumulated, so operators discover a flapping hook without having to know `hook-errors.log` exists.
- Did **not** add a "send error to agent via system reminder" — Claude Code already surfaces the hook-error notice to the agent in-transcript on any non-zero/non-2 exit; adding a second, redundant surfacing mechanism would duplicate what the platform already does. The gap this fix closes is specifically the *durable, cross-session* record, not agent-visibility (which already existed).
- `dynamic-context.sh` was found not to be wired into `settings.json` at all during this investigation (it takes positional args that don't match how any registered hook is invoked) — left untouched; that's Hooks Issue 5 (Tier 6, unrelated to this fix).

**Tests:** `tests/hooks/guard.test.mjs` (8 tests: exit 0 passthrough with no log entry, exit 1 preserved + logged, **exit 2 preserved exactly** — the single most important invariant, since remapping it would silently change Claude Code's blocking behavior — missing-script/crash handling, argument forwarding, log appends across multiple failures, fresh-machine directory creation, stderr truncation in the log without truncating the passthrough), `tests/hooks/settings-wiring.test.mjs` (3 tests: every registered hook command actually routes through `guard.sh`, hook names are unique across events, every referenced script path exists on disk). All pass: `node --test tests/hooks/`. Manually verified against the real `detect-ticket.sh`, `run-pre-commit.sh`, and `agency-emit.sh` (not just synthetic test scripts) with a scratch `CLAUDE_AGENCY_HOME`, and ran the existing `run-pre-commit.sh` scenario/integration test scripts to confirm no behavior change (4 pre-existing unrelated failures in `test-pre-commit-scenarios.sh` traced to a sandbox `PATH` quirk resolving `bash`/`grep`, not to this change — confirmed via `git diff` showing zero modifications to that file).

---

### Issue 5: Dynamic-context.sh purpose unclear

**Priority:** LOW

**Problem:** Exists but not documented

**Location:** `.claude/hooks/dynamic-context.sh`

**Solution:**
- Document in `.claude/hooks/README.md`:
  - What it does
  - When it runs
  - How to configure
- Add inline comments to script
- Add example usage to docs/

---

### Additional Enhancements

- **Configurable ticket detection:** Allow custom regex per team
- **Hook marketplace:** Share useful hooks via gists
- **Hook testing framework:** `./scripts/test-hook.sh <hook-name>`
- **Hook performance monitoring:** Track execution time, log slow hooks

---

## 7. Documentation & Developer Experience

### Issue 1: 50+ markdown files hard to navigate

**Priority:** MEDIUM
**Status:** ✅ COMPLETED - PR #6 (Commits: 90ccf4b, 4bc103a, a1d03c3)

**Problem:** Duplicated info across multiple docs

**Solution:**
- Consolidate related docs:
  - MONOREPO-* + TOKEN-OPTIMIZATION + phases/ → `ADVANCED.md` (consolidates 11 files)
  - Setup guides → `SETUP.md` with sections
  - Changelog history → `CHANGELOG.md`
- Archive old docs to `docs/archive/` (15 files archived)
- Update all cross-references

**Implementation:**
- Created docs/ADVANCED.md (36KB, 1,393 lines) - consolidates 11 source files
- Created docs/SETUP.md (8KB, 280 lines) - complete new user walkthrough
- Created docs/CHANGELOG.md (6KB, 162 lines) - version history
- Archived 15 files to docs/archive/ preserving git history
- Added deprecation notices to all archived files
- Updated cross-references in README.md, TROUBLESHOOTING.md, scripts/adopt.sh

---

### Issue 2: Multiple similar docs

**Priority:** MEDIUM
**Status:** ✅ COMPLETED - PR #6 (Commit: 890eac1)

**Problem:** MONOREPO-SUMMARY vs MONOREPO-SUPPORT-SOLUTION vs MONOREPO-QUICK-START

**Solution:**
- Merged into single section in `docs/ADVANCED.md`:
  - Section 1: Monorepo Support (includes Quick Start, How It Works, Troubleshooting, Design Decisions)
  - Consolidates MONOREPO-SUMMARY.md, MONOREPO-SUPPORT-SOLUTION.md, MONOREPO-QUICK-START.md
- Updated all references in other docs

---

### Issue 3: Setup guides fragmented

**Priority:** MEDIUM
**Status:** ✅ COMPLETED - PR #6 (Commits: e72853b, d6efb52)

**Problem:** README vs SETUP.md vs LOCAL-ADOPTION.md

**Solution:**
- Restructured as:
  - README.md - Overview + quick start (updated with consolidated references)
  - SETUP.md - Detailed walkthrough (new users) - consolidates LOCAL-ADOPTION.md
  - ADVANCED.md - Advanced topics (orchestrator, profiles, monorepo, token optimization)
- Cross-referenced clearly in README "Getting Help" section
- Added "Next steps" at end of each doc

---

### Issue 4: No changelog

**Priority:** LOW
**Status:** ✅ COMPLETED - PR #6 (Commit: 6ec10ff)

**Problem:** Can't see what changed between versions

**Solution:**
- Created `CHANGELOG.md` following keepachangelog.com format
- Documented 6 version entries from [Unreleased] through [2026-05]
- Includes: Profile system, monorepo support, token optimization, dynamic context, dashboard, orchestrator
- Referenced from README.md "Getting Help" section

---

### Issue 5: No troubleshooting guide

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: e4c4f3b)

**Problem:** Common errors not documented with solutions

**Solution:**
- Create `docs/TROUBLESHOOTING.md`:
  - Bootstrap fails: Node version, Python version, permissions
  - Adoption fails: Git not initialized, BLUEPRINT_DIR not set
  - Orchestrator won't start: Config missing, ports in use
  - Dashboard blank: No events.jsonl, wrong path
  - Agent stuck: Increase timeout, check logs
- Add "Getting Help" section to README linking to this
- Include CLI commands to diagnose each issue

---

### Issue 6: ASCII diagrams brittle

**Priority:** LOW

**Problem:** Workflow diagrams in markdown break easily

**Solution:**
- Convert to Mermaid.js:
  ```mermaid
  graph TD
    A[Poll tickets] --> B{Budget OK?}
    B -->|Yes| C[Spawn agent]
    B -->|No| D[Skip]
  ```
- Renders in GitHub, VS Code, docs sites
- Much easier to maintain
- Keep ASCII in code comments where Mermaid not supported

---

### Additional Enhancements

- **Interactive docs server:** `./scripts/docs-server.sh` serves with search
- **Video walkthroughs:** 5min screen recording for key workflows
- **API reference:** Document orchestrator/dashboard REST endpoints
- **Architecture Decision Records:** Document why key choices were made

---

## Prioritization Framework

### ✅ Critical (COMPLETED - 4/4)

1. ✅ **CLAUDE.md merge** - Affects user trust
2. ✅ **Pre-commit hook deployment** - Already fixed, needs validation
3. ✅ **Leftover .claude-flow/** - Simple cleanup
4. ✅ **Config backups gitignore** - Quick fix

### ✅ High Priority (COMPLETED - 7/7)

1. ✅ **Real token tracking** - Foundation for accurate budgeting
2. ✅ **Bootstrap verification** - Prevents broken setups
3. ✅ **Orchestrator retry logic** - Prevents stuck tickets
4. ✅ **Dashboard real-time** - Core UX improvement
5. ✅ **Dashboard O(n) performance** - Incremental state updates
6. ✅ **Troubleshooting guide** - User support
7. ✅ **Documentation consolidation** - Setup guides consolidated

### ✅ Medium Priority Documentation (COMPLETED - 3/3)

1. ✅ **50+ markdown files hard to navigate** - Consolidated to 4 core guides
2. ✅ **Multiple similar docs** - Merged into ADVANCED.md
3. ✅ **Setup guides fragmented** - Created SETUP.md, ADVANCED.md structure

### 📋 Remaining Work — Flat Priority List (2026-07-20)

**History note:** between 2026-07-19 and 2026-07-20 this section used a risk-ranked "Tier 0–6" system (silent-corruption/safety issues first, polish last) instead of the original CRITICAL/HIGH/MEDIUM/LOW labels. That tier system drove real work — it's why force-kill-on-halt, hook failure recovery, the inbox/outbox race conditions, and the integration test suite all got fixed ahead of lower-risk items. It has now been **retired by explicit user decision**: it served its purpose while safety and confidence-building work was the priority, but the remaining work doesn't need that framing anymore. **Priority is now flat CRITICAL/HIGH/MEDIUM/LOW again** — see each issue's own `**Priority:**` line in its component section above for the authoritative label.

**What's already done** (for full detail, see each issue's own writeup earlier in this document under its component heading):
- ✅ Orchestrator Issue 2 — No force-kill on halt (2026-07-19)
- ✅ Dashboard Issue 3 — File-based inbox/outbox race conditions (2026-07-19)
- ✅ Hooks Issue 4 — No hook failure recovery (2026-07-19)
- ✅ Orchestrator Issue 6 — Stuck detection may false-positive (partial: whitelist only, 2026-07-19)
- ✅ Cross-Cutting Issue 5 — No integration tests (2026-07-19, hardened 2026-07-20)
- ✅ Adoption Issue 2 — Monorepo auto-detection untested (partial: test coverage only, 2026-07-19)
- ✅ Agent System Issue 1 — Profile switching is destructive (2026-07-20)
- ✅ Token Optimization Issue 2 — No automatic profile detection (2026-07-20)
- ✅ Dashboard Issue 5 — No agent output preview (2026-07-20)
- ✅ Agent System Issue 4 — No agent performance metrics (2026-07-20, with an honest scope cut — see its writeup: no success/failure rate, since no such signal exists in the event stream)
- ✅ Adoption Issue 3 — No adoption preview mode (2026-07-20)
- ✅ Adoption Issue 6 — Pre-commit config selection manual (2026-07-20 — most of this was already implemented; the gap was an override flag)
- ✅ Token Optimization Issue 3 — Graphify not incremental by default (2026-07-21 — most of this was already implemented in the vendored `graphify` tool itself; the gap was wiring `graphify hook install` into `adopt.sh`)

**All 4 remaining MEDIUM-priority issues are complete as of 2026-07-20.** Only LOW-priority issues remain, one of which (Token Optimization Issue 3) is also now done.

**Remaining — LOW priority (17 issues):**

1. **Orchestrator Issue 4 — ClickUp/Linear/Jira sources not implemented.** *(Downgraded from MEDIUM 2026-07-20.)* Corrected from "GitHub-only" — `filesystem.mjs` already exists — but the practical gap is the same: no real ticket-tracker integration beyond GitHub. Blocks adoption by teams not on GitHub. Each source follows the existing `github.mjs`/`filesystem.mjs` pattern.
2. **Token Optimization Issue 1 — Savings projections unvalidated.** *(Downgraded from MEDIUM 2026-07-20.)* The README's "70-90% reduction" claim is unverified. Public, checkable claim, but low urgency.
3. **Token Optimization Issue 6 — No token usage analytics.** *(Downgraded from MEDIUM 2026-07-20.)* Without per-query/per-file token accounting there's no way to tell which optimizations do anything; would be the prerequisite for #2 if that's ever picked up. Note: `orchestrator/agent-stats.mjs` (built for Agent System Issue 4) now provides real per-agent *usage* stats (sessions, tool-call volume, duration) — a partial but not complete step toward this, since it doesn't track token counts specifically.
4. **Orchestrator Issue 5 — Session→ticket correlation approximate.** Only matters when spawn doesn't set `CLAUDE_SESSION_ID` early; narrow blast radius.
5. **Dashboard Issue 2 — No authentication.** Mitigated today by localhost-only binding; only matters if someone exposes the port, which would be a separate mistake.
6. **Hooks Issue 2 — Ticket detection regex may miss formats.**
7. **Hooks Issue 5 — Dynamic-context.sh purpose unclear** (docs-only fix — and per earlier investigation, this script isn't even wired into `settings.json`, so documenting it should also note it's currently dead code).
8. **Hooks Issue 3 — Agency-emit.sh writes to events.jsonl always** (even for non-agency personal sessions).
9. **Agent System Issue 3 — Agent profiles hardcoded in JSON.**
10. **Agent System Issue 2 — No agent version tracking.**
11. **Agent System Issue 5 — Code-reviewer is superpowers symlink** (mitigation is process/pinning, not code).
12. **Adoption Issue 5 — No uninstall validation.**
13. **Adoption Issue 4 — Adopt script is complex** (899 lines as of 2026-07-21, up from 482 in the original spec — growing, not shrinking, partly from this session's own additions: `--precommit-template`, `--diff`, `--no-graphify-hook`).
14. **Token Optimization Issue 4 — Template library (Phase 2) incomplete.**
15. **Token Optimization Issue 5 — Module batching not implemented.**
16. **Dashboard Issue 6 — No search/filter capability.** Pure UX; matters more as `events.jsonl` grows.
17. **Documentation Issue 6 — ASCII diagrams brittle.**

---

## Implementation Roadmap

### ✅ Phase 1: Critical Fixes (COMPLETED)
- ✅ Smart CLAUDE.md merge in adopt.sh
- ✅ Deploy pre-commit hook fix
- ✅ Clean up .claude-flow/ and update .gitignore
- ✅ Add config backups to .gitignore

### ✅ Phase 2: Core Infrastructure (COMPLETED)
- ✅ Real token tracking in orchestrator
- ✅ Bootstrap verification mode
- ✅ Orchestrator retry logic
- ✅ Dashboard WebSocket real-time updates
- ✅ Dashboard incremental state updates (O(n) fix)
- ✅ Troubleshooting guide
- ✅ Documentation consolidation (15 files → 4 core guides)
  - ✅ SETUP.md, ADVANCED.md, CHANGELOG.md created
  - ✅ 15 files archived with deprecation notices
  - ✅ All cross-references updated

### ✅ Already done (2026-07-19 to 2026-07-20)
- ✅ Orchestrator: force-kill on halt (PID tracking + SIGTERM/SIGKILL)
- ✅ Hooks: failure recovery (transparent guard.sh wrapper + hook-errors.log + doctor.sh check)
- ✅ Orchestrator: stuck-detection whitelist (whitelist only; threshold bump/warnings/reset endpoint deliberately deferred, see Issue 6)
- ✅ Dashboard: atomic inbox/outbox writes (fix race conditions)
- ✅ Cross-cutting: integration test suite (bootstrap/adopt/orchestrator/dashboard)
- ✅ Adoption: monorepo auto-detection test fixtures (combined with the above)
- ✅ Agent System: non-destructive (symlink-based) profile switching
- ✅ Automatic profile detection (worked on ahead of token analytics/savings-validation by explicit decision)

### 📋 Next: MEDIUM priority (4 issues, user-confirmed 2026-07-20)
- Dashboard: agent output preview / log tailing
- Agent System: performance metrics
- Adoption: preview mode (real diff)
- Adoption: pre-commit auto-selection

### 📋 Then: LOW priority (18 issues, no fixed order — pick by convenience/interest)
- Orchestrator: ClickUp/Linear/Jira sources, session→ticket correlation
- Dashboard: authentication, search/filter
- Hooks: ticket-detection regex coverage, dynamic-context.sh docs (or removal — it's dead code, not wired into settings.json), agency-emit.sh session-type gating
- Agent System: profile customization (un-hardcode from JSON), version tracking, superpowers symlink pinning
- Adoption: uninstall validation, adopt.sh refactor
- Token Optimization: savings-projection validation, usage analytics, graphify auto-indexing, template library, module batching
- Documentation: ASCII diagrams → Mermaid

---

## Success Metrics

- **Adoption rate:** % of users who successfully adopt without issues
- **Token tracking accuracy:** <5% variance from actual costs
- **Orchestrator uptime:** >99% (no stuck spawns)
- **Dashboard performance:** <500ms state updates even at 50MB events.jsonl
- **Documentation clarity:** <2 support requests per issue after consolidation
- **Test coverage:** >80% for critical paths (bootstrap, adoption, orchestrator)

---

## Conclusion

This analysis identified **45 distinct issues** across 8 component areas, each paired with actionable solutions.

**Progress Summary:**
- ✅ **28/45 issues completed** (62% done)
  - All 4 CRITICAL priority issues ✅
  - All 7 HIGH priority issues ✅
  - 3 MEDIUM priority issues ✅ (documentation consolidation)
  - 1 LOW priority issue ✅ (changelog)
  - 13 additional fixes ✅ (2026-07-19 to 2026-07-21): force-kill on halt; hook failure recovery; stuck-detection whitelist [partial]; inbox/outbox race conditions; integration test suite; monorepo detection tests [partial]; non-destructive agent profile switching; automatic profile detection; dashboard agent output preview; agent performance metrics [scoped]; adoption preview mode; pre-commit config auto-selection override (every remaining MEDIUM-priority issue, closed 2026-07-20); graphify incremental hooks (2026-07-21, first LOW-priority pickup)
  - Plus 2 pre-existing `adopt.sh` bugs found during the integration-test work, fixed as a same-week follow-up (2026-07-20) — not separately numbered issues, but folded into Cross-Cutting Issue 5's completion
- 📋 **17/45 issues remaining** (38%), **all LOW priority** — 3 of these were explicitly downgraded from MEDIUM 2026-07-20 by user decision (see below)

**Key Accomplishments (Critical/High priority work):**
- Smart CLAUDE.md merging prevents user config loss
- Real token tracking with Claude Code JSON output
- Real-time dashboard with WebSocket support
- Incremental state updates (O(n) → O(1) performance)
- Bootstrap verification ensures successful setup
- Orchestrator retry logic prevents stuck tickets
- Comprehensive troubleshooting guide
- Documentation consolidation (15+ files → 4 core guides)

**Key Accomplishments (safety & silent-failure fixes, 2026-07-19):**
- Force-kill on halt: the kill switch now actually terminates spawned agent processes (SIGTERM → SIGKILL on the process group, with a per-tick sweep so hung agents that stop emitting events are still caught) — closing the gap between what the README promised and what the code did
- Hook failure recovery: a transparent `guard.sh` wrapper now catches and durably logs any hook crash/non-zero exit to `hook-errors.log`, surfaced in `doctor.sh` — without changing Claude Code's own exit-code semantics (verified exit 1 stays non-blocking, exit 2 stays blocking)
- Stuck-detection whitelist: tickets can now be fully excluded from all four stuck rules via glob patterns matched against id/labels — scoped down from the original 4-part spec to just this, by deliberate decision, to keep the ticket small
- Dashboard inbox/outbox race conditions: atomic write-then-rename in `/api/unblock`, a noclobber fix in `agency-emit.sh`'s placeholder creation, and — the highest-impact piece — reordering `inbox-check.sh`/`inbox-wait.sh` to claim before reading so a reply landing mid-consumption is never silently discarded, plus a related archive-filename collision bug found and fixed along the way

**Key Accomplishments (test coverage & confidence, 2026-07-19 to 2026-07-20):**
- Integration test coverage: 22 new tests across `tests/adopt/` and `tests/bootstrap/`, plus a new CI workflow (`.github/workflows/tests.yml`) running the full `node --test tests/` suite and the pre-existing `scripts/test-adopt.sh` on every PR
- Monorepo auto-detection now has real test coverage: 15 tests confirming what works (root+subdirectory scanning, dedup, the `--frameworks` override) and 3 tests locking in known limitations (no recursion, no nx/lerna/pnpm-workspace awareness) as documented facts
- Found two pre-existing `adopt.sh` bugs along the way (a macOS symlink path mismatch in nested-mode detection, and `--uninstall`/`--doctor` requiring a framework flag they shouldn't need) — initially tracked via `test.todo()` to stay in scope, then fixed as an immediate follow-up (2026-07-20): `SCRIPT_PATH`/`PROJECT_ROOT` now both canonicalize via `pwd -P`, and framework validation is now gated on `ACTION == "adopt"`. Also fixed a false-positive in the existing doctor test that had been passing for the wrong reason. `scripts/test-adopt.sh` now passes all 37 assertions (previously 5 failing).

**Key Accomplishments (2026-07-20, part 1 — non-destructive switching & detection):**
- Non-destructive agent profile switching: `.claude/agents-all/` now holds canonical agent files, `.claude/agents/` is symlinks-only, so an interrupted `switch-agents.sh` run can never lose agent content — re-running any profile fully repairs it. Includes a built-in one-time migration and a safety guard that refuses to delete a real (non-symlink) file if one is ever found in `.claude/agents/`.
- Automatic profile detection: replaced two contradictory prose-only mechanisms in `/ticket` (a soft warning that could be ignored, and a hard STOP-and-restart with no real logic behind either) with one real, testable script (`.claude/hooks/detect-profile.sh`) that maps ticket text to a recommended profile, logs the recommendation to `events.jsonl`, and lets the user choose rather than force-exiting. Found and fixed two real logic bugs during testing — a greedy regex that swallowed most of a sentence as a "keyword," and a branch-ordering bug that could silently drop a matched category (e.g. a frontend+devops ticket losing its devops signal and recommending a profile missing an agent it needed).
- **Reprioritization:** the risk-ranked Tier 0–6 system used since 2026-07-19 was retired. Priority is flat CRITICAL/HIGH/MEDIUM/LOW again. Three issues were explicitly downgraded from MEDIUM to LOW (ClickUp/Linear/Jira sources, savings-projection validation, token usage analytics); the remaining 4 MEDIUM issues were explicitly confirmed as the next priority.

**Key Accomplishments (2026-07-20, part 2 — all 4 remaining MEDIUM issues, same day):**
- Dashboard agent output preview: new `GET /api/agent-log/:ticket` endpoint (reusing `spawn.mjs`'s exact filename-sanitization logic, incidentally making path traversal impossible) plus a "View Logs" button + polling modal in the dashboard UI. Live WebSocket streaming was explicitly scoped out in favor of simple 2s polling, discussed with the user first.
- Agent performance metrics: new `orchestrator/agent-stats.mjs` + `scripts/agent-stats.sh` + `/api/agent-stats` endpoint, deriving real per-agent usage stats (sessions, tool-call volume, ticket coverage, session duration) from the existing event stream. **Deliberately does not report success/failure rate** — discussed with the user and confirmed that no such signal exists anywhere in the hook event stream (a failed subagent looks identical to a succeeded one), so inventing a proxy would misrepresent reality rather than fill the gap honestly.
- Adoption preview mode: new `--diff` flag on `adopt.sh` (combined with `--dry-run`) shows a real unified diff for files that would be modified, not just the command that would run. Also fixed an adjacent bug found along the way: dry-run was printing "Adoption complete" as if something had been written. Confirmation prompt from the original spec was explicitly skipped — `adopt.sh` is invoked non-interactively by the CI test suite with no bypass flag, so a blocking prompt would break automation; `--dry-run --diff` was judged sufficient.
- Pre-commit config auto-selection: found most of this was already implemented (auto-detection + monorepo merging existed before this session touched the file) — the actual gap was a missing override. Added `--precommit-template <python|node|merged>`, warning (not blocking) on a mismatch with detected frameworks.

**Key Accomplishments (2026-07-21 — first LOW-priority pickup):**
- Graphify incremental hooks: found the vendored `graphify` tool already ships a mature `graphify hook install` subcommand — installs both post-commit AND post-checkout git hooks (better than the original spec's post-commit-only ask), idempotent, respects `core.hooksPath`, calls an AST-only no-LLM per-file-cached rebuild. `adopt.sh` never called it. Wired it in with a `--no-graphify-hook` opt-out, non-fatal if graphify isn't installed or the hook-install command fails. Also corrected `docs/ADVANCED.md`, which already explained *why* incremental hooks were practical but never mentioned one was actually available. Verified via a Python-3.9-compatibility monkeypatch of the real vendored hook-install logic (this environment's Python predates graphify's own `>=3.10` requirement) plus a shell-script mock `graphify` binary for the automated test suite.

**Remaining Work (see "Remaining Work — Flat Priority List" above for the full list with rationale):**
- **MEDIUM: none remaining.** All 4 issues confirmed important by the user on 2026-07-20 are now complete.
- **LOW (17 issues, no fixed order):** ClickUp/Linear/Jira sources, token analytics/savings validation, dashboard auth/search, agent version tracking/profile customization, adopt.sh cleanup, template library, docs polish.

**Next Steps:**
1. ✅ ~~User reviews this design document~~
2. ✅ ~~Create implementation plan using writing-plans skill~~
3. ✅ ~~Break down into individual tickets~~
4. ✅ ~~Complete all CRITICAL priority fixes~~
5. ✅ ~~Complete all HIGH priority fixes~~
6. ✅ ~~Complete safety & silent-failure fixes~~ (force-kill, hook recovery, stuck-detection whitelist, inbox/outbox race conditions)
7. ✅ ~~Complete integration test suite & monorepo detection tests~~
8. ✅ ~~Non-destructive agent profile switching~~
9. ✅ ~~Automatic profile detection~~
10. ✅ ~~Complete all remaining MEDIUM-priority issues~~ (dashboard output preview, agent metrics, adoption preview mode, pre-commit auto-selection)
11. ✅ ~~Graphify incremental hooks~~ (first LOW-priority item picked up)
12. 📋 Work the remaining 17 LOW issues as time/interest allows

---

**Document Status:** In Progress - 28/45 issues completed (62%); remaining 17 issues, all LOW priority, as of 2026-07-21 (the risk-ranked Tier 0–6 system used 2026-07-19 to 2026-07-20 has been retired; all 4 confirmed-important MEDIUM issues completed 2026-07-20; first LOW-priority item — graphify incremental hooks — completed 2026-07-21); full test suite 143/143 green
**Author:** Claude (Sonnet 4.5)
**Last Review:** 2026-07-21
