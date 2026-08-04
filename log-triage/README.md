# Log-Triage

A generic, **multi-source** pipeline that reads error logs 1–2×/day on a cron from whatever
providers you configure, clusters recurring errors, investigates the top issue, writes a
**minimal fix on a branch off `staging`**, and opens a **draft PR** for a dev to review. The bot
never merges — the PR review is the gate.

It is **provider-agnostic**: the clustering, ranking, and the whole investigate→fix→draft-PR
flow work on generic `{timestamp, message}` rows, so adding a new log provider is just a small
adapter. Ships with adapters for CloudWatch, GCP, Azure, Datadog, Sentry, Loki, Elasticsearch,
plus a **universal `command`/`file`** adapter that covers anything else.

## Pieces

| File | Role |
|------|------|
| `scripts/collect-log-errors.mjs` | Zero-dep Node core. Reads every `enabled` entry in the config's `sources[]`, dispatches to the matching adapter, merges rows, clusters them into **signatures** (collapses timestamps/UUIDs/IPs/numbers), ranks by occurrence, and writes a JSON report grouped by service to `reports/`. |
| `scripts/log-sources/<type>.mjs` | One adapter per source type — each exports `describe()` (dry-run) + `fetch()` returning normalized rows. Mirrors the orchestrator's `sources/` convention. |
| `.claude/commands/log-triage.md` → **`/log-triage`** | Read report → investigate top cluster → minimal fix on `fix/log-triage-*` → run feedback command → draft PR → assign/notify. |
| `log-triage/config.example.json` | Copy to `config.json` and edit: `sources[]` (per-provider), `services[]` (repo bindings), query patterns, thresholds. |
| `scripts/log-triage-cron.sh` | Headless launchd/cron wrapper. |
| `log-triage/com.claude-blueprint.log-triage.plist.example` | launchd template (09:00 & 17:00 daily). |

`config.json` and `reports/` are gitignored.

## Supported sources

| `type` | Backed by | Auth / requirements |
|--------|-----------|---------------------|
| `cloudwatch` | `aws logs` CLI (Insights) | AWS profile, read-only `logs:StartQuery`/`GetQueryResults` |
| `gcp` | `gcloud logging read` | `gcloud` auth + project |
| `azure` | `az monitor log-analytics query` | `az login` + workspace id |
| `datadog` | Logs Search API | env vars named by `api_key_env` / `app_key_env` |
| `sentry` | Issues API | env var named by `token_env` |
| `loki` | Grafana Loki `query_range` | `base_url` (+ optional `tenant`) |
| `elasticsearch` | ES/OpenSearch `_search` | `base_url` (+ optional `api_key_env`) |
| `command` | **any** shell command's stdout | whatever the command needs |
| `file` | local log files (lines or JSONL) | filesystem access |

Every source is bound to a **`service`** (an entry in `services[]`) that says which repo the fix
goes in, the base branch, feedback command, and assignee. Multiple sources can map to one service.

**Secrets are never stored in config** — API adapters reference *env-var names* (`api_key_env`,
`token_env`, …); export the actual token in the environment.

## Setup

### 1. Config

```bash
cd <blueprint-dir>
cp log-triage/config.example.json log-triage/config.json
```

Edit `log-triage/config.json`:
- Enable the `sources[]` you want (`"enabled": true`) and fill in their fields.
- Define the `services[]` binding(s) (`repo`, `repo_path` local clone, `base_branch`, `feedback_command`) and point each source at one via `service`.
- Confirm `defaults.assignee.github` / `.email`. Keep `triage.max_issues_per_run: 1` until trusted.

### 2. Dry-run the collector (no network)

```bash
node scripts/collect-log-errors.mjs --config log-triage/config.json --dry-run
```
Prints each enabled source's planned query/command. Then do a real read-only scan:
```bash
node scripts/collect-log-errors.mjs --config log-triage/config.json --hours 24
```
Open `reports/log-triage-<timestamp>.json` and confirm sensible clustered signatures. Tune
`query.pattern` / `query.min_occurrences` if it's too noisy or quiet.

### 3. Dry-run the full triage (no code, no PR)

```
/log-triage --report-only
```

### 4. One supervised real run

```
/log-triage
```
Watch it fix the top issue on a `fix/log-triage-*` branch, run the feedback command, open a
**draft** PR against the service's `base_branch`, assign the dev, and notify.

## Per-provider examples (config snippets)

```jsonc
// GCP via the native adapter
{ "type": "gcp", "name": "orders-gcp", "enabled": true, "service": "orders-service",
  "project": "my-project" }

// Anything at all, via the universal command adapter (kubectl here)
{ "type": "command", "name": "k8s", "enabled": true, "service": "orders-service",
  "run": "kubectl logs -l app=orders --since=24h", "format": "lines" }

// Datadog (keys come from the environment, not the file)
{ "type": "datadog", "name": "dd", "enabled": true, "service": "orders-service",
  "api_key_env": "DD_API_KEY", "app_key_env": "DD_APP_KEY",
  "query": "service:orders status:error" }
```

## Scheduling

Runs where your creds + `gh` + repo checkouts live (see the launchd template). Three options:

### A. launchd (macOS, recommended)
```bash
BLUEPRINT_DIR="$(pwd)"
sed "s#__BLUEPRINT_DIR__#$BLUEPRINT_DIR#g" \
  log-triage/com.claude-blueprint.log-triage.plist.example \
  > ~/Library/LaunchAgents/com.claude-blueprint.log-triage.plist
launchctl load ~/Library/LaunchAgents/com.claude-blueprint.log-triage.plist
launchctl start com.claude-blueprint.log-triage
```

### B. crontab
```cron
0 9,17 * * * /ABSOLUTE/PATH/TO/claude-blueprint/scripts/log-triage-cron.sh
```

### C. Claude scheduled routine (`/schedule`)
Remote runner must have the providers' creds, `gh`, and the repo checkouts provisioned.

## Monitor

```bash
tail -f reports/log-triage-cron.log
ls reports/log-triage-*.json
gh pr list --search "log-triage in:title"
```

## Test

```bash
node --test tests/scripts/collect-log-errors.test.mjs
```
