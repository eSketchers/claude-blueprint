# Monorepo Support — Executive Summary

## Problem

The blueprint's `adopt.sh` script only accepts **one framework** at a time:

```bash
adopt.sh --framework python  # Works for Django project
adopt.sh --framework nextjs  # Works for Next.js project
adopt.sh --framework ???     # ❌ Broken for Django + Next.js monorepo
```

This **fails for monorepos** that combine multiple frameworks (backend + frontend, multiple services, etc.).

---

## Impact

**Affected use cases:**
- ✅ Django + React monorepos
- ✅ NestJS + Next.js monorepos
- ✅ Python + Node.js microservices
- ✅ Multi-framework projects (backend + frontend + mobile + data)

**Current workaround:** None. Users must:
1. Manually merge CLAUDE.md templates
2. Manually merge pre-commit configs
3. Manually document workspace boundaries
4. Hope agents respect workspace scoping

---

## Proposed Solution

### Phase 1: Multi-Framework Flag (MVP)

**Timeline:** 1-2 days
**Effort:** Low
**Value:** High (covers 80% of monorepo use cases)

```bash
adopt.sh --frameworks "python,nextjs"
```

**What it does:**
- Accepts comma-separated frameworks
- Generates composite `CLAUDE.md` with workspace sections
- Merges pre-commit configs with path filters (`^backend/`, `^frontend/`)
- Documents workspace boundaries for agents

**Example output:**
- `CLAUDE.md` — Django section + Next.js section + shared conventions
- `.pre-commit-config.yaml` — Black (backend/) + ESLint (frontend/) + shared hooks
- `.claude/.adopted-from-blueprint` — `{frameworks: ["python", "nextjs"]}`

---

### Phase 2: Auto-Detection (Nice to Have)

**Timeline:** 3-5 days
**Effort:** Medium
**Value:** High (zero-config)

```bash
adopt.sh --detect  # Scans repo, finds all frameworks
```

**What it does:**
- Scans for `package.json`, `pyproject.toml`, `Cargo.toml`, etc.
- Detects workspace structure (pnpm workspaces, poetry, nx, turborepo)
- Auto-generates workspace-aware config

**Detection logic:**
```bash
# Finds Python
[[ -f pyproject.toml ]] || [[ -f backend/pyproject.toml ]]

# Finds Next.js
grep -q '"next"' package.json

# Finds multiple workspaces
jq '.workspaces' package.json  # pnpm/yarn
```

---

### Phase 3: Workspace Config (Future)

**Timeline:** 5-7 days
**Effort:** High
**Value:** Medium (enterprise monorepos)

```json
// .agency/workspaces.json
{
  "workspaces": {
    "backend": {"framework": "python", "path": "backend/"},
    "frontend": {"framework": "nextjs", "path": "frontend/"},
    "mobile": {"framework": "node", "path": "mobile/"}
  }
}
```

```bash
adopt.sh --workspaces .agency/workspaces.json
```

**What it does:**
- Explicit workspace definitions
- Per-workspace tooling config
- Agent workspace assignment
- Orchestrator workspace routing

---

## Recommendation

**Ship Phase 1 first.**

**Why:**
- Quick to implement (1-2 days)
- Covers 80% of use cases (Django+React, NestJS+Next.js)
- Low risk (opt-in, doesn't break existing workflows)
- Validates design before investing in Phase 2/3

**Then decide:**
- If usage is high → invest in Phase 2 (auto-detect)
- If enterprise demand → invest in Phase 3 (workspace config)
- If usage is low → stop at Phase 1

---

## Files in This Branch

### Documentation

1. **[MONOREPO-SUPPORT-SOLUTION.md](./MONOREPO-SUPPORT-SOLUTION.md)** (Complete design)
   - Problem statement
   - 3 solution options
   - Implementation details
   - Testing strategy
   - Rollout plan

2. **[MONOREPO-QUICK-START.md](./MONOREPO-QUICK-START.md)** (User guide)
   - Quick examples
   - Generated file previews
   - Workflow changes
   - Agent enhancements
   - FAQ

3. **[MONOREPO-SUMMARY.md](./MONOREPO-SUMMARY.md)** (This file)
   - Executive summary
   - Phase breakdown
   - Recommendation

### Prototype

4. **[scripts/adopt-monorepo-prototype.sh](../scripts/adopt-monorepo-prototype.sh)** (Phase 1 implementation sketch)
   - New `--frameworks` flag
   - Auto-detect logic preview
   - Composite CLAUDE.md generation
   - Merged pre-commit config generation
   - **NOT production-ready** (design validation only)

---

## Example: Django + Next.js Monorepo

**Before (broken):**
```bash
cd ~/work/my-saas
adopt.sh --framework python  # ❌ Frontend ignored
```

**After Phase 1:**
```bash
cd ~/work/my-saas
adopt.sh --frameworks "python,nextjs"

# Generated files:
# - CLAUDE.md (Django + Next.js sections)
# - .pre-commit-config.yaml (merged with path filters)
# - .claude/ (agents, commands, skills, settings)
```

**Workflow:**
```bash
# Ticket: "Add user authentication"
/ticket ABC-123

# Architect detects:
# - Backend work: JWT API endpoints
# - Frontend work: Login page + auth flow

# Dispatches in parallel:
# - backend-dev → backend/ (scoped to backend/)
# - frontend-dev → frontend/ (scoped to frontend/)

# Tests:
# - cd backend && pytest (backend changes)
# - cd frontend && pnpm test (frontend changes)
# - playwright test (E2E flow)

# Result:
# - PR with changes in both workspaces
# - All tests pass (workspace-scoped)
```

---

## Migration Path

### For Single-Framework Projects

**No changes needed:**
```bash
# Still works exactly as before
adopt.sh --framework python
```

### For Existing Monorepos

**Once Phase 1 ships:**
```bash
# Re-adopt with new flag
adopt.sh --frameworks "python,nextjs" --force

# Review generated CLAUDE.md
# Test /ticket workflow
# Commit
```

---

## Success Criteria

- ✅ Can adopt blueprint into Django+React monorepo
- ✅ Agents correctly scope work to affected workspaces
- ✅ Pre-commit hooks run only on changed workspaces
- ✅ `/ticket` workflow works end-to-end
- ✅ Test execution time reduced (workspace-scoped, not full monorepo)
- ✅ No regression for single-framework projects

---

## Next Steps

1. **Review this branch** with team
2. **Decide:** Ship Phase 1? Or Phase 1+2?
3. **Implement:** Convert prototype to production
4. **Test:** 3-4 real monorepos (internal + external)
5. **Ship:** Merge to master, announce
6. **Gather feedback:** Decide on Phase 2/3

---

## Questions?

See full design docs:
- [MONOREPO-SUPPORT-SOLUTION.md](./MONOREPO-SUPPORT-SOLUTION.md) — Complete technical design
- [MONOREPO-QUICK-START.md](./MONOREPO-QUICK-START.md) — User-facing guide
- [scripts/adopt-monorepo-prototype.sh](../scripts/adopt-monorepo-prototype.sh) — Implementation sketch

**Branch:** `feat/monorepo-support`
**Status:** Design complete, awaiting approval for implementation
