#!/usr/bin/env bash
# bootstrap.sh — one-time install of the agency Claude Code stack.
# Safe to re-run; each step is idempotent.

set -euo pipefail

log() { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# Parse flags
STRICT_MODE=true  # Default to strict
VERIFY_AFTER=true # Default to verify
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --permissive)
      STRICT_MODE=false
      shift
      ;;
    --strict)
      STRICT_MODE=true
      shift
      ;;
    --no-verify)
      VERIFY_AFTER=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--strict|--permissive] [--no-verify] [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --strict      Exit on any failure (default)"
      echo "  --permissive  Continue on warnings"
      echo "  --no-verify   Skip verification after install"
      echo "  --dry-run     Show what would be installed"
      echo ""
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

# Override warn/die based on mode
if [[ "$STRICT_MODE" == "true" ]]; then
  warn() { die "$@"; }  # In strict mode, warnings are fatal
fi

# Track installation results
declare -a INSTALLED=()
declare -a FAILED=()
declare -a SKIPPED=()

install_tool() {
  local name="$1"
  local check_cmd="$2"
  local install_cmd="$3"

  if $DRY_RUN; then
    log "[DRY-RUN] Would install: $name"
    log "[DRY-RUN] Check: $check_cmd"
    log "[DRY-RUN] Install: $install_cmd"
    SKIPPED+=("$name")
    return 0
  fi

  # Check if already installed
  if eval "$check_cmd" >/dev/null 2>&1; then
    log "$name already installed"
    INSTALLED+=("$name")
    return 0
  fi

  # Try to install
  log "Installing $name..."
  if eval "$install_cmd"; then
    INSTALLED+=("$name")
    log "✓ $name installed successfully"
  else
    FAILED+=("$name")
    if [[ "$STRICT_MODE" == "true" ]]; then
      die "Failed to install $name"
    else
      warn "Failed to install $name (continuing in permissive mode)"
    fi
  fi
}

command -v claude >/dev/null 2>&1 || die "claude CLI not found. Install Claude Code first."
command -v npx   >/dev/null 2>&1 || die "npx not found. Install Node 20+ first."

# ------------------------------------------------------------------
# 1. Claude Code plugins
# ------------------------------------------------------------------
log "Installing Superpowers plugin marketplace..."
install_tool "superpowers-marketplace" \
  "claude plugin list | grep -q superpowers-marketplace" \
  "claude plugin marketplace add obra/superpowers-marketplace"

install_tool "superpowers" \
  "claude plugin list | grep -q 'superpowers@'" \
  "claude plugin install superpowers@claude-plugins-official"

# ------------------------------------------------------------------
# 2. MCP servers (user scope, available to every project)
# ------------------------------------------------------------------
log "Registering MCP servers..."

install_tool "mcp-serena" \
  "claude mcp list | grep -q serena" \
  "claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena-mcp-server"

install_tool "mcp-context7" \
  "claude mcp list | grep -q context7" \
  "claude mcp add context7 -- npx -y @upstash/context7-mcp"

install_tool "mcp-sequential-thinking" \
  "claude mcp list | grep -q sequential-thinking" \
  "claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking"

install_tool "mcp-memory" \
  "claude mcp list | grep -q memory" \
  "claude mcp add memory -- npx -y @modelcontextprotocol/server-memory"

install_tool "mcp-playwright" \
  "claude mcp list | grep -q playwright" \
  "claude mcp add playwright -- npx -y @playwright/mcp@latest"

install_tool "mcp-github" \
  "claude mcp list | grep -q github" \
  "claude mcp add github -- npx -y @modelcontextprotocol/server-github"

# ------------------------------------------------------------------
# 3. Host-side tooling (ast-grep, graphify, pre-commit)
# ------------------------------------------------------------------
log "Installing host tools..."

install_tool "ast-grep" \
  "command -v ast-grep" \
  "npm install -g @ast-grep/cli"

install_tool "graphify" \
  "command -v graphify" \
  "pip install --user graphifyy && graphify install"

install_tool "pre-commit" \
  "command -v pre-commit" \
  "pip install --user pre-commit"

# ------------------------------------------------------------------
# 4. Verification
# ------------------------------------------------------------------
if [[ "$VERIFY_AFTER" == "true" ]] && [[ "$DRY_RUN" == "false" ]]; then
  log "Verifying installations..."
  if bash "$(dirname "$0")/verify-tools.sh"; then
    log "All verifications passed!"
  else
    if [[ "$STRICT_MODE" == "true" ]]; then
      die "Some verifications failed - check output above"
    else
      warn "Some verifications failed - check output above"
    fi
  fi
fi

# ------------------------------------------------------------------
# 5. Summary
# ------------------------------------------------------------------
echo ""
log "Installation Summary:"
log "===================="

if [[ ${#INSTALLED[@]} -gt 0 ]]; then
  printf '\033[1;32m✓\033[0m Installed (%d):\n' "${#INSTALLED[@]}"
  for tool in "${INSTALLED[@]}"; do
    echo "  ✓ $tool"
  done
fi

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  log "Skipped (${#SKIPPED[@]}):"
  for tool in "${SKIPPED[@]}"; do
    echo "  - $tool"
  done
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  printf '\033[1;31m✗\033[0m Failed (%d):\n' "${#FAILED[@]}"
  for tool in "${FAILED[@]}"; do
    echo "  ✗ $tool"
  done
fi

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
  printf '\033[1;32m✓\033[0m Bootstrap completed successfully!\n'
  log "Next step: ./scripts/adopt.sh --framework <python|node|nextjs|nestjs>"
else
  printf '\033[1;31m✗\033[0m Bootstrap completed with errors\n'
  log "Run with --permissive to continue despite errors"
  exit 1
fi
