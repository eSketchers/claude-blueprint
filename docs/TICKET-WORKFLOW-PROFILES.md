# /ticket Workflow Profile Usage

Quick guide for choosing the right profile when running `/ticket`.

## TL;DR

```bash
# Safe default (all MCPs loaded)
./scripts/switch-profile.sh ticket
claude
/ticket <url>

# Optimized (if you know ticket scope)
./scripts/switch-profile.sh frontend  # UI-only ticket
claude
/ticket <url>
```

## When to Use Which Profile

| Ticket Contains | Use Profile | Why | Token Savings |
|-----------------|-------------|-----|---------------|
| "Add React component" | `frontend` | No backend work | ~30-40% |
| "Build API endpoint" | `backend` | No UI work | ~40-50% |
| "Full-stack feature" | `ticket` | Needs all MCPs | 0% (baseline) |
| "Fix typo in docs" | `minimal` | No implementation | ~60-70% |
| "Refactor backend service" | `backend` | No UI changes | ~40-50% |
| "Unknown scope" | `ticket` | Safe default | 0% |

## Profile Contents

### `ticket` (Full Workflow)
```
✅ sequential-thinking
✅ memory
✅ serena (code search)
✅ context7 (library docs)
✅ playwright (E2E tests)
✅ github (PRs/issues)
```

**Use for:** Any ticket where you're unsure of scope.

### `frontend` (UI Work)
```
✅ sequential-thinking
✅ memory
✅ serena
✅ context7
✅ playwright
❌ github (if not needed for this ticket)
```

**Use for:** React/Next.js components, UI features, E2E tests.

**Saves:** ~1-2k tokens (github excluded).

### `backend` (API Work)
```
✅ sequential-thinking
✅ memory
✅ serena
✅ context7
❌ playwright (not needed)
❌ github (if not needed)
```

**Use for:** API endpoints, database work, backend services.

**Saves:** ~4-7k tokens (playwright + github excluded).

### `minimal` (Exploration Only)
```
✅ sequential-thinking
✅ memory
✅ serena
❌ context7
❌ playwright
❌ github
```

**Use for:** Docs updates, exploration, research spikes.

**Saves:** ~8-12k tokens (most MCPs excluded).

**Warning:** Will fail on Phase 6 (implementation) if ticket requires coding.

## Phase-by-Phase Requirements

| Phase | Description | Required MCPs | Notes |
|-------|-------------|---------------|-------|
| 0 | Fetch ticket | github/clickup/linear | Profile check added here |
| 1 | Plan | serena | Always needed |
| 2 | Adversarial review | serena | Always needed |
| 3 | Improved plan | serena | Always needed |
| 4 | Approval gate | — | No MCPs needed |
| 5 | Worktree | — | Git only |
| 6 | Implementation | context7, playwright* | *If E2E tests needed |
| 7 | Test | playwright* | *If E2E tests exist |
| 8 | Auto-fix | context7, playwright* | *Conditional |
| 9 | PR | github | Always needed |

## Profile Check (Phase 0)

Starting in Phase 0, the workflow now checks your active profile:

```
/ticket <url>
→ Fetches ticket
→ Classifies: "feature"
→ Checks: jq '.mcpServers | keys[]' .claude/settings.json
→ Sees: only 3 MCPs (minimal profile)
→ Warns: "⚠️  Recommend 'frontend', 'backend', or 'ticket' profile for features"
→ User can continue or exit to switch profile
```

## Examples

### Example 1: UI-Only Feature

```bash
# Ticket: "Add dark mode toggle to settings page"
# Classification: feature (frontend-only)

./scripts/switch-profile.sh frontend
claude
/ticket https://github.com/org/repo/issues/42

# ✅ Runs successfully
# ✅ Saves ~30-40% MCP tokens (github excluded, playwright used for E2E)
```

### Example 2: API-Only Feature

```bash
# Ticket: "Add pagination to /users endpoint"
# Classification: feature (backend-only)

./scripts/switch-profile.sh backend
claude
/ticket https://github.com/org/repo/issues/43

# ✅ Runs successfully
# ✅ Saves ~40-50% MCP tokens (playwright + github excluded)
# ⚠️  May fail if PR creation needs github MCP
```

### Example 3: Documentation Update

```bash
# Ticket: "Update README with installation steps"
# Classification: chore

./scripts/switch-profile.sh minimal
claude
/ticket https://github.com/org/repo/issues/44

# ✅ Runs through Phase 0-5
# ❌ May fail at Phase 6 if README needs verification
# ✅ Saves ~60-70% MCP tokens
```

### Example 4: Unknown Scope (Safe Default)

```bash
# Ticket: "Improve user authentication flow"
# Could touch FE, BE, infra

./scripts/switch-profile.sh ticket
claude
/ticket https://github.com/org/repo/issues/45

# ✅ Always works
# ✅ All MCPs available
# ❌ No token savings, but safe
```

## Best Practices

### 1. Start with `ticket` Profile

If unsure, always use the full `ticket` profile:

```bash
./scripts/switch-profile.sh ticket
claude
/ticket <url>
```

### 2. Optimize for Repeat Workflows

Once you know your ticket patterns:

```bash
# Your team mostly does frontend work
alias tix-fe='./scripts/switch-profile.sh frontend && claude'

# Your team mostly does backend work
alias tix-be='./scripts/switch-profile.sh backend && claude'

# Use in shell
tix-fe
/ticket <frontend-ticket-url>
```

### 3. Let Orchestrator Auto-Optimize

For autonomous operation, classify tickets and set profile automatically:

```javascript
// In orchestrator/spawn.mjs
const profile = classifyTicket(ticket);  // Returns: frontend|backend|ticket
await switchProfile(profile);
spawnClaude(`/ticket ${ticket.url} --auto`);
```

### 4. Monitor for Failures

Track if lighter profiles cause workflow failures:

```bash
# Log profile + outcome
echo "$(date) | $PROFILE | $TICKET_ID | SUCCESS" >> ~/.claude-agency/profile-outcomes.log
echo "$(date) | $PROFILE | $TICKET_ID | FAILED_PHASE_6" >> ~/.claude-agency/profile-outcomes.log
```

Review monthly to tune profile strategy.

## Common Questions

### Q: What if I choose the wrong profile?

**A:** The workflow will warn you in Phase 0 if profile seems insufficient. You can:
- Continue anyway (may fail later)
- Exit and switch profile
- Let it fail and restart with correct profile

### Q: Can I switch profiles mid-workflow?

**A:** No. Profile changes require restarting Claude Code. If you're in Phase 6 and realize you need more MCPs, you must:
1. Exit Claude Code
2. Run `./scripts/switch-profile.sh <better-profile>`
3. Restart `claude`
4. Re-run `/ticket <url>` from Phase 0

### Q: Does orchestrator handle this automatically?

**A:** Not yet (v1). You can add auto-classification logic to `orchestrator/spawn.mjs` to classify tickets and set profile before spawning. See [TICKET-PROFILE-OPTIMIZATION.md](./TICKET-PROFILE-OPTIMIZATION.md).

### Q: What if ticket scope changes during implementation?

**A:** If Phase 1 plan reveals broader scope than initial classification (e.g., "backend ticket" actually needs UI changes):
- Phase 0 check will warn if profile insufficient
- Architect agent will note missing tools in plan
- You can exit, upgrade profile, restart

### Q: Should I always use `ticket` to be safe?

**A:** Yes, if:
- You're new to the workflow
- Ticket scope is unclear
- Autonomous operation (orchestrator)

No, if:
- You clearly know it's UI-only or API-only
- Optimizing for token usage
- Manual operation with human oversight

## Summary

| Workflow Type | Recommended Profile | Why |
|---------------|---------------------|-----|
| **First time using /ticket** | `ticket` | Learn the flow safely |
| **Production orchestrator** | `ticket` | Avoid failures |
| **Manual ticket (known scope)** | `frontend` or `backend` | Save 30-50% tokens |
| **Daily dev work (mixed)** | `ticket` | One profile fits all |

See also:
- [DYNAMIC-CONTEXT-OPTIMIZATION.md](./DYNAMIC-CONTEXT-OPTIMIZATION.md) - General profile usage
- [TICKET-PROFILE-OPTIMIZATION.md](./TICKET-PROFILE-OPTIMIZATION.md) - Advanced optimization strategies
- [PROFILE-QUICK-REFERENCE.md](./PROFILE-QUICK-REFERENCE.md) - One-page cheat sheet
