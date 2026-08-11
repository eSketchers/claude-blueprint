#!/usr/bin/env bash
# adopt.sh — adopt the agency blueprint into an existing repo, locally.
#
# See docs/SETUP.md for developer-facing usage.
# See docs/superpowers/specs/2026-04-21-local-only-adoption-design.md for design.
#
# Two layouts (auto-detected):
#   sibling — $BLUEPRINT_DIR set, blueprint lives outside the project (absolute symlinks)
#   nested  — script lives under <project>/.agency/scripts/ (relative symlinks)

set -euo pipefail

# ---------- Utilities ----------
log()  { printf '\033[1;34m[adopt]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- Parse flags ----------
FRAMEWORK=""
FRAMEWORKS=()
DETECT=0
PROFILE=""
FORCE=0
NO_PRECOMMIT=0
NO_GRAPHIFY_HOOK=0
NO_DOCS_UPDATER=0
DRY_RUN=0
ACTION="adopt"   # adopt | uninstall | doctor
QUIET=0
MERGE_STRATEGY="merge"  # merge | overwrite | backup-only
PRECOMMIT_TEMPLATE=""   # "" (auto-detect, default) | python | node | merged
SHOW_DIFF=0

usage() {
  cat <<'USAGE'
Usage: adopt.sh [framework options] [other options]

Framework options (one required):
  --framework F       Single framework (legacy). F = python|node|nextjs|nestjs
  --frameworks F1,F2  Multiple frameworks (comma-separated). For monorepos.
  --detect            Auto-detect all frameworks in the repo.

Other options:
  --profile P             'backend' merges a stricter deny-list. Default for python/nestjs.
  --force                 Overwrite existing .claude/. Moves it to .claude.bak-<ts>/.
  --no-precommit          Skip `pre-commit install`.
  --precommit-template T  Override auto-selected pre-commit config. T = python|node|merged.
                          Default: auto-detected from framework(s) (single -> python/node,
                          2+ mixed -> merged). Use this to force a template that doesn't
                          match detection, e.g. a Python-only repo that also wants Node linters.
  --no-graphify-hook      Skip installing graphify's post-commit/post-checkout git hooks
                          (incremental, no-LLM knowledge-graph rebuild after each commit).
  --no-docs-updater       Skip provisioning the auto-docs updater (docs-sync config,
                          update-docs workflow + scripts, local post-merge hook).
  --merge-strategy S      How to handle existing CLAUDE.md: merge|overwrite|backup-only (default: merge).
  --dry-run               Print every op, change nothing.
  --diff                  With --dry-run: show a real diff for files that would be modified
                          (CLAUDE.md, .gitignore, .pre-commit-config.yaml), not just "would create/modify".
  --uninstall             Remove everything adopt created, restore .gitignore.
  --doctor [--quiet]      Health-check: validate marker and symlinks.
  -h, --help              This help.

Examples:
  adopt.sh --framework python                    # Single framework (legacy)
  adopt.sh --frameworks "python,nextjs"          # Monorepo (Django + Next.js)
  adopt.sh --detect                              # Auto-detect all frameworks
  adopt.sh --dry-run --diff                      # Preview exactly what would change
  adopt.sh --framework python --precommit-template merged  # Force merged config
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --framework)
      FRAMEWORK="${2:?}"
      FRAMEWORKS=("$FRAMEWORK")
      shift 2
      ;;
    --frameworks)
      IFS=',' read -ra FRAMEWORKS <<< "${2:?}"
      shift 2
      ;;
    --detect)
      DETECT=1
      shift
      ;;
    --profile)     PROFILE="${2:?}"; shift 2 ;;
    --force)       FORCE=1; shift ;;
    --no-precommit) NO_PRECOMMIT=1; shift ;;
    --no-graphify-hook) NO_GRAPHIFY_HOOK=1; shift ;;
    --no-docs-updater) NO_DOCS_UPDATER=1; shift ;;
    --precommit-template)
      PRECOMMIT_TEMPLATE="${2:?}"
      [[ "$PRECOMMIT_TEMPLATE" =~ ^(python|node|merged)$ ]] || die "Invalid --precommit-template: $PRECOMMIT_TEMPLATE (must be python|node|merged)"
      shift 2
      ;;
    --merge-strategy)
      MERGE_STRATEGY="${2:?}"
      [[ "$MERGE_STRATEGY" =~ ^(merge|overwrite|backup-only)$ ]] || die "Invalid --merge-strategy: $MERGE_STRATEGY (must be merge|overwrite|backup-only)"
      shift 2
      ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --diff)        SHOW_DIFF=1; shift ;;
    --uninstall)   ACTION="uninstall"; shift ;;
    --doctor)      ACTION="doctor"; shift ;;
    --quiet)       QUIET=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             die "Unknown flag: $1" ;;
  esac
done

# ---------- Resolve mode + blueprint dir ----------
# Use `pwd -P` (physical path, symlinks resolved) rather than plain `pwd`
# (logical path, as-typed) so this matches PROJECT_ROOT below. `git
# rev-parse --show-toplevel` always canonicalizes through symlinks — on
# macOS, the OS temp dir (and other paths) are commonly reached through a
# symlink (e.g. /var -> /private/var), so a logical-vs-physical mismatch
# here would make "$SCRIPT_PATH" == "$PROJECT_ROOT/.agency/scripts" silently
# fail to match even when the nested layout is exactly correct.
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_BLUEPRINT="$(cd "$SCRIPT_PATH/.." && pwd -P)"

# Project root = first git dir walking up from $PWD
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$PROJECT_ROOT" ]] || die "Not inside a git repo. Run 'git init' first or cd into the target project."
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd -P)"

MODE=""
if [[ "$SCRIPT_PATH" == "$PROJECT_ROOT/.agency/scripts" ]]; then
  MODE="nested"
  BLUEPRINT_RESOLVED="$PROJECT_ROOT/.agency"
elif [[ -n "${BLUEPRINT_DIR:-}" && -d "$BLUEPRINT_DIR/.claude" ]]; then
  MODE="sibling"
  BLUEPRINT_RESOLVED="$(cd "$BLUEPRINT_DIR" && pwd -P)"
  [[ "$BLUEPRINT_RESOLVED" == "$PROJECT_ROOT"* ]] && die "BLUEPRINT_DIR points inside the target project ($PROJECT_ROOT). Clone it to a sibling directory, or use nested mode."
else
  cat >&2 <<EOF
[error] Cannot resolve blueprint location. Pick one:

  Sibling layout:
    export BLUEPRINT_DIR=/path/to/claude-agency-blueprint
    "\$BLUEPRINT_DIR/scripts/adopt.sh" --framework <fw>

  Nested layout:
    git clone --recurse-submodules <blueprint-url> .agency
    ./.agency/scripts/adopt.sh --framework <fw>
EOF
  exit 1
fi

log "Mode: $MODE"
log "Blueprint: $BLUEPRINT_RESOLVED"
log "Project:   $PROJECT_ROOT"

# ---------- Framework detection ----------
detect_frameworks() {
  local project_root="$1"
  local detected=()

  # Helper to check if already detected
  has_framework() {
    local fw="$1"
    local f
    for f in "${detected[@]+"${detected[@]}"}"; do
      [[ "$f" == "$fw" ]] && return 0
    done
    return 1
  }

  # Check root for Python
  if [[ -f "$project_root/pyproject.toml" ]] || \
     [[ -f "$project_root/requirements.txt" ]] || \
     [[ -f "$project_root/setup.py" ]]; then
    detected+=("python")
  fi

  # Check root for Node/Next.js
  if [[ -f "$project_root/package.json" ]]; then
    if grep -q '"next"' "$project_root/package.json" 2>/dev/null; then
      detected+=("nextjs")
    elif grep -q '"@nestjs/core"' "$project_root/package.json" 2>/dev/null; then
      detected+=("nestjs")
    else
      detected+=("node")
    fi
  fi

  # Scan subdirectories (backend/, frontend/, api/, web/, mobile/, etc.)
  for subdir in backend frontend api web mobile apps services; do
    local dir="$project_root/$subdir"
    [[ -d "$dir" ]] || continue

    # Python in subdirectory
    if [[ -f "$dir/pyproject.toml" ]] || [[ -f "$dir/requirements.txt" ]] || [[ -f "$dir/manage.py" ]]; then
      has_framework "python" || detected+=("python")
    fi

    # Node/Next.js/NestJS in subdirectory
    if [[ -f "$dir/package.json" ]]; then
      if grep -q '"next"' "$dir/package.json" 2>/dev/null; then
        has_framework "nextjs" || detected+=("nextjs")
      elif grep -q '"@nestjs/core"' "$dir/package.json" 2>/dev/null; then
        has_framework "nestjs" || detected+=("nestjs")
      else
        has_framework "node" || detected+=("node")
      fi
    fi
  done

  # Print detected frameworks (handle empty array safely)
  if [[ ${#detected[@]} -gt 0 ]]; then
    printf '%s\n' "${detected[@]}"
  fi
}

# Framework selection/validation only matters for the `adopt` action.
# `--uninstall` and `--doctor` operate purely on $PROJECT_ROOT/.claude/ and
# never reference $FRAMEWORK/$FRAMEWORKS/$PROFILE — requiring a framework
# flag for them was a bug: `adopt.sh --uninstall` (exactly as documented in
# --help) used to die with "No frameworks specified" before ever reaching
# uninstall's own logic.
if [[ "$ACTION" == "adopt" ]]; then
  # Auto-detect if requested
  if [[ $DETECT -eq 1 ]]; then
    # Use read loop instead of mapfile for broader shell compatibility
    FRAMEWORKS=()
    while IFS= read -r fw; do
      [[ -n "$fw" ]] && FRAMEWORKS+=("$fw")
    done < <(detect_frameworks "$PROJECT_ROOT")

    if [[ ${#FRAMEWORKS[@]} -eq 0 ]]; then
      die "Auto-detection found no frameworks. Use --framework or --frameworks to specify manually."
    fi
    log "Auto-detected ${#FRAMEWORKS[@]} framework(s): ${FRAMEWORKS[*]}"
  fi

  # Ensure at least one framework specified
  if [[ ${#FRAMEWORKS[@]} -eq 0 ]]; then
    die "No frameworks specified. Use --framework, --frameworks, or --detect."
  fi

  # Validate all frameworks
  for fw in "${FRAMEWORKS[@]}"; do
    case "$fw" in
      python|node|nextjs|nestjs) ;;
      *) die "Unknown framework: $fw" ;;
    esac
  done

  # Set FRAMEWORK for backward compatibility (single framework case)
  if [[ ${#FRAMEWORKS[@]} -eq 1 ]]; then
    FRAMEWORK="${FRAMEWORKS[0]}"
  fi

  # ---------- Default profile ----------
  if [[ -z "$PROFILE" ]]; then
    # If any framework is python or nestjs, default to backend profile
    for fw in "${FRAMEWORKS[@]}"; do
      if [[ "$fw" == "python" || "$fw" == "nestjs" ]]; then
        PROFILE="backend"
        break
      fi
    done
  fi
fi

# ---------- Smart CLAUDE.md merge ----------
smart_merge_claude_md() {
  local target_file="$1"
  local source_file="$2"
  local strategy="${3:-merge}"

  # If target doesn't exist, this is a create, not a modification — --diff
  # only applies to files that already exist and would change (see the doc's
  # "Would create:" vs "Would modify:" distinction).
  if [[ ! -f "$target_file" ]]; then
    log "No existing CLAUDE.md — copying fresh"
    if [[ $DRY_RUN -eq 1 ]]; then
      printf '  DRY: cp %s %s\n' "$source_file" "$target_file"
    else
      cp "$source_file" "$target_file"
    fi
    return
  fi

  # Create timestamped backup
  local timestamp
  timestamp="$(date +%Y-%m-%d-%H%M%S)"
  local backup_file="${target_file}.backup-${timestamp}"

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  DRY: cp %s %s\n' "$target_file" "$backup_file"
  else
    cp "$target_file" "$backup_file"
    log "Created backup: $(basename "$backup_file")"
  fi

  # Handle strategy
  case "$strategy" in
    backup-only)
      log "Strategy: backup-only — CLAUDE.md unchanged"
      return
      ;;
    overwrite)
      log "Strategy: overwrite — replacing entire CLAUDE.md"
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  DRY: cp %s %s (overwrite)\n' "$source_file" "$target_file"
        if [[ $SHOW_DIFF -eq 1 ]]; then
          diff -u "$target_file" "$source_file" | sed 's/^/    /' || true
        fi
      else
        cp "$source_file" "$target_file"
      fi
      return
      ;;
    merge)
      # Check if target has markers
      if ! grep -q "<!-- BEGIN BLUEPRINT -->" "$target_file" || \
         ! grep -q "<!-- END BLUEPRINT -->" "$target_file"; then
        warn "Existing CLAUDE.md has no blueprint markers — treating as overwrite"
        if [[ $DRY_RUN -eq 1 ]]; then
          printf '  DRY: cp %s %s (no markers, overwrite)\n' "$source_file" "$target_file"
          if [[ $SHOW_DIFF -eq 1 ]]; then
            diff -u "$target_file" "$source_file" | sed 's/^/    /' || true
          fi
        else
          cp "$source_file" "$target_file"
        fi
        return
      fi

      log "Strategy: merge — preserving user sections, updating blueprint sections"

      # Always compute the merge result into a temp file — even in dry-run —
      # so --diff can show the real result instead of just "would merge".
      local tmp_merged
      tmp_merged="$(mktemp)"
      local tmp_before
      tmp_before="$(mktemp)"
      local tmp_after
      tmp_after="$(mktemp)"
      local tmp_blueprint
      tmp_blueprint="$(mktemp)"

      # Extract content before first marker from target
      sed -n '1,/<!-- BEGIN BLUEPRINT -->/p' "$target_file" | sed '$d' > "$tmp_before"

      # Extract content after last marker from target
      sed -n '/<!-- END BLUEPRINT -->/,$p' "$target_file" | sed '1d' > "$tmp_after"

      # Extract blueprint section from source (everything between markers, including markers)
      sed -n '/<!-- BEGIN BLUEPRINT -->/,/<!-- END BLUEPRINT -->/p' "$source_file" > "$tmp_blueprint"

      # Assemble merged file
      cat "$tmp_before" > "$tmp_merged"
      [[ -s "$tmp_before" ]] && echo "" >> "$tmp_merged"  # Add blank line if before section exists
      cat "$tmp_blueprint" >> "$tmp_merged"
      [[ -s "$tmp_after" ]] && echo "" >> "$tmp_merged"  # Add blank line if after section exists
      cat "$tmp_after" >> "$tmp_merged"

      rm -f "$tmp_before" "$tmp_after" "$tmp_blueprint"

      if [[ $DRY_RUN -eq 1 ]]; then
        if [[ $SHOW_DIFF -eq 1 ]]; then
          printf '  DRY: Merge blueprint sections into %s\n' "$target_file"
          diff -u "$target_file" "$tmp_merged" | sed 's/^/    /' || true
        else
          printf '  DRY: Merge blueprint sections into %s\n' "$target_file"
        fi
        rm -f "$tmp_merged"
        return
      fi

      # Replace target with merged content
      mv "$tmp_merged" "$target_file"

      log "Merged blueprint sections into CLAUDE.md"
      ;;
  esac
}

# ---------- Composite CLAUDE.md generator ----------
generate_claude_md() {
  local frameworks=("$@")
  local output="$PROJECT_ROOT/CLAUDE.md"

  log "Generating CLAUDE.md for ${#frameworks[@]} framework(s)"

  # Generate temporary source file
  local tmp_source
  tmp_source="$(mktemp)"

  if [[ ${#frameworks[@]} -eq 1 ]]; then
    # Single framework - use template directly
    local template="$BLUEPRINT_RESOLVED/templates/CLAUDE.md.${frameworks[0]}"
    if [[ -f "$template" ]]; then
      cp "$template" "$tmp_source"
    else
      warn "No template found for ${frameworks[0]}"
      rm -f "$tmp_source"
      return
    fi
  else
    # Multiple frameworks - generate composite
    if [[ $DRY_RUN -eq 1 ]]; then
      printf '  DRY: Generate composite CLAUDE.md for: %s\n' "${frameworks[*]}"
      rm -f "$tmp_source"
      return
    fi

    cat > "$tmp_source" <<'EOF'
# Claude Code Configuration — Monorepo

## Workspace Detection

This monorepo contains multiple frameworks. Before working on any ticket:

1. **Identify affected workspace(s)** from ticket labels/description
2. **Read workspace-specific conventions** below
3. **Use workspace-appropriate tooling** (package manager, test runner, linter)
4. **Run tests scoped to changed workspace(s)** only
5. **Coordinate with other agents** for cross-workspace changes

---

EOF

    # Append each framework section
    for fw in "${frameworks[@]}"; do
      local template="$BLUEPRINT_RESOLVED/templates/CLAUDE.md.$fw"

      if [[ ! -f "$template" ]]; then
        warn "No template found for $fw at $template, skipping"
        continue
      fi

      # Detect likely workspace path
      local workspace_path=""
      case "$fw" in
        python)
          [[ -d "$PROJECT_ROOT/backend" ]] && workspace_path="backend/"
          [[ -z "$workspace_path" && -d "$PROJECT_ROOT/api" ]] && workspace_path="api/"
          ;;
        nextjs|node)
          [[ -d "$PROJECT_ROOT/frontend" ]] && workspace_path="frontend/"
          [[ -z "$workspace_path" && -d "$PROJECT_ROOT/web" ]] && workspace_path="web/"
          ;;
        nestjs)
          [[ -d "$PROJECT_ROOT/backend" ]] && workspace_path="backend/"
          [[ -z "$workspace_path" && -d "$PROJECT_ROOT/api" ]] && workspace_path="api/"
          ;;
      esac

      echo "## Workspace: $fw${workspace_path:+ ($workspace_path)}" >> "$tmp_source"
      echo "" >> "$tmp_source"

      # Inject framework name from first line of template
      local framework_name
      framework_name="$(head -n1 "$template" | sed 's/# Claude Code Configuration — //')"
      echo "**Framework:** $framework_name" >> "$tmp_source"
      echo "" >> "$tmp_source"

      # Append template content (skip first line)
      tail -n +2 "$template" >> "$tmp_source"

      echo "" >> "$tmp_source"
      echo "---" >> "$tmp_source"
      echo "" >> "$tmp_source"
    done

    # Shared conventions footer
    cat >> "$tmp_source" <<'EOF'
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
  fi

  # Apply smart merge strategy
  smart_merge_claude_md "$output" "$tmp_source" "$MERGE_STRATEGY"

  # Cleanup temp file
  rm -f "$tmp_source"
}

# ---------- Merged pre-commit config generator ----------
generate_precommit_config() {
  local frameworks=("$@")
  local output="$PROJECT_ROOT/.pre-commit-config.yaml"

  if [[ -f "$output" ]]; then
    log "Existing .pre-commit-config.yaml preserved"
    return
  fi

  # --precommit-template overrides auto-detection entirely. Warn (don't fail)
  # if the override doesn't match any detected framework — the user may
  # deliberately want e.g. Node linters in a Python-only repo.
  if [[ -n "$PRECOMMIT_TEMPLATE" ]]; then
    local template_matches=0
    for fw in "${frameworks[@]}"; do
      case "$PRECOMMIT_TEMPLATE:$fw" in
        python:python|python:nestjs|node:node|node:nextjs|node:nestjs) template_matches=1 ;;
        merged:*) template_matches=1 ;;
      esac
    done
    [[ $template_matches -eq 1 ]] || warn "--precommit-template $PRECOMMIT_TEMPLATE does not match detected framework(s) (${frameworks[*]}) — using it anyway since it was explicitly requested."

    if [[ "$PRECOMMIT_TEMPLATE" == "python" || "$PRECOMMIT_TEMPLATE" == "node" ]]; then
      local PC_SRC="$BLUEPRINT_RESOLVED/pre-commit/.pre-commit-config.${PRECOMMIT_TEMPLATE}.yaml"
      if [[ -f "$PC_SRC" ]]; then
        if [[ $DRY_RUN -eq 1 ]]; then
          printf '  DRY: cp %s %s (forced by --precommit-template)\n' "$PC_SRC" "$output"
        else
          cp "$PC_SRC" "$output"
        fi
      else
        die "Template not found: $PC_SRC"
      fi
      return
    fi
    # PRECOMMIT_TEMPLATE == "merged" falls through to the merge generator below,
    # forcing both has_python and has_node on regardless of detected frameworks.
  elif [[ ${#frameworks[@]} -eq 1 ]]; then
    # No override, single framework - use existing logic
    local PC_SRC=""
    case "${frameworks[0]}" in
      python) PC_SRC="$BLUEPRINT_RESOLVED/pre-commit/.pre-commit-config.python.yaml" ;;
      node|nextjs|nestjs) PC_SRC="$BLUEPRINT_RESOLVED/pre-commit/.pre-commit-config.node.yaml" ;;
    esac
    if [[ -n "$PC_SRC" && -f "$PC_SRC" ]]; then
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  DRY: cp %s %s\n' "$PC_SRC" "$output"
      else
        cp "$PC_SRC" "$output"
      fi
    fi
    return
  fi

  # Multiple frameworks (or --precommit-template merged) - generate merged config
  log "Generating merged pre-commit config${PRECOMMIT_TEMPLATE:+ (forced by --precommit-template merged)}"

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  DRY: Generate merged .pre-commit-config.yaml\n'
    return
  fi

  local has_python=0
  local has_node=0

  if [[ "$PRECOMMIT_TEMPLATE" == "merged" ]]; then
    has_python=1
    has_node=1
  else
    for fw in "${frameworks[@]}"; do
      case "$fw" in
        python|nestjs) has_python=1 ;;
        node|nextjs) has_node=1 ;;
      esac
    done
  fi

  # Detect workspace paths for filters
  local backend_path=""
  local frontend_path=""

  [[ -d "$PROJECT_ROOT/backend" ]] && backend_path="backend/"
  [[ -d "$PROJECT_ROOT/api" ]] && backend_path="${backend_path:-api/}"
  [[ -d "$PROJECT_ROOT/frontend" ]] && frontend_path="frontend/"
  [[ -d "$PROJECT_ROOT/web" ]] && frontend_path="${frontend_path:-web/}"

  cat > "$output" <<'YAML'
# Merged pre-commit configuration for monorepo
# Generated by adopt.sh
repos:
YAML

  # Python hooks
  if [[ $has_python -eq 1 ]]; then
    cat >> "$output" <<YAML
  # Python hooks${backend_path:+ (${backend_path} only)}
  - repo: https://github.com/psf/black
    rev: 24.4.0
    hooks:
      - id: black
${backend_path:+        files: ^${backend_path}}

  - repo: https://github.com/PyCQA/flake8
    rev: 7.0.0
    hooks:
      - id: flake8
${backend_path:+        files: ^${backend_path}}

  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks:
      - id: isort
${backend_path:+        files: ^${backend_path}}

YAML
  fi

  # Node hooks
  if [[ $has_node -eq 1 ]]; then
    cat >> "$output" <<YAML
  # JavaScript/TypeScript hooks${frontend_path:+ (${frontend_path} only)}
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
${frontend_path:+        files: ^${frontend_path}}
        types: [file]
        types_or: [javascript, jsx, ts, tsx]

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
${frontend_path:+        files: ^${frontend_path}}
        types_or: [javascript, jsx, ts, tsx, json, yaml, markdown]

YAML
  fi

  # Shared hooks
  cat >> "$output" <<'YAML'
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
YAML
}

# ---------- Dispatch ----------
case "$ACTION" in
  adopt)
    # Frameworks already validated above
    log "Adopting for ${#FRAMEWORKS[@]} framework(s): ${FRAMEWORKS[*]}"

    # Preflight: working tree clean (unless --force)
    if [[ $FORCE -eq 0 ]]; then
      if ! git -C "$PROJECT_ROOT" diff --quiet || ! git -C "$PROJECT_ROOT" diff --cached --quiet; then
        die "Working tree is dirty. Commit or stash first, or pass --force."
      fi
    fi

    # Blueprint submodules must be initialized
    if [[ ! -d "$BLUEPRINT_RESOLVED/vendor/superpowers/skills" ]]; then
      log "Initializing blueprint submodules..."
      git -C "$BLUEPRINT_RESOLVED" submodule update --init --recursive
    fi

    # Existing .claude/ protection
    CLAUDE_DIR="$PROJECT_ROOT/.claude"
    if [[ -e "$CLAUDE_DIR" ]]; then
      if [[ -f "$CLAUDE_DIR/.adopted-from-blueprint" ]]; then
        log "Found prior adoption — refreshing."
      elif [[ $FORCE -eq 1 ]]; then
        ts="$(date +%Y%m%d-%H%M%S)"
        log "Existing .claude/ backed up to .claude.bak-$ts/"
        mv "$CLAUDE_DIR" "$PROJECT_ROOT/.claude.bak-$ts"
      else
        die ".claude/ exists and was not created by adopt. Re-run with --force to back it up and proceed."
      fi
    fi

    # --- Source helper ---
    # shellcheck source=scripts/lib/symlinks.sh
    source "$BLUEPRINT_RESOLVED/scripts/lib/symlinks.sh"

    # --- Layout ---
    [[ $DRY_RUN -eq 1 ]] && log "DRY RUN — no changes will be written"

    run() { if [[ $DRY_RUN -eq 1 ]]; then printf '  DRY: %s\n' "$*"; else eval "$@"; fi; }

    run "mkdir -p \"$CLAUDE_DIR/agents\" \"$CLAUDE_DIR/commands\" \"$CLAUDE_DIR/skills\" \"$CLAUDE_DIR/hooks\""

    # Copies
    for f in "$BLUEPRINT_RESOLVED"/.claude/agents/*.md; do
      [[ -f "$f" ]] || continue
      run "cp \"$f\" \"$CLAUDE_DIR/agents/$(basename "$f")\""
    done
    for f in "$BLUEPRINT_RESOLVED"/.claude/commands/*.md; do
      [[ -f "$f" ]] || continue
      run "cp \"$f\" \"$CLAUDE_DIR/commands/$(basename "$f")\""
    done
    for f in "$BLUEPRINT_RESOLVED"/.claude/hooks/*.sh; do
      [[ -f "$f" ]] || continue
      run "cp \"$f\" \"$CLAUDE_DIR/hooks/$(basename "$f")\""
      run "chmod +x \"$CLAUDE_DIR/hooks/$(basename "$f")\""
    done
    run "cp \"$BLUEPRINT_RESOLVED/.claude/settings.json\" \"$CLAUDE_DIR/settings.json\""

    # Profile merge
    if [[ "$PROFILE" == "backend" ]]; then
      command -v jq >/dev/null 2>&1 || die "jq required for --profile backend merge. Install jq or pass --profile none."
      FRAG="$BLUEPRINT_RESOLVED/scripts/lib/backend-deny.json"
      [[ -f "$FRAG" ]] || die "Missing deny fragment: $FRAG"
      if [[ $DRY_RUN -eq 0 ]]; then
        tmp_settings="$(mktemp)"
        jq --slurpfile frag "$FRAG" '
          .permissions.deny = ((.permissions.deny // []) + ($frag[0].deny // []) | unique)
        ' "$CLAUDE_DIR/settings.json" > "$tmp_settings"
        mv "$tmp_settings" "$CLAUDE_DIR/settings.json"
        rule_count="$(jq '.deny | length' "$FRAG")"
        log "Merged backend deny-list ($rule_count rules)."
      else
        printf '  DRY: jq-merge backend deny-list into settings.json\n'
      fi
    fi

    # Symlinks (mode-dependent)
    LINK=link_absolute
    [[ "$MODE" == "nested" ]] && LINK=link_relative

    SP="$BLUEPRINT_RESOLVED/vendor/superpowers"
    for skill_dir in "$SP"/skills/*/; do
      [[ -d "$skill_dir" ]] || continue
      sname="$(basename "$skill_dir")"
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  DRY: %s %s %s\n' "$LINK" "$skill_dir" "$CLAUDE_DIR/skills/$sname"
      else
        "$LINK" "${skill_dir%/}" "$CLAUDE_DIR/skills/$sname"
      fi
    done
    for cmd_file in "$SP"/commands/*.md; do
      [[ -f "$cmd_file" ]] || continue
      cname="$(basename "$cmd_file")"
      [[ -e "$CLAUDE_DIR/commands/$cname" ]] && continue   # don't clobber blueprint-owned commands
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  DRY: %s %s %s\n' "$LINK" "$cmd_file" "$CLAUDE_DIR/commands/$cname"
      else
        "$LINK" "$cmd_file" "$CLAUDE_DIR/commands/$cname"
      fi
    done
    if [[ -f "$SP/agents/code-reviewer.md" ]]; then
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  DRY: %s %s %s\n' "$LINK" "$SP/agents/code-reviewer.md" "$CLAUDE_DIR/agents/code-reviewer.md"
      else
        "$LINK" "$SP/agents/code-reviewer.md" "$CLAUDE_DIR/agents/code-reviewer.md"
      fi
    fi

    # Marker file — built via jq so path/sha/timestamp values are properly escaped JSON
    if [[ $DRY_RUN -eq 0 ]]; then
      command -v jq >/dev/null 2>&1 || die "jq required to write the adoption marker. Install jq first."
      sha="$(git -C "$BLUEPRINT_RESOLVED" rev-parse --short HEAD 2>/dev/null || echo unknown)"

      # Convert FRAMEWORKS array to JSON array
      frameworks_json="$(printf '%s\n' "${FRAMEWORKS[@]}" | jq -R . | jq -s .)"

      jq -n \
        --arg blueprint_sha "$sha" \
        --arg blueprint_dir "$BLUEPRINT_RESOLVED" \
        --arg mode          "$MODE" \
        --argjson frameworks "$frameworks_json" \
        --arg profile       "$PROFILE" \
        --arg adopted_at    "$(date -Iseconds)" \
        '{blueprint_sha:$blueprint_sha, blueprint_dir:$blueprint_dir, mode:$mode, frameworks:$frameworks, profile:$profile, adopted_at:$adopted_at}' \
        > "$CLAUDE_DIR/.adopted-from-blueprint"
    fi

    # CLAUDE.md — generate composite for monorepos or single for regular projects
    generate_claude_md "${FRAMEWORKS[@]}"

    # Gitignore append (idempotent)
    ensure_gitignore_line() {
      local line="$1"
      local gi="$PROJECT_ROOT/.gitignore"
      [[ -f "$gi" ]] || run "touch \"$gi\""
      if ! grep -qxF "$line" "$gi" 2>/dev/null; then
        run "printf '\n%s\n' \"$line\" >> \"$gi\""
      fi
    }
    ensure_gitignore_line "/.claude/"
    [[ "$MODE" == "nested" ]] && ensure_gitignore_line "/.agency/"

    # pre-commit — generate merged config for monorepos
    if [[ $NO_PRECOMMIT -eq 0 ]]; then
      generate_precommit_config "${FRAMEWORKS[@]}"

      # Install hooks
      if [[ $DRY_RUN -eq 0 ]] && command -v pre-commit >/dev/null 2>&1; then
        (cd "$PROJECT_ROOT" && pre-commit install >/dev/null 2>&1 || warn "pre-commit install failed")
      fi
    fi

    # graphify — install its own post-commit/post-checkout git hooks so the
    # knowledge graph rebuilds incrementally (AST-only, no LLM) after every
    # commit, instead of requiring a manual `./scripts/graphify-index.sh`.
    # `graphify hook install` is idempotent and appends to an existing hook
    # rather than clobbering it (see vendor/graphify/graphify/hooks.py).
    if [[ $NO_GRAPHIFY_HOOK -eq 0 ]]; then
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  DRY: graphify hook install\n'
      elif command -v graphify >/dev/null 2>&1; then
        ( cd "$PROJECT_ROOT" && graphify hook install >/dev/null 2>&1 ) || warn "graphify hook install failed (non-fatal — run 'graphify hook install' manually later)"
      else
        log "graphify not installed — skipping git hook install. Run './scripts/bootstrap.sh' first, or pass --no-graphify-hook to silence this."
      fi
    fi

    # auto-docs (docs-sync) — provision the pre-push documentation updater.
    # The /update-docs command is copied with the other commands above; here we add
    # the scripts, the per-project config, gitignore lines, and the pre-push hook
    # that generates docs WITH each push. No CI workflow needed.
    if [[ $NO_DOCS_UPDATER -eq 0 ]]; then
      run "mkdir -p \"$PROJECT_ROOT/scripts\" \"$PROJECT_ROOT/docs-sync\""
      for f in collect-doc-changes.mjs extract-symbols.mjs update-docs.sh; do
        [[ -f "$BLUEPRINT_RESOLVED/scripts/$f" ]] && run "cp \"$BLUEPRINT_RESOLVED/scripts/$f\" \"$PROJECT_ROOT/scripts/$f\""
      done
      [[ -f "$PROJECT_ROOT/scripts/update-docs.sh" ]] && run "chmod +x \"$PROJECT_ROOT/scripts/update-docs.sh\""
      # copy-if-absent; --force also refreshes an existing config (backs it up first)
      if [[ -f "$BLUEPRINT_RESOLVED/docs-sync/config.example.json" ]]; then
        if [[ ! -f "$PROJECT_ROOT/docs-sync/config.json" ]]; then
          run "cp \"$BLUEPRINT_RESOLVED/docs-sync/config.example.json\" \"$PROJECT_ROOT/docs-sync/config.json\""
          log "auto-docs: created docs-sync/config.json from example."
        elif [[ $FORCE -eq 1 && $DRY_RUN -eq 0 ]]; then
          _cfg_bak="$PROJECT_ROOT/docs-sync/config.json.backup-$(date +%Y-%m-%d-%H%M%S)"
          cp "$PROJECT_ROOT/docs-sync/config.json" "$_cfg_bak"
          cp "$BLUEPRINT_RESOLVED/docs-sync/config.example.json" "$PROJECT_ROOT/docs-sync/config.json"
          log "auto-docs: refreshed docs-sync/config.json (backup: $(basename "$_cfg_bak"))."
        fi
      fi
      # pre-push hook — install on first adoption; refresh on --force
      if [[ $DRY_RUN -eq 0 && -d "$PROJECT_ROOT/.git/hooks" && -f "$BLUEPRINT_RESOLVED/hooks/pre-push.sample" ]]; then
        if [[ ! -f "$PROJECT_ROOT/.git/hooks/pre-push" || $FORCE -eq 1 ]]; then
          cp "$BLUEPRINT_RESOLVED/hooks/pre-push.sample" "$PROJECT_ROOT/.git/hooks/pre-push" && chmod +x "$PROJECT_ROOT/.git/hooks/pre-push" || warn "pre-push hook install failed (non-fatal)"
        fi
      fi
      ensure_gitignore_line "docs-sync/config.json"
      ensure_gitignore_line "reports/"
      log "auto-docs: provisioned. Docs will be generated with each git push via the pre-push hook."
    fi

    # Self-test: one symlink must resolve
    if [[ $DRY_RUN -eq 0 ]]; then
      if [[ ! -e "$CLAUDE_DIR/skills/brainstorming/SKILL.md" ]]; then
        warn "Self-test failed: .claude/skills/brainstorming/SKILL.md does not resolve"
        die "Adoption self-test failed — .claude/ may be partially provisioned. Run --uninstall to roll back."
      fi
    fi

    # Install --doctor as a SessionStart hook (sibling mode only —
    # nested mode uses relative links, immune to blueprint moves)
    if [[ "$MODE" == "sibling" && $DRY_RUN -eq 0 ]]; then
      SETTINGS="$CLAUDE_DIR/settings.json"
      tmp_settings="$(mktemp)"
      jq --arg cmd "$BLUEPRINT_RESOLVED/scripts/adopt.sh --doctor --quiet" '
        .hooks.SessionStart += [ { "hooks": [ { "type": "command", "command": $cmd } ] } ]
      ' "$SETTINGS" > "$tmp_settings"
      mv "$tmp_settings" "$SETTINGS"
    fi

    if [[ $DRY_RUN -eq 1 ]]; then
      log "DRY RUN complete — nothing was written. Re-run without --dry-run to apply."
    else
      log "Adoption complete."
      log "  Gitignored: .claude/$([[ $MODE == nested ]] && echo ', .agency/')"
      log "  Written to working tree (review, then commit yourself): CLAUDE.md, .pre-commit-config.yaml, .gitignore"
      log ""
      log "Next: run 'claude' in this project."
    fi
    ;;
  uninstall)
    CLAUDE_DIR="$PROJECT_ROOT/.claude"
    if [[ -d "$CLAUDE_DIR" && -f "$CLAUDE_DIR/.adopted-from-blueprint" ]]; then
      log "Removing $CLAUDE_DIR"
      rm -rf "$CLAUDE_DIR"
    elif [[ -d "$CLAUDE_DIR" ]]; then
      die ".claude/ exists but has no adopt marker. Not touching it. Inspect manually."
    fi

    # List any .claude.bak-* directories that --force created; do NOT delete
    for bak in "$PROJECT_ROOT"/.claude.bak-*; do
      [[ -e "$bak" ]] || continue
      log "Leaving backup dir in place: $(basename "$bak")"
    done

    # Strip the two lines adopt appended to .gitignore
    GI="$PROJECT_ROOT/.gitignore"
    if [[ -f "$GI" ]]; then
      tmp_gi="$(mktemp)"
      grep -vxF -e "/.claude/" -e "/.agency/" "$GI" > "$tmp_gi" || true
      mv "$tmp_gi" "$GI"
      # An empty .gitignore is fine; user can delete it if they want.
    fi

    log "Uninstalled. .agency/ (if present) untouched — delete manually if desired."
    ;;
  doctor)
    CLAUDE_DIR="$PROJECT_ROOT/.claude"
    MARKER="$CLAUDE_DIR/.adopted-from-blueprint"
    [[ -f "$MARKER" ]] || { [[ $QUIET -eq 1 ]] || warn "No adopt marker in $CLAUDE_DIR"; exit 2; }

    # Walk symlinks under .claude/ and report dead ones
    DEAD=0
    while IFS= read -r link; do
      if [[ ! -e "$link" ]]; then
        [[ $QUIET -eq 1 ]] || warn "Dead symlink: $link"
        DEAD=$((DEAD+1))
      fi
    done < <(find "$CLAUDE_DIR" -type l 2>/dev/null)

    if [[ $DEAD -gt 0 ]]; then
      [[ $QUIET -eq 1 ]] || warn "$DEAD dead symlink(s). Re-run adopt.sh --force to repair."
      exit 1
    fi
    [[ $QUIET -eq 1 ]] || log "All $(find "$CLAUDE_DIR" -type l | wc -l) symlinks OK."
    ;;
esac
