#!/usr/bin/env bash
# detect-frameworks.sh — auto-detect which frameworks a project uses.
#
# Sourced by scripts/adopt.sh. Pure functions — no side effects, no
# references to adopt.sh's global state (PROJECT_ROOT, DRY_RUN, etc.);
# detect_frameworks() takes the project root as an explicit argument and
# prints detected framework names to stdout, one per line.
#
# Usage:
#   source "$BLUEPRINT_DIR/scripts/lib/detect-frameworks.sh"
#   while IFS= read -r fw; do ...; done < <(detect_frameworks "$PROJECT_ROOT")
#
# Note: `set -u` below applies to whatever shell sources this file, not just
# this file's own functions — a no-op when the caller (adopt.sh) already runs
# `set -euo pipefail`, but worth knowing if sourcing this elsewhere.

set -u

# Reads a workspace-manager's declared package glob patterns (npm/yarn/pnpm
# `workspaces` array in package.json, or lerna.json's `packages` array) and
# prints each one, one per line. Best-effort line-based parsing, not a real
# JSON/YAML parser — handles the common flat-array shape used by the vast
# majority of real repos, not every possible nesting (e.g. an object-shaped
# `{"workspaces":{"packages":[...]}}` in package.json is not handled).
read_workspace_globs_json() {
  local file="$1" field="$2"
  [[ -f "$file" ]] || return 0
  if ! command -v jq >/dev/null 2>&1; then
    printf '[warn] jq not found; cannot read the "%s" field from %s — workspace-glob detection may be incomplete\n' "$field" "$file" >&2
    return 0
  fi
  jq -r --arg f "$field" '(.[$f] // []) | if type == "array" then .[] else empty end' "$file" 2>/dev/null
}

# pnpm-workspace.yaml's `packages:` field — a flat YAML list, one glob per
# line. No real YAML parser dependency; reads lines under the `packages:`
# key until the next top-level (non-indented) key or end of file.
read_pnpm_workspace_globs() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  awk '
    /^packages:/ { in_packages=1; next }
    in_packages && /^[a-zA-Z]/ { in_packages=0 }
    in_packages && /^[[:space:]]*-[[:space:]]*/ {
      line=$0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/[\x27\"]/, "", line)
      print line
    }
  ' "$file"
}

detect_frameworks() {
  local project_root="$1"
  local detected=()

  # Helper to check if already detected. Prefixed (_df_ = detect-frameworks)
  # since bash has no local-function scope — an unprefixed name would leak
  # into whatever shell sources this file, risking collision with a
  # same-named function the caller (or another sourced lib) defines.
  _df_has_framework() {
    local fw="$1"
    local f
    for f in "${detected[@]+"${detected[@]}"}"; do
      [[ "$f" == "$fw" ]] && return 0
    done
    return 1
  }

  # Checks a single directory for framework marker files and records any
  # match (deduplicated). Shared by the root check, the hardcoded-subdir
  # scan, and the workspace-glob-resolved directory scan below, so the
  # detection rules only live in one place.
  _df_scan_dir_for_framework() {
    local dir="$1"

    if [[ -f "$dir/pyproject.toml" ]] || [[ -f "$dir/requirements.txt" ]] || [[ -f "$dir/setup.py" ]] || [[ -f "$dir/manage.py" ]]; then
      _df_has_framework "python" || detected+=("python")
    fi

    if [[ -f "$dir/package.json" ]]; then
      if grep -q '"next"' "$dir/package.json" 2>/dev/null; then
        _df_has_framework "nextjs" || detected+=("nextjs")
      elif grep -q '"@nestjs/core"' "$dir/package.json" 2>/dev/null; then
        _df_has_framework "nestjs" || detected+=("nestjs")
      else
        _df_has_framework "node" || detected+=("node")
      fi
    fi
  }

  _df_scan_dir_for_framework "$project_root"

  # Scan subdirectories (backend/, frontend/, api/, web/, mobile/, etc.)
  for subdir in backend frontend api web mobile apps services; do
    local dir="$project_root/$subdir"
    [[ -d "$dir" ]] && _df_scan_dir_for_framework "$dir"
  done

  # Workspace-manager awareness: lerna.json and pnpm-workspace.yaml both
  # declare real, directly-readable glob patterns for where packages live —
  # scan those too, in addition to the 7 hardcoded names above, so e.g. a
  # `packages/*`-based monorepo (not covered by any of the hardcoded names)
  # gets its real per-package frameworks detected instead of silently
  # falling through to a single generic "node" at the root.
  #
  # nx.json is deliberately NOT given the same treatment here: unlike
  # lerna.json/pnpm-workspace.yaml, it has no glob field of its own (Nx
  # discovers projects via per-project project.json files or plugin
  # inference, not a listable pattern in nx.json — confirmed against Nx's
  # own docs and its own monorepo, which has neither a `workspaces` field
  # nor a glob in nx.json). An nx.json-only repo with no package.json
  # `workspaces` array still can't be resolved to real subdirectories from
  # static config alone, so it's left as the documented "recognized but not
  # fully scannable" limitation — see the caller in adopt.sh for the
  # specific error message given in that case.
  local globs=()
  while IFS= read -r g; do [[ -n "$g" ]] && globs+=("$g"); done < <(read_workspace_globs_json "$project_root/package.json" workspaces)
  while IFS= read -r g; do [[ -n "$g" ]] && globs+=("$g"); done < <(read_workspace_globs_json "$project_root/lerna.json" packages)
  while IFS= read -r g; do [[ -n "$g" ]] && globs+=("$g"); done < <(read_pnpm_workspace_globs "$project_root/pnpm-workspace.yaml")

  if [[ ${#globs[@]} -gt 0 ]]; then
    local glob resolved nullglob_was_set=0
    shopt -q nullglob && nullglob_was_set=1
    shopt -s nullglob
    # IFS= for the glob-expansion loop below: `$glob` must stay unquoted for
    # globbing to expand it, but that also subjects it to word-splitting —
    # without this, a glob like "my apps/*" (a legal, if uncommon, workspace
    # directory name containing a space) silently expands to two separate
    # words ("my" and "apps/*") instead of one path, and the real match is
    # missed with no warning. Restored right after the loop since the rest
    # of this function relies on normal word-splitting.
    local old_ifs="$IFS"
    for glob in "${globs[@]}"; do
      [[ "$glob" == !* ]] && continue  # exclusion patterns aren't expanded, just skipped
      # No subshell here (unlike a `( ... )` group) — _df_scan_dir_for_framework's
      # `detected+=(...)` must mutate this function's own array, not a copy
      # inside a subshell that vanishes when the group exits.
      IFS=
      for resolved in "$project_root"/$glob; do
        IFS="$old_ifs"
        [[ -d "$resolved" ]] && _df_scan_dir_for_framework "$resolved"
      done
      IFS="$old_ifs"
    done
    [[ "$nullglob_was_set" -eq 0 ]] && shopt -u nullglob
  fi

  # Print detected frameworks (handle empty array safely)
  if [[ ${#detected[@]} -gt 0 ]]; then
    printf '%s\n' "${detected[@]}"
  fi
}
