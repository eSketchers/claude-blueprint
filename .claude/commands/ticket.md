---
description: Pick up a ticket (ClickUp / Linear / GitHub / Jira URL or ID), plan → adversarial review → improved plan → worktree → implement → test → lint → PR.
argument-hint: <ticket-url-or-id> [--auto]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, mcp__claude_ai_ClickUp__clickup_get_task, mcp__linear-server__authenticate, mcp__github__get_issue, mcp__github__create_pull_request
---

# Ticket Workflow

Argument: `$ARGUMENTS` (the ticket URL / ID — e.g. `https://app.clickup.com/t/abc123`, `LIN-456`, `#789`, or a full Jira/GitHub issue URL).

Optional flag `--auto` skips the human approval gate after the improved plan.

## Phase 0 — Fetch & classify

**Use haiku model for this phase** - simple classification task, saves ~70% tokens.

1. Parse the ticket reference. Detect source:
   - `app.clickup.com` or bare ClickUp ID → use `mcp__claude_ai_ClickUp__clickup_get_task`
   - `linear.app` or `XXX-123` pattern → use Linear MCP
   - `github.com/.../issues/N` or `#N` in a GitHub repo context → use `mcp__github__get_issue`
   - `*.atlassian.net` → use Jira MCP if available, else WebFetch
   - Otherwise: ask the user which source to use before proceeding.
2. Fetch ticket: title, description, acceptance criteria, labels, attachments, linked items.
3. Classify: **feature** | **bug** | **chore** | **spike**. Report your classification and one-sentence justification.
4. **Detect the required profile** (this is the *only* profile check in the workflow — do not re-check in Phase 1):
   - Run `.claude/hooks/detect-profile.sh "<ticket title + description>" "<current profile>"`, where `<current profile>` is inferred from active MCPs (`jq -r '.mcpServers | keys[]' .claude/settings.json`) — match the MCP set against `.claude/agents.profiles.json`'s known profiles, or pass it empty if you can't tell.
   - stdout is the recommended profile name alone (e.g. `backend`); stderr has the rationale and matched keywords — read both.
   - The script already logs the recommendation to `~/.claude-agency/events.jsonl`, so no separate logging step is needed.
   - **If the recommendation matches the current profile:** proceed silently.
   - **If it differs:** tell the user the recommended profile and why (from stderr's rationale), and ask: "Switch profiles with `./scripts/switch-profile-full.sh <profile>` and restart, or continue anyway with the current profile? [switch/continue]" — do **not** force a hard stop; let the user decide, since the detection is a heuristic (keyword matching), not a guarantee.
5. If **not a feature**, stop here and ask the user whether to continue with a simpler flow (bug / chore don't need adversarial review).

## Phase 1 — Plan

**Use sonnet model** - complex reasoning required for planning.

**Smart exploration approach:**
- Use Glob/Grep to map codebase structure first
- Read 5-10 representative files to understand patterns (not the entire codebase)
- Read files explicitly mentioned in ticket requirements
- Read existing ADRs and architecture docs
- **Aim for 10-15 file reads max** - understanding patterns > reading everything

Invoke the `architect` subagent with the fetched ticket. (Profile detection already happened in Phase 0 step 4 — don't re-check it here.)

The architect produces `docs/plans/<ticket-slug>.md` following the superpowers `writing-plans` skill format:

- Problem statement (one paragraph)
- Acceptance criteria (bulleted, testable)
- Proposed approach (step-by-step)
- Files to change / add (explicit paths)
- Tools required (MCPs + agents needed) ← NEW
- Test plan (what to test + at which level)
- Risks & open questions
- Rollback plan

## Phase 2 — Adversarial review

Invoke the `code-reviewer` subagent (from superpowers) in **plan review mode**. Ask it to:

- Attack the plan — what's missing, what will break, what's hand-waved?
- Flag any step that hides complexity (vague "refactor X", "add support for Y")
- Check edge cases the plan doesn't cover
- Check security / performance / data-integrity risks
- Output: `## Blocking` / `## Concerns` / `## Missing test cases` / `## Open questions`

Write review to `docs/plans/<ticket-slug>.review.md`.

## Phase 3 — Improve plan

Re-invoke `architect` with both the plan and the adversarial review. Produce `docs/plans/<ticket-slug>.v2.md` that addresses every **Blocking** item and explicitly accepts/rejects each **Concern** with reasoning.

## Phase 4 — Approval gate

Unless `--auto` is set:
- Print a short summary of the v2 plan
- Ask the user: `"Approve plan and proceed to implementation? [y/N]"`
- On `n` or silence: stop, leave the plan files, exit.
- On `y`: continue.

## Phase 5 — Worktree

Use the superpowers `using-git-worktrees` skill:

1. Determine branch name: `feat/<ticket-slug>` (or `fix/`, `chore/` based on classification)
2. Run `scripts/workflow/feature.sh <ticket-slug> <classification>` which creates the worktree at `../<repo>-<ticket-slug>` and `cd`s into it
3. From here on, all file edits happen in the worktree — never on the main checkout

## Phase 6 — Implement

**Model selection:** Use haiku for initial file exploration within each agent, then sonnet for actual code writing.

**Smart implementation approach:**
- Discovery sub-phase: Glob/Grep to find relevant files (use Grep with `files_with_matches` mode)
- Pattern learning: Read 3-5 existing similar files to understand project patterns
- Just-in-time reading: Read each file immediately before editing it
- **Quality over tokens:** When in doubt, read more to maintain consistency and correctness

Dispatch parallel agents (superpowers `dispatching-parallel-agents` skill) in one message:

- `backend-dev` — backend / API / DB changes (if the plan has them)
- `frontend-dev` — UI changes (if the plan has them)
- `data-engineer` — pipeline / schema changes (if the plan has them)
- `devops` — CI / Docker / IaC changes (if the plan has them)

Each agent receives the v2 plan + the subset of files they own. Each writes a **failing test first** (superpowers `test-driven-development` skill), then implementation, then passes the test.

## Phase 7 — Test

In the worktree:
- Run full test suite appropriate for the stack (detect from `CLAUDE.md` / `package.json` / `pyproject.toml`)
- Run linters: `pre-commit run --all-files` (covers Flake8 / ESLint / Prettier / gitleaks per the project's config)
- Run typecheck: `tsc --noEmit` / `mypy src`

## Phase 8 — Auto-fix loop

If tests or lint fail:
- Up to **3 iterations**: feed failures back to the responsible agent(s), let them fix, re-run.
- After 3 failed iterations: stop, report what's stuck, ask the user.

## Phase 8.5 — Refresh docs in-PR (docs-sync)

If `docs-sync/config.json` exists and its `enabled` is true, regenerate the affected docs so they
ride along **in this ticket's PR** (no separate docs PR). Do it **in this session** — you already
have Read/Write/Edit — do **not** spawn a nested `claude -p` (that would recurse).

1. Classify the ticket's own changes: `node scripts/collect-doc-changes.mjs --config docs-sync/config.json --base <base-branch-from-Phase-5> --head HEAD`. Read the newest `reports/doc-changes-*.json`. If `empty: true`, **skip this phase**.
2. Otherwise apply `/update-docs` **in place** for the non-empty surfaces: Phase 3 (regenerate inventory blocks inside `AUTO-DOC` markers) + Phase 5 (append one changelog entry). If `symbol_reference.enabled` **and** `ast-grep` is installed, also Phase 3b (describe only changed symbols); if `llm_narration.enabled`, Phase 4. Skip 3b gracefully with a note when `ast-grep` is absent.
3. Guardrails (same as `/update-docs`): only touch files under `docs.output_dir`; regenerate only inside `AUTO-DOC` markers; `CHANGELOG.md` append-only; never open a separate PR here.
4. Stage the result: `git add <docs.output_dir>` so it's committed with the code in Phase 9.

## Phase 9 — Commit & PR

Use superpowers `finishing-a-development-branch` skill:

1. `pre-commit run --all-files` (one last pass)
2. Commits in logical units, conventional format: `feat(scope): ...`, `test(scope): ...`, and a separate `docs(scope): ...` commit for any Phase 8.5 doc changes. Never one mega-commit.
3. `git push -u origin <branch>`
4. Open PR with `gh pr create`:
   - Title: ticket title
   - Body: v2 plan as "## Summary", linked to the ticket URL, with a "## Test plan" section from the plan. Note in the body if docs were refreshed in-PR.
5. Return the PR URL.

## Output

Short summary at the end:
- Ticket + classification
- Plan file paths
- PR URL
- Docs refreshed in-PR? (which sections, or "skipped — no doc-relevant changes")
- Any warnings (skipped steps, auto-fix iterations used, etc.)
