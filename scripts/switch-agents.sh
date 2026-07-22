#!/usr/bin/env bash
# Switch agent availability based on profile
# Usage: ./scripts/switch-agents.sh [minimal|frontend|backend|fullstack|devops|data|ticket]
#
# Non-destructive by design: .claude/agents-all/ holds the canonical agent
# files; .claude/agents/ contains only symlinks into agents-all/ for the
# active profile. Switching profiles removes and recreates symlinks — it
# never deletes or overwrites real content, so an interrupted run (Ctrl-C,
# jq failure, disk full) can leave .claude/agents/ empty at worst, never in
# a state where an agent's actual content is lost. Re-running the script (or
# any prior profile) fully repairs it, since agents-all/ was never touched.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$PROJECT_ROOT/.claude/agents"
AGENTS_ALL="$PROJECT_ROOT/.claude/agents-all"
PROFILES_FILE="$PROJECT_ROOT/.claude/agents.profiles.json"
PROFILE="${1:-ticket}"

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ ! -f "$PROFILES_FILE" ]; then
    echo -e "${RED}Error: $PROFILES_FILE not found${NC}"
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required. Install with: brew install jq${NC}"
    exit 1
fi

# Validate profile exists
if ! jq -e ".profiles.\"$PROFILE\"" "$PROFILES_FILE" >/dev/null 2>&1; then
    echo -e "${RED}Error: Profile '$PROFILE' not found in $PROFILES_FILE${NC}"
    echo -e "${YELLOW}Available profiles:${NC}"
    jq -r '.profiles | keys[]' "$PROFILES_FILE" | sed 's/^/  - /'
    exit 1
fi

# Get list of agents for this profile
PROFILE_AGENTS=$(jq -r ".profiles.\"$PROFILE\".agents[]" "$PROFILES_FILE" 2>/dev/null || echo "")
PROFILE_DESC=$(jq -r ".profiles.\"$PROFILE\".description" "$PROFILES_FILE")

if [ -z "$PROFILE_AGENTS" ]; then
    echo -e "${RED}Error: Profile '$PROFILE' has no agents defined${NC}"
    exit 1
fi

mkdir -p "$AGENTS_DIR" "$AGENTS_ALL"

# One-time migration: if agents-all/ is empty but agents/ has real (non-symlink)
# files, move them into agents-all/ as the new canonical source. Safe to run
# every time — a no-op once migrated. Does not touch existing symlinks.
if [ -z "$(ls -A "$AGENTS_ALL" 2>/dev/null)" ]; then
    shopt -s nullglob
    real_files=("$AGENTS_DIR"/*.md)
    shopt -u nullglob
    if [ ${#real_files[@]} -gt 0 ]; then
        echo -e "${BLUE}Migrating existing agents to $AGENTS_ALL (one-time)...${NC}"
        for f in "${real_files[@]}"; do
            [ -L "$f" ] && continue  # already a symlink, nothing to migrate for this file
            mv "$f" "$AGENTS_ALL/$(basename "$f")"
        done
    fi
fi

if [ -z "$(ls -A "$AGENTS_ALL" 2>/dev/null)" ]; then
    echo -e "${RED}Error: $AGENTS_ALL is empty and .claude/agents/ has no agent files to migrate.${NC}"
    echo -e "${YELLOW}Nothing to activate a profile from — check that agent .md files exist somewhere.${NC}"
    exit 1
fi

# Remove only symlinks from the active directory — never a real file. If a
# real .md file somehow still exists here (e.g. added by hand after
# migration), leave it alone and warn, rather than silently deleting content.
echo -e "${YELLOW}Clearing active agent symlinks for profile: $PROFILE${NC}"
shopt -s nullglob
for f in "$AGENTS_DIR"/*.md; do
    if [ -L "$f" ]; then
        rm "$f"
    else
        echo -e "${RED}    ⚠ Skipping non-symlink file, not removing: $f${NC}"
    fi
done
shopt -u nullglob

# Create symlinks for profile agents
echo -e "${GREEN}Activating agents for profile: $PROFILE${NC}"
echo -e "${YELLOW}  Description: $PROFILE_DESC${NC}"
echo -e "${YELLOW}  Active agents:${NC}"

for agent in $PROFILE_AGENTS; do
    AGENT_FILE="$AGENTS_ALL/${agent}.md"

    if [ ! -f "$AGENT_FILE" ]; then
        echo -e "${RED}    ✗ $agent (file not found: $AGENT_FILE)${NC}"
        continue
    fi

    # Relative target (../agents-all/<name>.md), not $AGENT_FILE (absolute) —
    # an absolute symlink bakes in this machine's path and breaks the moment
    # the repo is cloned/checked out anywhere else (e.g. CI, another
    # developer's machine, a container). agents/ and agents-all/ are always
    # siblings directly under .claude/, so the relative path is always just
    # one directory up.
    ln -sf "../agents-all/${agent}.md" "$AGENTS_DIR/${agent}.md"
    echo -e "    ${GREEN}✓ $agent${NC}"
done

# Show savings
ALL_AGENTS_COUNT=$(ls -1 "$AGENTS_ALL"/*.md 2>/dev/null | wc -l | tr -d ' ')
ACTIVE_AGENTS_COUNT=$(echo "$PROFILE_AGENTS" | wc -w | tr -d ' ')
SAVINGS_PERCENT=$(( (ALL_AGENTS_COUNT - ACTIVE_AGENTS_COUNT) * 100 / ALL_AGENTS_COUNT ))

echo ""
echo -e "${BLUE}Agent overhead reduction:${NC}"
echo -e "  Total agents available: $ALL_AGENTS_COUNT"
echo -e "  Active agents: $ACTIVE_AGENTS_COUNT"
echo -e "  Savings: ~${SAVINGS_PERCENT}% agent context (~$((ALL_AGENTS_COUNT - ACTIVE_AGENTS_COUNT)) agents × 50-60 tokens)"

echo ""
echo -e "${YELLOW}⚠️  Restart Claude Code for changes to take effect${NC}"
echo -e "   Or run: ${GREEN}claude${NC} in this directory"
