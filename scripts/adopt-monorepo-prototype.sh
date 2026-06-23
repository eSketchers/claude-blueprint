#!/usr/bin/env bash
# adopt-monorepo-prototype.sh — Phase 1 implementation sketch
#
# This is a PROTOTYPE showing how monorepo support would work.
# NOT production-ready. For design validation only.

set -euo pipefail

# ---------- New flags ----------
FRAMEWORKS=()   # Array instead of single string
DETECT=0        # Auto-detect flag

usage() {
  cat <<'USAGE'
Usage: adopt.sh [options]

Monorepo support (Phase 1):
  --framework F       Single framework (legacy, still works)
  --frameworks F1,F2  Multiple frameworks (comma-separated)
  --detect            Auto-detect all frameworks in repo

Options:
  --profile P         'backend' merges stricter deny-list
  --force             Overwrite existing .claude/
  --no-precommit      Skip pre-commit install
  --dry-run           Print ops, change nothing
  -h, --help          This help

Examples:
  # Single framework (legacy)
  adopt.sh --framework python

  # Monorepo with explicit frameworks
  adopt.sh --frameworks "python,nextjs"

  # Monorepo with auto-detection
  adopt.sh --detect
USAGE
}

# ---------- Parse flags ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --framework)
      # Legacy: single framework
      FRAMEWORKS=("${2:?}")
      shift 2
      ;;
    --frameworks)
      # New: comma-separated frameworks
      IFS=',' read -ra FRAMEWORKS <<< "${2:?}"
      shift 2
      ;;
    --detect)
      DETECT=1
      shift
      ;;
    --profile|--force|--no-precommit|--dry-run)
      # Pass through to existing logic
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown flag: $1"
      ;;
  esac
done

# ---------- Auto-detection logic (Phase 2 preview) ----------
detect_frameworks() {
  local project_root="$1"
  local detected=()

  # Scan for Python
  if [[ -f "$project_root/pyproject.toml" ]] || \
     [[ -f "$project_root/backend/pyproject.toml" ]] || \
     [[ -f "$project_root/requirements.txt" ]]; then
    detected+=("python")
  fi

  # Scan for Node/Next.js
  if [[ -f "$project_root/package.json" ]]; then
    if grep -q '"next"' "$project_root/package.json" 2>/dev/null; then
      detected+=("nextjs")
    else
      detected+=("node")
    fi
  fi

  # Check subdirectories for additional frameworks
  for dir in "$project_root"/*/ ; do
    [[ -d "$dir" ]] || continue

    if [[ -f "$dir/package.json" ]] && ! has_element "node" detected && ! has_element "nextjs" detected; then
      if grep -q '"next"' "$dir/package.json" 2>/dev/null; then
        detected+=("nextjs")
      else
        detected+=("node")
      fi
    fi

    if [[ -f "$dir/pyproject.toml" ]] && ! has_element "python" detected; then
      detected+=("python")
    fi
  done

  printf '%s\n' "${detected[@]}"
}

has_element() {
  local e match="$1"
  shift
  for e; do [[ "$e" == "$match" ]] && return 0; done
  return 1
}

# ---------- Auto-detect if requested ----------
if [[ $DETECT -eq 1 ]]; then
  mapfile -t FRAMEWORKS < <(detect_frameworks "$PROJECT_ROOT")
  log "Auto-detected frameworks: ${FRAMEWORKS[*]}"
fi

# Validate frameworks
for fw in "${FRAMEWORKS[@]}"; do
  case "$fw" in
    python|node|nextjs|nestjs) ;;
    *) die "Unknown framework: $fw" ;;
  esac
done

# ---------- Generate composite CLAUDE.md ----------
generate_claude_md() {
  local frameworks=("$@")
  local output="$PROJECT_ROOT/CLAUDE.md"

  if [[ -f "$output" ]]; then
    log "Existing CLAUDE.md preserved. Not overwriting."
    return
  fi

  log "Generating composite CLAUDE.md for: ${frameworks[*]}"

  # Header
  cat > "$output" <<'EOF'
# Claude Code Configuration — Monorepo

## Workspace Structure

This monorepo contains multiple frameworks. Before working on any ticket:

1. **Identify affected workspace(s)** from ticket labels/description
2. **Read the workspace-specific conventions** below
3. **Use workspace-appropriate tooling** (package manager, test runner, linter)
4. **Run tests scoped to changed workspace(s)** only
5. **Coordinate with other agents** for cross-workspace changes

---

EOF

  # Append each framework section
  local fw
  for fw in "${frameworks[@]}"; do
    local template="$BLUEPRINT_RESOLVED/templates/CLAUDE.md.$fw"

    if [[ ! -f "$template" ]]; then
      warn "No template found for $fw at $template, skipping"
      continue
    fi

    # Detect workspace path (heuristic)
    local workspace_path
    case "$fw" in
      python)
        if [[ -d "$PROJECT_ROOT/backend" ]]; then
          workspace_path="backend/"
        else
          workspace_path="(root or detect from pyproject.toml)"
        fi
        ;;
      nextjs|node)
        if [[ -d "$PROJECT_ROOT/frontend" ]]; then
          workspace_path="frontend/"
        elif [[ -d "$PROJECT_ROOT/web" ]]; then
          workspace_path="web/"
        else
          workspace_path="(root or detect from package.json)"
        fi
        ;;
      nestjs)
        if [[ -d "$PROJECT_ROOT/backend" ]]; then
          workspace_path="backend/"
        elif [[ -d "$PROJECT_ROOT/api" ]]; then
          workspace_path="api/"
        else
          workspace_path="(root)"
        fi
        ;;
    esac

    echo "## Workspace: $fw ($workspace_path)" >> "$output"
    echo "" >> "$output"

    # Inject workspace path into template
    sed "s|^# Claude Code Configuration|**Framework:** $(head -n1 "$template" | sed 's/# Claude Code Configuration — //')|" "$template" >> "$output"

    echo "" >> "$output"
    echo "---" >> "$output"
    echo "" >> "$output"
  done

  # Shared conventions footer
  cat >> "$output" <<'EOF'
## Shared Conventions (All Workspaces)

**Behavioral rules (always enforced):**
- Do what was asked — nothing more, nothing less
- NEVER create files unless necessary; prefer editing existing ones
- NEVER create docs/*.md/README files unless explicitly requested
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env* files

**TDD workflow (mandatory):**
1. Failing test first
2. Minimum implementation to pass
3. Refactor with tests green

**Cross-workspace coordination:**
- If you change API contracts, notify affected agents via memory MCP
- If you modify shared types/schemas, run all workspace tests
- If unclear which workspace to modify, ask the architect agent
EOF

  log "Generated $output"
}

# ---------- Merge pre-commit configs ----------
merge_precommit_configs() {
  local frameworks=("$@")
  local output="$PROJECT_ROOT/.pre-commit-config.yaml"

  if [[ -f "$output" ]]; then
    log "Existing .pre-commit-config.yaml preserved"
    return
  fi

  log "Generating merged pre-commit config for: ${frameworks[*]}"

  cat > "$output" <<'EOF'
# Merged pre-commit configuration for monorepo
# Generated by adopt.sh --frameworks

repos:
EOF

  local has_python=0
  local has_node=0

  for fw in "${frameworks[@]}"; do
    case "$fw" in
      python|nestjs) has_python=1 ;;
      node|nextjs) has_node=1 ;;
    esac
  done

  # Detect workspace paths for path filters
  local backend_path="backend/"
  local frontend_path="frontend/"

  [[ ! -d "$PROJECT_ROOT/backend" ]] && backend_path=""
  [[ ! -d "$PROJECT_ROOT/frontend" ]] && frontend_path=""

  # Python hooks
  if [[ $has_python -eq 1 ]]; then
    local files_filter=""
    [[ -n "$backend_path" ]] && files_filter="^$backend_path"

    cat >> "$output" <<EOF
  # Python hooks${files_filter:+ (${backend_path}only)}
  - repo: https://github.com/psf/black
    rev: 24.4.0
    hooks:
      - id: black
${files_filter:+        files: $files_filter}

  - repo: https://github.com/PyCQA/flake8
    rev: 7.0.0
    hooks:
      - id: flake8
${files_filter:+        files: $files_filter}

  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks:
      - id: isort
${files_filter:+        files: $files_filter}

EOF
  fi

  # Node hooks
  if [[ $has_node -eq 1 ]]; then
    local files_filter=""
    [[ -n "$frontend_path" ]] && files_filter="^$frontend_path"

    cat >> "$output" <<EOF
  # JavaScript/TypeScript hooks${files_filter:+ (${frontend_path}only)}
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
${files_filter:+        files: $files_filter}
        types: [file]
        types_or: [javascript, jsx, ts, tsx]

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
${files_filter:+        files: $files_filter}
        types_or: [javascript, jsx, ts, tsx, json, yaml, markdown]

EOF
  fi

  # Shared hooks (all workspaces)
  cat >> "$output" <<'EOF'
  # Shared hooks (all files)
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
EOF

  log "Generated $output"
}

# ---------- Main adoption flow (modified) ----------
adopt_monorepo() {
  local frameworks=("$@")

  log "Adopting blueprint for ${#frameworks[@]} framework(s): ${frameworks[*]}"

  # Existing adoption logic...
  # (copy agents, commands, skills, settings.json, etc.)

  # NEW: Generate composite CLAUDE.md
  generate_claude_md "${frameworks[@]}"

  # NEW: Merge pre-commit configs
  merge_precommit_configs "${frameworks[@]}"

  # Update marker file with frameworks array
  jq -n \
    --argjson frameworks "$(printf '%s\n' "${frameworks[@]}" | jq -R . | jq -s .)" \
    --arg mode "$MODE" \
    --arg adopted_at "$(date -Iseconds)" \
    '{frameworks:$frameworks, mode:$mode, adopted_at:$adopted_at}' \
    > "$CLAUDE_DIR/.adopted-from-blueprint"

  log "Adoption complete. Frameworks: ${frameworks[*]}"
}

# ---------- Entry point ----------
if [[ ${#FRAMEWORKS[@]} -eq 0 ]]; then
  die "No frameworks specified. Use --framework, --frameworks, or --detect"
fi

adopt_monorepo "${FRAMEWORKS[@]}"
