# Agency Dashboard

Lightweight live view of all your Claude Code agents across every project / ticket you have open.

## What it shows

- **🛑 Meeting Room** — agents blocked waiting for your input. Click a card to type a reply; it's dropped into the agent's inbox.
- **💻 Office** — agents currently running (last tool call < 60s ago). Shows which tool + which file.
- **☕ Cafeteria** — idle agents (session open, no recent activity).
- **🎟️ Tickets** — every branch / ticket the agents have touched, with per-ticket activity.

## How it works (no external deps)

```
hooks → ~/.claude-agency/events.jsonl → server.mjs (in-memory snapshot) → dashboard polls /api/state.json every 2s
                                         └── /api/unblock writes to ~/.claude-agency/inbox/<session>.txt
```

- **No database, no build step, no npm deps** — plain Node HTTP + vanilla JS.
- **Hooks** (`.claude/hooks/agency-emit.sh`) append one JSON line per lifecycle event.
- **Unblock inbox**: when you submit a reply in the UI, it's written to `~/.claude-agency/inbox/<session>.txt`. Your agent's workflow / custom tool should read that file when it knows it's blocked.

## Running

```bash
# One-off:
node dashboard/server.mjs

# Or set up as a background service:
nohup node dashboard/server.mjs > ~/.claude-agency/server.log 2>&1 &
```

Open http://127.0.0.1:7842.

## Environment

- `AGENCY_PORT` — override the default 7842.
- `CLAUDE_AGENCY_HOME` — override `~/.claude-agency` for the state dir.

## Self-resume loop (agents pick up replies themselves)

The dashboard drops the unblock message into `~/.claude-agency/inbox/<session>.txt`. Two slash commands pick it up:

| Command | Behavior | When to use |
|---|---|---|
| `/check-inbox` | **Non-blocking** pull. Reads + archives any pending reply, or reports empty. | At the start of a turn, to see if there's a queued answer. |
| `/wait-for-reply "<question>"` | **Blocking** poll (up to 120s). Fires a `notification` event so the dashboard flips the agent to **Meeting Room** with the question visible, then waits for the inbox file to materialize. | When the agent is genuinely blocked and other agents are running in parallel — lets the agent resume itself in the same turn. |

### How `/wait-for-reply` works end-to-end

1. Agent runs `/wait-for-reply "Which DB should the pipeline use?"`
2. Script emits a `notification` event → dashboard shows the agent card in **Meeting Room** with the question on it
3. Operator clicks the card, types a reply, sends → dashboard POSTs `/api/unblock` → server writes `~/.claude-agency/inbox/<session>.txt`
4. Script's poll loop sees the file, prints the reply between `===== operator reply =====` delimiters, archives the file, exits 0
5. Agent continues in the same turn, using the reply as input

Timeout (default 120s, configurable): script exits 1 with a stderr notice. The command's `.claude/commands/wait-for-reply.md` spec tells the agent to hand control back rather than loop.

### Helper scripts

- `.claude/hooks/inbox-check.sh` — reads + archives inbox file
- `.claude/hooks/inbox-wait.sh` — notification + blocking poll

Both are deployed into every project by `scripts/new-project.sh`.

## Limitations (by design in v1)

- Not real-time: polls at 2s. Fine for visibility, not for trading desks.
- State is derived from the event log on every request. Re-reads the whole file each tick. If it grows huge (> 50 MB), truncate it (`mv events.jsonl events.jsonl.old && : > events.jsonl`).
- Multi-user not supported — assumes one operator on localhost.
- No auth. Binds to 127.0.0.1 only; do not expose beyond localhost without adding auth first.

## What to build next (v2 wishlist)

- SQLite + incremental ingest
- WebSocket push instead of polling
- Per-ticket timeline view (tool-by-tool)
- Log tail per agent
- Graphviz / ticket-agent graph
