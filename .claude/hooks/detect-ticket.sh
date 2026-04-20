#!/usr/bin/env bash
# UserPromptSubmit hook: detect ticket references in the user's prompt
# and surface them to Claude so it can proactively invoke the /ticket command.
#
# Wire into .claude/settings.json:
#   "hooks": {
#     "UserPromptSubmit": [
#       { "hooks": [{ "type": "command", "command": ".claude/hooks/detect-ticket.sh" }] }
#     ]
#   }
#
# Inputs (from Claude Code):  $CLAUDE_USER_PROMPT  — the message the user just sent
# Outputs (stdout is appended to Claude's context as a system note):

set -euo pipefail

prompt="${CLAUDE_USER_PROMPT:-}"
[[ -z "$prompt" ]] && exit 0

matches=""

# ClickUp task URLs
while IFS= read -r url; do
  [[ -n "$url" ]] && matches+=$'\n- ClickUp: '"$url"
done < <(printf '%s' "$prompt" | grep -oE 'https://app\.clickup\.com/t/[a-zA-Z0-9]+' || true)

# Linear issue URLs + bare LIN-123 style
while IFS= read -r url; do
  [[ -n "$url" ]] && matches+=$'\n- Linear: '"$url"
done < <(printf '%s' "$prompt" | grep -oE 'https://linear\.app/[^ ]+/issue/[A-Z]+-[0-9]+' || true)

while IFS= read -r id; do
  [[ -n "$id" ]] && matches+=$'\n- Linear ID: '"$id"
done < <(printf '%s' "$prompt" | grep -oE '\b[A-Z]{2,5}-[0-9]+\b' || true)

# GitHub issue URLs
while IFS= read -r url; do
  [[ -n "$url" ]] && matches+=$'\n- GitHub: '"$url"
done < <(printf '%s' "$prompt" | grep -oE 'https://github\.com/[^/]+/[^/]+/issues/[0-9]+' || true)

# Jira URLs
while IFS= read -r url; do
  [[ -n "$url" ]] && matches+=$'\n- Jira: '"$url"
done < <(printf '%s' "$prompt" | grep -oE 'https://[a-z0-9-]+\.atlassian\.net/browse/[A-Z]+-[0-9]+' || true)

if [[ -n "$matches" ]]; then
  cat <<NOTE
[ticket-detector] Detected ticket reference(s) in the user's prompt:$matches

Suggestion: invoke the /ticket <url> slash command to run the agency workflow
(plan → adversarial review → worktree → implement → test → PR).
Confirm with the user before kicking off the full flow unless they explicitly
asked you to pick it up.
NOTE
fi

exit 0
