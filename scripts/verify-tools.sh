#!/usr/bin/env bash
# verify-tools.sh - Verify all agency tools are working

set -euo pipefail

log() { printf '\033[1;34m[verify]\033[0m %s\n' "$*"; }
success() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*"; }

ERRORS=0

verify_tool() {
  local name="$1"
  local cmd="$2"

  if eval "$cmd" >/dev/null 2>&1; then
    success "$name is working"
    return 0
  else
    fail "$name is not working: $cmd"
    ((ERRORS++))
    return 1
  fi
}

log "Verifying Claude Agency Blueprint tools..."
echo ""

# Core requirements
verify_tool "Claude CLI" "claude --version"
verify_tool "Node.js" "node --version"
verify_tool "npm" "npm --version"

# Claude plugins
verify_tool "Superpowers plugin" "claude plugin list | grep -q superpowers"

# MCP servers
verify_tool "MCP serena" "claude mcp list | grep -q serena"
verify_tool "MCP context7" "claude mcp list | grep -q context7"
verify_tool "MCP sequential-thinking" "claude mcp list | grep -q sequential-thinking"
verify_tool "MCP memory" "claude mcp list | grep -q memory"
verify_tool "MCP playwright" "claude mcp list | grep -q playwright"
verify_tool "MCP github" "claude mcp list | grep -q github"

# Host tools
verify_tool "ast-grep" "ast-grep --version"
verify_tool "graphify" "command -v graphify"
verify_tool "pre-commit" "pre-commit --version"

echo ""
if [[ $ERRORS -eq 0 ]]; then
  success "All tools verified successfully!"
  exit 0
else
  fail "Verification failed: $ERRORS tools not working"
  exit 1
fi
