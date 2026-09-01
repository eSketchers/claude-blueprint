#!/usr/bin/env bash
# claude-md.sh — CLAUDE.md smart-merge and composite-generation for
# scripts/adopt.sh's monorepo/single-framework adoption flow.
#
# Sourced by scripts/adopt.sh — NOT self-contained like detect-frameworks.sh.
# Expects the caller to have already defined:
#   Functions: log(), warn()
#   Globals:   DRY_RUN, SHOW_DIFF, PROJECT_ROOT, BLUEPRINT_RESOLVED,
#              MERGE_STRATEGY
#
# Usage:
#   source "$BLUEPRINT_DIR/scripts/lib/claude-md.sh"
#   generate_claude_md "${FRAMEWORKS[@]}"

set -u

# Merges a generated CLAUDE.md (source_file) into an existing one
# (target_file) according to `strategy` (merge|overwrite|backup-only).
# Always backs up the existing file first (unless it doesn't exist yet,
# which is a fresh copy, not a merge).
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

# Builds the CLAUDE.md that would be adopted for the given framework list —
# a single framework's template directly, or a composite for a monorepo —
# then hands it to smart_merge_claude_md() against the project's real
# CLAUDE.md (in $PROJECT_ROOT).
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
