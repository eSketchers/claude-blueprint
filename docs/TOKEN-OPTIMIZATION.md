# Token Optimization Guide

This document provides **safe** strategies to minimize token usage across the Claude Agency Blueprint without changing the core workflow or degrading code quality.

**Core Principle:** Quality and correctness > token savings. Eliminate waste, not understanding.

For detailed rationale and risk analysis, see **[SAFE-CONTEXT-REDUCTION.md](./SAFE-CONTEXT-REDUCTION.md)**.

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

## 0. Filter Noise Files with .claudeignore (Highest Impact)

The blueprint includes `.claude/.claudeignore` which automatically filters files that agents should never read.

**What's blocked:**
- Dependencies (node_modules/, vendor/)
- Build outputs (dist/, build/, .next/)
- Generated/minified files (*.min.js, *_pb2.py)
- Lock files (package-lock.json, yarn.lock)
- Version control internals (.git/)

**Impact:** 80-95% reduction in Glob/Grep noise results

**Risk:** None - these files genuinely don't help agents understand code

**The file is already created** - no setup needed. Just works automatically.

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

**Key Feature: Incremental Updates (Built-in)**
- Graphify uses SHA256 caching - only changed files are re-processed
- Re-indexing 5 changed files: ~5-15 seconds (vs 2-5 minutes for full re-index)
- Makes post-commit hooks practical for keeping graph fresh automatically

**Installation:** The PyPI package is `graphifyy` (double-y), but the CLI command is `graphify`:
```bash
pip install --user graphifyy
```

**Usage:**
```bash
# After merging a large feature (incremental automatically)
graphify index .

# Query the graph instead of reading files
graphify query "What modules handle authentication?"
```

**Automatic Updates (Recommended):**
```bash
# Install post-commit hook for automatic incremental updates
cp hooks/post-commit.sample .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# Now graph updates automatically after each commit (5-15s overhead)
```

**When to re-index:**

The knowledge graph captures file structure, function/class definitions, and code relationships. Re-index when these change significantly:

**Structural Changes (always re-index):**
- Adding/removing 10+ files
- Moving files between directories
- Renaming modules, classes, or functions used across multiple files
- Splitting or merging services/modules
- Changing directory structure

**Code Changes (re-index if significant):**
- Major refactoring (affecting 20+ files or changing architectural boundaries)
- Adding new API endpoints/routes (5+ endpoints)
- Database schema migrations that add/remove entities
- Adding new feature modules
- Dependency changes (new libraries that introduce new patterns)

**Time-based (for active projects):**
- **Daily active projects:** Every 2-3 days or after each major feature
- **Weekly active projects:** Weekly on Monday morning
- **Occasional updates:** After each batch of changes

**Automatic threshold:**
- Script auto-skips if index is < 24 hours old (use `--force` to override)

## 4. Parallel Agent Strategy

The `/ticket` workflow already spawns specialized agents in parallel. Each has isolated context = more efficient than one agent with all contexts.

**Best practice:** Let the workflow handle parallelization automatically. Don't try to coordinate agents manually.

## 5. File Operation Hygiene

**Already optimized in the blueprint**, but for custom agents:

✅ **DO:**
- Use Read/Glob/Grep tools directly
- Read specific files once
- Use Grep with `output_mode: "files_with_matches"` for discovery

❌ **DON'T:**
- Use bash `cat` / `find` / `grep` when tools exist
- Read the same file multiple times
- Use `Read` without `limit` on huge files

## 6. Pre-commit Hooks Reduce Rework

The blueprint's PostToolUse hooks catch lint/format issues immediately, preventing costly fix-refix loops.

**Already enabled** - no action needed.

## 7. Dashboard Monitoring

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

## 8. Agent-Specific Tips

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

## 9. Cost Tracking

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

## Phase 2: Additional Optimizations (Optional)

Once Phase 1 is stable, consider these advanced strategies:

### 11. Template Library

**Impact:** 2K-5K tokens saved per new file creation
**Status:** ✅ Templates available in `.claude/templates/`

Agents check `.claude/templates/` before reading example files:
- **NestJS:** controller, service
- **React:** component, form
- **FastAPI:** router, service
- **Testing:** pytest-fixture, jest-mock

Only read existing code when templates don't exist or need project-specific customizations.

### 12. AST-Based Navigation

**Impact:** 60-80% reduction for "find all X" queries
**Status:** ✅ Available via `scripts/ast-query.sh`

Use AST queries instead of Grep+Read for structural searches:
```bash
# Find authentication guards
./scripts/ast-query.sh auth-guards

# Find specific function
./scripts/ast-query.sh function-name handleLogin

# Find Python class
./scripts/ast-query.sh python-class UserService
```

### 13. Module Batching

**Impact:** 20-30% reduction in multi-file reads
**Status:** ✅ Available via `scripts/read-module.sh`

Read entire modules at once instead of separate files:
```bash
# Read all files in auth module
./scripts/read-module.sh src/auth
```

More efficient than separate Read calls, provides better context.

**Phase 2 details:** See `docs/optimization-phases/PHASE-2-PRACTICAL.md`

---

## Expected Savings (Projections)

**These are theoretical projections based on strategy analysis, not measured results.**

Implementing all recommendations:

- **Phase 1 (core optimizations):** Targets 70-85% waste elimination
  - `.claudeignore` filtering: 80-95% noise reduction
  - Smart reading patterns: 50-70% reduction in unnecessary file reads
  - Graphify indexing: 60-80% fewer repeated file reads

- **Phase 2 (templates + AST + batching):** Additional 10-20% reduction
  - Templates: 2K-5K tokens per new file (when applicable)
  - AST navigation: 60-80% reduction for structural queries
  - Module batching: 20-30% savings on related file reads

**Actual reduction depends on:**
- Codebase structure (how much noise vs signal)
- Task types (exploration vs implementation)
- Agent adherence to guidance (prompt-based, not enforced)

**Combined target:** 70-90% reduction in wasted context (not total context)

## Rollback

If optimization causes quality issues:

1. Remove model parameters from Task calls (defaults to sonnet)
2. Use "medium" or "very thorough" for Explore agent
3. Increase orchestrator thresholds
4. Stop using templates (agents will read examples as before)
5. Review `~/.claude-agency/agent-logs/` for failures
