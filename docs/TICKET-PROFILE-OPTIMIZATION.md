# Ticket Workflow Profile Optimization

How to use the right profile for different ticket types to maximize token savings.

## The Problem

The `/ticket` workflow has 9 phases, but **not all tickets need all MCPs**:

| Ticket Type | Needs Frontend? | Needs Backend? | Needs GitHub? |
|-------------|----------------|----------------|---------------|
| **Bug fix** | Maybe | Maybe | Yes |
| **Frontend feature** | Yes | No | Yes |
| **Backend feature** | No | Yes | Yes |
| **Full-stack feature** | Yes | Yes | Yes |
| **Chore** | No | No | Yes |
| **Docs** | No | No | Yes |

## Solution: Conditional Profiles Per Ticket Type

### Strategy 1: Manual Pre-Classification

**Before running `/ticket`**, read the ticket and choose profile:

```bash
# Frontend-only ticket
./scripts/switch-profile.sh frontend
claude
/ticket https://github.com/org/repo/issues/123

# Backend-only ticket
./scripts/switch-profile.sh backend
claude
/ticket https://github.com/org/repo/issues/456

# Full-stack ticket
./scripts/switch-profile.sh ticket
claude
/ticket https://github.com/org/repo/issues/789
```

**Token savings:**
- Frontend-only: ~40% vs fullstack (no backend-specific context loaded)
- Backend-only: ~30% vs fullstack (playwright excluded)

### Strategy 2: Orchestrator Auto-Classification

For autonomous operation, the orchestrator can classify and set profile:

```javascript
// In orchestrator/spawn.mjs
async function classifyAndSetProfile(ticket) {
    const labels = ticket.labels.map(l => l.name.toLowerCase());
    const title = ticket.title.toLowerCase();
    const body = ticket.body.toLowerCase();

    // Detect ticket type from labels/content
    if (labels.includes('frontend') || /\b(ui|component|react|next)\b/.test(title + body)) {
        return 'frontend';
    }

    if (labels.includes('backend') || /\b(api|database|migration)\b/.test(title + body)) {
        return 'backend';
    }

    if (labels.includes('bug') && !labels.includes('feature')) {
        return 'minimal';  // Bugs often don't need playwright
    }

    // Default to fullstack for features
    return 'ticket';
}

// Before spawn
const profile = await classifyAndSetProfile(ticket);
await switchProfile(profile);
spawnHeadlessClaude(`/ticket ${ticket.url}`);
```

### Strategy 3: Dynamic Phase-Based Loading (Future)

**Ideal but requires Claude Code changes:**

```
Phase 0-3 (Planning): Use minimal profile
  ↓ (auto-upgrade)
Phase 6 (Implementation): Detect from plan which agents needed
  → Frontend work detected: Load playwright
  → Backend work detected: Load context7
  → No E2E tests: Skip playwright
  ↓
Phase 7-9 (Test/PR): Keep only needed MCPs
```

This would require Claude Code to support **mid-session MCP loading** (not currently supported).

## Current Recommendation

### For Manual `/ticket` Usage

**Default to `ticket` profile** to ensure all phases work:

```bash
./scripts/switch-profile.sh ticket
claude
/ticket <url>
```

**Optimize only if you know the ticket scope:**

| Ticket Scope | Profile | Why |
|--------------|---------|-----|
| UI-only (no API changes) | `frontend` | No backend context needed |
| API-only (no UI changes) | `backend` | No playwright needed |
| Documentation | `minimal` | No implementation MCPs needed |
| Exploration/spike | `minimal` | Just researching, not coding |
| Unknown/mixed | `ticket` | Safe default |

### For Orchestrator Usage

Implement auto-classification logic:

1. Fetch ticket metadata (labels, title, description)
2. Classify based on keywords/labels
3. Set profile before spawn
4. Fall back to `ticket` if unsure

## Phase-by-Phase MCP Requirements

Here's what each `/ticket` phase actually needs:

| Phase | MCPs Required | Can Skip If... |
|-------|---------------|----------------|
| 0: Fetch ticket | github (or clickup/linear) | Using different tracker |
| 1: Plan (architect) | serena (code search) | — Always needed |
| 2: Review (code-reviewer) | serena | — Always needed |
| 3: Improved plan | serena | — Always needed |
| 4: Approval gate | — None — | Human interaction only |
| 5: Worktree | — None — | Git operations only |
| 6: Implement | context7, playwright (conditional) | Backend-only = no playwright |
| 7: Test | playwright (conditional) | No E2E tests = skip |
| 8: Auto-fix | context7, playwright (conditional) | — Depends on failures |
| 9: PR | github | — Always needed |

### Minimal MCP Set for Backend-Only Ticket

```json
{
  "sequential-thinking": {...},
  "memory": {...},
  "serena": {...},
  "context7": {...},
  "github": {...}
  // playwright excluded - saves ~3-5k tokens
}
```

### Minimal MCP Set for Docs/Chore Ticket

```json
{
  "sequential-thinking": {...},
  "memory": {...},
  "serena": {...},
  "github": {...}
  // context7, playwright excluded - saves ~5-8k tokens
}
```

## Implementation Example

### Update ticket.md to Respect Profile

Add to Phase 0 of `.claude/commands/ticket.md`:

```markdown
## Phase 0 — Fetch & classify

1. Parse ticket reference and fetch details
2. Classify: feature | bug | chore | spike
3. **Check active MCP profile:**
   - If minimal profile + feature ticket → Warn: "Consider using 'frontend' or 'backend' profile"
   - If frontend profile + backend-heavy ticket → Warn: "Consider upgrading to 'ticket' profile"
   - If profile matches ticket → Proceed
4. Report classification and recommended profile (if different from current)
```

### Add Profile Checker Script

```bash
#!/usr/bin/env bash
# .claude/hooks/check-ticket-profile.sh
# Warns if current profile may be insufficient for ticket

TICKET_TYPE="$1"  # feature|bug|chore|spike
CURRENT_PROFILE="$2"  # minimal|frontend|backend|ticket

case "$TICKET_TYPE" in
    feature)
        if [[ "$CURRENT_PROFILE" == "minimal" ]]; then
            echo "⚠️  Warning: Minimal profile may lack needed MCPs for feature implementation"
            echo "   Recommend: frontend, backend, or ticket profile"
        fi
        ;;
    bug)
        # Bugs are often quick fixes, minimal may be fine
        :
        ;;
    chore)
        # Chores rarely need playwright
        if [[ "$CURRENT_PROFILE" == "ticket" ]]; then
            echo "ℹ️  Info: 'backend' or 'minimal' profile may be sufficient for chores"
        fi
        ;;
esac
```

## Testing Profile Impact

### Measure Token Usage Per Profile

Run same ticket with different profiles and compare:

```bash
# Test 1: Full profile
./scripts/switch-profile.sh ticket
claude
/ticket https://github.com/org/repo/issues/123
/context  # Note: System tools: 15.2k tokens

# Test 2: Frontend profile (if ticket is UI-only)
./scripts/switch-profile.sh frontend
claude
/ticket https://github.com/org/repo/issues/123
/context  # Note: System tools: ~10-12k tokens (30-40% savings)

# Test 3: Backend profile (if ticket is API-only)
./scripts/switch-profile.sh backend
claude
/ticket https://github.com/org/repo/issues/456
/context  # Note: System tools: ~9-11k tokens (40-50% savings)
```

## Best Practices

1. **Default to `ticket` profile** - ensures all phases work
2. **Optimize for known scopes** - use frontend/backend if ticket is clearly scoped
3. **Orchestrator auto-classification** - implement for autonomous operation
4. **Monitor failures** - track if lighter profiles cause `/ticket` failures
5. **Document conventions** - e.g., "UI label = frontend profile"

## Common Pitfalls

### ❌ Using `minimal` for `/ticket`

```bash
./scripts/switch-profile.sh minimal
claude
/ticket <url>
# Phase 6 fails - no context7 for library docs
# Phase 7 fails - no playwright for E2E tests
```

**Fix:** Use `frontend`, `backend`, or `ticket` profile.

### ❌ Using `frontend` for backend ticket

```bash
./scripts/switch-profile.sh frontend
claude
/ticket <backend-api-url>
# Works, but loads playwright unnecessarily
# Wastes ~3-5k tokens
```

**Fix:** Use `backend` profile instead.

### ❌ Switching mid-workflow

```bash
./scripts/switch-profile.sh ticket
claude
/ticket <url>
# ... during Phase 6 implementation ...
# Exit and switch profile ← DON'T DO THIS
```

**Fix:** Let workflow complete with initial profile, or restart from Phase 0.

## Summary

| Usage Pattern | Recommended Profile | Token Savings |
|---------------|---------------------|---------------|
| **Manual /ticket (unknown scope)** | `ticket` | 0% (safe default) |
| **Manual /ticket (UI-only)** | `frontend` | ~30-40% |
| **Manual /ticket (API-only)** | `backend` | ~40-50% |
| **Manual /ticket (docs/chore)** | `backend` or `minimal` | ~40-60% |
| **Orchestrator autonomous** | Auto-classify → set profile | ~20-50% avg |

**Conservative approach:** Always use `ticket` profile for `/ticket` workflow.

**Aggressive optimization:** Classify tickets → use minimal viable profile.

See [DYNAMIC-CONTEXT-OPTIMIZATION.md](./DYNAMIC-CONTEXT-OPTIMIZATION.md) for general profile usage.
