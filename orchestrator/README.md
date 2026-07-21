# Orchestrator

The daemon that closes the loop between your ticket system and autonomous agent runs. It polls issue trackers, spawns headless Claude Code sessions per new ticket, enforces budget caps + a kill switch, and routes blockers to Slack.

## Overview

```
┌────────────────┐     poll      ┌─────────────────┐
│ GitHub / ...   │──────────────▶│  orchestrator   │
└────────────────┘               │  (daemon)       │
                                 │                 │
                                 │  spawn headless │
                                 │  claude code    │───▶ /ticket <url>  ─▶ dashboard hooks
                                 │                 │
     Slack  ◀── notifier ◀──────│  tail events    │◀── ~/.claude-agency/events.jsonl
                                 │                 │
                                 │  budget guard   │
                                 └─────────────────┘
```

## Files

| File | Role |
|---|---|
| `server.mjs` | Main loop. Ticks every N seconds. |
| `registry.mjs` | JSON-file state: which tickets seen / running / halted, daily spend. |
| `budget.mjs` | Per-ticket + daily caps, kill-switch check. |
| `notifier.mjs` | Slack webhook + console fallback. |
| `spawn.mjs` | Launches headless Claude Code sessions. |
| `sources/github.mjs` | GitHub Issues poller via `gh` CLI. |

State lives at `~/.claude-agency/`:

```
events.jsonl      Hook events (shared with dashboard)
registry.json     Orchestrator ticket registry + daily spend
inbox/ outbox/    Operator unblock messages (shared with dashboard)
agent-logs/       One log file per spawned ticket
orchestrator.log  Daemon log
orchestrator.pid  Daemon pidfile
KILLSWITCH        If this file exists, no new spawns + halt in-progress
```

## Configure

```bash
cp config/orchestrator.example.json config/orchestrator.json
# edit: sources, budget caps, spawn command, Slack webhook env var
```

Key config:

- `sources[]` — each entry polls a source. GitHub supported today; pattern generalizes.
- `budget.daily_usd_cap` + `per_ticket_usd_cap` — hard ceilings. Exceeding halts spawns.
- `budget.cost_per_event_usd` — rough proxy for token spend. This is a **circuit breaker, not billing** — tune after observing real cost.
- `spawn.dry_run: true` — prints the would-be command without executing. Leave enabled while tuning config.
- `notifier.slack.webhook_url_env` — env var name holding your Slack incoming-webhook URL. Unset = console-only.

## Run

```bash
# Start (background, writes to ~/.claude-agency/orchestrator.log)
./scripts/start-orchestrator.sh

# Stop
./scripts/stop-orchestrator.sh

# Foreground (for debugging)
node orchestrator/server.mjs
```

## Kill switch

Pull the emergency brake any time:

```bash
touch ~/.claude-agency/KILLSWITCH
```

Effect:
- No new tickets picked up
- Running tickets are marked `halted` and their spawned agent process is force-killed: SIGTERM to the process group first, then SIGKILL after `budget.kill_grace_ms` (default 30s) if it hasn't exited
- A periodic sweep (every tick) catches tickets that stop emitting events entirely, so a hung agent is still killed even without a fresh hook event to trigger it
- Slack notified on halt, and again if SIGKILL was needed

Release:

```bash
rm ~/.claude-agency/KILLSWITCH
```

## Budget

The budget guard is **heuristic**, not precise billing:

- Each hook event from a running agent counts as `cost_per_event_usd`.
- When a ticket crosses `per_ticket_usd_cap`, it's halted.
- When daily spend crosses `daily_usd_cap`, new spawns stop.
- At 90% of daily cap, Slack gets a warning.

Calibrate by watching 1–2 tickets with `dry_run: true` disabled, then adjusting `cost_per_event_usd` to match your observed spend.

## Slack

1. Create an incoming webhook in Slack (`https://api.slack.com/apps` → your app → Incoming Webhooks).
2. Export the URL:
   ```bash
   export AGENCY_SLACK_WEBHOOK=https://hooks.slack.com/services/...
   ```
3. Start the orchestrator — you'll see posts on: blocker, budget cap, ticket complete, error.

## Spawn command

The default is `claude -p "/ticket {{ticket_url}} --auto"`. This assumes your Claude Code CLI supports a one-shot print mode (`-p` / `--print`). Adjust `spawn.command` + `spawn.args` in the config to match your setup — for example:

- Custom wrapper script:
  ```json
  "command": "/opt/agency/bin/spawn-ticket.sh",
  "args": ["{{ticket_url}}"]
  ```

Use `dry_run: true` to verify the expanded command before letting it fly.

## Stuck-agent detection

The orchestrator watches each active ticket and flips it to `status: stuck` when it matches any of these heuristics. A Slack notification is sent on each transition; re-notification is throttled by `stuck.re_notify_after_ms` to avoid spam.

| Rule | When it fires | Signal |
|---|---|---|
| `idle` | No events for `idle_timeout_ms` (default 10 min) | Session alive, agent stalled / deadlocked |
| `tool_loop` | Same tool + same file `tool_loop_threshold` times in a row (default 5) | Agent editing the same file repeatedly without progress |
| `thrashing` | `thrashing_window` events (default 50) with no `Edit`/`Write` | Agent reading forever, not producing changes |
| `stopped_no_changes` | `Stop` event fires but ticket never touched a file | Classic ask-a-question-and-return (agent didn't use `/wait-for-reply`) |

When a stuck ticket emits a new substantive event (not `stop`), it transitions back to `in_progress` and Slack gets a `resumed` info ping. State is persisted in `registry.json` (`status`, `stuck_reason`, `stuck_since`, `stuck_detail`) so the dashboard can surface it.

Tune all thresholds in `config/orchestrator.json` under the `stuck` block. Set any to an absurdly high value to effectively disable a rule.

### Whitelisting tickets

Some tickets are expected to go long without a file edit — research spikes, infra investigation, anything read-heavy by nature. Exclude them from stuck detection entirely with `stuck.whitelist`, a list of glob patterns (`*` wildcard) matched against the ticket's id and its labels:

```json
"stuck": {
  "whitelist": ["gh:your-org/your-repo#42", "research-*", "long-running"]
}
```

A whitelisted ticket never transitions to `stuck` for any rule (idle, tool_loop, thrashing, stopped_no_changes) — it's a full opt-out, not a threshold adjustment. Non-whitelisted tickets are unaffected.

## Known limitations (v1)

- **Budget is approximate** — not real tokens.
- **One orchestrator per host.** Multi-host is v2.
- **No retries.** If a spawn crashes early, the ticket stays `in_progress` until manually updated.
- **Session→ticket linking is approximate.** If your spawn doesn't set `CLAUDE_SESSION_ID` before the agent first emits, the tail uses the ticket branch slug to correlate.
- **GitHub only for now.** ClickUp / Linear / Jira sources follow the same pattern — drop in as `sources/clickup.mjs` etc.

## What to build next (v2 wishlist)

- ClickUp / Linear / Jira sources
- Per-repo policy (auto-merge chores, require approval for migrations)
- Reviewer-bot PR approval
