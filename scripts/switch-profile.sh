#!/usr/bin/env bash
# Switch Claude Code MCP profile dynamically
# Usage: ./scripts/switch-profile.sh [minimal|frontend|backend|fullstack|ticket]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS_FILE="$PROJECT_ROOT/.claude/settings.json"
PROFILES_FILE="$PROJECT_ROOT/.claude/settings.profiles.json"
PROFILE="${1:-minimal}"

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Backup current settings
BACKUP_FILE="$SETTINGS_FILE.backup-$(date +%s)"
cp "$SETTINGS_FILE" "$BACKUP_FILE"
echo -e "${GREEN}Backed up current settings to: $BACKUP_FILE${NC}"

# Extract profile MCPs
PROFILE_MCPS=$(jq ".profiles.\"$PROFILE\".mcpServers" "$PROFILES_FILE")
PROFILE_DESC=$(jq -r ".profiles.\"$PROFILE\".description" "$PROFILES_FILE")

# Merge into settings.json (preserve everything except mcpServers)
jq --argjson mcps "$PROFILE_MCPS" '.mcpServers = $mcps' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"
mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

echo -e "${GREEN}✓ Switched to profile: $PROFILE${NC}"
echo -e "${YELLOW}  Description: $PROFILE_DESC${NC}"
echo -e "${YELLOW}  Active MCPs:${NC}"
jq -r '.mcpServers | keys[]' "$SETTINGS_FILE" | sed 's/^/    - /'

echo ""
echo -e "${YELLOW}⚠️  Restart Claude Code for changes to take effect${NC}"
echo -e "   Or run: ${GREEN}claude${NC} in this directory"
