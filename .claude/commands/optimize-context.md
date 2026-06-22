---
description: Switch to minimal MCP profile for the current task to reduce context usage
argument-hint: [minimal|frontend|backend|fullstack|ticket|auto]
---

# Optimize Context Usage

Argument: `$ARGUMENTS` (profile name or "auto" to detect from conversation)

## What this does

Switches the active MCP server profile to minimize context usage while keeping necessary tools available.

## Profiles

- **minimal** - Only sequential-thinking, memory, serena (exploration, planning, questions)
- **frontend** - Adds playwright, context7 (React/Next.js/UI work)
- **backend** - Adds context7 (API/database/service work)
- **fullstack** - Adds playwright, context7, github (features touching both FE & BE)
- **ticket** - All MCPs enabled (full /ticket workflow)

## Auto-detection

If argument is "auto" or empty, analyze the conversation to detect task type:

1. Scan recent messages for keywords:
   - Frontend: react, nextjs, component, ui, tailwind, playwright, e2e
   - Backend: api, database, migration, nestjs, fastapi, express
   - DevOps: docker, ci/cd, terraform, deploy, kubernetes
   - Planning: architect, design, adr, plan, ticket

2. Choose the minimal profile that covers detected types

3. Report recommended profile and reasoning

## Implementation

1. Use Bash tool to run: `./scripts/switch-profile.sh <profile>`
2. Report current context usage before switch
3. Inform user they need to restart Claude Code for changes to take effect
4. Show which MCPs were activated/deactivated

## Important

- This modifies `.claude/settings.json` - changes persist across sessions
- A backup is created automatically at `.claude/settings.json.backup-<timestamp>`
- User must restart Claude Code (or start new session) for changes to apply
- Current session continues with existing MCPs loaded

## Example

User: `/optimize-context frontend`