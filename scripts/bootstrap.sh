#!/usr/bin/env bash
# bootstrap.sh — one-time install of the agency Claude Code stack.
# Safe to re-run; each step is idempotent.

set -euo pipefail

log() { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

command -v claude >/dev/null 2>&1 || die "claude CLI not found. Install Claude Code first."
command -v npx   >/dev/null 2>&1 || die "npx not found. Install Node 20+ first."

# ------------------------------------------------------------------
# 1. Claude Code plugins
# ------------------------------------------------------------------
log "Installing Superpowers plugin marketplace..."
claude plugin marketplace add obra/superpowers-marketplace || warn "marketplace add failed (maybe already added)"
claude plugin install superpowers@claude-plugins-official || warn "superpowers install failed"

# ------------------------------------------------------------------
# 2. MCP servers (user scope, available to every project)
# ------------------------------------------------------------------
log "Registering MCP servers..."

claude mcp add serena               -- uvx --from git+https://github.com/oraios/serena serena-mcp-server || warn "serena add failed"
claude mcp add context7             -- npx -y @upstash/context7-mcp || warn "context7 add failed"
claude mcp add sequential-thinking  -- npx -y @modelcontextprotocol/server-sequential-thinking || warn "sequential-thinking add failed"
claude mcp add memory               -- npx -y @modelcontextprotocol/server-memory || warn "memory add failed"
claude mcp add playwright           -- npx -y @playwright/mcp@latest || warn "playwright add failed"
claude mcp add github               -- npx -y @modelcontextprotocol/server-github || warn "github add failed"

# ------------------------------------------------------------------
# 3. Claude Flow CLI + daemon
# ------------------------------------------------------------------
log "Registering Claude Flow MCP + daemon..."
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest || warn "claude-flow add failed"
npx -y @claude-flow/cli@latest daemon start || warn "claude-flow daemon start skipped"
npx -y @claude-flow/cli@latest doctor --fix || warn "claude-flow doctor skipped"

# ------------------------------------------------------------------
# 4. Host-side tooling (ast-grep, graphify, pre-commit)
# ------------------------------------------------------------------
log "Installing host tools..."

if ! command -v ast-grep >/dev/null 2>&1; then
  npm install -g @ast-grep/cli || warn "ast-grep install failed"
fi

if ! command -v graphify >/dev/null 2>&1; then
  pip install --user graphifyy || warn "graphify install failed"
  command -v graphify >/dev/null 2>&1 && graphify install || true
fi

if ! command -v pre-commit >/dev/null 2>&1; then
  pip install --user pre-commit || warn "pre-commit install failed"
fi

log "Bootstrap complete."
log "Next step: ./scripts/new-project.sh <name> <python|node|nextjs|nestjs>"
