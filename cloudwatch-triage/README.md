# CloudWatch Log-Triage

A generic, config-driven pipeline that reads AWS CloudWatch error logs 1–2×/day on a cron,
investigates the top recurring issue, writes a **minimal fix on a branch off `staging`**, and
opens a **draft PR** for a dev to review. The bot never merges — the PR review is the gate.

## Pieces

| File | Role |
|------|------|
| `scripts/collect-cloudwatch-errors.mjs` | Zero-dep Node collector. Runs a CloudWatch Logs Insights query per configured log group, clusters raw error lines into **signatures** (collapses timestamps/UUIDs/IPs/numbers so "the same error" groups together), ranks by occurrence, writes a JSON report to `reports/`. Drives the `aws logs` CLI — no npm deps, no boto3. |
| `.claude/commands/log-triage.md` → **`/log-triage`** | The Claude workflow: read report → investigate top cluster → minimal fix on a `fix/log-triage-*` branch → run the repo's feedback command → open a **draft** PR + assign the dev → notify. All guardrails live here. |
| `cloudwatch-triage/config.example.json` | Copy to `config.json` and edit: services/log-groups, `default_base_branch` (`staging`), per-service base/assignee overrides, query pattern + thresholds, notify email. |
| `scripts/log-triage-cron.sh` | Headless wrapper (`claude -p "/log-triage"`) for launchd/cron. Logs to `reports/log-triage-cron.log`. |
| `cloudwatch-triage/com.claude-blueprint.log-triage.plist.example` | launchd template — runs 09:00 & 17:00 daily on macOS. |

`config.json` and `reports/` are gitignored (config names internal log groups; reports are run output).

## Guardrails baked in

- **Never merges, never pushes to `main`/`master`/`staging`** — only a `fix/log-triage-*` branch → **draft** PR.
- **One issue per run** by default (`triage.max_issues_per_run`).
- **Confidence gate** — only clear, minimal, low-blast-radius fixes get a code PR; anything ambiguous/cross-service/risky downgrades to a report entry.
- Runs the repo's feedback command (jest/build/lint) before opening a PR; **idempotent** (won't dup a PR for a signature that already has one open).
- **Read-only against AWS.**

## Setup

### 1. Config

```bash
cd <blueprint-dir>
cp cloudwatch-triage/config.example.json cloudwatch-triage/config.json
```

Edit `cloudwatch-triage/config.json`:
- Set each service's real `log_groups` (discover them in step 2), `repo`, and `repo_path` (local clone).
- Flip `enabled: true` only for the services you want watched.
- Confirm `defaults.assignee.github` (PR assignee/reviewer) and `defaults.assignee.email`.
- `default_base_branch` is already `staging`. Keep `triage.max_issues_per_run: 1` until you trust it.

### 2. AWS access + discover log-group names

The AWS profile needs read-only `logs:StartQuery` / `logs:GetQueryResults` / `logs:StopQuery`.

```bash
# List log groups so you can copy exact names into config.json:
aws --profile default --region us-east-1 logs describe-log-groups \
  --query 'logGroups[].logGroupName' --output table
```

### 3. Dry-run the collector (read-only)

```bash
# Print the query without hitting AWS:
node scripts/collect-cloudwatch-errors.mjs --config cloudwatch-triage/config.json --dry-run

# Real read-only scan -> writes reports/cloudwatch-triage-<timestamp>.json:
node scripts/collect-cloudwatch-errors.mjs --config cloudwatch-triage/config.json --hours 24
```

Open the report and confirm you see sensible clustered signatures with counts. Tune
`query.pattern` / `query.min_occurrences` if it's too noisy or too quiet.

### 4. Dry-run the full triage (no code, no PR)

Inside Claude Code:

```
/log-triage --report-only
```

Confirms scan + ranking + investigation quality before it's allowed to write fixes.

### 5. One supervised real run

```
/log-triage
```

Watch it fix the top issue on a `fix/log-triage-*` branch, run the feedback command, open a
**draft** PR against `staging`, assign the dev, and notify. Review that draft PR yourself before
letting it run unattended.

## Scheduling

The runner needs local AWS creds, `gh` auth, and the repo checkouts, so it runs on the machine
that has them. Three options:

### A. launchd (recommended on macOS — survives sleep/wake)

```bash
BLUEPRINT_DIR="$(pwd)"
sed "s#__BLUEPRINT_DIR__#$BLUEPRINT_DIR#g" \
  cloudwatch-triage/com.claude-blueprint.log-triage.plist.example \
  > ~/Library/LaunchAgents/com.claude-blueprint.log-triage.plist

launchctl unload ~/Library/LaunchAgents/com.claude-blueprint.log-triage.plist 2>/dev/null || true
launchctl load  ~/Library/LaunchAgents/com.claude-blueprint.log-triage.plist
launchctl start com.claude-blueprint.log-triage    # test-fire now
```

### B. crontab

```cron
0 9,17 * * * /ABSOLUTE/PATH/TO/claude-blueprint/scripts/log-triage-cron.sh
```

### C. Claude scheduled routine (`/schedule`)

Runs as a **remote** agent, so it must have AWS creds, a `gh` token, and the repo checkouts
provisioned in that environment (org secrets / IAM role). If those aren't wired up, use A or B —
they run where your creds already live.

## Monitor

```bash
tail -f reports/log-triage-cron.log                 # each run's output
ls reports/cloudwatch-triage-*.json                 # raw clusters per run
gh pr list --search "log-triage in:title"           # PRs it opened
```

## Test

```bash
node --test tests/scripts/collect-cloudwatch-errors.test.mjs
```
