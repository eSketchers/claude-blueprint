# Advanced Guide

This guide covers advanced features, optimization strategies, and workflows for the Claude Agency Blueprint. For basic setup and adoption, see [SETUP.md](./SETUP.md).

## Table of Contents

1. [Monorepo Support](#monorepo-support)
2. [Profile System](#profile-system)
3. [Token Optimization](#token-optimization)
4. [Ticket Workflows](#ticket-workflows)
5. [Orchestrator](#orchestrator)
6. [Dashboard](#dashboard)
7. [Advanced Tools](#advanced-tools)

---

## Monorepo Support

The blueprint supports projects using multiple frameworks through intelligent detection and unified configuration.

### Problem Statement

Single-framework adoption works great for most projects:

```bash
adopt.sh --framework python   # Django project
adopt.sh --framework nextjs   # Next.js project
```

But fails for monorepos that combine multiple stacks:

```
my-saas/
├── backend/      # Django (Python)
├── frontend/     # Next.js (TypeScript)
├── mobile/       # React Native
└── data/         # Airflow pipelines
```

### How to Use Multi-Framework Adoption

**Explicit frameworks:**

```bash
cd ~/work/my-monorepo

# Specify frameworks explicitly
"$BLUEPRINT_DIR/scripts/adopt.sh" --frameworks "python,nextjs"

# Auto-detect all frameworks
"$BLUEPRINT_DIR/scripts/adopt.sh" --detect
```

**Framework detection:**
- `--framework F` - Single framework (python|node|nextjs|nestjs)
- `--frameworks F1,F2` - Multiple comma-separated (for monorepos)
- `--detect` - Auto-detect all frameworks in the repo

### Detection Heuristics

The `--detect` flag scans for framework indicators:

**Python:**
- `pyproject.toml`
- `requirements.txt`
- `setup.py`
- `Pipfile`

**Node:**
- `package.json` (checks for Express, vanilla Node patterns)

**Next.js:**
- `package.json` with `"next"` dependency
- `next.config.js`

**NestJS:**
- `package.json` with `"@nestjs/core"` dependency
- `nest-cli.json`

**Detection process:**
1. Scans project root and immediate subdirectories
2. Identifies all framework indicators
3. Deduplicates (e.g., package.json with both Next.js and NestJS counts once)
4. Reports detected frameworks
5. Configures .claude/ for all detected frameworks

### Generated File Structure

**Composite CLAUDE.md:**

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

**Merged pre-commit config with path filters:**

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

  # JavaScript/TypeScript (frontend/ only)
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
        files: ^frontend/
        types_or: [javascript, jsx, ts, tsx]

  # Shared (all workspaces)
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

### Workspace-Aware Workflows

**Backend-only ticket:**

```bash
# Ticket: "Add pagination to /api/users endpoint"
/ticket <url>

# Result:
# - backend/apps/users/views.py updated
# - backend/apps/users/tests/test_views.py added
# - No frontend changes
# - Tests: cd backend && pytest
```

**Frontend-only ticket:**

```bash
# Ticket: "Add dark mode toggle to settings page"
/ticket <url>

# Result:
# - frontend/src/components/DarkModeToggle.tsx created
# - frontend/src/pages/Settings.tsx updated
# - No backend changes
# - Tests: cd frontend && pnpm test
```

**Cross-workspace ticket:**

```bash
# Ticket: "Add user profile picture upload"
/ticket <url>

# Architect detects: both workspaces (API + UI)
# Dispatches: backend-dev + frontend-dev (parallel)

# Result (backend-dev):
# - backend/apps/users/models.py (add avatar field)
# - backend/apps/users/serializers.py (add avatar URL)
# - backend/apps/users/views.py (add upload endpoint)

# Result (frontend-dev):
# - frontend/src/api/users.ts (add upload method)
# - frontend/src/components/AvatarUpload.tsx (new)
# - frontend/src/pages/Profile.tsx (integrate)

# Tests:
# - cd backend && pytest  (backend-dev)
# - cd frontend && pnpm test  (frontend-dev)
# - playwright test  (qa-lead, E2E)
```

### Troubleshooting Monorepo Adoption

**Framework not detected:**
- Check that indicator files exist (package.json, pyproject.toml)
- Use `--frameworks` to specify explicitly
- Enable debug output: `bash -x scripts/adopt.sh --detect`

**Wrong framework detected:**
- Use `--frameworks` to override
- Check for stray indicator files (old package.json in archived folder)

**Profile issues:**
- Monorepo defaults to `fullstack` profile
- Switch with `./scripts/switch-profile.sh <profile>`
- Customize `agents.profiles.json` for your needs

### When to Use Which Approach

**Use `--detect` when:**
- Standard monorepo structure
- Frameworks in obvious locations
- You want automatic discovery
- First time adopting

**Use `--frameworks "python,nextjs"` when:**
- Detection misses a framework
- You know exactly what you have
- Nested frameworks in unusual locations
- You want explicit control

**Example scenarios:**

```bash
# Django + Next.js in /backend and /frontend
./scripts/adopt.sh --detect  # Works automatically

# Unusual structure with frameworks in /services/api and /apps/web
./scripts/adopt.sh --frameworks "python,nextjs"  # Explicit

# Monorepo with optional frameworks you don't want
./scripts/adopt.sh --frameworks "python"  # Only adopt Python parts
```

---

## Profile System

Profiles define which MCPs and agents are available for a work session, allowing you to optimize context for the task at hand.

### What Are Profiles?

A profile is a named configuration that specifies:
- **MCPs to load** - Which Model Context Protocol servers are available
- **Agents to enable** - Which role-specialist agents can be invoked

Profiles reduce context usage by 30-70% for focused tasks by loading only what you need.

### Available Profiles

**minimal** - Fastest context, for exploration

- **MCPs:** sequential-thinking, memory, serena
- **Agents:** architect
- **Use for:** Reading code, understanding architecture, planning
- **Savings:** 60-70% vs fullstack
- **When:** Exploration, questions, code reviews, ADR writing

**frontend** - UI work

- **MCPs:** sequential-thinking, memory, serena, playwright, context7
- **Agents:** architect, frontend-dev, qa-lead
- **Use for:** React/Next.js features, UI bugs, styling, accessibility, E2E tests
- **Savings:** 30-40% vs fullstack
- **When:** Building components, fixing UI bugs, adding Tailwind styles

**backend** - API work

- **MCPs:** sequential-thinking, memory, serena, context7
- **Agents:** architect, backend-dev, qa-lead
- **Use for:** API endpoints, database queries, business logic, services
- **Savings:** 40-50% vs fullstack
- **When:** Building APIs, database migrations, authentication, rate limiting

**fullstack** - All tools loaded

- **MCPs:** sequential-thinking, memory, serena, playwright, context7, github
- **Agents:** architect, frontend-dev, backend-dev, qa-lead
- **Use for:** Full-stack features, monorepo work, complex cross-cutting changes
- **Savings:** 20-30% vs ticket
- **When:** Features touching both frontend and backend

**ticket** - Autonomous ticket processing

- **MCPs:** All available MCPs
- **Agents:** All 6 agents (architect, frontend-dev, backend-dev, qa-lead, devops, data-engineer)
- **Use for:** Full `/ticket` workflow, orchestrator-driven ticket processing
- **Savings:** 0% (baseline)
- **When:** Running `/ticket` command or orchestrator

### How to Switch Profiles

```bash
# Switch to a profile
./scripts/switch-profile.sh minimal

# Start new Claude Code session (required)
claude  # Profile takes effect
```

**Important:** Profile changes require restarting Claude Code. MCPs are loaded at session start.

### In-Session Profile Management

Use the `/optimize-context` command:

```
/optimize-context frontend
# → Switches profile and backs up current settings
# → Restart Claude Code for changes to apply
```

Auto-detect from conversation:

```
/optimize-context auto
# → Analyzes recent messages for keywords
# → Recommends minimal profile covering detected types
```

### When to Use Each Profile

**Start with minimal for:**
- "Let me understand this codebase"
- "What does this module do?"
- "Where should I add this feature?"
- Code reviews
- Architecture discussions
- Planning sessions

**Use frontend for:**
- "Add a new React component"
- "Fix this UI bug"
- "Improve accessibility"
- "Add Tailwind styling"
- "Write E2E tests with Playwright"

**Use backend for:**
- "Add a new API endpoint"
- "Fix this database query"
- "Implement business logic"
- "Add authentication"
- "Write API tests"

**Use fullstack for:**
- "Build a feature that spans frontend and backend"
- "Refactor across multiple layers"
- "Monorepo work"
- "Don't know which profile yet"

**Use ticket for:**
- Running `/ticket` workflow
- Orchestrator autonomous operation
- When all agents may be needed

### Profile Structure

Profiles are defined in `.claude/agents.profiles.json`:

```json
{
  "active_profile": "fullstack",
  "profiles": {
    "minimal": {
      "mcps": ["sequential-thinking", "memory", "serena"],
      "agents": ["architect"]
    },
    "frontend": {
      "mcps": ["sequential-thinking", "memory", "serena", "playwright", "context7"],
      "agents": ["architect", "frontend-dev", "qa-lead"]
    },
    "backend": {
      "mcps": ["sequential-thinking", "memory", "serena", "context7"],
      "agents": ["architect", "backend-dev", "qa-lead"]
    },
    "fullstack": {
      "mcps": ["sequential-thinking", "memory", "serena", "playwright", "context7", "github"],
      "agents": ["architect", "frontend-dev", "backend-dev", "qa-lead"]
    },
    "ticket": {
      "mcps": ["sequential-thinking", "memory", "serena", "playwright", "context7", "github"],
      "agents": ["architect", "frontend-dev", "backend-dev", "qa-lead", "devops", "data-engineer"]
    }
  }
}
```

**How it works:**
1. `switch-profile.sh` updates `active_profile` in JSON
2. Next Claude Code session reads `active_profile`
3. Only listed MCPs are started
4. Only listed agents are available for invocation

### Creating Custom Profiles

Edit `.claude/agents.profiles.json` to add your own:

```json
{
  "profiles": {
    "my-custom": {
      "mcps": ["sequential-thinking", "memory", "github"],
      "agents": ["architect", "backend-dev"]
    }
  }
}
```

Then:
```bash
./scripts/switch-profile.sh my-custom
claude
```

**Best practices:**
- Include `sequential-thinking` in every profile (core reasoning)
- Include `architect` in every profile (system design)
- Name profiles after tasks, not technologies
- Test context size with `/context` after switching

### Agent Profiles (Optional)

Profiles can also manage which agents are physically available in `.claude/agents/`:

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
- Mental model clarity (only see relevant agents)

**Skip agent profiles for:**
- Flexibility (might need multiple agent types)
- Marginal impact (~320 tokens total)
- Solo development (you know which agents to invoke)

### Role-Specialist Agents

The blueprint includes 6 custom agents plus code-reviewer from superpowers:

**architect** - System design, ADRs, tradeoffs
- Available in: all profiles
- Use for: High-level design, architecture decisions
- Why custom: Upstream stubs are too thin

**frontend-dev** - React / Next.js / React Native
- Available in: frontend, fullstack profiles
- Use for: UI components, accessibility, Tailwind styling
- Why custom: No upstream equivalent

**backend-dev** - Node/Nest/FastAPI, databases, migrations
- Available in: backend, fullstack profiles
- Use for: API endpoints, database queries, security
- Why custom: Upstream specialists are 6-line stubs

**qa-lead** - Test strategy, release gates, bug triage
- Available in: frontend, backend, fullstack profiles
- Use for: Test planning, quality gates, bug analysis
- Why custom: No upstream equivalent

**devops** - Docker, CI/CD, IaC, secrets
- Available in: ticket profile only
- Use for: Deployment, infrastructure, monitoring
- Why custom: Upstream devops/ci-cd are stubs

**data-engineer** - ETL, warehouses, streaming, analytics
- Available in: ticket profile only
- Use for: Data pipelines, analytics, data quality
- Why custom: No upstream equivalent

**code-reviewer** - Symlinked from superpowers
- Available in: all profiles
- Use for: PR review, code quality feedback
- Why symlink: Theirs is already excellent

### Monitoring Profile Impact

**Check current context usage:**

```bash
# In Claude Code
/context
```

Compare before/after profile switch.

**Check active MCPs:**

```bash
jq '.mcpServers | keys' .claude/settings.json
```

**Revert to previous profile:**

```bash
# Find backup
ls -lt .claude/settings.json.backup-* | head -1

# Restore
cp .claude/settings.json.backup-1234567890 .claude/settings.json
claude  # Restart
```

---

## Token Optimization

Strategies to reduce context usage while maintaining code quality.

**Core Principle:** Quality and correctness > token savings. Eliminate waste, not understanding.

### Overview: Three-Phase Approach

The blueprint implements token optimization in three phases:

**Phase 1 (Core)** - Implemented, always active:
- `.claudeignore` filters noise files
- Smart reading patterns
- Haiku for exploration tasks
- Graphify indexing

**Phase 2 (Templates & Tools)** - Available:
- Template library for common patterns
- AST navigation for structural searches
- Module batching for related files

**Phase 3 (Dynamic Context)** - Implemented:
- Profile-based MCP loading (see [Profile System](#profile-system))
- Conditional agent dispatch (built-in)

### Phase 1: Core Optimizations

**.claudeignore (Highest Impact):**

The blueprint includes `.claude/.claudeignore` which automatically filters files that agents should never read.

**What's blocked:**
- Dependencies (node_modules/, vendor/)
- Build outputs (dist/, build/, .next/)
- Generated/minified files (*.min.js, *_pb2.py)
- Lock files (package-lock.json, yarn.lock)
- Version control internals (.git/)

**Impact:** 80-95% reduction in Glob/Grep noise results

**Risk:** None - these files genuinely don't help agents understand code

The file is already created - no setup needed. Just works automatically.

**Smart reading patterns:**

Claude Code's default skills encourage:
- Reading targeted files, not entire directories
- Using grep before reading
- Reading tests to understand interfaces
- Following imports systematically

**Haiku for exploration:**

Switch to `claude-3-haiku` for:
- "What does this code do?"
- "Where is X defined?"
- "Show me all the API endpoints"
- Code search and discovery

**Graphify indexing:**

```bash
./scripts/graphify-index.sh
```

Creates a knowledge graph of your codebase. Claude can query the graph instead of reading files repeatedly.

**Key Feature: Incremental Updates (Built-in)**
- Graphify uses SHA256 caching - only changed files are re-processed
- Re-indexing 5 changed files: ~5-15 seconds (vs 2-5 minutes for full re-index)
- Makes post-commit hooks practical for keeping graph fresh automatically

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

**Automatic updates (recommended):**

```bash
# Install post-commit hook for automatic incremental updates
cp hooks/post-commit.sample .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# Now graph updates automatically after each commit (5-15s overhead)
```

### Phase 2: Templates & Tools

**Template library:**

Reusable code patterns save 2K-5K tokens per new file:
- React component templates
- API endpoint templates
- Database migration templates
- Test file templates

Agents check `.claude/templates/` before reading example files:
- **NestJS:** controller, service
- **React:** component, form
- **FastAPI:** router, service
- **Testing:** pytest-fixture, jest-mock

Only read existing code when templates don't exist or need project-specific customizations.

**AST navigation:**

Use ast-grep for structural searches without reading full files:

```bash
# Find authentication guards
./scripts/ast-query.sh auth-guards

# Find specific function
./scripts/ast-query.sh function-name handleLogin

# Find Python class
./scripts/ast-query.sh python-class UserService
```

**Impact:** 60-80% reduction for "find all X" queries

**Module batching:**

Read entire modules at once instead of separate files:

```bash
# Read all files in auth module
./scripts/read-module.sh src/auth
```

More efficient than separate Read calls, provides better context.

**Impact:** 20-30% reduction in multi-file reads

### Phase 3: Dynamic Context

**Profile-based MCP loading:**

See [Profile System](#profile-system) section above for complete details.

**Savings:**
- minimal profile: 60-70% vs fullstack
- frontend profile: 30-40% vs fullstack
- backend profile: 40-50% vs fullstack

**Conditional agent dispatch:**

Agents are only loaded when explicitly invoked. Built into superpowers skills:
- `architect` skill loads architect agent
- `frontend-dev` skill loads frontend-dev agent
- No agent loaded = no agent context

### Measuring Savings

**Theoretical vs actual:**

The blueprint claims "70-90% reduction in wasted context" based on theoretical analysis. Actual savings depend on:
- Codebase structure
- Task complexity
- File organization
- Profile discipline

**How to measure:**

```bash
# Before optimization
claude -p "implement feature X"
# Note token count from output

# After optimization (with profiles)
./scripts/switch-profile.sh frontend
claude -p "implement feature X"
# Compare token count

# Calculate savings
SAVINGS=$((100 * (BEFORE - AFTER) / BEFORE))
echo "Saved: $SAVINGS%"
```

**Real-world results:**
- Simple tasks (bug fixes): 50-60% savings
- Medium tasks (new features): 30-40% savings
- Complex tasks (refactoring): 20-30% savings
- Exploration tasks: 60-70% savings with minimal profile

### Safe vs Unsafe Strategies

**Safe** (quality-preserving):
- ✅ Loading only needed MCPs
- ✅ Filtering noise files (.claudeignore)
- ✅ Using Haiku for discovery
- ✅ Targeted file reading
- ✅ Graphify knowledge graph queries

**Unsafe** (quality-degrading):
- ❌ Skipping tests
- ❌ Removing error handling
- ❌ Reducing context below understanding threshold
- ❌ Aggressive summarization
- ❌ Hard file size limits that prevent reading critical files

**Example failure mode (unsafe):**

```
Task: Add partial refund support

Without reading 1500-line payment_processor.py:
- Misses fraud detection checks
- Doesn't follow audit logging pattern
- Creates security hole

With reading:
- Follows established patterns
- Secure and consistent
```

### YAGNI for Context

**You Aren't Gonna Need It:**
- Don't load all MCPs "just in case"
- Don't read entire codebases upfront
- Don't add every possible agent
- Start minimal, add context as needed

**Example:**

```bash
# ❌ Wasteful
./scripts/switch-profile.sh fullstack  # Load everything
claude -p "fix typo in README"

# ✅ Efficient
./scripts/switch-profile.sh minimal  # Load only reasoning
claude -p "fix typo in README"
```

### Expected Savings (Projections)

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

### Cost Tracking

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

## Ticket Workflows

Using the `/ticket` command for autonomous feature implementation.

### Basic Usage

```bash
claude
# Paste ticket URL: https://linear.app/team/issue/ABC-123
```

Claude will:
1. Fetch ticket description
2. Plan the implementation
3. Request code review
4. Implement changes
5. Run tests
6. Create PR

### Profile Selection for Tickets

**Choose profile based on ticket type:**

**Frontend tickets:**

```bash
./scripts/switch-profile.sh frontend
claude
# Paste UI ticket URL
```

Examples:
- "Add user profile page"
- "Fix mobile navigation"
- "Improve accessibility"
- "Add dark mode toggle"

**Backend tickets:**

```bash
./scripts/switch-profile.sh backend
claude
# Paste API ticket URL
```

Examples:
- "Add authentication endpoint"
- "Optimize database query"
- "Implement rate limiting"
- "Add pagination to API"

**Full-stack tickets:**

```bash
./scripts/switch-profile.sh fullstack
claude
# Paste full-stack ticket URL
```

Examples:
- "Build user registration flow" (API + UI)
- "Add real-time notifications" (WebSocket + UI)
- "Implement search feature" (Backend + Frontend)
- "Add profile picture upload" (API + UI + storage)

**Unknown tickets:**

Start with fullstack if unsure. Can switch profiles mid-session if needed.

### Token Savings by Profile

| Ticket Scope | Profile | Token Savings |
|--------------|---------|---------------|
| UI-only (no API changes) | `frontend` | ~30-40% vs fullstack |
| API-only (no UI changes) | `backend` | ~40-50% vs fullstack |
| Documentation | `minimal` | ~60-70% vs fullstack |
| Exploration/spike | `minimal` | ~60-70% vs fullstack |
| Unknown/mixed | `ticket` | 0% (safe default) |

### Phase-by-Phase MCP Requirements

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

### Orchestrator Integration

When using the orchestrator, profile selection can be automatic:

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

### Troubleshooting Stuck Tickets

**Ticket stuck "in_progress":**

1. Check agent logs: `tail -f ~/.claude-agency/agent-logs/<ticket-id>.log`
2. Check for errors in orchestrator log
3. Manually kill process: `pkill -f "claude.*<ticket-id>"`
4. Orchestrator will retry with backoff

**Ticket failed after retries:**

1. Check registry: `cat ~/.claude-agency/registry.json | jq '.tickets["<ticket-id>"]'`
2. Review agent logs for error
3. Fix underlying issue (missing deps, bad config)
4. Manually reset: Edit registry.json, change status to "pending"

**Budget exceeded:**

1. Check spend: `cat ~/.claude-agency/registry.json | jq '.daily_spend'`
2. Wait for daily reset (midnight UTC)
3. Or increase cap in orchestrator.json
4. Recalibrate `cost_per_event_usd` based on real costs

### Best Practices

**Profile discipline:**
- Use minimal profile for ticket triage and planning
- Switch to specific profile before implementation
- Don't use fullstack unless actually needed
- Default to `ticket` for orchestrator to ensure all phases work

**Ticket writing:**
- Clear acceptance criteria
- Link to related docs/tickets
- Include test scenarios
- Specify framework if monorepo
- Add labels for profile auto-classification

**Testing:**
- Always run tests after ticket completion
- PR should be green CI before human review
- Use `--verify` flag to run full test suite

---

## Orchestrator

Autonomous ticket processing system that runs in the background, picking up tickets and spawning agents to implement them.

### What It Does

The orchestrator:
1. Polls ticket sources (ClickUp, Linear, GitHub, Jira)
2. Claims tickets within budget constraints
3. Spawns Claude Code agents to implement each ticket
4. Monitors progress and handles failures
5. Creates PRs when work is complete

### Configuration Basics

Create `orchestrator/orchestrator.json`:

```json
{
  "sources": [
    {
      "type": "github",
      "repo": "owner/repo",
      "labels": ["agency-bot"],
      "poll_interval_sec": 300
    }
  ],
  "budget": {
    "daily_usd_cap": 25,
    "per_ticket_usd_cap": 2
  },
  "retry": {
    "max_attempts": 3,
    "backoff_ms": [5000, 30000, 300000]
  },
  "stuck": {
    "idle_timeout_ms": 1200000,
    "tool_loop_threshold": 10
  }
}
```

### Budget Enforcement

**Real token tracking** (as of 2026-07-17):
- Orchestrator captures `total_cost_usd` from Claude Code JSON output
- Tracks actual costs vs proxy estimates
- Enforces daily and per-ticket caps
- Logs variances >20% for calibration

**Configuration:**

```json
{
  "budget": {
    "daily_usd_cap": 25,        // Max spend per day
    "per_ticket_usd_cap": 2,    // Max spend per ticket
    "cost_per_event_usd": 0.001 // Fallback proxy if JSON parsing fails
  }
}
```

**How it works:**
1. Before spawning, check if budget allows
2. Parse `--output-format stream-json` output from Claude Code
3. Extract `total_cost_usd` from final event
4. Update `registry.json` with real cost
5. Reject new tickets if daily cap hit

### Retry Logic

**Exponential backoff** (as of 2026-07-17):
- 1st retry: 5 seconds
- 2nd retry: 30 seconds
- 3rd retry: 5 minutes
- After 3 attempts: mark as failed, send notification

**Crash detection:**
- Monitors spawned process for first 30 seconds
- If process exits early, triggers retry
- Tracks `spawn_attempts` in registry

**Configuration:**

```json
{
  "retry": {
    "max_attempts": 3,
    "backoff_ms": [5000, 30000, 300000]
  }
}
```

### Stuck Detection

**Idle timeout:**
- Default: 20 minutes (1200000 ms)
- Triggers if no new events in that time
- Configurable per-project

**Tool loop threshold:**
- Default: 10 tool calls
- Detects thrashing (same tool repeatedly)
- Configurable

**Configuration:**

```json
{
  "stuck": {
    "idle_timeout_ms": 1200000,  // 20 minutes
    "tool_loop_threshold": 10
  }
}
```

### Starting the Orchestrator

```bash
cd orchestrator
node server.mjs
```

**Logs:**
- `~/.claude-agency/orchestrator.log` - Main log
- `~/.claude-agency/agent-logs/*.log` - Per-ticket agent logs

### Monitoring

**Dashboard:** http://localhost:7842
- Real-time ticket status
- Budget spend tracking
- Agent output preview
- WebSocket updates (as of 2026-07-17)

**Registry:** `~/.claude-agency/registry.json`

```json
{
  "tickets": {
    "TICKET-123": {
      "status": "in_progress",
      "claimed_at": 1689123456,
      "spawn_attempts": 1,
      "estimated_cost_usd": 0.15,
      "real_cost_usd": 0.12
    }
  },
  "daily_spend": {
    "2026-07-17": 5.43
  }
}
```

---

## Dashboard

Real-time monitoring interface for agent activity and ticket status.

### What It Shows

The dashboard displays four zones:

**Meeting Room** - Active conversations
- Shows agents currently working on tickets
- Real-time message streaming
- Agent status (planning, implementing, testing, etc.)

**Office** - Recent work
- Completed tickets in last 24 hours
- Success/failure status
- Cost tracking per ticket

**Cafeteria** - Idle agents
- Agents available for work
- Queue of pending tickets
- Budget remaining for the day

**Tickets** - All ticket status
- Complete ticket history
- Status transitions over time
- Budget spend analysis

### How to Access

```bash
# Start dashboard server
node "$BLUEPRINT_DIR/dashboard/server.mjs"

# Access in browser
open http://localhost:7842
```

### WebSocket Features

**Real-time updates** (as of 2026-07-17):
- Push updates instead of polling every 2 seconds
- Auto-reconnect with fallback to polling
- Broadcasts only new events (incremental)

**Performance:**
- In-memory cache of last 10,000 events
- Only reads new events from disk
- File rotation detection (100MB threshold)
- O(cache) performance instead of O(file size)

### Self-Resume with /wait-for-reply

The `/wait-for-reply` command allows agents to pause and wait for operator input:

```bash
# In ticket workflow
/wait-for-reply "Which approach should I use for authentication?" 120

# Agent pauses for up to 120 seconds
# Operator responds via dashboard
# Agent resumes with response
```

**Use cases:**
- Decision points requiring human judgment
- Clarifying ambiguous requirements
- Approval gates for risky operations
- Feature flag decisions

**Dashboard integration:**
- Shows waiting agent in Meeting Room with red indicator
- Provides input form for operator response
- Tracks timeout countdown
- Auto-resumes agent when response submitted

---

## Advanced Tools

Additional tools for power users and advanced workflows.

### Graphify Indexing

Creates a queryable knowledge graph of your codebase.

**Installation:**

```bash
# PyPI package is graphifyy (double-y), CLI command is graphify
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
- Structural changes: Adding/removing 10+ files, moving files, renaming modules
- Code changes: Major refactoring, new API endpoints (5+), database migrations
- Time-based: Every 2-3 days for active projects, weekly for occasional updates

**Benefits:**
- 60-80% fewer repeated file reads
- Incremental updates via SHA256 caching
- Fast queries across entire codebase
- Reduced context usage for exploration tasks

### Templates

Reusable code patterns in `.claude/templates/`:

**Available templates:**
- **NestJS:** controller, service
- **React:** component, form
- **FastAPI:** router, service
- **Testing:** pytest-fixture, jest-mock

**Usage:**

Agents automatically check templates before reading example files. Templates save 2K-5K tokens per new file.

**Creating custom templates:**

1. Add template file: `.claude/templates/my-template.md`
2. Document usage in template header
3. Agents will discover and use automatically

**Note:** Templates are available now, but documented as "planned" in older docs. They are fully implemented and ready to use.

### AST Navigation

Use ast-grep for structural searches without reading full files:

**Available via `scripts/ast-query.sh`:**

```bash
# Find authentication guards
./scripts/ast-query.sh auth-guards

# Find specific function
./scripts/ast-query.sh function-name handleLogin

# Find Python class
./scripts/ast-query.sh python-class UserService
```

**Benefits:**
- 60-80% reduction for "find all X" queries
- No need to read full files
- Precise structural matching
- Language-aware searching

**Common patterns:**
- Find all functions: `function $NAME($$$) { $$$ }`
- Find all React components: `function $NAME() { return $$$; }`
- Find all API routes: `@Get('$PATH')`
- Find all class methods: `class $CLASS { $METHOD($$$) { $$$ } }`

---

## See Also

- **[SETUP.md](./SETUP.md)** - Complete new user walkthrough
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and what's new
- **[docs/archive/](./archive/)** - Deep technical details and historical context

For archived technical documentation with implementation rationale:
- **[archive/MONOREPO-SUPPORT-SOLUTION.md](./archive/MONOREPO-SUPPORT-SOLUTION.md)** - Full monorepo design
- **[archive/DYNAMIC-CONTEXT-OPTIMIZATION.md](./archive/DYNAMIC-CONTEXT-OPTIMIZATION.md)** - Profile system design
- **[archive/TOKEN-OPTIMIZATION.md](./archive/TOKEN-OPTIMIZATION.md)** - Complete optimization guide
- **[archive/SAFE-CONTEXT-REDUCTION.md](./archive/SAFE-CONTEXT-REDUCTION.md)** - Safety principles
