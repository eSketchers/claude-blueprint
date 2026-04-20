---
description: Pull any pending operator reply from the dashboard inbox (non-blocking)
allowed-tools: Bash
argument-hint: (none)
---

# /check-inbox

Run `.claude/hooks/inbox-check.sh` to see whether the operator has replied via the dashboard at http://127.0.0.1:7842 while you were working.

**Interpret the output:**

- If the first line is `(inbox empty for session ...)` → no reply is waiting. Report that to the operator in this channel and pause for their input here instead.
- Otherwise → the output is a message the operator typed in the dashboard. Treat it exactly as if they had typed it in this chat, and continue the task based on it.

After running, don't ask again — proceed with the reply if there was one, or hand control back if the inbox was empty.
