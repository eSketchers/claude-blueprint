# Handoff: Remaining LOW-priority issues

**Date:** 2026-07-22
**Branch:** `medium-and-low-priority-fixes`
**Open PR:** [#7](https://github.com/eSketchers/claude-blueprint/pull/7) — "Orchestrator ticket sources (ClickUp/Linear/Jira/beads), safety, coverage, and quality fixes"
**Source of truth:** `docs/superpowers/specs/2026-07-15-blueprint-issues-and-enhancements-design.md` — this handoff is a snapshot/pointer into that doc, not a replacement for it. Always check that doc for the current state before starting work; it's the one place status is tracked in detail.

---

## Where things stand

All CRITICAL, HIGH, and MEDIUM priority issues are done. **30/45 total issues complete**, **15/45 remaining — all LOW priority**. Full test suite: `node --test tests/` → 198/198 passing.

The design doc is split into exactly two sections: `# Completed` and `# To-Do`. Every remaining issue below has its full problem/solution writeup there — this handoff just gives you a fast-resume summary so you don't have to re-read the whole doc to pick up where this left off.

## How to resume

1. `git checkout medium-and-low-priority-fixes && git pull`
2. Skim the design doc's `# To-Do` section (or the list below) and pick an issue — there's no fixed order, priority is flat LOW across all of them.
3. Follow the pattern established throughout this branch: read the issue's **Problem**/**Solution** in the design doc, verify assumptions against real behavior before implementing (several "obvious" fixes this session turned out to need correction once actually tested — e.g. the ClickUp source's original sketch didn't even call `.json()`, and `bd init`'s documented flags needed live verification), write tests, then **move the issue from `# To-Do` to `# Completed`** in the design doc with a real writeup (what was implemented, what was deliberately skipped and why, test count) — don't just flip a checkbox.
4. Commit, push to `medium-and-low-priority-fixes`, and update PR #7's description to match (a new bullet/section per fix, test-plan checkbox added, test count bumped) — this branch has been accumulating all LOW-priority work into the same open PR rather than opening a new one per fix.

## The 15 remaining issues

Grouped by component, in the same order as the design doc. No priority ordering within — pick whichever is most useful or interesting.

### Dashboard
- **Issue 2 — No authentication.** Optional basic auth via env var, mitigated today by localhost-only binding.
- **Issue 6 — No search/filter capability.** Filter/search UI over the Tickets view; pure UX, matters more as `events.jsonl` grows.

### Agent System
- **Issue 2 — No agent version tracking.** Version metadata in agent files + a `./scripts/agent-version.sh` to show/rollback.
- **Issue 3 — Agent profiles hardcoded in JSON.** Make `.claude/agents.profiles.json` more directly customizable, with validation.
- **Issue 5 — Code-reviewer is superpowers symlink.** Mitigation is version-pinning/process, not really a code change.

### Adoption & Bootstrap
- **Issue 4 — Adopt script is complex.** 899 lines now (was 482), still growing from this session's own additions. Candidate for extracting into smaller functions/files.
- **Issue 5 — No uninstall validation.** Post-`--uninstall` checks confirming everything was actually removed.

### Token Optimization
- **Issue 1 — Savings projections unvalidated.** *(Downgraded from MEDIUM.)* The README's "70-90% reduction" claim has never been measured against real before/after data.
- **Issue 4 — Template library (Phase 2) incomplete.** `templates/code-patterns/` doesn't exist yet.
- **Issue 5 — Module batching not implemented.** Agent-prompt guidance for batching related file reads.
- **Issue 6 — No token usage analytics.** *(Downgraded from MEDIUM.)* Prerequisite for Issue 1 if that's ever picked up. Note: `orchestrator/agent-stats.mjs` already gives partial usage stats (sessions/tool-calls/duration) but not token counts specifically.

### Hooks & Integration
- **Issue 2 — Ticket detection regex may miss formats.** Make the regex configurable per-team instead of hardcoded.
- **Issue 3 — Agency-emit.sh writes to events.jsonl always.** Even for non-agency personal sessions; needs a session-type tag.
- **Issue 5 — Dynamic-context.sh purpose unclear.** Confirmed dead code (not wired into `settings.json` at all) — worth deciding to document or just delete rather than fix.

### Documentation & Developer Experience
- **Issue 6 — ASCII diagrams brittle.** Convert workflow diagrams to Mermaid.js.

There's also an **"Additional Enhancements"** section at the bottom of the design doc — unscoped brainstorm ideas, not tracked issues. Only worth picking up if there's a concrete need; they were never prioritized.

## Things worth knowing before you start

- **This session's biggest lesson:** verify against real behavior before writing code or docs, especially for anything involving an external API/CLI (ClickUp, Linear, Jira, beads all had real discrepancies between what seemed obvious and what the actual tool did — wrong pagination shapes, wrong flag names, auto-commit side effects nobody warned about). The design doc's own original "Solution" sketches have sometimes been wrong in exactly this way (e.g. the ClickUp code snippet). Don't trust a sketch is correct just because it's in the doc.
- **`server.mjs` has no exports** — `intakeTick()`, `onEvent()`, etc. are all module-private. Several fixes this session (beads claim/close wiring, session correlation) were verified by direct code inspection plus live end-to-end testing (spawn a real process, run the real hook script) rather than unit tests against `server.mjs` itself. That's an intentional, established pattern here, not a gap to "fix" by force-exporting things.
- **The design doc's counts are load-bearing** — after finishing an issue, recount `# Completed`/`# To-Do` issue headers programmatically (a one-line Python/grep script, examples are in recent git history) rather than hand-incrementing. Counts have silently drifted before.
- **Test discipline:** every fix this session got a `node --test` suite. For CLI/API-backed sources (ClickUp, Linear, Jira, beads), tests mock the network/binary rather than requiring live credentials in CI — follow that pattern for anything similar.

## Cleanup done alongside this handoff

Deleted three stale, fully-superseded planning artifacts from earlier CRITICAL/HIGH-priority work (2026-07-15/17) — `HANDOFF-2026-07-17-high-priority-fixes.md` and the two `plans/*.md` files. Everything in them was already completed and is captured in the design doc's Completed section; nothing was lost. `test-agents.backup/` (an empty leftover scratch directory, unrelated to any of this) was also removed.
