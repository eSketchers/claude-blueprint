#!/usr/bin/env bash
# Switch both MCP servers AND agents based on profile
# Usage: ./scripts/switch-profile-full.sh [minimal|frontend|backend|fullstack|devops|data|ticket]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-minimal}"

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Switching to profile: ${GREEN}$PROFILE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Switch MCP servers
echo -e "${YELLOW}[1/2] Switching MCP servers...${NC}"
"$SCRIPT_DIR/switch-profile.sh" "$PROFILE"
echo ""

# Step 2: Switch agents
echo -e "${YELLOW}[2/2] Switching agent availability...${NC}"
"$SCRIPT_DIR/switch-agents.sh" "$PROFILE"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Profile switch complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Exit current Claude Code session (if running)"
echo -e "  2. Start new session: ${GREEN}claude${NC}"
echo -e "  3. Verify with: ${GREEN}/context${NC}"
echo ""
