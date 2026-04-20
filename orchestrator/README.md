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
- Running tickets get marked `halted` on their next emitted event (not force-killed — see limitations)
- Slack notified

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

- `claude-flow`-based spawn:
  ```json
  "command": "npx",
  "args": ["-y", "@claude-flow/cli@latest", "swarm", "run", "--prompt", "/ticket {{ticket_url}} --auto"]
  ```
- Custom wrapper script:
  ```json
  "command": "/opt/agency/bin/spawn-ticket.sh",
  "args": ["{{ticket_url}}"]
  ```

Use `dry_run: true` to verify the expanded command before letting it fly.

## Known limitations (v1)

- **Budget is approximate** — not real tokens.
- **Halt does not kill running processes** — it only stops new spawns and marks tickets halted on next event. A forcible PID kill on halt is v2.
- **One orchestrator per host.** Multi-host is v2.
- **No retries.** If a spawn crashes early, the ticket stays `in_progress` until manually updated.
- **Session→ticket linking is approximate.** If your spawn doesn't set `CLAUDE_SESSION_ID` before the agent first emits, the tail uses the ticket branch slug to correlate.
- **GitHub only for now.** ClickUp / Linear / Jira sources follow the same pattern — drop in as `sources/clickup.mjs` etc.

## What to build next (v2 wishlist)

- Real token counts (parse Claude Code's usage output)
- ClickUp / Linear / Jira sources
- Retry on crash + backoff
- Forcible halt (PID kill)
- Per-repo policy (auto-merge chores, require approval for migrations)
- Reviewer-bot PR approval
