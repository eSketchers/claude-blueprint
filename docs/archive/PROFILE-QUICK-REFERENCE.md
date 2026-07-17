# Profile Quick Reference

One-page guide for choosing the right MCP profile.

## When to Use Each Profile

| Your Task | Profile | Command |
|-----------|---------|---------|
| 📖 Reading code, exploring codebase | **minimal** | `./scripts/switch-profile.sh minimal` |
| 🤔 Planning features, writing ADRs | **minimal** | `./scripts/switch-profile.sh minimal` |
| ⚛️ React/Next.js components + E2E tests | **frontend** | `./scripts/switch-profile.sh frontend` |
| 🖥️ Building APIs, database work | **backend** | `./scripts/switch-profile.sh backend` |
| 🌐 Full-stack features (FE + BE) | **fullstack** | `./scripts/switch-profile.sh fullstack` |
| 🎫 Running `/ticket` workflow | **ticket** | `./scripts/switch-profile.sh ticket` |

## What Each Profile Loads

| MCP | minimal | frontend | backend | fullstack | ticket |
|-----|---------|----------|---------|-----------|--------|
| sequential-thinking | ✅ | ✅ | ✅ | ✅ | ✅ |
| memory | ✅ | ✅ | ✅ | ✅ | ✅ |
| serena (code search) | ✅ | ✅ | ✅ | ✅ | ✅ |
| context7 (lib docs) | ❌ | ✅ | ✅ | ✅ | ✅ |
| playwright (E2E) | ❌ | ✅ | ❌ | ✅ | ✅ |
| github (PRs/issues) | ❌ | ❌ | ❌ | ✅ | ✅ |

## Token Savings

| Profile | vs. ticket | Typical Token Count | Use When |
|---------|-----------|---------------------|----------|
| **ticket** | 0% (baseline) | ~15k MCP tokens | Full autonomous workflow |
| **fullstack** | ~20-30% | ~10-12k tokens | Manual feature work (FE+BE) |
| **frontend** | ~30-40% | ~8-10k tokens | UI-only work |
| **backend** | ~40-50% | ~7-9k tokens | API-only work |
| **minimal** | ~60-70% | ~4-6k tokens | Exploration, planning |

## Workflow Examples

### Exploring a New Codebase

```bash
./scripts/switch-profile.sh minimal
claude
# Ask questions, read code, understand architecture
# Only loads serena (search), memory, sequential-thinking
```

### Building a React Component

```bash
./scripts/switch-profile.sh frontend
claude
# Playwright available for E2E tests
# context7 for React/Tailwind docs
```

### Creating an API Endpoint

```bash
./scripts/switch-profile.sh backend
claude
# context7 for FastAPI/NestJS docs
# No playwright (not needed)
```

### Autonomous Ticket Processing

```bash
./scripts/switch-profile.sh ticket
claude
# All MCPs loaded for full /ticket workflow
# Plan → adversarial review → implement → test → PR
```

## In-Session Commands

After starting Claude Code, use `/optimize-context`:

```
/optimize-context minimal
# Switches profile, backs up settings
# Restart Claude Code for changes to apply
```

Auto-detect from conversation:

```
/optimize-context auto
# Analyzes recent messages
# Recommends best profile
```

## Shell Aliases (Optional)

Add to `~/.zshrc` or `~/.bashrc`:

```bash
# Quick profile switchers
alias cmin='cd "$PROJECT_DIR" && ./scripts/switch-profile.sh minimal && claude'
alias cfe='cd "$PROJECT_DIR" && ./scripts/switch-profile.sh frontend && claude'
alias cbe='cd "$PROJECT_DIR" && ./scripts/switch-profile.sh backend && claude'
alias cfs='cd "$PROJECT_DIR" && ./scripts/switch-profile.sh fullstack && claude'
alias ctix='cd "$PROJECT_DIR" && ./scripts/switch-profile.sh ticket && claude'
```

Usage:
```bash
cmin   # Start minimal session
cfe    # Start frontend session
ctix   # Start ticket session
```

## Troubleshooting

### Profile didn't change

**Cause:** Profile changes require restarting Claude Code

**Fix:** Exit current session, run `claude` again

### Missing tools during task

**Cause:** Profile too minimal for the task

**Fix:**
```bash
# Exit Claude Code
./scripts/switch-profile.sh fullstack  # or ticket
claude  # Restart
```

### Want to revert

**Cause:** Profile switch broke workflow

**Fix:**
```bash
# Restore from backup
ls -lt .claude/settings.json.backup-* | head -1
# Copy the most recent backup
cp .claude/settings.json.backup-1234567890 .claude/settings.json
claude  # Restart
```

## Best Practices

1. **Start minimal** - Upgrade to heavier profile only when needed
2. **Match task type** - Frontend work → frontend profile (not ticket)
3. **Use ticket sparingly** - Only for full autonomous workflows
4. **Monitor context** - Run `/context` to see actual savings
5. **Team conventions** - Document which profile for which work type

## When NOT to Use Profiles

- **One-off questions** - Current session is fine, no need to restart
- **Mid-implementation** - Don't switch profiles mid-task
- **Already at right profile** - Check current MCPs with `/context` first

## Measuring Impact

Before switch:
```
/context
# Note: System tools: 15.2k tokens
```

After switch (new session):
```
/context
# Note: System tools: 6.5k tokens  ← 57% reduction
```

## Agent Profiles (Optional)

In addition to MCPs, you can also constrain which agents are available:

```bash
# Switch both MCPs AND agents
./scripts/switch-profile-full.sh frontend
claude

# Result:
# - MCPs: sequential-thinking, memory, serena, context7, playwright
# - Agents: architect, frontend-dev, qa-lead (only)
```

**Agent savings:** ~150-250 tokens (marginal, ~1-2% of context)

**Use agent profiles for:**
- Consistency (MCPs and agents aligned)
- Team conventions
- Orchestrator constraints

**Skip agent profiles for:**
- Flexibility (might need multiple agent types)
- Marginal impact (~320 tokens total)

See [AGENT-PROFILES.md](./AGENT-PROFILES.md) for details.

## Quick Decision Tree

```
Start task
    ↓
Is it exploration/planning?
    YES → minimal
    NO → Continue
         ↓
         Does it involve UI/E2E tests?
             YES → Does it also need backend work?
                      YES → fullstack
                      NO → frontend
             NO → Is it backend/API work?
                      YES → backend
                      NO → Is it full /ticket workflow?
                              YES → ticket
                              NO → minimal (default)
```

## Summary

- **Default to minimal** - upgrade only when needed
- **Restart required** - profile changes need new session
- **Check /context** - verify actual savings
- **Team alignment** - share profile conventions

See [DYNAMIC-CONTEXT-OPTIMIZATION.md](./DYNAMIC-CONTEXT-OPTIMIZATION.md) for full details.
