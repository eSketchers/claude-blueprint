#!/usr/bin/env bash
# detect-profile.sh — recommend a .claude/agents.profiles.json profile from
# ticket text (title + description + labels), for the /ticket workflow's
# Phase 0/1 profile check (Tier 4, Token Optimization Issue 2: "No automatic
# profile detection").
#
# Usage:
#   .claude/hooks/detect-profile.sh "<ticket text>" [current_profile]
#
# stdout: the recommended profile name, alone on its own line (e.g. "backend")
# stderr: human-readable rationale (matched keywords per category)
# Side effect: emits a `profile_detected` event to ~/.claude-agency/events.jsonl
#              via agency-emit.sh, so the dashboard/orchestrator can see what
#              was recommended and why — this is what the design doc asked
#              for ("log profile choice and rationale to events.jsonl").
#
# This does NOT switch anything itself — .claude/commands/ticket.md's Phase 0
# calls it, compares the recommendation against the current profile (passed as
# $2), and only warns/prompts if they differ. It never silently switches
# profiles out from under the user.

set -u

TICKET_TEXT="${1:-}"
CURRENT_PROFILE="${2:-}"

if [[ -z "$TICKET_TEXT" ]]; then
  echo "detect-profile.sh: missing ticket text argument" >&2
  exit 1
fi

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Keyword categories -----------------------------------------------
# Same spirit as dynamic-context.sh's task-type detection, but mapped to
# agents.profiles.json profile names instead of raw MCP lists.

has_frontend=0
has_backend=0
has_devops=0
has_data=0

MATCHED_FRONTEND=""
MATCHED_BACKEND=""
MATCHED_DEVOPS=""
MATCHED_DATA=""

check() {
  local pattern="$1"
  printf '%s' "$TICKET_TEXT" | grep -ioE "$pattern" | tr '[:upper:]' '[:lower:]' | sort -u | tr '\n' ',' | sed 's/,$//'
}

MATCHED_FRONTEND="$(check '(react|next\.?js|component|\bui\b|frontend|tailwind|playwright|\be2e\b|browser|css|responsive)')"
[[ -n "$MATCHED_FRONTEND" ]] && has_frontend=1

MATCHED_BACKEND="$(check '(\bapi\b|backend|database|migration|nest\.?js|fastapi|django|express|endpoint|schema|\bsql\b)')"
[[ -n "$MATCHED_BACKEND" ]] && has_backend=1

MATCHED_DEVOPS="$(check '(docker|ci/cd|terraform|deploy|infrastructure|\bk8s\b|kubernetes|helm)')"
[[ -n "$MATCHED_DEVOPS" ]] && has_devops=1

MATCHED_DATA="$(check '(\betl\b|warehouse|\bdbt\b|airflow|dagster|data pipeline|analytics pipeline)')"
[[ -n "$MATCHED_DATA" ]] && has_data=1

# --- Map matched categories -> profile --------------------------------
# Rule: a profile is only recommended by exact category-set match. Any
# combination not explicitly listed here (e.g. frontend+devops, or 3+ of any
# kind) falls through to the broad "ticket" profile rather than guessing a
# partial profile that would be missing an agent it actually needs. This is
# checked BEFORE any single-category branch, so e.g. a ticket matching both
# "react" (frontend) and "kubernetes" (devops) can't accidentally take the
# frontend-only branch and silently drop the devops signal.

CATEGORY_COUNT=$((has_frontend + has_backend + has_devops + has_data))

if [[ $CATEGORY_COUNT -eq 0 ]]; then
  PROFILE="minimal"
  RATIONALE="No frontend/backend/devops/data keywords matched — likely exploration, planning, or a question. 'minimal' (architect only) keeps context small."
elif [[ $CATEGORY_COUNT -ge 3 ]]; then
  PROFILE="ticket"
  RATIONALE="Matched $CATEGORY_COUNT of 4 categories — broad enough to need every specialist. 'ticket' loads all agents."
elif [[ $CATEGORY_COUNT -eq 2 ]]; then
  if [[ $has_frontend -eq 1 && $has_backend -eq 1 ]]; then
    PROFILE="fullstack"
    RATIONALE="Matched both frontend ($MATCHED_FRONTEND) and backend ($MATCHED_BACKEND) keywords."
  else
    PROFILE="ticket"
    RATIONALE="Matched 2 categories with no dedicated combined profile (only frontend+backend maps to 'fullstack') — using 'ticket' for full coverage rather than guessing."
  fi
elif [[ $has_frontend -eq 1 ]]; then
  PROFILE="frontend"
  RATIONALE="Matched frontend keywords only: $MATCHED_FRONTEND"
elif [[ $has_backend -eq 1 ]]; then
  PROFILE="backend"
  RATIONALE="Matched backend keywords only: $MATCHED_BACKEND"
elif [[ $has_devops -eq 1 ]]; then
  PROFILE="devops"
  RATIONALE="Matched devops/infra keywords only: $MATCHED_DEVOPS"
else
  PROFILE="data"
  RATIONALE="Matched data-pipeline keywords only: $MATCHED_DATA"
fi

echo "$PROFILE"

{
  echo "📊 Profile detection:"
  echo "   Frontend keywords: ${MATCHED_FRONTEND:-none}"
  echo "   Backend keywords:  ${MATCHED_BACKEND:-none}"
  echo "   DevOps keywords:   ${MATCHED_DEVOPS:-none}"
  echo "   Data keywords:     ${MATCHED_DATA:-none}"
  echo "   Recommended profile: $PROFILE"
  echo "   Rationale: $RATIONALE"
  if [[ -n "$CURRENT_PROFILE" ]]; then
    if [[ "$CURRENT_PROFILE" == "$PROFILE" ]]; then
      echo "   Current profile ('$CURRENT_PROFILE') already matches — no action needed."
    else
      echo "   Current profile ('$CURRENT_PROFILE') differs from recommendation ('$PROFILE')."
    fi
  fi
} >&2

# Log the recommendation (and, if given, whether it matched the active
# profile) so the dashboard/orchestrator can see what was recommended and why.
if [[ -x "$HOOK_DIR/agency-emit.sh" ]]; then
  EXTRA="profile=$PROFILE"
  [[ -n "$CURRENT_PROFILE" ]] && EXTRA="$EXTRA current=$CURRENT_PROFILE match=$([[ "$CURRENT_PROFILE" == "$PROFILE" ]] && echo yes || echo no)"
  "$HOOK_DIR/agency-emit.sh" profile_detected "$EXTRA" >/dev/null 2>&1 || true
fi

exit 0
