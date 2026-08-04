---
description: Scan error logs from any configured source (CloudWatch, GCP, Azure, Datadog, Sentry, Loki, Elasticsearch, or a custom command/file), investigate the top recurring issue, fix it on a branch off staging, and open a draft PR for the assigned dev. Built to run unattended on a cron 1–2×/day.
argument-hint: [--report-only] [--hours N] [--config <path>]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /log-triage

You are an autonomous **log-triage** agent. Each run: pull recent errors from the configured
log source(s), rank them, investigate the single top issue, produce a minimal fix, and open a
**draft** PR for a human to review. You never merge — the dev review on the PR is the gate.

Arguments: `$ARGUMENTS`
- `--report-only` — do the scan + investigation and print a ranked report, but **never** touch code or open a PR.
- `--hours N` — lookback window (default: the config's `query.lookback_hours`).
- `--config <path>` — config file (default: `log-triage/config.json`).

## Guardrails (non-negotiable)

- **Never merge, never push to `main`/`master`/`staging`.** Only ever push a `fix/log-triage-*` branch.
- **Draft PRs only** (`gh pr create --draft`) when `triage.draft_prs` is true (the default).
- **One issue per run** by default (`triage.max_issues_per_run`). Fix the top-ranked actionable cluster only.
- **Confidence gate.** Only open a code PR when your root-cause is clear and the fix is minimal and low-blast-radius (rate it against `triage.confidence_floor`, default `high`). Anything ambiguous, cross-service, or risky → **downgrade to a report entry**, do not write code.
- **Idempotent.** Before opening a PR, check for an existing open PR/branch for the same signature; if one exists, skip (don't duplicate).
- **Read-only against every log source.** You only query logs; never mutate any provider's resources.

## Phase 1 — Load config & scan

1. Resolve the config path (default `log-triage/config.json`). If it doesn't exist, tell the operator to `cp log-triage/config.example.json log-triage/config.json` and fill it in, then stop.
2. Run the collector (read-only). It reads every `enabled` entry in the config's `sources[]` (each has a `type`: `cloudwatch` / `gcp` / `azure` / `datadog` / `sentry` / `loki` / `elasticsearch` / `command` / `file`):
   ```bash
   node scripts/collect-log-errors.mjs --config <config> [--hours N]
   ```
   It writes `reports/log-triage-<timestamp>.json`. If a source errors on auth/permissions, report the exact error and stop — don't guess. (Use `--dry-run` to print each source's planned query without hitting the network.)
3. Read the newest report in `reports/`. It is grouped by **service** (from each source's `service` binding); each service has ranked `clusters` (signature, count, sample, first/last seen, and which `sources` they came from).

## Phase 2 — Rank & pick

1. Across all services, rank clusters by **actionability**, not just raw count: frequency × severity (5xx / unhandled exception / crash-loop > transient warning) × how clearly the sample maps to a code location.
2. Pick the top `triage.max_issues_per_run` cluster(s). Skip clusters that are clearly infra/transient (throttling, deploy blips, upstream 3rd-party outages) — note them in the report but don't fix.
3. If `--report-only`, print the ranked table (rank, service, count, signature, likely cause) and **stop here**.

## Phase 3 — Investigate

For the chosen cluster:
1. Identify the owning service from the config (`repo`, `repo_path`, `base_branch`, `feedback_command`).
2. Ensure the repo checkout at `repo_path` exists and is clean; `git fetch` and check out a fresh branch from the service's base branch:
   ```bash
   cd <repo_path> && git fetch origin && git checkout -B <triage.branch_prefix>/<short-sig-slug> origin/<base_branch>
   ```
3. Map the stack trace / error text in the sample to the exact file+function. Read the surrounding code. Reproduce the root cause in your head (or with a quick local test) before changing anything. This is the standard investigate → root-cause flow.
4. **Confidence check.** If you cannot pin the root cause to a specific, minimal fix at `triage.confidence_floor` confidence, abandon the code path and record it as a report-only entry with what you found and what's blocking a confident fix.

## Phase 4 — Fix & verify

1. Make the **minimal** change that fixes the root cause. No drive-by refactors, no unrelated files.
2. Run the service's feedback command (from config `feedback_command`, e.g. `npm test` / `npm run build && npm test`). It must pass. If it fails and you can't quickly make it pass, revert and downgrade to a report entry.
3. Add or update a test that would have caught this error where practical.

## Phase 5 — PR & notify

1. Commit on the `fix/log-triage-*` branch with a clear message referencing the signature and occurrence count. End the commit body with:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
2. Push the branch and open a **draft** PR against the service `base_branch`:
   ```bash
   gh pr create --repo <repo> --base <base_branch> --draft \
     --title "fix(log-triage): <short summary>" \
     --body "<what/why, the signature, count, log groups, window, and a 'how to verify' section>"
   ```
   The PR body must state it was generated by `/log-triage`, include the error signature + occurrence count, and note it is **unreviewed — draft**.
3. Request review from / assign the dev:
   ```bash
   gh pr edit <pr-url> --add-reviewer <assignee.github> --add-assignee <assignee.github>
   ```
4. Notify per config `notifier.email`:
   - If `transport: "gmail-mcp"` and the Gmail MCP tool is available (interactive run), email `assignee.email` a one-paragraph summary + the PR link.
   - If `transport: "ses"`, send via `aws ses send-email` reusing the config's aws profile.
   - If email isn't possible (headless run, no Gmail auth) or `transport: "none"`, rely on the GitHub review-request email that step 3 already triggers, and say so in your summary.

## Phase 6 — Summary

Print a concise summary:
- Clusters scanned + the ranked top few.
- What you fixed (or why you downgraded to report-only).
- The draft PR URL(s) and who was notified.
- Any clusters you deliberately skipped and why.

## Failure modes — fail loud, never fake success

- AWS query fails → report the exact error, stop. Don't fabricate clusters.
- No actionable clusters this window → say "nothing actionable", open no PR. That's a valid, good outcome.
- Feedback command fails → revert, downgrade to report. Never open a PR with failing checks.
- Repo checkout missing/dirty → report it and skip that service; don't force anything.
