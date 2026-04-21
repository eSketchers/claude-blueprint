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
PROFILE=""
FORCE=0
NO_PRECOMMIT=0
DRY_RUN=0
ACTION="adopt"   # adopt | uninstall | doctor
QUIET=0

usage() {
  cat <<'USAGE'
Usage: adopt.sh --framework <python|node|nextjs|nestjs> [options]

Options:
  --framework F       Required. Picks CLAUDE.md template and pre-commit config.
  --profile P         'backend' merges a stricter deny-list. Default for python/nestjs.
  --force             Overwrite existing .claude/. Moves it to .claude.bak-<ts>/.
  --no-precommit      Skip `pre-commit install`.
  --dry-run           Print every op, change nothing.
  --uninstall         Remove everything adopt created, restore .gitignore.
  --doctor [--quiet]  Health-check: validate marker and symlinks.
  -h, --help          This help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --framework)   FRAMEWORK="${2:?}"; shift 2 ;;
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

# ---------- Default profile ----------
if [[ -z "$PROFILE" && ("$FRAMEWORK" == "python" || "$FRAMEWORK" == "nestjs") ]]; then
  PROFILE="backend"
fi

# ---------- Dispatch ----------
case "$ACTION" in
  adopt)
    [[ -n "$FRAMEWORK" ]] || die "--framework is required"
    case "$FRAMEWORK" in python|node|nextjs|nestjs) ;; *) die "Unknown framework: $FRAMEWORK" ;; esac

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
      run "cp \"$f\" \"$CLAUDE_DIR/agents/$(basename "$f")\""
    done
    for f in "$BLUEPRINT_RESOLVED"/.claude/commands/*.md; do
      run "cp \"$f\" \"$CLAUDE_DIR/commands/$(basename "$f")\""
    done
    for f in "$BLUEPRINT_RESOLVED"/.claude/hooks/*.sh; do
      run "cp \"$f\" \"$CLAUDE_DIR/hooks/$(basename "$f")\""
      run "chmod +x \"$CLAUDE_DIR/hooks/$(basename "$f")\""
    done
    run "cp \"$BLUEPRINT_RESOLVED/.claude/settings.json\" \"$CLAUDE_DIR/settings.json\""

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

    # Marker file
    if [[ $DRY_RUN -eq 0 ]]; then
      sha="$(git -C "$BLUEPRINT_RESOLVED" rev-parse --short HEAD 2>/dev/null || echo unknown)"
      cat > "$CLAUDE_DIR/.adopted-from-blueprint" <<EOF
{
  "blueprint_sha": "$sha",
  "blueprint_dir": "$BLUEPRINT_RESOLVED",
  "mode": "$MODE",
  "framework": "$FRAMEWORK",
  "profile": "$PROFILE",
  "adopted_at": "$(date -Iseconds)"
}
EOF
    fi

    # CLAUDE.md — only if project has none
    if [[ ! -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
      run "cp \"$BLUEPRINT_RESOLVED/templates/CLAUDE.md.$FRAMEWORK\" \"$PROJECT_ROOT/CLAUDE.md\""
    else
      log "Existing CLAUDE.md preserved. See $BLUEPRINT_RESOLVED/templates/CLAUDE.md.$FRAMEWORK for reference."
    fi

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

    # pre-commit
    if [[ $NO_PRECOMMIT -eq 0 ]]; then
      PC_SRC=""
      case "$FRAMEWORK" in
        python) PC_SRC="$BLUEPRINT_RESOLVED/pre-commit/.pre-commit-config.python.yaml" ;;
        node|nextjs|nestjs) PC_SRC="$BLUEPRINT_RESOLVED/pre-commit/.pre-commit-config.node.yaml" ;;
      esac
      if [[ -n "$PC_SRC" && -f "$PC_SRC" && ! -f "$PROJECT_ROOT/.pre-commit-config.yaml" ]]; then
        run "cp \"$PC_SRC\" \"$PROJECT_ROOT/.pre-commit-config.yaml\""
      fi
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

    log "Adoption complete."
    log "  Gitignored: .claude/$([[ $MODE == nested ]] && echo ', .agency/')"
    log "  Committed:  CLAUDE.md, .pre-commit-config.yaml, .gitignore"
    log ""
    log "Next: run 'claude' in this project."
    ;;
  uninstall) log "TODO: uninstall action pending implementation (Task 9)"; exit 0 ;;
  doctor)    log "TODO: doctor action pending implementation (Task 10)"; exit 0 ;;
esac
