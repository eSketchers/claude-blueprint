> **⚠️ ARCHIVED DOCUMENTATION**
>
> This document has been archived. For current documentation, see:
> - [Advanced Guide](../ADVANCED.md) - Monorepo Support section
> - [Changelog](../CHANGELOG.md) - Recent changes
>
> This archived version is kept for historical reference and contains detailed technical information that may still be useful.

---

# Monorepo Support Solution

## Problem Statement

The current adoption script (`scripts/adopt.sh`) only accepts a **single framework** flag:

```bash
adopt.sh --framework python  # OR node OR nextjs OR nestjs
```

This works for single-framework projects but **fails for monorepos** that contain multiple stacks:

```
my-monorepo/
├── backend/      # Django (Python)
├── frontend/     # React + Vite (node/nextjs)
├── mobile/       # React Native (node)
└── data/         # Airflow (Python)
```

**Current limitation:**
- Can only generate one `CLAUDE.md` template
- Single pre-commit config for one framework
- No workspace-aware context guidance

---

## Solution Overview

Enable **multi-framework adoption** with workspace-aware configuration:

### Option 1: Multi-Framework Flag (Simplest)

```bash
adopt.sh --frameworks "python,nextjs"
```

**Implementation:**
- Accept comma-separated frameworks
- Merge multiple pre-commit configs
- Generate composite `CLAUDE.md` with workspace detection logic
- Blueprint already has `CLAUDE.md.django-react` as a template

**Pros:**
- ✅ Simple to implement
- ✅ Works with existing templates
- ✅ Minimal changes to adopt.sh

**Cons:**
- ⚠️ Limited to predefined combinations
- ⚠️ No per-workspace customization

---

### Option 2: Workspace Detection (Automatic)

```bash
adopt.sh --detect  # Auto-detects all frameworks
```

**Implementation:**
- Scan repo for `package.json`, `pyproject.toml`, `Cargo.toml`, etc.
- Detect workspace structure (pnpm workspaces, yarn workspaces, poetry, cargo workspaces)
- Generate workspace-aware `CLAUDE.md`
- Merge all relevant pre-commit configs

**Pros:**
- ✅ Zero configuration
- ✅ Adapts to any monorepo structure
- ✅ Future-proof

**Cons:**
- ⚠️ More complex implementation
- ⚠️ Risk of false positives

---

### Option 3: Workspace Configuration File (Most Flexible)

Create `.agency/workspaces.json`:

```json
{
  "workspaces": {
    "backend": {
      "framework": "python",
      "path": "backend/",
      "package_manager": "uv",
      "test_command": "pytest",
      "lint_command": "flake8"
    },
    "frontend": {
      "framework": "nextjs",
      "path": "frontend/",
      "package_manager": "pnpm",
      "test_command": "vitest",
      "lint_command": "eslint"
    },
    "mobile": {
      "framework": "node",
      "path": "mobile/",
      "package_manager": "pnpm",
      "test_command": "jest"
    }
  },
  "shared": {
    "docs": "docs/",
    "scripts": "scripts/"
  }
}
```

Then adopt:

```bash
adopt.sh --workspaces .agency/workspaces.json
```

**Pros:**
- ✅ Maximum flexibility
- ✅ Explicit workspace boundaries
- ✅ Per-workspace tooling
- ✅ Works for complex monorepos (nx, turborepo, lerna)

**Cons:**
- ⚠️ Requires manual configuration file
- ⚠️ More maintenance

---

## Recommended Solution: Hybrid Approach

**Combine Options 1 & 2** for best UX:

```bash
# Simple case - auto-detect
adopt.sh --detect

# Override detection
adopt.sh --frameworks "python,nextjs"

# Complex case - explicit config
adopt.sh --workspaces .agency/workspaces.json
```

---

## Implementation Details

### 1. Enhanced `CLAUDE.md` Generation

**Current:**
```bash
cp "templates/CLAUDE.md.$FRAMEWORK" "$PROJECT_ROOT/CLAUDE.md"
```

**New:**
```bash
# Multi-framework: merge templates with workspace detection
generate_claude_md() {
  local frameworks=("$@")

  # Start with header
  cat > "$PROJECT_ROOT/CLAUDE.md" <<'EOF'
# Claude Code Configuration — Monorepo

## Workspace Detection

This is a monorepo. Before working on any ticket:
1. Identify which workspace(s) the ticket affects
2. Use appropriate tooling for that workspace
3. Run tests only for affected workspaces

EOF

  # Append each framework section
  for fw in "${frameworks[@]}"; do
    echo "## Workspace: $fw" >> "$PROJECT_ROOT/CLAUDE.md"
    cat "templates/CLAUDE.md.$fw" >> "$PROJECT_ROOT/CLAUDE.md"
    echo "" >> "$PROJECT_ROOT/CLAUDE.md"
  done
}
```

### 2. Merged Pre-Commit Config

**Current:**
```bash
case "$FRAMEWORK" in
  python) PC_SRC=".pre-commit-config.python.yaml" ;;
  node|nextjs) PC_SRC=".pre-commit-config.node.yaml" ;;
esac
```

**New:**
```yaml
# .pre-commit-config.monorepo.yaml
repos:
  # Python hooks (backend/ only)
  - repo: https://github.com/psf/black
    rev: 24.4.0
    hooks:
      - id: black
        files: ^backend/

  - repo: https://github.com/PyCQA/flake8
    rev: 7.0.0
    hooks:
      - id: flake8
        files: ^backend/

  # Node hooks (frontend/ and mobile/)
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
        files: ^(frontend|mobile)/
        types: [file]
        types_or: [javascript, jsx, ts, tsx]

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
        files: ^(frontend|mobile)/
```

### 3. Workspace-Aware Test Execution

Update `.claude/commands/ticket.md` Phase 7:

**Current:**
```markdown
## Phase 7 — Test
- Run full test suite (detect from package.json / pyproject.toml)
```

**New:**
```markdown
## Phase 7 — Test

Detect affected workspaces from git diff:
- If backend/ changed → `cd backend && pytest`
- If frontend/ changed → `cd frontend && pnpm test`
- If mobile/ changed → `cd mobile && pnpm test`
- If shared deps changed → run all workspace tests
```

### 4. Agent Workspace Awareness

Update `.claude/agents/backend-dev.md` and `.claude/agents/frontend-dev.md`:

**Add to each agent:**
```markdown
## Monorepo Awareness

If this project is a monorepo:
1. Check CLAUDE.md for workspace paths
2. Only read/edit files in your workspace
3. Run tests scoped to your workspace
4. Don't modify other workspaces' dependencies
5. Coordinate with other agents for shared code
```

---

## Migration Path

### Phase 1: Simple Multi-Framework Support (Quick Win)

```bash
# Changes to adopt.sh
- Add --frameworks flag (comma-separated)
- Merge pre-commit configs
- Use existing CLAUDE.md.django-react as template
- Document limitation: only python+node combinations supported
```

**Effort:** 1-2 days
**Value:** Covers 80% of monorepo use cases

### Phase 2: Auto-Detection (High Value)

```bash
# Add workspace detection
- Scan for package.json, pyproject.toml, Cargo.toml
- Detect workspace managers (pnpm workspaces, poetry, nx, turborepo)
- Generate workspace-aware CLAUDE.md
- Smart pre-commit config with path filters
```

**Effort:** 3-5 days
**Value:** Zero-config for most monorepos

### Phase 3: Full Workspace Config (Enterprise)

```bash
# Add .agency/workspaces.json support
- Per-workspace framework specification
- Per-workspace tooling configuration
- Agent workspace assignment
- Orchestrator workspace routing
```

**Effort:** 5-7 days
**Value:** Enterprise monorepos (nx, turborepo, rush)

---

## Example: Django + React Monorepo

**Before (doesn't work):**
```bash
adopt.sh --framework python  # ❌ Frontend ignored
adopt.sh --framework nextjs  # ❌ Backend ignored
```

**After Phase 1:**
```bash
adopt.sh --frameworks "python,nextjs"
# ✅ Generates composite CLAUDE.md
# ✅ Merges pre-commit configs with path filters
# ✅ Agents aware of workspace boundaries
```

**Generated CLAUDE.md excerpt:**
```markdown
# Claude Code Configuration — Monorepo

## Workspace Detection

This project has two workspaces:
- `backend/` — Django + DRF (Python 3.11+, uv)
- `frontend/` — Next.js (Node 20+, pnpm)

When working on a ticket:
1. Identify affected workspace from ticket labels/description
2. Read CLAUDE.md section for that workspace
3. Use workspace-specific tooling
4. Run workspace-scoped tests

## Backend Workspace (backend/)
[... Django conventions from CLAUDE.md.python ...]

## Frontend Workspace (frontend/)
[... Next.js conventions from CLAUDE.md.nextjs ...]

## Shared Conventions (all workspaces)
- TDD workflow mandatory
- Never commit secrets
- Read before editing
```

**Generated `.pre-commit-config.yaml`:**
```yaml
repos:
  # Backend (Python)
  - repo: https://github.com/psf/black
    hooks:
      - id: black
        files: ^backend/

  # Frontend (Node)
  - repo: https://github.com/pre-commit/mirrors-eslint
    hooks:
      - id: eslint
        files: ^frontend/
```

---

## Testing Strategy

### Unit Tests (scripts/test-adopt.sh)

```bash
# Add monorepo test cases
test_monorepo_python_nextjs() {
  tmp=$(fresh_project)
  mkdir -p "$tmp/backend" "$tmp/frontend"
  echo "from django import ..." > "$tmp/backend/manage.py"
  echo '{"dependencies": {...}}' > "$tmp/frontend/package.json"

  adopt.sh --frameworks "python,nextjs"

  assert "Both frameworks in CLAUDE.md" "grep -q 'Django' && grep -q 'Next.js'"
  assert "Path filters in pre-commit" "grep -q '^backend/' .pre-commit-config.yaml"
}
```

### Integration Tests

```bash
# Test with real monorepo structure
cd playground/
adopt.sh --detect
/ticket <url>  # Verify workspace detection works
```

---

## Open Questions

1. **How to handle conflicting dependencies?**
   - Example: backend uses Python 3.11, data/ uses Python 3.9
   - Solution: Document in CLAUDE.md, use per-workspace venvs

2. **Should agents be workspace-scoped by default?**
   - Option A: `backend-dev` only touches `backend/`
   - Option B: All agents can access all workspaces (current)
   - Recommendation: Option B with guardrails in CLAUDE.md

3. **How to handle cross-workspace changes?**
   - Example: API change in backend requires frontend update
   - Solution: Architect dispatches multiple agents in parallel (already supported)

4. **Should orchestrator support per-workspace tickets?**
   - Example: Label `workspace:backend` routes to backend-only profile
   - Recommendation: Phase 3 enhancement

---

## Rollout Plan

### Week 1: Design Review
- [ ] Review this doc with team
- [ ] Decide on Phase 1 vs Phase 1+2
- [ ] Finalize CLAUDE.md template format

### Week 2: Implementation
- [ ] Implement --frameworks flag
- [ ] Create merged pre-commit templates
- [ ] Update CLAUDE.md generation logic
- [ ] Write unit tests

### Week 3: Testing
- [ ] Test with 3-4 real monorepos
- [ ] Gather feedback
- [ ] Iterate on workspace detection

### Week 4: Documentation & Rollout
- [ ] Update LOCAL-ADOPTION.md
- [ ] Add MONOREPO-GUIDE.md
- [ ] Update README.md with monorepo example
- [ ] Announce to team

---

## Success Metrics

- ✅ Can adopt blueprint into Django+React monorepo
- ✅ Agents correctly scope work to affected workspaces
- ✅ Pre-commit hooks run only on changed workspaces
- ✅ /ticket workflow works end-to-end in monorepo
- ✅ Test execution time reduced (workspace-scoped)

---

## Alternatives Considered

### Alternative 1: Separate .claude/ per workspace

```
backend/.claude/
frontend/.claude/
mobile/.claude/
```

**Rejected because:**
- Violates single .claude/ per repo assumption
- Claude Code doesn't support workspace-scoped configs
- Orchestrator doesn't support multiple .claude/ dirs

### Alternative 2: Framework-agnostic adoption

```bash
adopt.sh  # No --framework flag, generate generic CLAUDE.md
```

**Rejected because:**
- Loses value of framework-specific best practices
- Pre-commit config can't be framework-specific
- Agent prompts less helpful

### Alternative 3: Multiple CLAUDE.md files

```
CLAUDE.md            # Root
backend/CLAUDE.md    # Backend-specific
frontend/CLAUDE.md   # Frontend-specific
```

**Rejected because:**
- Claude Code only reads root CLAUDE.md
- Would require custom hook to merge files

---

## Conclusion

**Recommended approach:**

1. **Phase 1 (MVP):** `--frameworks "fw1,fw2"` flag
   - Quick to implement (1-2 days)
   - Covers 80% of use cases
   - Low risk

2. **Phase 2 (Auto-magic):** `--detect` flag
   - Higher value (zero config)
   - Medium complexity (3-5 days)
   - Unlocks full monorepo support

Ship Phase 1 first, gather feedback, then decide on Phase 2.
