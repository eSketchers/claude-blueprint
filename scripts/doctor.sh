#!/usr/bin/env bash
# doctor.sh - Diagnostic script for Claude Agency Blueprint

set -euo pipefail

log() { printf '\033[1;34m[doctor]\033[0m %s\n' "$*"; }
success() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m⚠\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*"; }

echo "Claude Agency Blueprint Diagnostic Report"
echo "========================================="
echo ""

# System Information
log "System Information:"
echo "  OS: $(uname -s) $(uname -r)"
echo "  Arch: $(uname -m)"
echo "  Shell: $SHELL"
echo ""

# Tool Versions
log "Tool Versions:"
check_tool() {
  if command -v "$1" >/dev/null 2>&1; then
    success "$1: $($1 --version 2>&1 | head -1)"
  else
    fail "$1: NOT FOUND"
  fi
}

check_tool node
check_tool npm
check_tool python3
check_tool pip3
check_tool claude
check_tool git
echo ""

# Claude Setup
log "Claude Setup:"
if command -v claude >/dev/null 2>&1; then
  echo "  Plugins:"
  claude plugin list 2>/dev/null | sed 's/^/    /' || warn "Could not list plugins"

  echo "  MCP Servers:"
  claude mcp list 2>/dev/null | sed 's/^/    /' || warn "Could not list MCP servers"
else
  fail "Claude CLI not installed"
fi
echo ""

# Blueprint Status
log "Blueprint Status:"
BLUEPRINT_DIR="${BLUEPRINT_DIR:-$HOME/work/claude-agency-blueprint}"
if [[ -d "$BLUEPRINT_DIR" ]]; then
  success "Blueprint directory: $BLUEPRINT_DIR"
  cd "$BLUEPRINT_DIR"
  echo "  Git revision: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  echo "  Git status: $(git status --porcelain | wc -l) modified files"
else
  fail "Blueprint directory not found: $BLUEPRINT_DIR"
fi
echo ""

# Project Setup (if in a project)
if [[ -d ".claude" ]]; then
  log "Project Configuration:"
  success "Project adopted (/.claude exists)"

  if [[ -f ".claude/settings.json" ]]; then
    echo "  Settings: $(jq -r '.model // "default"' .claude/settings.json 2>/dev/null || echo 'invalid JSON')"
  fi

  if [[ -d ".claude/agents" ]]; then
    echo "  Agents: $(ls -1 .claude/agents/*.md 2>/dev/null | wc -l) loaded"
  fi

  if [[ -f ".claude/agents.profiles.json" ]]; then
    echo "  Profiles: $(jq -r '.profiles | keys[]' .claude/agents.profiles.json 2>/dev/null | paste -sd, - || echo 'none')"
  fi
else
  warn "Not in an adopted project (no .claude directory)"
fi
echo ""

# Agency State
log "Agency State:"
AGENCY_HOME="${CLAUDE_AGENCY_HOME:-$HOME/.claude-agency}"
if [[ -d "$AGENCY_HOME" ]]; then
  success "Agency home: $AGENCY_HOME"

  if [[ -f "$AGENCY_HOME/events.jsonl" ]]; then
    echo "  Events: $(wc -l < "$AGENCY_HOME/events.jsonl") events, $(du -h "$AGENCY_HOME/events.jsonl" | cut -f1) size"
  fi

  if [[ -f "$AGENCY_HOME/registry.json" ]]; then
    echo "  Registry: $(jq '.tickets | length' "$AGENCY_HOME/registry.json" 2>/dev/null || echo '0') tickets"
    echo "  Today spend: \$$(jq '.daily_spend."'$(date +%Y-%m-%d)'" // 0' "$AGENCY_HOME/registry.json" 2>/dev/null || echo '0')"
  fi

  if [[ -d "$AGENCY_HOME/agent-logs" ]]; then
    echo "  Agent logs: $(ls -1 "$AGENCY_HOME/agent-logs"/*.log 2>/dev/null | wc -l) files"
  fi
else
  warn "Agency home not initialized: $AGENCY_HOME"
fi
echo ""

# Service Status
log "Service Status:"

# Check orchestrator
if pgrep -f "orchestrator/server.mjs" >/dev/null 2>&1; then
  success "Orchestrator: RUNNING (PID: $(pgrep -f 'orchestrator/server.mjs'))"
else
  warn "Orchestrator: NOT RUNNING"
fi

# Check dashboard
if curl -s http://localhost:7842/api/state >/dev/null 2>&1; then
  success "Dashboard: RUNNING (http://localhost:7842)"
else
  warn "Dashboard: NOT RUNNING or not responding"
fi
echo ""

# Recommendations
log "Recommendations:"

ISSUES=0

if ! command -v claude >/dev/null 2>&1; then
  echo "  1. Install Claude Code: https://claude.com/claude-code"
  ((ISSUES++))
fi

if ! command -v node >/dev/null 2>&1 || [[ $(node --version | cut -d. -f1 | cut -dv -f2) -lt 20 ]]; then
  echo "  2. Update Node.js to v20+: nvm install 20"
  ((ISSUES++))
fi

if [[ ! -d "$BLUEPRINT_DIR" ]]; then
  echo "  3. Clone blueprint: git clone <blueprint-repo> $BLUEPRINT_DIR"
  ((ISSUES++))
fi

if [[ ! -d ".claude" ]] && [[ "$PWD" != "$BLUEPRINT_DIR" ]]; then
  echo "  4. Adopt project: $BLUEPRINT_DIR/scripts/adopt.sh --framework <type>"
  ((ISSUES++))
fi

if [[ $ISSUES -eq 0 ]]; then
  success "No issues detected - system ready!"
else
  warn "Found $ISSUES issue(s) - see recommendations above"
fi

echo ""
echo "Report generated: $(date)"
