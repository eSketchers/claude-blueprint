# Monorepo Quick Start Guide

> **Status:** Solution designed but not yet implemented. See [MONOREPO-SUPPORT-SOLUTION.md](./MONOREPO-SUPPORT-SOLUTION.md) for full details.

## Current Limitation

```bash
# ❌ Doesn't work for monorepos
adopt.sh --framework python

# This only generates Python-specific config
# Ignores your React frontend completely
```

## Proposed Solution (Phase 1)

```bash
# ✅ Works for monorepos
adopt.sh --frameworks "python,nextjs"

# Generates:
# - Composite CLAUDE.md with both frameworks
# - Merged pre-commit config with path filters
# - Workspace-aware agent instructions
```

---

## Example: Django + Next.js Monorepo

### Your Project Structure

```
my-saas/
├── backend/
│   ├── manage.py
│   ├── config/
│   ├── apps/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── docs/
└── scripts/
```

### Adoption

```bash
cd ~/work/my-saas
git switch -c chore/agency-adopt

# Current (broken)
adopt.sh --framework python  # ❌ Frontend ignored

# Proposed (Phase 1)
adopt.sh --frameworks "python,nextjs"

# Proposed (Phase 2 - auto-detect)
adopt.sh --detect
```

### Generated Files

#### `CLAUDE.md` (composite)

```markdown
# Claude Code Configuration — Monorepo

## Workspace Structure

This monorepo contains:
- `backend/` — Django 5.x + DRF (Python 3.11+, uv)
- `frontend/` — Next.js 14 (Node 20+, pnpm)

## Workspace Detection (Critical)

Before working on any ticket:
1. Read ticket description/labels to identify affected workspace(s)
2. Use workspace-specific tooling and conventions
3. Run tests scoped to changed workspace(s) only
4. Coordinate with other agents for cross-workspace changes

---

## Backend Workspace (`backend/`)

**Framework:** Django 5.x + Django REST Framework

**Conventions:**
- Apps: one per bounded context
- Models: always explicit CharField(max_length=...)
- Migrations: one per schema change
- Views: generic views/viewsets when possible
- Tests: pytest + pytest-django

**Commands:**
```bash
cd backend
uv sync
uv run python manage.py runserver
uv run pytest
```

---

## Frontend Workspace (`frontend/`)

**Framework:** Next.js 14 + TypeScript + Tailwind

**Conventions:**
- Strict TypeScript: no implicit any
- API layer: src/api/ wrapping fetch
- State: TanStack Query for server, Zustand for client
- Forms: react-hook-form + zod
- Tests: Vitest + Playwright

**Commands:**
```bash
cd frontend
pnpm install
pnpm dev
pnpm test
```

---

## Cross-Workspace Rules

**Shared dependencies:**
- If you modify API contracts (`backend/apps/*/serializers.py`), check if frontend types need updates
- If you add backend endpoints, consider updating frontend API client

**Testing:**
- Backend changes: `cd backend && pytest`
- Frontend changes: `cd frontend && pnpm test`
- API contract changes: run both test suites
- Playwright E2E: always run on cross-workspace changes
```

#### `.pre-commit-config.yaml` (merged with path filters)

```yaml
repos:
  # Python (backend/ only)
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
        args: [--config=backend/.flake8]

  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks:
      - id: isort
        files: ^backend/
        args: [--settings-path=backend/pyproject.toml]

  # JavaScript/TypeScript (frontend/ only)
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
        files: ^frontend/
        types: [file]
        types_or: [javascript, jsx, ts, tsx]
        args: [--config=frontend/.eslintrc.json]

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
        files: ^frontend/
        types_or: [javascript, jsx, ts, tsx, json, yaml, markdown]

  # Shared (all workspaces)
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

---

## /ticket Workflow Changes

### Phase 1 (Architect) — Workspace Detection

**Current:**
```markdown
1. Fetch ticket
2. Classify: feature/bug/chore
3. Explore codebase
4. Write plan
```

**New:**
```markdown
1. Fetch ticket
2. Classify: feature/bug/chore
3. **Detect affected workspaces** (labels, description, linked files)
4. Read CLAUDE.md section for each workspace
5. Explore affected workspace(s) only
6. Write plan with workspace scoping
```

### Phase 6 (Implement) — Workspace-Scoped Agents

**Example ticket:** "Add user authentication API and login page"

**Architect plan:**
```markdown
## Affected Workspaces
- `backend/` — JWT auth endpoints
- `frontend/` — Login form component

## Agent Dispatch
- `backend-dev` → backend/ (API, models, tests)
- `frontend-dev` → frontend/ (UI, API client, tests)
- `qa-lead` → E2E tests (both workspaces)
```

**Parallel execution:**
```markdown
## Phase 6 — Implement

Dispatch agents in parallel:
- backend-dev: Implement JWT auth in backend/
- frontend-dev: Implement login UI in frontend/
- qa-lead: Write E2E test for full flow
```

### Phase 7 (Test) — Workspace-Scoped Execution

**Current:**
```bash
# Runs ALL tests
pytest
npm test
```

**New:**
```bash
# Detect changed workspaces from git diff
git diff --name-only origin/master...HEAD

# If backend/ changed:
cd backend && pytest

# If frontend/ changed:
cd frontend && pnpm test

# If both changed (API contract):
cd backend && pytest
cd frontend && pnpm test
playwright test  # E2E
```

---

## Agent Workspace Awareness

### backend-dev.md (enhanced)

```markdown
## Monorepo Awareness

If CLAUDE.md indicates this is a monorepo:

1. **Scope detection:**
   - Check ticket labels for `workspace:backend` or description mentions "API", "database", "Django"
   - If unclear, ask the architect agent

2. **Workspace boundaries:**
   - ONLY read/edit files in `backend/` (or path specified in CLAUDE.md)
   - Do NOT modify frontend/, mobile/, or other workspaces
   - Exception: shared types/contracts (coordinate with frontend-dev)

3. **Dependency management:**
   - Use backend workspace package manager (uv, poetry, pip)
   - Do NOT modify root package.json or other workspace dependencies

4. **Testing:**
   - Run tests scoped to backend workspace: `cd backend && pytest`
   - Do NOT run frontend tests (frontend-dev handles that)

5. **Cross-workspace changes:**
   - If you change API contracts (serializers, OpenAPI schema), notify frontend-dev
   - Use memory MCP to record: "Updated GET /api/users response shape"
```

### frontend-dev.md (enhanced)

```markdown
## Monorepo Awareness

If CLAUDE.md indicates this is a monorepo:

1. **Scope detection:**
   - Check ticket labels for `workspace:frontend` or mentions "UI", "component", "page"
   - If unclear, ask the architect agent

2. **Workspace boundaries:**
   - ONLY read/edit files in `frontend/` (or path specified in CLAUDE.md)
   - Do NOT modify backend/, mobile/, or other workspaces
   - Exception: API type generation (read backend OpenAPI schema)

3. **Dependency management:**
   - Use frontend workspace package manager (pnpm, npm, yarn)
   - Do NOT modify backend pyproject.toml or other workspace dependencies

4. **Testing:**
   - Run tests scoped to frontend workspace: `cd frontend && pnpm test`
   - Do NOT run backend tests (backend-dev handles that)

5. **Cross-workspace changes:**
   - If backend changed API, regenerate types: `pnpm generate:api-types`
   - Use memory MCP to record: "Updated API client for new /users endpoint"
```

---

## Common Workflows

### Workflow 1: Backend-Only Ticket

**Ticket:** "Add pagination to /api/users endpoint"

```bash
# Architect detects: backend workspace only
# Dispatches: backend-dev

/ticket <url>

# Result:
# - backend/apps/users/views.py updated
# - backend/apps/users/tests/test_views.py added
# - No frontend changes
# - Tests: cd backend && pytest
```

### Workflow 2: Frontend-Only Ticket

**Ticket:** "Add dark mode toggle to settings page"

```bash
# Architect detects: frontend workspace only
# Dispatches: frontend-dev

/ticket <url>

# Result:
# - frontend/src/components/DarkModeToggle.tsx created
# - frontend/src/pages/Settings.tsx updated
# - No backend changes
# - Tests: cd frontend && pnpm test
```

### Workflow 3: Cross-Workspace Ticket

**Ticket:** "Add user profile picture upload"

```bash
# Architect detects: both workspaces (API + UI)
# Dispatches: backend-dev + frontend-dev (parallel)

/ticket <url>

# Result (backend-dev):
# - backend/apps/users/models.py (add avatar field)
# - backend/apps/users/serializers.py (add avatar URL)
# - backend/apps/users/views.py (add upload endpoint)
# - backend/apps/users/tests/ (add tests)

# Result (frontend-dev):
# - frontend/src/api/users.ts (add upload method)
# - frontend/src/components/AvatarUpload.tsx (new)
# - frontend/src/pages/Profile.tsx (integrate)
# - frontend/src/tests/ (add tests)

# Tests:
# - cd backend && pytest  (backend-dev)
# - cd frontend && pnpm test  (frontend-dev)
# - playwright test  (qa-lead, E2E)
```

---

## FAQ

### Q: Can I still use single-framework adoption?

**A:** Yes, `--framework python` still works for single-framework projects.

### Q: What if I have 3+ workspaces?

**A:** Phase 1 supports any number: `--frameworks "python,nextjs,node"`

Phase 2 (--detect) automatically finds all workspaces.

### Q: How do I handle shared code?

**A:** Document in CLAUDE.md:

```markdown
## Shared Code (`shared/`)

Code used by multiple workspaces:
- `shared/types/` — TypeScript types shared by frontend + mobile
- `shared/utils/` — Common utilities

**Rules:**
- Any agent can read shared/
- Only architect can modify shared/ (coordinate changes)
- Tests: run all workspace tests when shared/ changes
```

### Q: What about nx/turborepo/lerna?

**A:** Phase 3 (workspace config) will support these explicitly.

For now, use `--frameworks` and document workspace structure in CLAUDE.md.

### Q: Does this work with the orchestrator?

**A:** Yes, orchestrator spawns sessions with the same composite CLAUDE.md.

For workspace-specific routing (Phase 3), label tickets: `workspace:backend`

---

## Migration Path

### Existing Single-Framework Projects

No changes needed:

```bash
# Still works
adopt.sh --framework python
```

### Upgrading to Monorepo Support

1. Wait for Phase 1 release
2. Re-adopt with new flag:

```bash
adopt.sh --frameworks "python,nextjs" --force
```

3. Review generated CLAUDE.md
4. Test /ticket workflow
5. Commit

---

## Next Steps

1. **Review** [MONOREPO-SUPPORT-SOLUTION.md](./MONOREPO-SUPPORT-SOLUTION.md)
2. **Decide** Phase 1 vs Phase 1+2
3. **Implement** (tracked in feat/monorepo-support branch)
4. **Test** with 3-4 real monorepos
5. **Ship** 🚀
