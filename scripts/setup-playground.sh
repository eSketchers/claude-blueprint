#!/usr/bin/env bash
# setup-playground.sh — create a fully isolated test playground for the agency blueprint.
#
# Produces:
#   <playground-dir>/
#     polls-app/         Django + React project (scaffolded by the agent, not here)
#     agency-home/       ISOLATED CLAUDE_AGENCY_HOME — separate events.jsonl, inbox, etc.
#     tickets/           Orchestrator polls this dir; /generate-tickets writes here
#     config/            orchestrator.json pointing at filesystem source
#     logs/              daemon + per-agent logs
#     PRD.md             sample product requirements doc
#     start.sh  stop.sh  submit-prd.sh
#     README.md          how to run the full test
#
# Zero contact with your existing ~/.claude-agency state. Dashboard runs on
# a separate port (7843) so you can run the regular agency + the playground
# in parallel if you want.

set -euo pipefail

log()  { printf '\033[1;34m[playground]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

BLUEPRINT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$HOME/PycharmProjects/polls-playground}"
DASHBOARD_PORT="${AGENCY_PORT:-7843}"

[[ -e "$TARGET" ]] && die "Target already exists: $TARGET  (rm -rf it first, or pass a different path)"

log "Building playground at $TARGET"
log "Isolated agency-home: $TARGET/agency-home"
log "Dashboard port: $DASHBOARD_PORT"

mkdir -p "$TARGET"/{agency-home/{inbox,outbox,agent-logs},tickets/processed,config,logs,polls-app}
cd "$TARGET"

# ---------------- polls-app skeleton ----------------
# We intentionally DO NOT scaffold Django/React files here — leave that to
# the first ticket (polls-001 "scaffold the project") so the agent can
# actually demonstrate the autonomous flow. We only lay down the .claude/
# and CLAUDE.md + git bones.

log "Scaffolding polls-app with blueprint .claude/ + Django+React CLAUDE.md"
cd "$TARGET/polls-app"
git init -q

mkdir -p .claude/{agents,commands,skills,hooks}

# Copy role agents
cp "$BLUEPRINT_DIR"/.claude/agents/*.md            .claude/agents/
cp "$BLUEPRINT_DIR"/.claude/settings.json          .claude/settings.json

# Copy our workflow commands (ticket, generate-tickets, check-inbox, wait-for-reply)
cp "$BLUEPRINT_DIR"/.claude/commands/*.md          .claude/commands/

# Hooks (dashboard telemetry + ticket detector + inbox helpers)
cp "$BLUEPRINT_DIR"/.claude/hooks/*.sh             .claude/hooks/
chmod +x .claude/hooks/*.sh

# Superpowers: symlink skills + commands + code-reviewer agent
SP="$BLUEPRINT_DIR/vendor/superpowers"
if [[ -d "$SP/skills" ]]; then
  for skill in "$SP"/skills/*/; do
    ln -sfn "$skill" ".claude/skills/$(basename "$skill")"
  done
  for cmd in "$SP"/commands/*.md; do
    base="$(basename "$cmd")"
    [[ -e ".claude/commands/$base" ]] && continue
    ln -sfn "$cmd" ".claude/commands/$base"
  done
  [[ -f "$SP/agents/code-reviewer.md" ]] && ln -sfn "$SP/agents/code-reviewer.md" .claude/agents/code-reviewer.md
fi

# Dashboard symlink (optional — lets users invoke it via the project dir)
ln -sfn "$BLUEPRINT_DIR/dashboard" .claude/dashboard

# Django+React CLAUDE.md
cp "$BLUEPRINT_DIR/templates/CLAUDE.md.django-react" CLAUDE.md

# Combined pre-commit — backend + frontend in one config
cat > .pre-commit-config.yaml <<'YAML'
# Combined pre-commit for Django + React monorepo.
# Backend hooks only run against backend/**; frontend hooks only against frontend/**.
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
        args: ['--maxkb=500']
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/psf/black
    rev: 24.8.0
    hooks:
      - id: black
        files: ^backend/
        args: ['--line-length=100']

  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks:
      - id: isort
        files: ^backend/
        args: ['--profile=black', '--line-length=100']

  - repo: https://github.com/pycqa/flake8
    rev: 7.1.1
    hooks:
      - id: flake8
        files: ^backend/
        args: ['--max-line-length=100', '--extend-ignore=E203,W503']

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0-alpha.8
    hooks:
      - id: prettier
        files: ^frontend/
        types_or: [ts, tsx, js, jsx, json, css, markdown]

  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.0
    hooks:
      - id: gitleaks
YAML

# .gitignore
cat > .gitignore <<'GITIGNORE'
.env
.env.*
!.env.example
*credentials*
*secret*
node_modules/
dist/
.next/
coverage/
.venv/
venv/
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
htmlcov/
.DS_Store
.idea/
.vscode/
.claude/settings.local.json
GITIGNORE

git add -A
git -c user.email=playground@local -c user.name=playground commit -q -m "chore: playground polls-app scaffold (blueprint + CLAUDE.md)"

cd "$TARGET"

# ---------------- Sample PRD ----------------
log "Writing sample PRD"
cat > "$TARGET/PRD.md" <<'PRD'
# Polls App — Product Requirements

## Overview
A minimal online polling application. Users can view a list of polls,
vote once per poll, and see aggregated results in real time.

## Users
- **Voter** (authenticated) — views polls, casts one vote per poll.
- **Admin** — creates/edits/closes polls and choices via Django admin.

## Functional requirements

1. **Browse polls**: list all open polls, newest first. Show title, short
   description, total vote count, and close date if set.
2. **View poll detail**: poll question + list of choices with current
   percentages. If the user already voted, show their selection highlighted.
3. **Vote**: authenticated user selects one choice and submits. Rejects
   duplicate votes by the same user on the same poll.
4. **Results**: show live totals and percentages. Update on page refresh
   (real-time is out of scope for v1).
5. **Auth**: email + password signup/login via Django built-ins. Session
   cookies for the frontend.
6. **Admin**: create polls (with 2–8 choices), edit, close. Django admin
   is sufficient — no custom admin UI needed.

## Non-functional requirements

- p95 page load < 1s on home broadband.
- Should handle 100 concurrent voters on a $20/mo box.
- Accessibility: keyboard-navigable forms, labeled controls, contrast ≥ 4.5:1.
- Test coverage: backend ≥ 80%, frontend ≥ 70% on changed code.

## Out of scope (v1)
- WebSocket live results
- Anonymous voting
- Multi-choice voting (only single-select per poll)
- Mobile app (responsive web only)
- Email verification flow (basic signup is enough for v1)

## Technical constraints
- Django 5.x + DRF backend, React 18 + Vite + TS frontend.
- Postgres in prod, SQLite dev.
- No third-party auth provider for v1.

## Acceptance
- End-to-end: a new user can sign up, open a poll, vote, and see their
  vote reflected in the totals, all in one session.
- Admin can create a poll + choices via `/admin` and see it appear on
  the home page.
PRD

# ---------------- Orchestrator config (isolated) ----------------
log "Writing isolated orchestrator.json"

# absolute paths so the daemon doesn't need a specific cwd
POLLS_APP="$TARGET/polls-app"
TICKETS_DIR="$TARGET/tickets"

cat > "$TARGET/config/orchestrator.json" <<EOF
{
  "_comment": "Playground config — filesystem source, dry-run spawn so you can inspect before going live.",

  "tick_interval_ms": 10000,

  "sources": [
    {
      "type": "filesystem",
      "name": "polls",
      "enabled": true,
      "dir": "$TICKETS_DIR",
      "processed_dir": "$TICKETS_DIR/processed",
      "repo_path": "$POLLS_APP"
    }
  ],

  "stuck": {
    "idle_timeout_ms": 600000,
    "tool_loop_threshold": 5,
    "thrashing_window": 50,
    "re_notify_after_ms": 600000
  },

  "budget": {
    "daily_usd_cap": 10,
    "per_ticket_usd_cap": 2,
    "cost_per_event_usd": 0.001,
    "killswitch_file": "$TARGET/agency-home/KILLSWITCH"
  },

  "spawn": {
    "_note": "dry_run=true prints what WOULD run without executing. Flip to false when ready.",
    "dry_run": true,
    "command": "claude",
    "args": ["-p", "/ticket {{ticket_url}} --auto"],
    "cwd": "{{repo_path}}",
    "env": {
      "CLAUDE_AGENCY_HOME": "$TARGET/agency-home"
    }
  },

  "notifier": {
    "slack": {
      "webhook_url_env": "PLAYGROUND_SLACK_WEBHOOK",
      "channel": "#agents",
      "notify_on": ["blocker", "budget_cap", "ticket_complete", "error"]
    }
  }
}
EOF

# ---------------- Start / stop / submit-prd scripts ----------------
log "Writing start / stop / submit-prd scripts"

cat > "$TARGET/start.sh" <<EOF
#!/usr/bin/env bash
# Boot the dashboard + orchestrator against THIS playground only.
set -euo pipefail
HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
BLUEPRINT="$BLUEPRINT_DIR"

export CLAUDE_AGENCY_HOME="\$HERE/agency-home"
export AGENCY_PORT="$DASHBOARD_PORT"
export AGENCY_ORCH_CONFIG="\$HERE/config/orchestrator.json"

DASH_LOG="\$HERE/logs/dashboard.log"
ORCH_LOG="\$HERE/logs/orchestrator.log"
DASH_PID="\$HERE/logs/dashboard.pid"
ORCH_PID="\$HERE/logs/orchestrator.pid"

if [[ -f "\$DASH_PID" ]] && kill -0 "\$(cat "\$DASH_PID")" 2>/dev/null; then
  echo "[start] dashboard already running (pid \$(cat "\$DASH_PID"))"
else
  nohup node "\$BLUEPRINT/dashboard/server.mjs" > "\$DASH_LOG" 2>&1 &
  echo \$! > "\$DASH_PID"
  echo "[start] dashboard → http://127.0.0.1:$DASHBOARD_PORT  (pid \$(cat "\$DASH_PID"))"
fi

if [[ -f "\$ORCH_PID" ]] && kill -0 "\$(cat "\$ORCH_PID")" 2>/dev/null; then
  echo "[start] orchestrator already running (pid \$(cat "\$ORCH_PID"))"
else
  nohup node "\$BLUEPRINT/orchestrator/server.mjs" > "\$ORCH_LOG" 2>&1 &
  echo \$! > "\$ORCH_PID"
  echo "[start] orchestrator started (pid \$(cat "\$ORCH_PID"))  log: \$ORCH_LOG"
fi

echo ""
echo "Next:"
echo "  1. cd \$HERE/polls-app  && claude"
echo "     → inside Claude Code, run:  /generate-tickets ../PRD.md ../tickets"
echo "  2. Watch the dashboard:  http://127.0.0.1:$DASHBOARD_PORT"
echo "  3. When ready for live runs, edit config/orchestrator.json and set spawn.dry_run=false"
EOF
chmod +x "$TARGET/start.sh"

cat > "$TARGET/stop.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for name in dashboard orchestrator; do
  pidfile="$HERE/logs/$name.pid"
  [[ -f "$pidfile" ]] || { echo "[stop] $name not running"; continue; }
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid"
    sleep 0.5
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid"
    echo "[stop] $name stopped (pid $pid)"
  else
    echo "[stop] $name stale pidfile"
  fi
  rm -f "$pidfile"
done
EOF
chmod +x "$TARGET/stop.sh"

cat > "$TARGET/submit-prd.sh" <<'EOF'
#!/usr/bin/env bash
# Convenience wrapper: open Claude Code in the polls-app dir and hint the next step.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CLAUDE_AGENCY_HOME="$HERE/agency-home"

PRD="${1:-$HERE/PRD.md}"
[[ -f "$PRD" ]] || { echo "[submit-prd] PRD file not found: $PRD" >&2; exit 1; }

: "${AGENCY_PORT:=7843}"

cat <<MSG
Opening Claude Code in the polls-app directory.

Inside Claude Code, run:

  /generate-tickets $PRD $HERE/tickets

The architect agent will produce docs/tech-spec.md and drop ticket JSON
files into $HERE/tickets. The orchestrator picks them up on the next
tick and (currently in dry-run) logs what would be spawned.

Log to follow:   tail -f $HERE/logs/orchestrator.log
Dashboard:       http://127.0.0.1:$AGENCY_PORT
MSG

cd "$HERE/polls-app" && claude
EOF
chmod +x "$TARGET/submit-prd.sh"

# ---------------- Playground README ----------------
log "Writing playground README"

cat > "$TARGET/README.md" <<'README_EOF'
# Polls Playground — Agency Blueprint End-to-End Test

A fully isolated sandbox to test the agency blueprint's autonomous flow:
PRD → tech spec → tickets → agents → PRs. Nothing here touches your main
`~/.claude-agency/` state or your other projects.

## What's here

| Path | What |
|---|---|
| `polls-app/`     | The target project. Django (`backend/`) + React (`frontend/`) will be created by the first agent run. |
| `agency-home/`   | **Isolated** CLAUDE_AGENCY_HOME. Events, inbox, outbox, agent logs. |
| `tickets/`       | Orchestrator polls this. `/generate-tickets` writes here; daemon moves picked-up files to `tickets/processed/`. |
| `config/orchestrator.json` | Playground-only config. Filesystem source, dry-run spawn enabled. |
| `PRD.md`         | Sample product requirements doc for the polls app. |
| `logs/`          | dashboard.log, orchestrator.log, pidfiles. |
| `start.sh` / `stop.sh` / `submit-prd.sh` | Boot / shutdown / PRD workflow. |

## Run it

    cd __TARGET__

    # 1. Start the isolated dashboard (port __PORT__) + orchestrator
    ./start.sh

    # 2. Open Claude Code in polls-app and submit the PRD
    ./submit-prd.sh
    #    inside Claude Code:
    #    /generate-tickets ../PRD.md ../tickets

    # 3. Watch the orchestrator pick up tickets
    tail -f logs/orchestrator.log
    # and open http://127.0.0.1:__PORT__

    # 4. When ready for live agent runs:
    #    edit config/orchestrator.json, set spawn.dry_run=false
    ./stop.sh && ./start.sh

## Dry-run by default

The orchestrator config ships with `spawn.dry_run=true` — it logs what
command it *would* run for each picked-up ticket without executing.
Verify tickets + config first; flip to `false` when ready.

## Connecting new MCPs

Blueprint-level MCPs (serena, context7, playwright, github, etc.) are
registered at the user level by the blueprint's `bootstrap.sh` and are
available to any Claude Code session, including this playground.

To add a playground-only MCP, add it to `polls-app/.claude/settings.local.json`
(git-ignored) so it doesn't leak to other projects.

## Budget + kill switch

- Daily cap: $10 · per-ticket cap: $2 (in `config/orchestrator.json`).
- Emergency stop: `touch agency-home/KILLSWITCH` halts new spawns.

## Tear down

    ./stop.sh
    cd .. && rm -rf __BASENAME__     # nukes the playground entirely

## What to watch for

- Dashboard **Meeting Room**: agents waiting for you. Click to reply.
- Dashboard **Office**: agents working. Tool + file + elapsed.
- Slack (if `PLAYGROUND_SLACK_WEBHOOK` exported): pings on blocker,
  budget cap, ticket complete, stuck-agent detection.
- `logs/orchestrator.log`: per-tick source polls, spawns, budget.
- `agency-home/events.jsonl`: every hook event (debugging source of truth).
- `agency-home/agent-logs/<ticket-id>.log`: full stdout/stderr per spawned session.
README_EOF

# Fill placeholders in the README
sed -i "s|__TARGET__|$TARGET|g; s|__PORT__|$DASHBOARD_PORT|g; s|__BASENAME__|$(basename "$TARGET")|g" "$TARGET/README.md"

log ""
log "Done. Playground at: $TARGET"
log ""
log "Next:"
log "  cd $TARGET"
log "  ./start.sh"
log "  ./submit-prd.sh      # opens Claude Code in polls-app"
log "  # inside Claude Code:"
log "  #   /generate-tickets ../PRD.md ../tickets"
log "  # then open http://127.0.0.1:$DASHBOARD_PORT"
