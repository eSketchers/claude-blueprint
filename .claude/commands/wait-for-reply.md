---
description: Pause and block until the operator replies via the dashboard (up to 120s)
allowed-tools: Bash
argument-hint: "<question>" [timeout-seconds]
---

# /wait-for-reply

Run `.claude/hooks/inbox-wait.sh "$ARGUMENTS"`.

This is the self-resume mechanism for parallel agents:

1. It emits a `notification` event so the dashboard flips you to **Meeting Room** with the question as the visible text.
2. It polls `~/.claude-agency/inbox/<session>.txt` every 2 seconds.
3. When the operator clicks your card in the dashboard and sends a reply, the file materializes → the script prints the message and exits 0.
4. If nobody replies within 120s (or the custom timeout), it exits 1 with a timeout notice.

**How to interpret the result:**

- **Exit 0, output contains `===== operator reply =====`**: the block between the delimiters is the operator's reply. Continue the task using it.
- **Exit 1, timeout notice**: hand control back to the operator here with a short summary of the question and what's still pending. Do NOT loop on `/wait-for-reply` — one attempt per blocker.

**When to use this vs just asking in chat:**

- Use `/wait-for-reply` when you're one of multiple parallel agents and the operator is watching the dashboard, not this specific chat.
- Ask in chat normally when the operator is clearly engaged in this session.

**Examples:**

- `/wait-for-reply "Which database connection string should this pipeline use?"`
- `/wait-for-reply "Should I delete the deprecated /v1 routes, or keep them for one more release?" 300`

Do not pass secrets / full code bodies as the question — keep it short enough to read on a dashboard card.
