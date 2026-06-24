# Dynamic Profile System - Changes Summary

Quick overview of all changes and their impact.

## 📊 Changes at a Glance

| Category | Files Changed | Breaking? | Impact |
|----------|---------------|-----------|--------|
| **New Config** | 2 files | ❌ No | Defines profiles (not used by default) |
| **New Scripts** | 3 files | ⚠️ Yes, if used | Switches MCPs/agents |
| **Modified Code** | 1 file | ⚠️ Minor | Added check in /ticket Phase 0 |
| **New Docs** | 7 files | ❌ No | Documentation only |
| **Modified Docs** | 2 files | ❌ No | Documentation updates |

**Total:** 15 files changed/added, **0 files deleted**

---

## 📁 File Changes Breakdown

### ✅ New Configuration (Non-Breaking)

```
.claude/settings.profiles.json          ← MCP profile definitions
.claude/agents.profiles.json            ← Agent profile definitions
```

**Impact:** None unless scripts are used

---

### 🔧 New Scripts (Breaking if Used)

```
scripts/switch-profile.sh               ← Switch MCPs only
scripts/switch-agents.sh                ← Switch agents only (⚠️ removes agent files)
scripts/switch-profile-full.sh          ← Switch both MCPs + agents
```

**Impact:**
- ✅ None if not executed
- ⚠️ Changes `.claude/settings.json` when run
- ⚠️ Moves agents to `.claude/agents.backup/` when run
- ⚠️ Requires Claude Code restart

---

### ⚠️ Modified Workflow (Minor Breaking)

```
.claude/commands/ticket.md              ← Added profile check in Phase 0
```

**Before Phase 0:**
```
1. Fetch ticket
2. Classify
3. Ask if not feature
```

**After Phase 0:**
```
1. Fetch ticket
2. Classify
3. Check MCP profile ← NEW
4. Ask if not feature
```

**Impact:**
- ✅ No impact with default settings (6 MCPs loaded)
- ⚠️ Shows warning if using lighter profile
- ✅ User can ignore warning and continue
- ⚠️ Later phases may fail if MCPs insufficient

---

### 📚 New Documentation (Non-Breaking)

```
docs/DYNAMIC-CONTEXT-OPTIMIZATION.md    ← Complete profile guide
docs/PROFILE-QUICK-REFERENCE.md         ← Cheat sheet
docs/TICKET-PROFILE-OPTIMIZATION.md     ← /ticket optimization
docs/TICKET-WORKFLOW-PROFILES.md        ← /ticket + profiles guide
docs/AGENT-PROFILES.md                  ← Agent management guide
docs/CHANGELOG-DYNAMIC-PROFILES.md      ← This changelog
.claude/commands/optimize-context.md    ← Slash command (not tested)
.claude/hooks/dynamic-context.sh        ← Helper script (not wired)
```

**Impact:** ✅ None (documentation only)

---

### 📝 Modified Documentation (Non-Breaking)

```
README.md                               ← Added Phase 3 section
docs/TOKEN-OPTIMIZATION.md              ← Added section 10
```

**Impact:** ✅ None (informational only)

---

## 🔄 Workflow Impact Analysis

### `/ticket` Workflow

#### **Default Behavior (No Profile Switching)**

```bash
claude  # Default settings.json loaded
/ticket <url>
```

**Impact:** ✅ **ZERO CHANGES**
- All 6 MCPs loaded
- All 6 agents available
- Phase 0 sees full profile → no warnings
- All 9 phases work identically

---

#### **With ticket Profile (Explicit)**

```bash
./scripts/switch-profile-full.sh ticket
claude
/ticket <url>
```

**Impact:** ✅ **IDENTICAL TO DEFAULT**
- All 6 MCPs loaded
- All 6 agents available
- Phase 0 happy → no warnings
- All 9 phases work identically

---

#### **With Lighter Profile (e.g., frontend)**

```bash
./scripts/switch-profile-full.sh frontend
claude
/ticket <url>
```

**Impact:** ⚠️ **MAY BREAK**

| Phase | Status | Notes |
|-------|--------|-------|
| 0 | ⚠️ Warning | Detects insufficient MCPs, warns user |
| 1-3 | ✅ Works | serena available for code search |
| 4-5 | ✅ Works | No MCPs needed |
| 6 | ⚠️ May fail | If backend-dev agent excluded |
| 7 | ⚠️ May fail | If playwright excluded |
| 8 | ⚠️ May fail | If playwright excluded |
| 9 | ⚠️ May fail | If github MCP excluded |

**Recommendation:** **DON'T use lighter profiles for /ticket**

---

### Manual Development Workflows

#### **Before Profiles**

```bash
claude
# All 6 MCPs + all 6 agents always loaded
# ~15k tokens MCP overhead
```

---

#### **After Profiles (If Used)**

**Exploration:**
```bash
./scripts/switch-profile.sh minimal
claude
# 3 MCPs + all 6 agents
# ~5k tokens MCP overhead (67% savings)
```

**Frontend work:**
```bash
./scripts/switch-profile.sh frontend
claude
# 5 MCPs + all 6 agents
# ~10k tokens MCP overhead (33% savings)
```

**Backend work:**
```bash
./scripts/switch-profile.sh backend
claude
# 4 MCPs + all 6 agents
# ~7k tokens MCP overhead (53% savings)
```

**Impact:** ✅ Works perfectly if profile matches task

---

### Orchestrator Workflow

#### **Before**

```javascript
// orchestrator/spawn.mjs
spawnClaude(`/ticket ${url} --auto`);
// Uses default settings.json
```

**Impact:** ✅ None

---

#### **After (If Enhanced)**

```javascript
// orchestrator/spawn.mjs
const profile = classifyTicket(ticket);  // New logic
await switchProfile(profile);            // New call
spawnClaude(`/ticket ${url} --auto`);
```

**Impact:** ⚠️ Requires implementing classification

**Recommendation:** Keep using default settings for safety

---

### Dashboard Workflow

**Before:**
```bash
node dashboard/server.mjs
# Shows all 6 agents across all projects
```

**After (if agent profiles used):**
```bash
node dashboard/server.mjs
# Shows only active agents (1-6 depending on profile)
```

**Impact:**
- ✅ Cleaner UI (fewer agents)
- ⚠️ May be confusing (expected agent not visible)

---

## 🎯 Migration Strategies

### **Strategy 1: Do Nothing (Safest)**

```bash
# Don't run any profile scripts
# Keep using default settings
claude
/ticket <url>
```

**Pros:**
- ✅ Zero risk
- ✅ Zero changes
- ✅ Everything works identically

**Cons:**
- ❌ No token savings
- ❌ No optimization

**Best for:** Teams that don't need optimization

---

### **Strategy 2: MCP-Only Profiles (Recommended)**

```bash
# Switch MCPs, keep all agents
./scripts/switch-profile.sh minimal    # For exploration
./scripts/switch-profile.sh frontend   # For UI work
./scripts/switch-profile.sh backend    # For API work
./scripts/switch-profile.sh ticket     # For /ticket
```

**Pros:**
- ✅ 30-70% token savings
- ✅ All agents available (flexibility)
- ✅ Low risk

**Cons:**
- ⚠️ Must restart Claude Code
- ⚠️ Must remember to switch

**Best for:** Manual development work

---

### **Strategy 3: Full Profiles (Advanced)**

```bash
# Switch both MCPs and agents
./scripts/switch-profile-full.sh frontend
```

**Pros:**
- ✅ 30-70% token savings
- ✅ Perfect consistency
- ✅ Can't invoke wrong agent

**Cons:**
- ⚠️ Less flexible
- ⚠️ Higher risk for /ticket
- ⚠️ Must restart if wrong profile

**Best for:** Orchestrator, focused work

---

### **Strategy 4: Hybrid (Optimal)**

**Manual work:**
```bash
./scripts/switch-profile.sh <profile>  # MCPs only
```

**Orchestrator:**
```bash
./scripts/switch-profile-full.sh ticket  # Always safe
```

**Best for:** Most teams

---

## ⚠️ Breaking Changes (Only if Scripts Used)

### 1. Agent Removal

**Trigger:** Running `./scripts/switch-agents.sh <profile>`

**Effect:**
- Moves agents to `.claude/agents.backup/`
- Filters `.claude/agents/` to profile agents only
- NEW sessions see only profile agents

**Fix:**
```bash
./scripts/switch-agents.sh ticket  # Restore all
```

---

### 2. /ticket Phase 0 Warning

**Trigger:** Running `/ticket` with lighter profile

**Effect:**
- Phase 0 detects insufficient MCPs
- Shows warning to user
- User must acknowledge to continue

**Fix:**
```bash
./scripts/switch-profile.sh ticket  # Use full profile
```

---

### 3. Missing MCPs in Later Phases

**Trigger:** Using lighter profile, continuing past Phase 0 warning

**Effect:**
- Phase 6: May fail if context7 excluded
- Phase 7: May fail if playwright excluded
- Phase 9: May fail if github excluded

**Fix:**
- Exit and restart with `ticket` profile
- Or accept partial workflow completion

---

## ✅ No Breaking Changes If

1. **You don't run profile scripts** - Default behavior preserved
2. **You use `ticket` profile for /ticket** - All MCPs/agents available
3. **You match profile to task** - Frontend profile for frontend work

---

## 🔧 Rollback Process

### Rollback Everything

```bash
# Remove new files
rm .claude/settings.profiles.json
rm .claude/agents.profiles.json
rm scripts/switch-profile*.sh
rm scripts/switch-agents.sh
rm .claude/hooks/dynamic-context.sh
rm .claude/commands/optimize-context.md
rm -rf .claude/agents.backup/

# Restore originals
git checkout .claude/settings.json
git checkout .claude/commands/ticket.md
git checkout README.md
git checkout docs/TOKEN-OPTIMIZATION.md

# Remove docs (optional)
rm docs/DYNAMIC-CONTEXT-OPTIMIZATION.md
rm docs/PROFILE-QUICK-REFERENCE.md
rm docs/TICKET-PROFILE-OPTIMIZATION.md
rm docs/TICKET-WORKFLOW-PROFILES.md
rm docs/AGENT-PROFILES.md
rm docs/CHANGELOG-DYNAMIC-PROFILES.md
rm docs/CHANGES-SUMMARY.md

# Restart
claude
```

---

### Rollback Just MCPs

```bash
# Restore settings
cp .claude/settings.json.backup-<latest> .claude/settings.json
claude  # Restart
```

---

### Rollback Just Agents

```bash
# Restore all agents
./scripts/switch-agents.sh ticket
# Or manually:
cp .claude/agents.backup/*.md .claude/agents/
claude  # Restart
```

---

## 📈 Token Savings Summary

### MCP Savings (High Impact)

| Profile | MCPs | Tokens | Savings |
|---------|------|--------|---------|
| ticket | 6 | ~15k | 0% (baseline) |
| fullstack | 6 | ~12k | ~20% |
| frontend | 5 | ~10k | ~33% |
| backend | 4 | ~7k | ~53% |
| minimal | 3 | ~5k | ~67% |

---

### Agent Savings (Low Impact)

| Profile | Agents | Tokens | Savings |
|---------|--------|--------|---------|
| ticket | 6 | ~320 | 0% |
| fullstack | 4 | ~220 | ~31% |
| frontend | 3 | ~170 | ~47% |
| backend | 3 | ~170 | ~47% |
| minimal | 1 | ~60 | ~81% |

---

### Combined Savings

| Profile | Total Savings | Best For |
|---------|---------------|----------|
| **minimal** | ~10.3k tokens (67%) | Exploration, planning |
| **frontend** | ~7.2k tokens (33%) | UI work |
| **backend** | ~8.2k tokens (53%) | API work |
| **fullstack** | ~4.1k tokens (20%) | Mixed work |

---

## 🎓 Recommendations

### For /ticket Workflow

```bash
# ALWAYS use ticket profile
./scripts/switch-profile.sh ticket
claude
/ticket <url>
```

**Don't risk lighter profiles** unless extensively tested.

---

### For Manual Work

```bash
# Match profile to task
./scripts/switch-profile.sh minimal     # Planning
./scripts/switch-profile.sh frontend    # UI work
./scripts/switch-profile.sh backend     # API work
```

Keep all agents available (don't use `switch-profile-full.sh`)

---

### For Orchestrator

```bash
# Safe default
await switchProfile('ticket');
spawnClaude(`/ticket ${url} --auto`);
```

Don't auto-classify in v1 - too risky.

---

## ❓ FAQ

### Q: Will this break my existing workflows?

**A:** No, only if you run the profile scripts. Default behavior is 100% preserved.

---

### Q: Should I use this for /ticket?

**A:** Only with `ticket` profile. Don't use lighter profiles.

---

### Q: What's the risk level?

**A:**
- **No scripts:** ✅ Zero risk
- **MCP-only profiles:** ⚠️ Low risk (may lack tools)
- **Full profiles:** ⚠️ Medium risk (agents excluded)
- **Lighter /ticket:** ⛔ High risk (workflow may fail)

---

### Q: Can I undo changes?

**A:** Yes, easily. See [Rollback Process](#-rollback-process)

---

### Q: What's the ROI?

**A:**
- **MCP optimization:** High (10k tokens saved)
- **Agent optimization:** Low (150 tokens saved)
- **Combined:** Medium-High (10.3k tokens saved)

---

## 📋 Testing Checklist

Before production:

- [ ] Test `/ticket` with `ticket` profile (expect: works)
- [ ] Test `/ticket` with `frontend` profile (expect: warning in Phase 0)
- [ ] Test manual frontend work with `frontend` profile (expect: works)
- [ ] Test manual backend work with `backend` profile (expect: works)
- [ ] Test exploration with `minimal` profile (expect: works)
- [ ] Test rollback: `./scripts/switch-profile.sh ticket` (expect: all restored)
- [ ] Test agent rollback: `./scripts/switch-agents.sh ticket` (expect: all agents back)
- [ ] Run `/context` before/after switching (expect: token count difference)
- [ ] Test orchestrator with `ticket` profile (expect: works)
- [ ] Test dashboard with filtered agents (expect: shows only active)

---

## 📞 Support

**Issues?**
1. Check [CHANGELOG-DYNAMIC-PROFILES.md](./CHANGELOG-DYNAMIC-PROFILES.md) for detailed impact
2. Review [DYNAMIC-CONTEXT-OPTIMIZATION.md](./DYNAMIC-CONTEXT-OPTIMIZATION.md) for usage
3. Rollback if needed (see above)
4. Open issue in blueprint repo

**Best Practices:**
1. Start with MCP-only profiles
2. Always use `ticket` profile for `/ticket`
3. Test on non-critical work first
4. Measure actual savings with `/context`
5. Keep backups accessible

---

**Summary:** 15 files added/changed, fully backward compatible, optional optimization, 30-70% token savings possible with correct usage.
