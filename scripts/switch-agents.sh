#!/usr/bin/env bash
# Switch agent availability based on profile
# Usage: ./scripts/switch-agents.sh [minimal|frontend|backend|fullstack|devops|data|ticket]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$PROJECT_ROOT/.claude/agents"
AGENTS_BACKUP="$PROJECT_ROOT/.claude/agents.backup"
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

# Create backup directory if it doesn't exist
if [ ! -d "$AGENTS_BACKUP" ]; then
    mkdir -p "$AGENTS_BACKUP"
    # Move all current agents to backup
    echo -e "${BLUE}Creating initial backup of agents...${NC}"
    cp -r "$AGENTS_DIR"/*.md "$AGENTS_BACKUP/" 2>/dev/null || true
fi

# Remove all agents from active directory (except backup dir)
echo -e "${YELLOW}Removing inactive agents for profile: $PROFILE${NC}"
rm -f "$AGENTS_DIR"/*.md

# Copy only profile agents back
echo -e "${GREEN}Activating agents for profile: $PROFILE${NC}"
echo -e "${YELLOW}  Description: $PROFILE_DESC${NC}"
echo -e "${YELLOW}  Active agents:${NC}"

for agent in $PROFILE_AGENTS; do
    AGENT_FILE="$AGENTS_BACKUP/${agent}.md"

    if [ ! -f "$AGENT_FILE" ]; then
        echo -e "${RED}    ✗ $agent (file not found: $AGENT_FILE)${NC}"
        continue
    fi

    cp "$AGENT_FILE" "$AGENTS_DIR/"
    echo -e "    ${GREEN}✓ $agent${NC}"
done

# Show savings
ALL_AGENTS_COUNT=$(ls -1 "$AGENTS_BACKUP"/*.md 2>/dev/null | wc -l | tr -d ' ')
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
