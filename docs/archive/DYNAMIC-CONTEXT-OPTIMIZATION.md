> **⚠️ ARCHIVED DOCUMENTATION**
>
> This document has been archived. For current documentation, see:
> - [Advanced Guide](../ADVANCED.md) - Profile System and Token Optimization sections
> - [Changelog](../CHANGELOG.md) - Recent changes
>
> This archived version is kept for historical reference and contains detailed technical information that may still be useful.

---

# Dynamic Context Optimization

This guide explains how to activate skills and MCPs only when needed, reducing context usage by 30-50% for focused tasks.

## Problem

Loading all MCPs and agents at session start consumes unnecessary context:
- **6 MCPs always loaded** → ~10-15k tokens (playwright alone is ~3-5k)
- **6 agents always available** → ~320 tokens (minimal, but adds up)
- **Most tasks only need 2-3 MCPs** → wasting 60-80% of MCP context

## Solution: Profile-Based Context Loading

### Quick Start

```bash
# Before starting a frontend task
./scripts/switch-profile.sh frontend
claude  # Start new session with minimal context

# Before starting backend work
./scripts/switch-profile.sh backend
claude

# Before running /ticket workflow
./scripts/switch-profile.sh ticket
claude
```

### Available Profiles

| Profile | Use Case | MCPs Loaded | Token Savings |
|---------|----------|-------------|---------------|
| **minimal** | Exploration, questions, planning | sequential-thinking, memory, serena | ~60-70% (vs fullstack) |
| **frontend** | React/Next.js/UI work | +playwright, context7 | ~30-40% |
| **backend** | API/database/services | +context7 | ~40-50% |
| **fullstack** | Features touching FE+BE | +playwright, context7, github | ~20-30% |
| **ticket** | Full /ticket workflow | All MCPs | Baseline (0%) |

### In-Session Usage

Use the `/optimize-context` command:

```
/optimize-context frontend
# → Switches profile and backs up current settings
# → Restart Claude Code for changes to apply
```

Auto-detect from conversation:

```
/optimize-context auto
# → Analyzes recent messages for keywords
# → Recommends minimal profile covering detected types
```

## How It Works

### 1. Profile System

`.claude/settings.profiles.json` defines MCP sets for each task type:

```json
{
  "profiles": {
    "minimal": {
      "mcpServers": {
        "sequential-thinking": {...},
        "memory": {...},
        "serena": {...}
      }
    },
    "frontend": {
      "mcpServers": {
        "sequential-thinking": {...},
        "memory": {...},
        "serena": {...},
        "playwright": {...},
        "context7": {...}
      }
    }
  }
}
```

### 2. Profile Switcher

`./scripts/switch-profile.sh` merges selected profile into `.claude/settings.json`:

```bash
./scripts/switch-profile.sh frontend
# Backs up: .claude/settings.json.backup-1234567890
# Updates: .claude/settings.json with frontend MCPs
# Requires: Restart Claude Code
```

### 3. Conditional Agent Dispatch

The `/ticket` workflow already dispatches agents conditionally based on plan analysis:

- Plan mentions "API endpoint" → `backend-dev` spawned
- Plan mentions "React component" → `frontend-dev` spawned
- Plan mentions "Terraform" → `devops` spawned

**No action needed** - this is built-in.

## Best Practices

### For Exploratory Work

```bash
./scripts/switch-profile.sh minimal
```

Only loads serena (code search), memory, sequential-thinking.

**Saves ~60-70% MCP tokens** vs fullstack.

### For Feature Work

1. Start with `minimal` during planning/exploration
2. Switch to task-specific profile during implementation:
   ```bash
   # Planning phase
   ./scripts/switch-profile.sh minimal
   claude
   # ... explore codebase, read tickets, plan ...

   # Implementation phase (restart session)
   ./scripts/switch-profile.sh frontend
   claude
   # ... implement with playwright available ...
   ```

### For /ticket Workflow

```bash
./scripts/switch-profile.sh ticket
claude
# All MCPs available for full autonomous workflow
```

### For Daily Work

Set profile based on your primary focus area:

```bash
# Frontend developer
echo "alias claude-fe='./scripts/switch-profile.sh frontend && claude'" >> ~/.zshrc

# Backend developer
echo "alias claude-be='./scripts/switch-profile.sh backend && claude'" >> ~/.zshrc

# Full-stack
echo "alias claude-fs='./scripts/switch-profile.sh fullstack && claude'" >> ~/.zshrc
```

## Advanced: Task-Specific Skills

### Conditional Skill Loading (Future Enhancement)

Currently, all superpowers skills are symlinked and always available (minimal token cost).

To make skills conditional:

1. **Move skills from symlinks to profile-specific directories:**

```bash
# Current (always loaded):
.claude/skills/test-driven-development.md  # symlink

# Proposed (conditional):
.claude/skills/profiles/backend/test-driven-development.md
.claude/skills/profiles/frontend/test-driven-development.md
```

2. **Update profile switcher to manage skill symlinks:**

```bash
# In switch-profile.sh
case "$PROFILE" in
  frontend)
    ln -sf profiles/frontend/* .claude/skills/
    ;;
  backend)
    ln -sf profiles/backend/* .claude/skills/
    ;;
esac
```

**Current impact:** Skills are ~14 files but only ~2-3k tokens total (metadata only, content loads on use).

**ROI:** Low priority - focus on MCP optimization first.

## Monitoring

### Check Current Context Usage

```bash
# In Claude Code
/context
```

Compare before/after profile switch.

### Check Active MCPs

```bash
jq '.mcpServers | keys' .claude/settings.json
```

### Revert to Previous Profile

```bash
# Find backup
ls -lt .claude/settings.json.backup-* | head -1

# Restore
cp .claude/settings.json.backup-1234567890 .claude/settings.json
claude  # Restart
```

## Expected Savings

Based on MCP token costs:

| MCP | Approximate Token Cost |
|-----|----------------------|
| playwright | 3-5k tokens |
| context7 | 2-3k tokens |
| github | 1-2k tokens |
| serena | 2-3k tokens |
| sequential-thinking | 1-2k tokens |
| memory | 1-2k tokens |

**Example savings:**

- **Fullstack → Frontend**: Remove github → Save ~1-2k tokens (~10-15%)
- **Fullstack → Backend**: Remove playwright, github → Save ~4-7k tokens (~30-40%)
- **Fullstack → Minimal**: Remove playwright, context7, github → Save ~6-10k tokens (~40-60%)

## Integration with Orchestrator

For autonomous ticket processing, set profile per ticket classification:

```javascript
// In orchestrator/spawn.mjs
const profileMap = {
  feature: 'fullstack',
  bug: 'minimal',      // Start minimal, upgrade if needed
  chore: 'backend',
  spike: 'minimal'
};

const profile = profileMap[ticket.classification] || 'ticket';
await switchProfile(profile);
spawnClaude(ticketUrl);
```

## Limitations

1. **Profile changes require session restart** - Claude Code loads MCPs at startup
2. **No mid-session MCP reload** - limitation of Claude Code architecture
3. **Manual profile selection** - auto-detection is heuristic-based (can be wrong)
4. **Profile per project, not per task** - settings.json is project-scoped

## Rollback

If optimization causes issues:

```bash
# Restore full MCP set
./scripts/switch-profile.sh ticket
claude

# Or manually restore backup
cp .claude/settings.json.backup-<timestamp> .claude/settings.json
```

## Next Steps

1. **Try it:** Start with `minimal` profile for your next exploration task
2. **Measure:** Run `/context` before and after switch to see savings
3. **Tune:** Adjust profiles in `.claude/settings.profiles.json` based on your workflow
4. **Automate:** Add profile aliases to your shell RC file
5. **Team rollout:** Document team conventions (e.g., "use `backend` for API work")

## Feedback Loop

Track which profiles work best for which tasks:

```bash
# Log profile usage (optional)
echo "$(date): $PROFILE - $TASK_DESCRIPTION" >> ~/.claude-agency/profile-usage.log
```

Review monthly to identify:
- Profiles that are too minimal (missing needed tools)
- Profiles that are too heavy (unused tools loaded)
- New profile needs (e.g., "data" for data engineering work)
