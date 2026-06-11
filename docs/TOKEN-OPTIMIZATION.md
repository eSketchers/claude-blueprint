# Token Optimization Guide

This document provides strategies to minimize token usage across the Claude Agency Blueprint without changing the core workflow.

## Quick Reference: When to Use Which Model

| Task Type | Model | Reason |
|-----------|-------|--------|
| File search, pattern matching | **haiku** | Simple operations, 20x cheaper |
| Code reading, exploration | **haiku** | Context gathering doesn't need reasoning |
| Bug classification, ticket triage | **haiku** | Straightforward categorization |
| Simple refactors (rename, extract) | **haiku** | Mechanical transformations |
| Architecture planning | **sonnet** | Complex reasoning required |
| Security review | **sonnet** | Deep analysis needed |
| Complex refactors | **sonnet** | Multi-file coordination |
| Code generation | **sonnet** | Quality matters more than cost |

## 1. Model Selection in Task Tool

When invoking agents via the Task tool, specify the `model` parameter:

```python
# Example: Low-cost exploration
Task(
  subagent_type="Explore",
  model="haiku",
  description="Find auth endpoints",
  prompt="Find all API endpoints that handle user authentication"
)

# Example: Complex implementation
Task(
  subagent_type="backend-dev",
  model="sonnet",
  description="Implement OAuth2",
  prompt="Implement OAuth2 flow with PKCE"
)
```

**Available models:** `haiku`, `sonnet`, `opus`

## 2. Explore Agent Thoroughness

The Explore agent accepts a thoroughness level in the prompt:

- **"quick"** - Basic searches, minimal file reading (~500 tokens)
- **"medium"** - Moderate exploration (~2K tokens)
- **"very thorough"** - Comprehensive analysis (~10K+ tokens)

Default to "quick" unless deeper analysis is needed:

```
Use Explore agent with "quick" thoroughness to find all database migration files
```

## 3. Graphify Knowledge Graph

Run graphify indexing after significant changes to build a queryable knowledge graph. This reduces repeated file reads by 60-80%.

```bash
# After merging a large feature
graphify index .

# Query the graph instead of reading files
graphify query "What modules handle authentication?"
```

**When to re-index:**
- After merging 5+ PRs
- After major refactoring
- Weekly for active projects

## 4. Orchestrator Budget Controls

Configure hard caps in `config/orchestrator.json`:

```json
{
  "budget": {
    "per_ticket_usd_cap": 2.0,        // Halt ticket when exceeded
    "daily_usd_cap": 30.0,            // Stop new spawns
    "cost_per_event_usd": 0.015,      // Tune based on observed cost
    "warn_at_daily_percent": 85
  },
  "stuck": {
    "tool_loop_threshold": 3,         // Same file edited 3x → halt
    "thrashing_window": 40,           // 40 events, no changes → halt
    "idle_timeout_ms": 480000         // 8 min no activity → halt
  }
}
```

**Calibration:**
1. Run with `dry_run: false` on 2-3 representative tickets
2. Check `~/.claude-agency/registry.json` for actual spend
3. Adjust `cost_per_event_usd` to match reality
4. Lower thresholds by 20-30% for stricter control

## 5. Parallel Agent Strategy

The `/ticket` workflow already spawns specialized agents in parallel. Each has isolated context = more efficient than one agent with all contexts.

**Best practice:** Let the workflow handle parallelization automatically. Don't try to coordinate agents manually.

## 6. File Operation Hygiene

**Already optimized in the blueprint**, but for custom agents:

✅ **DO:**
- Use Read/Glob/Grep tools directly
- Read specific files once
- Use Grep with `output_mode: "files_with_matches"` for discovery

❌ **DON'T:**
- Use bash `cat` / `find` / `grep` when tools exist
- Read the same file multiple times
- Use `Read` without `limit` on huge files

## 7. Pre-commit Hooks Reduce Rework

The blueprint's PostToolUse hooks catch lint/format issues immediately, preventing costly fix-refix loops.

**Already enabled** - no action needed.

## 8. Dashboard Monitoring

Use the dashboard to spot runaway agents:

```bash
node "$BLUEPRINT_DIR/dashboard/server.mjs"
# → http://127.0.0.1:7842
```

**Watch for:**
- Agents in "Office" zone for > 10 minutes
- Same agent editing same file repeatedly
- High event counts with no commits

**Action:** Kill the session, review why it got stuck, tune thresholds.

## 9. Agent-Specific Tips

### Architect
- Use haiku for initial codebase exploration
- Use sonnet only for ADR writing and tradeoff analysis

### Backend-dev / Frontend-dev
- Use haiku for file discovery and reading existing code
- Switch to sonnet when writing new features

### QA-lead
- Use haiku for test discovery and classification
- Use sonnet for complex test scenario generation

### Code-reviewer
- Use sonnet (always) - quality matters more than cost here

## 10. Cost Tracking

Monitor actual spend:

```bash
# Orchestrator registry
cat ~/.claude-agency/registry.json | jq '.daily_spend'

# Per-ticket costs
cat ~/.claude-agency/registry.json | jq '.tickets[] | {id, estimated_cost}'
```

Set up alerts when approaching daily caps:

```bash
# Add to your shell profile
alias token-burn='jq -r ".daily_spend" ~/.claude-agency/registry.json'
```

---

## Expected Savings

Implementing all recommendations:

- **Quick wins (haiku + graphify):** 40-60% reduction
- **Full optimization:** 60-75% reduction
- **Orchestrator caps:** Prevents runaway spend (unbounded → bounded)

## Rollback

If optimization causes quality issues:

1. Remove model parameters from Task calls (defaults to sonnet)
2. Use "medium" or "very thorough" for Explore agent
3. Increase orchestrator thresholds
4. Review `~/.claude-agency/agent-logs/` for failures
