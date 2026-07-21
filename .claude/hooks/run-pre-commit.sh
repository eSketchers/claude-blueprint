#!/usr/bin/env bash
# run-pre-commit.sh — Wrapper for pre-commit with proper error reporting
#
# Purpose: Run pre-commit hooks on files edited by Claude Code and provide
# clear feedback when hooks modify files or find issues.
#
# Context: Called by PostToolUse hook in settings.json after Edit/Write tools.
# The CLAUDE_TOOL_FILE_PATH environment variable contains the file path(s).

set -euo pipefail

# Check if pre-commit is installed
if ! command -v pre-commit &>/dev/null; then
    # Silently skip if pre-commit not installed - this is optional tooling
    exit 0
fi

# Check if we have a file path to check
if [ -z "${CLAUDE_TOOL_FILE_PATH:-}" ]; then
    exit 0
fi

# Run pre-commit and capture both output and exit code
output=$(pre-commit run --files "$CLAUDE_TOOL_FILE_PATH" 2>&1) || exit_code=$?
exit_code=${exit_code:-0}

# If pre-commit passed with no output, silently succeed
if [ $exit_code -eq 0 ] && [ -z "$output" ]; then
    exit 0
fi

# If pre-commit made changes or found issues, report them
if [ $exit_code -ne 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "⚠️  Pre-commit hooks found issues or modified files" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "" >&2
    echo "$output" >&2
    echo "" >&2
    echo "📝 Action required:" >&2
    echo "   • If files were auto-fixed, re-read them to see changes" >&2
    echo "   • If hooks failed, fix the issues and try again" >&2
    echo "" >&2
    echo "   File(s): $CLAUDE_TOOL_FILE_PATH" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2

    # Return success to not block the tool execution
    # The warning above is sufficient for the agent to notice
    exit 0
fi

# If pre-commit passed but had output (e.g., skipped hooks), show it
if [ -n "$output" ]; then
    echo "✓ Pre-commit hooks passed" >&2
    echo "$output" >&2
fi

exit 0
