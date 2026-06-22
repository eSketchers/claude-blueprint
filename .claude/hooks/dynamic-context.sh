#!/usr/bin/env bash
# Dynamic context optimization - activate tools only when needed
# Called by UserPromptSubmit hook to analyze prompt and suggest minimal MCP set

set -euo pipefail

PROMPT="$1"
CURRENT_MCPS="${2:-}"  # Currently active MCPs (comma-separated)

# Detect task type from prompt
detect_task_type() {
    local prompt="$1"
    local types=()

    # Frontend detection
    if echo "$prompt" | grep -iE '(react|next\.?js|component|ui|frontend|tailwind|playwright|e2e|browser)' >/dev/null; then
        types+=("frontend")
    fi

    # Backend detection
    if echo "$prompt" | grep -iE '(api|backend|database|migration|nest\.?js|fastapi|django|express)' >/dev/null; then
        types+=("backend")
    fi

    # DevOps detection
    if echo "$prompt" | grep -iE '(docker|ci/cd|terraform|deploy|infrastructure|k8s|kubernetes)' >/dev/null; then
        types+=("devops")
    fi

    # Data engineering detection
    if echo "$prompt" | grep -iE '(pipeline|etl|warehouse|dbt|airflow|dagster)' >/dev/null; then
        types+=("data")
    fi

    # Architecture/planning detection
    if echo "$prompt" | grep -iE '(architect|design|adr|plan|ticket|feature)' >/dev/null; then
        types+=("planning")
    fi

    # Code review detection
    if echo "$prompt" | grep -iE '(review|pr|pull request|merge)' >/dev/null; then
        types+=("review")
    fi

    echo "${types[@]}"
}

# Map task types to required MCPs
get_required_mcps() {
    local task_types="$1"
    local mcps=()

    # Always needed (low token cost)
    mcps+=("sequential-thinking" "memory")

    # Task-specific MCPs
    if echo "$task_types" | grep -q "frontend"; then
        mcps+=("playwright")
    fi

    if echo "$task_types" | grep -qE "(planning|review|backend|frontend)"; then
        mcps+=("serena")  # Code search for any implementation work
    fi

    if echo "$task_types" | grep -qE "(planning|backend|frontend|data)"; then
        mcps+=("context7")  # Library docs when writing code
    fi

    if echo "$task_types" | grep -qE "(planning|review)"; then
        mcps+=("github")  # For ticket/PR work
    fi

    # Unique and sort
    printf '%s\n' "${mcps[@]}" | sort -u | tr '\n' ',' | sed 's/,$//'
}

# Main logic
task_types=$(detect_task_type "$PROMPT")

if [ -z "$task_types" ]; then
    # Generic task - minimal set
    echo "sequential-thinking,memory,serena"
else
    required_mcps=$(get_required_mcps "$task_types")
    echo "$required_mcps"
fi

# Optionally output recommendation to stderr for user visibility
if [ -n "$task_types" ]; then
    >&2 echo "📊 Detected task types: $task_types"
    >&2 echo "🔧 Recommended MCPs: $required_mcps"
fi
