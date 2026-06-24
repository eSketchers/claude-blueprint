# Agent Profile Management

Connect agent availability to MCP profiles for maximum context optimization.

## Overview

**Agents add ~50-60 tokens each** (metadata only). With 6 agents, total overhead is ~320-360 tokens.

While **marginal compared to MCPs** (~15k tokens), managing agent availability provides:
1. **Mental model clarity** - only see relevant agents in `/context`
2. **Prevents accidental misuse** - can't invoke backend-dev if doing frontend work
3. **Cleaner orchestrator logs** - fewer agents = clearer event streams
4. **Consistency** - profile determines both MCPs AND agents

## Quick Start

### Full Profile Switch (MCPs + Agents)

```bash
# Switch everything at once (recommended)
./scripts/switch-profile-full.sh frontend
claude

# Activates:
# - MCPs: sequential-thinking, memory, serena, context7, playwright
# - Agents: architect, frontend-dev, qa-lead
```

### MCPs Only (Default)

```bash
# Switch just MCPs, keep all agents
./scripts/switch-profile.sh frontend
claude

# Activates:
# - MCPs: sequential-thinking, memory, serena, context7, playwright
# - Agents: ALL 6 (architect, frontend-dev, backend-dev, qa-lead, devops, data-engineer)
```

### Agents Only

```bash
# Switch just agents, keep current MCPs
./scripts/switch-agents.sh frontend
claude

# Agents: architect, frontend-dev, qa-lead
# MCPs: unchanged from current settings
```

## Agent Profiles

| Profile | Agents Loaded | Use Case |
|---------|---------------|----------|
| **minimal** | architect | Exploration, planning, ADRs |
| **frontend** | architect, frontend-dev, qa-lead | React/Next.js/UI work |
| **backend** | architect, backend-dev, qa-lead | APIs, databases, services |
| **fullstack** | architect, frontend-dev, backend-dev, qa-lead | Full-stack features |
| **devops** | architect, devops, qa-lead | CI/CD, infrastructure, deployments |
| **data** | architect, data-engineer, backend-dev, qa-lead | Pipelines, warehousing, analytics |
| **ticket** | ALL 6 agents | Full autonomous workflow |

## Token Savings

| Profile | Agents Active | Agents Excluded | Token Savings |
|---------|---------------|-----------------|---------------|
| **ticket** | 6/6 | 0 | 0 tokens (baseline) |
| **fullstack** | 4/6 | 2 | ~100-120 tokens |
| **frontend** | 3/6 | 3 | ~150-180 tokens |
| **backend** | 3/6 | 3 | ~150-180 tokens |
| **devops** | 3/6 | 3 | ~150-180 tokens |
| **data** | 4/6 | 2 | ~100-120 tokens |
| **minimal** | 1/6 | 5 | ~250-300 tokens |

**Note:** Agent savings are **small** compared to MCP savings (~10k tokens). Main benefit is clarity.

## Combined Savings (MCPs + Agents)

| Profile | MCP Savings | Agent Savings | Total Savings |
|---------|-------------|---------------|---------------|
| **minimal** | ~10k tokens | ~250 tokens | **~10.3k tokens** |
| **frontend** | ~7k tokens | ~150 tokens | **~7.2k tokens** |
| **backend** | ~8k tokens | ~150 tokens | **~8.2k tokens** |
| **fullstack** | ~4k tokens | ~100 tokens | **~4.1k tokens** |

## How It Works

### Directory Structure

```
.claude/
├── agents/              # Active agents (loaded by Claude Code)
│   └── architect.md     # Only architect for "minimal" profile
├── agents.backup/       # All agents (source of truth)
│   ├── architect.md
│   ├── frontend-dev.md
│   ├── backend-dev.md
│   ├── qa-lead.md
│   ├── devops.md
│   └── data-engineer.md
└── agents.profiles.json # Profile definitions
```

### Script Behavior

```bash
./scripts/switch-agents.sh frontend
```

1. **Backup** - Copies all agents to `.claude/agents.backup/` (first run only)
2. **Clear** - Removes all `.md` files from `.claude/agents/`
3. **Restore** - Copies only profile agents from backup to active dir
4. **Report** - Shows which agents are active and savings

## When to Use Agent Profiles

### ✅ Use Agent Profiles When:

- **You want consistency** - Profile should control both MCPs and agents
- **Running orchestrator** - Autonomous operation benefits from constraints
- **Team conventions** - "Frontend profile = only frontend-dev available"
- **Learning workflow** - Easier to understand what each profile enables

### ❌ Don't Use Agent Profiles When:

- **Flexibility needed** - You might invoke multiple agent types in one session
- **Exploratory work** - Unsure which agents you'll need
- **Agent overhead negligible** - 320 tokens is <0.2% of 200k context
- **Switching mid-session** - Claude Code doesn't reload agents mid-session

## Best Practices

### 1. Default to Full Profile Switch

```bash
# Recommended: switch both MCPs and agents
./scripts/switch-profile-full.sh frontend
```

This keeps MCPs and agents aligned.

### 2. Keep All Agents for Manual Work

```bash
# Switch just MCPs, keep all agents available
./scripts/switch-profile.sh frontend
```

Gives you flexibility to invoke any agent if needed.

### 3. Constrain Agents for Orchestrator

```javascript
// In orchestrator/spawn.mjs
await switchProfileFull(profile);  // MCPs + agents
spawnClaude(`/ticket ${url} --auto`);
```

Ensures autonomous agents don't accidentally invoke wrong specialist.

### 4. Architect Always Available

All profiles include `architect` because:
- Planning is needed across all workflows
- Writing ADRs is universal
- Only ~60 tokens overhead

## Examples

### Example 1: Frontend Work

```bash
./scripts/switch-profile-full.sh frontend
claude

# Available agents:
/context
# → architect (59 tokens)
# → frontend-dev (53 tokens)
# → qa-lead (52 tokens)
# Total: ~164 tokens (vs 320 for all 6)

# Trying to use excluded agent:
# User: "Use backend-dev to build an API"
# Claude: "backend-dev agent not available in this profile"
```

### Example 2: Backend Work

```bash
./scripts/switch-profile-full.sh backend
claude

# Available agents:
# → architect
# → backend-dev
# → qa-lead

# Can't accidentally invoke frontend-dev or devops
```

### Example 3: Planning Only

```bash
./scripts/switch-profile-full.sh minimal
claude

# Available agents:
# → architect (only)

# Perfect for:
# - Writing ADRs
# - Exploring codebase
# - Answering questions
# - Planning features (without implementation)
```

## Restore All Agents

```bash
./scripts/switch-agents.sh ticket

# Or use full switcher:
./scripts/switch-profile-full.sh ticket
```

All 6 agents restored to `.claude/agents/`.

## Customizing Agent Profiles

Edit `.claude/agents.profiles.json`:

```json
{
  "profiles": {
    "my-custom-profile": {
      "description": "Custom agent set",
      "agents": [
        "architect",
        "backend-dev",
        "devops"
      ],
      "comment": "Backend + infra work"
    }
  }
}
```

Then use it:

```bash
./scripts/switch-agents.sh my-custom-profile
```

## Integration with /ticket Workflow

The `/ticket` workflow uses `Task` tool to spawn agents. If an agent file doesn't exist, the spawn will fail:

```
Phase 6: Implementation
  → Dispatching: backend-dev, frontend-dev
  → ✅ backend-dev spawned (file exists)
  → ❌ frontend-dev failed (file not found in .claude/agents/)
```

**Recommendation for /ticket:**

Always use `ticket` profile to ensure all agents available:

```bash
./scripts/switch-profile-full.sh ticket
claude
/ticket <url>
```

Or classify and switch automatically (orchestrator):

```javascript
if (ticketClassification === 'frontend-only') {
    await switchProfileFull('frontend');
} else {
    await switchProfileFull('ticket');  // Safe default
}
```

## Troubleshooting

### Agent not available when invoked

**Cause:** Agent file not in `.claude/agents/` for current profile

**Fix:**
```bash
# Check active agents
ls .claude/agents/

# Check backup has all agents
ls .claude/agents.backup/

# Restore missing agent by switching to fuller profile
./scripts/switch-agents.sh ticket  # All agents
```

### Backup directory missing

**Cause:** First run or backup deleted

**Fix:**
```bash
# Backup will be created automatically on next switch
./scripts/switch-agents.sh ticket

# Or manually restore from git
git checkout .claude/agents/
cp .claude/agents/*.md .claude/agents.backup/
```

### Want to keep all agents loaded

**Cause:** Agent profiles feel too restrictive

**Fix:**
```bash
# Just switch MCPs, not agents
./scripts/switch-profile.sh frontend  # MCPs only
# All 6 agents remain in .claude/agents/
```

## ROI Analysis

### Token Impact

| Component | Overhead | Savings Potential |
|-----------|----------|-------------------|
| **MCPs** | ~15k tokens | 60-70% (10k tokens) |
| **Agents** | ~320 tokens | 50-80% (150-250 tokens) |
| **Messages** | 35k tokens | N/A (conversation history) |

**Conclusion:** Agent optimization saves ~1-2% of total context. **Use for consistency, not optimization.**

### When Agent Profiles Matter

- **Large teams** - Enforce conventions (frontend devs use frontend profile)
- **Autonomous systems** - Orchestrator prevents agent misuse
- **Learning** - Clearer mental model of what each profile enables
- **OCD** - Completeness (if optimizing MCPs, why not agents?)

### When to Skip

- **Solo developer** - You know which agents to invoke
- **Exploratory work** - Need flexibility
- **Agent overhead negligible** - 320 tokens is <0.2% of budget

## Summary

**Agent profiles provide:**
- ✅ **Consistency** - MCPs and agents aligned per task type
- ✅ **Clarity** - `/context` shows only relevant agents
- ✅ **Safety** - Can't accidentally invoke wrong specialist
- ⚠️ **Marginal savings** - ~150-250 tokens (vs ~10k for MCPs)

**Use them if:**
- You want full profile consistency (MCPs + agents)
- Running orchestrator autonomously
- Team needs conventions

**Skip them if:**
- Agent overhead doesn't matter (~1-2% of context)
- You want flexibility in agent invocation
- MCP optimization is sufficient

**Recommended approach:**
```bash
# Full profile switch for consistency
./scripts/switch-profile-full.sh <profile>

# Or MCP-only for flexibility
./scripts/switch-profile.sh <profile>
```

See also:
- [DYNAMIC-CONTEXT-OPTIMIZATION.md](./DYNAMIC-CONTEXT-OPTIMIZATION.md) - MCP profiles
- [PROFILE-QUICK-REFERENCE.md](./PROFILE-QUICK-REFERENCE.md) - Cheat sheet
- [TICKET-WORKFLOW-PROFILES.md](./TICKET-WORKFLOW-PROFILES.md) - /ticket optimization
