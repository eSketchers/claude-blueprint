#!/usr/bin/env bash
# symlinks.sh — shared helpers for creating symlinks in adopted projects.
#
# Sourced by scripts/adopt.sh and scripts/new-project.sh. Provides two
# link modes (absolute for sibling layout, relative for nested) and a
# path-math helper.
#
# Usage:
#   source "$BLUEPRINT_DIR/scripts/lib/symlinks.sh"
#   link_absolute /abs/src /abs/dst
#   link_relative /abs/src /abs/dst
#   compute_relative_path /abs/from /abs/to   # echoes relative path
#
# All functions are idempotent: re-running replaces existing symlinks.

set -u

link_absolute() {
  local src="$1" dst="$2"
  [[ -e "$src" ]] || { printf 'link_absolute: source missing: %s\n' "$src" >&2; return 1; }
  mkdir -p "$(dirname "$dst")"
  ln -sfn "$src" "$dst"
}

link_relative() {
  local src="$1" dst="$2"
  [[ -e "$src" ]] || { printf 'link_relative: source missing: %s\n' "$src" >&2; return 1; }
  mkdir -p "$(dirname "$dst")"
  local rel
  rel="$(compute_relative_path "$(dirname "$dst")" "$src")"
  ln -sfn "$rel" "$dst"
}

# compute_relative_path FROM_DIR TO_PATH
# Pure-bash relpath — portable, no python/perl dependency.
compute_relative_path() {
  local from="$1" to="$2"
  # Normalize by resolving . and .. where possible (but keep missing paths ok)
  from="$(cd "$from" 2>/dev/null && pwd || printf '%s' "$from")"
  # Don't require "to" to exist (symlink target may be a file we're about to create)
  local to_dir to_base
  to_dir="$(dirname "$to")"
  to_base="$(basename "$to")"
  to_dir="$(cd "$to_dir" 2>/dev/null && pwd || printf '%s' "$to_dir")"
  to="$to_dir/$to_base"

  # Split paths into arrays
  local -a from_parts to_parts
  IFS='/' read -ra from_parts <<< "${from#/}"
  IFS='/' read -ra to_parts <<< "${to#/}"

  # Strip common prefix
  local i=0
  while [[ $i -lt ${#from_parts[@]} && $i -lt ${#to_parts[@]} && "${from_parts[$i]}" == "${to_parts[$i]}" ]]; do
    ((i++))
  done

  # Up from `from` to common ancestor
  local up=""
  local j=$i
  while [[ $j -lt ${#from_parts[@]} ]]; do
    up="../$up"
    ((j++))
  done

  # Down from common ancestor to `to`
  local down=""
  while [[ $i -lt ${#to_parts[@]} ]]; do
    down="$down${to_parts[$i]}/"
    ((i++))
  done
  down="${down%/}"

  printf '%s%s' "$up" "$down"
}
