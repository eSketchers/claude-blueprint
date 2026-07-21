# Agency Dashboard

Lightweight live view of all your Claude Code agents across every project / ticket you have open.

## What it shows

- **🛑 Meeting Room** — agents blocked waiting for your input. Click a card to type a reply; it's dropped into the agent's inbox.
- **💻 Office** — agents currently running (last tool call < 60s ago). Shows which tool + which file.
- **☕ Cafeteria** — idle agents (session open, no recent activity).
- **🎟️ Tickets** — every branch / ticket the agents have touched, with per-ticket activity.

## How it works

```
hooks → ~/.claude-agency/events.jsonl → EventReader (incremental read + in-memory cache)
                                              ├── WebSocket push to connected clients (full_state on connect, incremental_events on new lines)
                                              └── GET /api/state.json — full snapshot, used as the client's fallback if the WebSocket drops
                                         └── /api/unblock writes to ~/.claude-agency/inbox/<session>.txt (atomic write-then-rename)
```

- **No database, no build step** — plain Node HTTP + WebSocket server + vanilla JS on the client. One runtime dependency: [`ws`](https://www.npmjs.com/package/ws) (see `package.json`) — run `npm install` in this directory once before starting the server.
- **Hooks** (`.claude/hooks/agency-emit.sh`) append one JSON line per lifecycle event.
- **Real-time, not polling**: the server watches `events.jsonl` with `fs.watch` and pushes new events to every connected client over WebSocket as they land. Clients only fall back to polling `/api/state.json` if the WebSocket connection drops.
- **Incremental reads**: `EventReader` tracks a byte offset into `events.jsonl` and only reads what's new since the last read — it doesn't re-parse the whole file on every update. It also keeps an in-memory cache (last 10k events) so state rebuilds don't touch disk at all.
- **Unblock inbox**: when you submit a reply in the UI, it's written atomically to `~/.claude-agency/inbox/<session>.txt` (temp file + rename, so a concurrent reader never sees a torn write). Your agent's workflow / custom tool reads that file when it knows it's blocked — see `/check-inbox` and `/wait-for-reply` below.

## Running

```bash
# First time only — installs the ws dependency:
npm install

# One-off:
node server.mjs

# Or set up as a background service:
nohup node server.mjs > ~/.claude-agency/server.log 2>&1 &
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

- Multi-user not supported — assumes one operator on localhost.
- No auth. Binds to 127.0.0.1 only; do not expose beyond localhost without adding auth first.
- `events.jsonl` rotates automatically past a 100MB threshold (`EventReader.shouldRotate()`), but nothing auto-archives the rotated file yet — if you want to reclaim disk, truncate manually (`mv events.jsonl events.jsonl.old && : > events.jsonl`).

## What to build next (v2 wishlist)

- SQLite + incremental ingest (durable storage beyond the in-memory cache + flat file)
- Per-ticket timeline view (tool-by-tool)
- Log tail per agent
- Graphviz / ticket-agent graph
- Auth for non-localhost / multi-operator use
