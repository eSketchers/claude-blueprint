#!/usr/bin/env bash
# adopt.sh — adopt the agency blueprint into an existing repo, locally.
#
# See docs/LOCAL-ADOPTION.md for developer-facing usage.
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
DRY_RUN=0
ACTION="adopt"   # adopt | uninstall | doctor
QUIET=0

usage() {
  cat <<'USAGE'
Usage: adopt.sh [framework options] [other options]

Framework options (one required):
  --framework F       Single framework (legacy). F = python|node|nextjs|nestjs
  --frameworks F1,F2  Multiple frameworks (comma-separated). For monorepos.
  --detect            Auto-detect all frameworks in the repo.

Other options:
  --profile P         'backend' merges a stricter deny-list. Default for python/nestjs.
  --force             Overwrite existing .claude/. Moves it to .claude.bak-<ts>/.
  --no-precommit      Skip `pre-commit install`.
  --dry-run           Print every op, change nothing.
  --uninstall         Remove everything adopt created, restore .gitignore.
  --doctor [--quiet]  Health-check: validate marker and symlinks.
  -h, --help          This help.

Examples:
  adopt.sh --framework python                    # Single framework (legacy)
  adopt.sh --frameworks "python,nextjs"          # Monorepo (Django + Next.js)
  adopt.sh --detect                              # Auto-detect all frameworks
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
    --dry-run)     DRY_RUN=1; shift ;;
    --uninstall)   ACTION="uninstall"; shift ;;
    --doctor)      ACTION="doctor"; shift ;;
    --quiet)       QUIET=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             die "Unknown flag: $1" ;;
  esac
done

# ---------- Resolve mode + blueprint dir ----------
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_BLUEPRINT="$(cd "$SCRIPT_PATH/.." && pwd)"

# Project root = first git dir walking up from $PWD
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$PROJECT_ROOT" ]] || die "Not inside a git repo. Run 'git init' first or cd into the target project."

MODE=""
if [[ "$SCRIPT_PATH" == "$PROJECT_ROOT/.agency/scripts" ]]; then
  MODE="nested"
  BLUEPRINT_RESOLVED="$PROJECT_ROOT/.agency"
elif [[ -n "${BLUEPRINT_DIR:-}" && -d "$BLUEPRINT_DIR/.claude" ]]; then
  MODE="sibling"
  BLUEPRINT_RESOLVED="$(cd "$BLUEPRINT_DIR" && pwd)"
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

# ---------- Composite CLAUDE.md generator ----------
generate_claude_md() {
  local frameworks=("$@")
  local output="$PROJECT_ROOT/CLAUDE.md"

  if [[ -f "$output" ]]; then
    log "Existing CLAUDE.md preserved. Template would be for: ${frameworks[*]}"
    return
  fi

  log "Generating CLAUDE.md for ${#frameworks[@]} framework(s)"

  if [[ ${#frameworks[@]} -eq 1 ]]; then
    # Single framework - use template directly
    local template="$BLUEPRINT_RESOLVED/templates/CLAUDE.md.${frameworks[0]}"
    if [[ -f "$template" ]]; then
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  DRY: cp %s %s\n' "$template" "$output"
      else
        cp "$template" "$output"
      fi
    else
      warn "No template found for ${frameworks[0]}"
    fi
  else
    # Multiple frameworks - generate composite
    if [[ $DRY_RUN -eq 1 ]]; then
      printf '  DRY: Generate composite CLAUDE.md for: %s\n' "${frameworks[*]}"
      return
    fi

    cat > "$output" <<'EOF'
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

      echo "## Workspace: $fw${workspace_path:+ ($workspace_path)}" >> "$output"
      echo "" >> "$output"

      # Inject framework name from first line of template
      local framework_name
      framework_name="$(head -n1 "$template" | sed 's/# Claude Code Configuration — //')"
      echo "**Framework:** $framework_name" >> "$output"
      echo "" >> "$output"

      # Append template content (skip first line)
      tail -n +2 "$template" >> "$output"

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
  fi
}

# ---------- Merged pre-commit config generator ----------
generate_precommit_config() {
  local frameworks=("$@")
  local output="$PROJECT_ROOT/.pre-commit-config.yaml"

  if [[ -f "$output" ]]; then
    log "Existing .pre-commit-config.yaml preserved"
    return
  fi

  if [[ ${#frameworks[@]} -eq 1 ]]; then
    # Single framework - use existing logic
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

  # Multiple frameworks - generate merged config
  log "Generating merged pre-commit config for ${#frameworks[@]} framework(s)"

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  DRY: Generate merged .pre-commit-config.yaml\n'
    return
  fi

  local has_python=0
  local has_node=0

  for fw in "${frameworks[@]}"; do
    case "$fw" in
      python|nestjs) has_python=1 ;;
      node|nextjs) has_node=1 ;;
    esac
  done

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

    log "Adoption complete."
    log "  Gitignored: .claude/$([[ $MODE == nested ]] && echo ', .agency/')"
    log "  Written to working tree (review, then commit yourself): CLAUDE.md, .pre-commit-config.yaml, .gitignore"
    log ""
    log "Next: run 'claude' in this project."
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
