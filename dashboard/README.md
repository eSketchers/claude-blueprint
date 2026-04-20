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

## Hooking unblock replies into your agents

The dashboard only drops a file into `~/.claude-agency/inbox/<session>.txt`. For the agent to actually resume, one of the following needs to happen:

1. **Manual** — you paste the reply into the Claude Code UI yourself (simplest, works today).
2. **Custom tool / slash command** — a `/check-inbox` command reads the file and echoes it back to the agent (works; requires the agent to proactively check).
3. **Notification responder** — a small watcher daemon that pushes the reply via the Claude Code messaging channel (requires deeper integration; future work).

For v1 we recommend (1). The dashboard is mainly a **status + audit trail** tool right now; the unblock file is a staging ground until (2)/(3) are built.

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
