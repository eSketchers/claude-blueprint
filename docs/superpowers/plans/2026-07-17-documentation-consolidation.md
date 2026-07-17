# Documentation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 15+ overlapping documentation files into 3 core user-facing documents (SETUP.md, ADVANCED.md, CHANGELOG.md) while preserving all information in docs/archive/.

**Architecture:** "Big Bang" migration - create new consolidated docs, archive old docs with git mv (preserving history), update all cross-references.

**Tech Stack:** Markdown, git, bash

**Design Spec:** `docs/superpowers/specs/2026-07-17-documentation-consolidation-design.md`

---

## File Structure

### New Files to Create
- `docs/SETUP.md` - Complete new user walkthrough (~300-400 lines)
- `docs/ADVANCED.md` - Deep dive topics (~600-800 lines)
- `docs/CHANGELOG.md` - Standard keepachangelog.com format (~100-200 lines)

### Files to Archive (git mv to docs/archive/)
- `docs/AGENT-PROFILES.md` (10K)
- `docs/CHANGELOG-DYNAMIC-PROFILES.md` (20K)
- `docs/CHANGES-SUMMARY.md` (13K)
- `docs/DYNAMIC-CONTEXT-OPTIMIZATION.md` (7.4K)
- `docs/LOCAL-ADOPTION.md` (6.7K)
- `docs/MONOREPO-QUICK-START.md` (11K)
- `docs/MONOREPO-SUMMARY.md` (6.2K)
- `docs/MONOREPO-SUPPORT-SOLUTION.md` (12K)
- `docs/PROFILE-QUICK-REFERENCE.md` (6.1K)
- `docs/SAFE-CONTEXT-REDUCTION.md` (6.7K)
- `docs/TEAM-ONBOARDING.md` (2.5K)
- `docs/TICKET-PROFILE-OPTIMIZATION.md` (8.6K)
- `docs/TICKET-WORKFLOW-PROFILES.md` (7.4K)
- `docs/TOKEN-OPTIMIZATION.md` (10K)
- `docs/optimization-phases/` (entire directory)

### Files to Modify
- `README.md` - Fix SETUP.md link, add references to new docs

### Files to Keep As-Is
- `docs/TROUBLESHOOTING.md` - Recently created, comprehensive
- `docs/superpowers/` - Implementation history

---

## Task 1: Create docs/SETUP.md

**Files:**
- Create: `docs/SETUP.md`
- Read: `docs/LOCAL-ADOPTION.md`, `docs/TEAM-ONBOARDING.md`, `README.md`

**Content to Extract and Consolidate:**
- Prerequisites (Node 20+, Python 3.8+, Claude Code)
- Bootstrap process and commands
- Adoption for single-framework and multi-framework (monorepo)
- CLAUDE.md merge strategies
- First work session guidance
- Safety notes

- [ ] **Step 1: Read LOCAL-ADOPTION.md for adoption mechanics**

```bash
cat docs/LOCAL-ADOPTION.md
```

Extract:
- Prerequisites section (lines 6-9)
- Layout A/B explanations (lines 13-33)
- Adoption commands (lines 36-64)
- CLAUDE.md merge strategies (lines 78-162)
- Updates section (lines 163-180)
- Troubleshooting tips (lines 190-201)
- Safety notes (lines 202-207)

- [ ] **Step 2: Read TEAM-ONBOARDING.md for onboarding flow**

```bash
cat docs/TEAM-ONBOARDING.md
```

Extract:
- What you get overview (lines 6-10)
- Setup prerequisites (lines 20-34)
- Adoption workflow (lines 47-54)
- Daily loop (lines 65-70)

- [ ] **Step 3: Read README.md Quick Start section**

```bash
head -40 README.md
```

Extract:
- Bootstrap command
- Adoption examples
- Framework options

- [ ] **Step 4: Write docs/SETUP.md with all extracted content**

Create complete SETUP.md with sections:

```markdown
# Setup Guide

Complete walkthrough for setting up the Claude Agency Blueprint in your project.

## Prerequisites

**Required tools:**
- **Node.js 20+** - For Claude Code and various tooling
- **Python 3.8+** - For pre-commit hooks and Python tooling
- **Claude Code CLI** - The foundation

Install:
```bash
# macOS
brew install git jq pre-commit node python@3.11 gh
npm install -g @anthropic-ai/claude-code
pip install --user pre-commit

# Ubuntu
sudo apt install git jq python3-pip nodejs npm gh
npm install -g @anthropic-ai/claude-code
pip install --user pre-commit
```

Run `claude` once and sign in with your Anthropic account.

## Step 1: Bootstrap (Global Tool Installation)

Clone the blueprint and install global tools:

```bash
# Clone with submodules
git clone --recurse-submodules <blueprint-url> ~/work/claude-agency-blueprint

# Set environment variable
echo 'export BLUEPRINT_DIR=~/work/claude-agency-blueprint' >> ~/.zshrc   # or .bashrc
source ~/.zshrc

# Run bootstrap
cd "$BLUEPRINT_DIR"
./scripts/bootstrap.sh
```

**What bootstrap installs:**
- **Plugins:** superpowers marketplace + superpowers plugin
- **MCP Servers:** serena, context7, sequential-thinking, memory, playwright, github
- **Host Tools:** ast-grep, graphify, pre-commit

**Bootstrap flags:**
- `--strict` - Exit on any failure (default)
- `--permissive` - Continue on warnings
- `--no-verify` - Skip verification after install
- `--dry-run` - Show what would be installed
- `--help` - Show all options

**Verification:**
```bash
./scripts/verify-tools.sh
```

This checks that all tools are working correctly.

## Step 2: Adopt Into Your Project

### Single Framework Projects

For projects using one framework:

```bash
cd ~/work/my-project
git switch -c chore/agency-adopt

# Python project
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python

# Node project
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework node

# Next.js project
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework nextjs

# NestJS project
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework nestjs
```

### Multi-Framework Projects (Monorepos)

For projects using multiple frameworks:

```bash
cd ~/work/my-monorepo

# Explicit frameworks
"$BLUEPRINT_DIR/scripts/adopt.sh" --frameworks "python,nextjs"

# Auto-detect all frameworks
"$BLUEPRINT_DIR/scripts/adopt.sh" --detect
```

**Framework detection:**
- `--framework F` - Single framework (python|node|nextjs|nestjs)
- `--frameworks F1,F2` - Multiple comma-separated (for monorepos)
- `--detect` - Auto-detect all frameworks in the repo

**Profile selection:**
- For `python` and `nestjs`, the backend deny-list is merged automatically (`--profile backend`)
- Backend profile blocks: direct DB shells, migration apply, cluster CLIs, pushes to main/master

### What Gets Created

**Committed to your repo** (reviewable):
- `CLAUDE.md` - Project context for Claude
- `.pre-commit-config.yaml` - Team-shared lint rules
- `.gitignore` - Adds `/.claude/` line

**Gitignored** (per-developer, local only):
- `.claude/` - All blueprint configuration
  - `settings.json` - Permissions, hooks, MCP config
  - `agents/` - Role specialist agents
  - `commands/` - Slash commands
  - `skills/` - Superpowers skills (symlinked)
  - `hooks/` - Workflow automation

### CLAUDE.md Merge Strategies

When you re-run adoption (e.g., to update blueprint content), the script intelligently handles your existing `CLAUDE.md`:

**Merge (default)** - Preserves your customizations:
```bash
scripts/adopt.sh --framework python  # uses merge by default
```

Blueprint sections wrapped in `<!-- BEGIN BLUEPRINT -->` / `<!-- END BLUEPRINT -->` markers.
- Content before first marker: preserved (project context)
- Content between markers: updated from blueprint
- Content after last marker: preserved (custom conventions)
- Creates timestamped backup: `CLAUDE.md.backup-YYYY-MM-DD-HHMMSS`

**Overwrite** - Replaces entire file:
```bash
scripts/adopt.sh --framework python --merge-strategy overwrite
```

Use when you want fresh blueprint defaults. Always creates backup first.

**Backup-only** - Create snapshot without modifying:
```bash
scripts/adopt.sh --framework python --merge-strategy backup-only
```

Use when testing adoption changes.

### Adoption Flags

```bash
--framework F         # Single framework
--frameworks F1,F2    # Multiple frameworks (monorepo)
--detect             # Auto-detect all frameworks
--profile P          # backend|frontend|fullstack (auto for python/nestjs)
--force              # Overwrite existing .claude/
--no-precommit       # Skip pre-commit install
--merge-strategy S   # merge|overwrite|backup-only (default: merge)
--uninstall          # Remove blueprint from project
```

## Step 3: Your First Work Session

### Start Claude Code

```bash
cd ~/work/my-project
claude
```

### Using Profiles

The blueprint includes different profiles for different types of work:

- **minimal** - Basic tools, fastest context, for exploration
- **frontend** - Playwright + context7, for UI work
- **backend** - Database tools, for API work
- **fullstack** - All tools loaded
- **ticket** - Optimized for autonomous ticket processing

Switch profiles with:
```bash
./scripts/switch-profile.sh minimal
claude  # Start new session with minimal profile
```

See [ADVANCED.md](./ADVANCED.md#profile-system) for detailed profile guide.

### Try the /ticket Workflow

1. Find a ticket URL (ClickUp, Linear, GitHub, Jira)
2. Paste it into Claude Code
3. Claude will:
   - Plan the work
   - Request code review of the plan
   - Implement the changes
   - Run tests
   - Create a PR

## Step 4: Updates

Keep the blueprint up to date:

```bash
# Update blueprint
cd "$BLUEPRINT_DIR"
git pull
git submodule update --remote

# Refresh your project's blueprint files
cd ~/work/my-project
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python --force
```

Symlinked content (skills, commands) updates automatically.

## Next Steps

- **Advanced topics:** See [ADVANCED.md](./ADVANCED.md) for monorepo details, profile system deep dive, token optimization, orchestrator setup
- **Troubleshooting:** See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions
- **Version history:** See [CHANGELOG.md](./CHANGELOG.md) for what's new
- **Diagnostic check:** Run `./scripts/doctor.sh` to verify your setup

## Uninstall

Remove blueprint from a project:

```bash
"$BLUEPRINT_DIR/scripts/adopt.sh" --uninstall
```

Removes `.claude/` and the `.gitignore` line. Leaves backups (`.claude.bak-*`) - delete manually if desired.

## Safety Notes

- Backend profile blocks dangerous operations: direct DB shells (`psql`, `mysql`, `redis-cli`), migration apply (`alembic upgrade`, `prisma migrate deploy`), cluster CLIs (`kubectl`, `terraform apply`, `aws`, `gcloud`), pushes to `main|master|staging|production`
- Claude Code cannot edit `.env*`, `*credentials*`, `*secret*` files - hard-denied in `settings.json`
- All blueprint data stays local on your laptop
- Event log (`~/.claude-agency/`) is per-user only
```

- [ ] **Step 5: Verify content completeness**

Check that SETUP.md includes:
- [ ] All prerequisites from source docs
- [ ] Bootstrap commands and flags
- [ ] Single-framework adoption
- [ ] Multi-framework adoption (monorepo)
- [ ] CLAUDE.md merge strategies
- [ ] What gets created/committed
- [ ] Profile introduction
- [ ] First work session guidance
- [ ] Update procedures
- [ ] Uninstall instructions
- [ ] Safety notes

- [ ] **Step 6: Commit SETUP.md**

```bash
git add docs/SETUP.md
git commit -m "docs: create SETUP.md - complete new user walkthrough

- Prerequisites (Node 20+, Python 3.8+, Claude Code)
- Bootstrap global tool installation
- Single-framework and multi-framework adoption
- CLAUDE.md merge strategies
- First work session with profiles
- Update and uninstall procedures
- Safety notes for backend profile

Consolidates content from:
- LOCAL-ADOPTION.md
- TEAM-ONBOARDING.md
- README.md Quick Start section"
```

---

## Task 2: Create docs/ADVANCED.md (Part 1: Read Source Docs)

**Files:**
- Create: `docs/ADVANCED.md`
- Read: All monorepo, profile, and optimization docs

- [ ] **Step 1: Read all 3 monorepo docs**

```bash
cat docs/MONOREPO-QUICK-START.md
cat docs/MONOREPO-SUMMARY.md
cat docs/MONOREPO-SUPPORT-SOLUTION.md
```

Extract unique information from each about:
- How multi-framework detection works
- Heuristics used by --detect
- When to use --frameworks vs --detect
- Supported framework combinations
- Profile selection for monorepos
- Troubleshooting monorepo adoption
- Architecture decisions

- [ ] **Step 2: Read all profile-related docs**

```bash
cat docs/AGENT-PROFILES.md
cat docs/PROFILE-QUICK-REFERENCE.md
cat docs/TICKET-PROFILE-OPTIMIZATION.md
cat docs/TICKET-WORKFLOW-PROFILES.md
```

Extract:
- What profiles are (MCP + agent combinations)
- Available profiles and when to use each
- How to switch profiles
- Profile internals (agents.profiles.json structure)
- Creating custom profiles
- Profile selection for different ticket types

- [ ] **Step 3: Read all optimization docs**

```bash
cat docs/TOKEN-OPTIMIZATION.md
cat docs/DYNAMIC-CONTEXT-OPTIMIZATION.md
cat docs/SAFE-CONTEXT-REDUCTION.md
cat docs/optimization-phases/PHASE-2-PRACTICAL.md
```

Extract:
- Overview of optimization phases (1-3)
- Phase 1: .claudeignore, smart reading, graphify
- Phase 2: Templates, AST navigation, module batching
- Phase 3: Profile-based MCP loading, conditional agents
- Measuring savings (theoretical vs actual)
- Safe vs unsafe optimization strategies
- YAGNI principle for context

---

## Task 3: Create docs/ADVANCED.md (Part 2: Write Content)

**Files:**
- Create: `docs/ADVANCED.md`

- [ ] **Step 1: Write ADVANCED.md with all extracted content**

Create complete ADVANCED.md with sections:

```markdown
# Advanced Topics

Deep dive into advanced features, architecture decisions, and optimization strategies.

## Table of Contents

1. [Monorepo Support](#monorepo-support)
2. [Profile System](#profile-system)
3. [Token Optimization](#token-optimization)
4. [Orchestrator](#orchestrator)
5. [Agent Profiles](#agent-profiles)
6. [Ticket Workflows](#ticket-workflows)

---

## Monorepo Support

The blueprint supports projects using multiple frameworks through intelligent detection and unified configuration.

### How It Works

**Auto-detection heuristics:**
```bash
./scripts/adopt.sh --detect
```

The script searches for framework indicators:
- **Python:** `pyproject.toml`, `requirements.txt`, `setup.py`, `Pipfile`
- **Node:** `package.json` (checks for Express, vanilla Node patterns)
- **Next.js:** `package.json` with `"next"` dependency, `next.config.js`
- **NestJS:** `package.json` with `"@nestjs/core"` dependency, `nest-cli.json`

**Detection process:**
1. Scans project root and immediate subdirectories
2. Identifies all framework indicators
3. Deduplicates (e.g., package.json with both Next.js and NestJS counts once)
4. Reports detected frameworks
5. Configures .claude/ for all detected frameworks

### Framework Combinations

**Supported combinations:**
- **python + nextjs** - Django backend + Next.js frontend (common)
- **nestjs + nextjs** - NestJS backend + Next.js frontend
- **python + node** - FastAPI backend + Express backend
- **Any framework combo** - The system is extensible

**Profile selection for monorepos:**
- Multiple frameworks → `fullstack` profile (all MCPs loaded)
- Can override with `--profile` flag
- Backend-dominant repos can use `--profile backend`

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

### Architecture

**Why profiles work this way:**
- Each framework needs different MCPs (playwright for frontend, database tools for backend)
- Loading all MCPs wastes context for focused tasks
- Profile system allows per-task MCP selection
- Monorepo support ensures all needed MCPs are available
- Agent availability tied to profile (frontend-dev only loads with frontend profile)

**Design decisions:**
- Single `.claude/` directory for entire monorepo (not per-framework)
- Unified `CLAUDE.md` with all framework context
- Per-profile MCP loading via `agents.profiles.json`
- Framework detection runs at adoption time (not session start)

---

## Profile System

Profiles define which MCPs and agents are available for a work session, allowing you to optimize context for the task at hand.

### What Are Profiles?

A profile is a named configuration that specifies:
- **MCPs to load** - Which Model Context Protocol servers are available
- **Agents to enable** - Which role-specialist agents can be invoked

Example from `agents.profiles.json`:
```json
{
  "profiles": {
    "minimal": {
      "mcps": ["sequential-thinking"],
      "agents": ["architect"]
    },
    "frontend": {
      "mcps": ["sequential-thinking", "playwright", "context7"],
      "agents": ["architect", "frontend-dev", "qa-lead"]
    }
  }
}
```

### Available Profiles

**minimal** - Fastest context, for exploration
- MCPs: sequential-thinking only
- Agents: architect only
- Use for: Reading code, understanding architecture, planning
- Savings: 60-70% vs fullstack

**frontend** - UI work
- MCPs: sequential-thinking, playwright, context7
- Agents: architect, frontend-dev, qa-lead
- Use for: React/Next.js features, UI bugs, styling, accessibility
- Savings: 40-50% vs fullstack

**backend** - API work
- MCPs: sequential-thinking, memory
- Agents: architect, backend-dev, qa-lead
- Use for: API endpoints, database queries, business logic
- Savings: 40-50% vs fullstack

**fullstack** - All tools loaded
- MCPs: All enabled (sequential-thinking, memory, playwright, context7, github)
- Agents: All enabled (architect, frontend-dev, backend-dev, qa-lead, devops, data-engineer)
- Use for: Full-stack features, monorepo work, complex cross-cutting changes
- Savings: 0% (baseline)

**ticket** - Autonomous ticket processing
- MCPs: Optimized for /ticket workflow
- Agents: All enabled
- Use for: Orchestrator-driven ticket processing
- Savings: 20-30% vs fullstack

### How to Switch Profiles

```bash
# Switch to a profile
./scripts/switch-profile.sh minimal

# Start new Claude Code session
claude  # Profile takes effect
```

**Important:** Profile changes require starting a new Claude Code session.

### When to Use Each Profile

**Start with minimal for:**
- "Let me understand this codebase"
- "What does this module do?"
- "Where should I add this feature?"
- Code reviews
- Architecture discussions

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

### Profile Internals

Profiles are defined in `.claude/agents.profiles.json`:

```json
{
  "active_profile": "fullstack",
  "profiles": {
    "minimal": {
      "mcps": ["sequential-thinking"],
      "agents": ["architect"]
    },
    "frontend": {
      "mcps": ["sequential-thinking", "playwright", "context7"],
      "agents": ["architect", "frontend-dev", "qa-lead"]
    }
  }
}
```

**Structure:**
- `active_profile` - Currently selected profile
- `profiles` - Map of profile name to configuration
- Each profile has `mcps` (list) and `agents` (list)

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
      "mcps": ["sequential-thinking", "github"],
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
- Test context size with `/token-count` after switching

---

## Token Optimization

Strategies to reduce context usage while maintaining code quality.

### Overview: Three-Phase Approach

The blueprint implements token optimization in three phases:

**Phase 1 (Core)** - Implemented, always active:
- `.claudeignore` filters noise files
- Smart file reading patterns
- Haiku for exploration tasks
- Graphify indexing

**Phase 2 (Templates & Tools)** - Planned:
- Template library for common patterns
- AST navigation for structural searches
- Module batching for related files

**Phase 3 (Dynamic Context)** - Implemented:
- Profile-based MCP loading (this doc)
- Conditional agent dispatch (built-in)

### Phase 1: Core Optimizations

**.claudeignore:**
```
node_modules/
__pycache__/
*.pyc
.git/
dist/
build/
coverage/
.next/
```

Filters files Claude Code should never read. Reduces wasted context on dependencies and build outputs.

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

### Phase 2: Templates & Tools (Planned)

**Template library:**
Reusable code patterns save 2K-5K tokens per new file:
- React component templates
- API endpoint templates
- Database migration templates
- Test file templates

**AST navigation:**
Use ast-grep for structural searches without reading full files:
```bash
ast-grep --pattern 'function $NAME($$$) { $$$ }' --lang ts
```

**Module batching:**
Read related files together efficiently:
- Controller + service + test
- Component + styles + story
- Model + migration + seed

### Phase 3: Dynamic Context

**Profile-based MCP loading:**
See [Profile System](#profile-system) section above for complete details.

**Savings:**
- minimal profile: 60-70% vs fullstack
- frontend profile: 40-50% vs fullstack
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
- Loading only needed MCPs ✅
- Filtering noise files (.claudeignore) ✅
- Using Haiku for discovery ✅
- Targeted file reading ✅

**Unsafe** (quality-degrading):
- Skipping tests ❌
- Removing error handling ❌
- Reducing context below understanding threshold ❌
- Aggressive summarization ❌

**Core principle:** Quality and correctness > token savings. Eliminate waste, not understanding.

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

### Configuration

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

## Agent Profiles

Connecting agent availability to MCP profiles for maximum context optimization.

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
- Available in: fullstack profile only
- Use for: Deployment, infrastructure, monitoring
- Why custom: Upstream devops/ci-cd are stubs

**data-engineer** - ETL, warehouses, streaming, analytics
- Available in: fullstack profile only
- Use for: Data pipelines, analytics, data quality
- Why custom: No upstream equivalent

**code-reviewer** - Symlinked from superpowers
- Available in: all profiles
- Use for: PR review, code quality feedback
- Why symlink: Theirs is already excellent

### Agent-Profile Mapping

From `.claude/agents.profiles.json`:
```json
{
  "profiles": {
    "minimal": {
      "agents": ["architect"]
    },
    "frontend": {
      "agents": ["architect", "frontend-dev", "qa-lead"]
    },
    "backend": {
      "agents": ["architect", "backend-dev", "qa-lead"]
    },
    "fullstack": {
      "agents": ["architect", "frontend-dev", "backend-dev", "qa-lead", "devops", "data-engineer"]
    }
  }
}
```

**How it works:**
- Only agents listed in active profile are available
- Agent files exist in `.claude/agents/` but aren't loaded unless profile allows
- Reduces context by not loading unused agent instructions

### Creating Custom Agents

1. Create agent file: `.claude/agents/my-agent.md`
2. Add to profile: Edit `agents.profiles.json`
3. Invoke: Use skill or direct agent call

**Example agent structure:**
```markdown
# My Agent

You are a specialist in X domain. Your role is to Y.

## Skills
- Skill 1
- Skill 2

## Constraints
- Constraint 1
- Constraint 2

## Workflow
1. Step 1
2. Step 2
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

**Unknown tickets:**
Start with fullstack if unsure. Can switch profiles mid-session if needed.

### Orchestrator Integration

When using the orchestrator, profile selection is automatic:
- Ticket labels determine profile: `frontend`, `backend`, `fullstack`
- Default: fullstack if no label
- Configure in `orchestrator/orchestrator.json`

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

**Ticket writing:**
- Clear acceptance criteria
- Link to related docs/tickets
- Include test scenarios
- Specify framework if monorepo

**Testing:**
- Always run tests after ticket completion
- PR should be green CI before human review
- Use `--verify` flag to run full test suite
```

- [ ] **Step 2: Verify content completeness**

Check that ADVANCED.md includes:
- [ ] All monorepo concepts from 3 source docs
- [ ] All profile concepts from 4+ source docs
- [ ] All optimization strategies from 4 source docs
- [ ] Orchestrator overview (budget, retry, stuck detection)
- [ ] Agent-profile mappings
- [ ] Ticket workflow guidance

- [ ] **Step 3: Commit ADVANCED.md**

```bash
git add docs/ADVANCED.md
git commit -m "docs: create ADVANCED.md - deep dive on advanced topics

- Monorepo support (detection, frameworks, troubleshooting)
- Profile system (all profiles, switching, custom profiles)
- Token optimization (3 phases, measuring savings)
- Orchestrator (budget, retry, stuck detection)
- Agent profiles (mapping, custom agents)
- Ticket workflows (profile selection, troubleshooting)

Consolidates content from:
- MONOREPO-QUICK-START.md
- MONOREPO-SUMMARY.md
- MONOREPO-SUPPORT-SOLUTION.md
- AGENT-PROFILES.md
- PROFILE-QUICK-REFERENCE.md
- TICKET-PROFILE-OPTIMIZATION.md
- TICKET-WORKFLOW-PROFILES.md
- TOKEN-OPTIMIZATION.md
- DYNAMIC-CONTEXT-OPTIMIZATION.md
- SAFE-CONTEXT-REDUCTION.md
- optimization-phases/PHASE-2-PRACTICAL.md"
```

---

## Task 4: Create docs/CHANGELOG.md

**Files:**
- Create: `docs/CHANGELOG.md`
- Read: `docs/CHANGELOG-DYNAMIC-PROFILES.md`, `docs/CHANGES-SUMMARY.md`

- [ ] **Step 1: Read CHANGELOG-DYNAMIC-PROFILES.md**

```bash
cat docs/CHANGELOG-DYNAMIC-PROFILES.md
```

Extract key user-visible changes, ignore implementation details.

- [ ] **Step 2: Read CHANGES-SUMMARY.md**

```bash
cat docs/CHANGES-SUMMARY.md
```

Extract all major changes.

- [ ] **Step 3: Check git log for recent commits**

```bash
git log --oneline --since="2026-07-01" | head -20
```

Extract recent changes to include in CHANGELOG.

- [ ] **Step 4: Write docs/CHANGELOG.md**

```markdown
# Changelog

All notable changes to the Claude Agency Blueprint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [2026-07-17] - Documentation Consolidation

### Changed
- Consolidated 15+ documentation files into SETUP.md, ADVANCED.md, and CHANGELOG.md
- Moved old docs to docs/archive/ with full git history preserved
- Fixed broken README.md link to SETUP.md

### Added
- Complete setup walkthrough in SETUP.md
- Deep dive guide in ADVANCED.md covering monorepo, profiles, optimization, orchestrator
- Standard CHANGELOG.md following keepachangelog.com format

## [2026-07-17] - HIGH Priority Fixes

### Added
- Real token tracking from Claude Code JSON output
  - Captures `total_cost_usd` from `--output-format stream-json`
  - Tracks actual costs vs proxy estimates
  - Logs variances >20% for calibration
- Orchestrator retry logic with exponential backoff
  - 3 retry attempts: 5s, 30s, 5min
  - Crash detection monitors first 30 seconds
  - Tracks spawn_attempts in registry
- Dashboard WebSocket support for real-time updates
  - Push updates instead of polling every 2 seconds
  - Auto-reconnect with fallback to polling
  - Broadcasts only new events (incremental)
- Dashboard incremental reading for O(cache) performance
  - In-memory cache of last 10,000 events
  - Only reads new events from disk
  - File rotation detection (100MB threshold)
- Bootstrap verification mode
  - `--strict` (default), `--permissive`, `--no-verify`, `--dry-run` flags
  - Installation tracking with success/failure reporting
  - `verify-tools.sh` script for post-install verification
- Comprehensive troubleshooting guide
  - TROUBLESHOOTING.md with common issues and solutions
  - `doctor.sh` diagnostic script for system health checks
  - Covers bootstrap, adoption, orchestrator, dashboard, agent issues

### Fixed
- Configuration backup files now gitignored (`*.backup-*`, `agents.backup/`)
- Pre-commit hook error handling prevents hook failures from blocking commits
- Smart CLAUDE.md merge preserves user customizations during adoption
  - Uses `<!-- BEGIN BLUEPRINT -->` / `<!-- END BLUEPRINT -->` markers
  - Content before/after markers preserved
  - Creates timestamped backups

### Removed
- Leftover `.claude-flow/` directory from removed submodule (PR #5)

## [2026-07-15] - Dynamic Context Optimization

### Added
- Profile-based MCP loading system
  - 5 profiles: minimal, frontend, backend, fullstack, ticket
  - Profile switching via `./scripts/switch-profile.sh`
  - 30-60% context savings for focused tasks
- Agent profiles connected to MCP profiles
  - Only listed agents available per profile
  - Reduces context by not loading unused agent instructions
- Profile definitions in `agents.profiles.json`
  - Specifies MCPs and agents per profile
  - Active profile tracked, applied at session start

### Changed
- `.claude/settings.json` now uses profile references for MCP configuration
- Agent availability tied to active profile
- Orchestrator uses profile-aware spawning

### Documentation
- Added AGENT-PROFILES.md
- Added PROFILE-QUICK-REFERENCE.md
- Added TICKET-PROFILE-OPTIMIZATION.md
- Added TICKET-WORKFLOW-PROFILES.md
- Added DYNAMIC-CONTEXT-OPTIMIZATION.md

## [2026-04-21] - Local-Only Adoption

### Added
- Local-only adoption mode (no shared infrastructure required)
- Two layout options: sibling (blueprint outside project) and nested (blueprint inside project)
- CLAUDE.md merge strategies: merge (default), overwrite, backup-only
- Automatic backup creation with timestamps
- Framework auto-detection for monorepos
- Multi-framework support: `--frameworks "python,nextjs"`

### Changed
- Bootstrap now installs tools globally (one-time per machine)
- Adoption creates .claude/ directory (gitignored, per-developer)
- Only CLAUDE.md and .pre-commit-config.yaml committed to repos

### Documentation
- Added LOCAL-ADOPTION.md
- Added TEAM-ONBOARDING.md
- Added docs/superpowers/specs/2026-04-21-local-only-adoption-design.md

## [Earlier] - Initial Blueprint

### Added
- 6 role-specialist agents: architect, frontend-dev, backend-dev, qa-lead, devops, data-engineer
- Integration with superpowers plugin for TDD, git-worktrees, code-review skills
- MCP server registrations: serena, context7, sequential-thinking, memory, playwright, github
- Host tooling: ast-grep, graphify, pre-commit
- Pre-commit hook configuration for Python and Node.js projects
- Framework templates: Python, Node, Next.js, NestJS
- Vendor directory with pinned submodules: superpowers, graphify, awesome-claude-code
- Orchestrator for autonomous ticket processing
- Dashboard for agent visibility (port 7842)
- `/ticket` workflow for feature implementation
```

- [ ] **Step 5: Commit CHANGELOG.md**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: create CHANGELOG.md - standard version history

- Follows keepachangelog.com format
- Documents all major changes since project start
- Includes recent HIGH priority fixes (token tracking, retry, WebSocket, performance)
- Includes dynamic context optimization (profile system)
- Includes local-only adoption mode

Consolidates content from:
- CHANGELOG-DYNAMIC-PROFILES.md
- CHANGES-SUMMARY.md
- Git commit history"
```

---

## Task 5: Archive Old Documentation Files

**Files:**
- Archive: All deprecated docs (git mv to docs/archive/)

- [ ] **Step 1: Create docs/archive/ directory**

```bash
mkdir -p docs/archive
```

- [ ] **Step 2: Move all deprecated docs to archive**

```bash
git mv docs/AGENT-PROFILES.md docs/archive/
git mv docs/CHANGELOG-DYNAMIC-PROFILES.md docs/archive/
git mv docs/CHANGES-SUMMARY.md docs/archive/
git mv docs/DYNAMIC-CONTEXT-OPTIMIZATION.md docs/archive/
git mv docs/LOCAL-ADOPTION.md docs/archive/
git mv docs/MONOREPO-QUICK-START.md docs/archive/
git mv docs/MONOREPO-SUMMARY.md docs/archive/
git mv docs/MONOREPO-SUPPORT-SOLUTION.md docs/archive/
git mv docs/PROFILE-QUICK-REFERENCE.md docs/archive/
git mv docs/SAFE-CONTEXT-REDUCTION.md docs/archive/
git mv docs/TEAM-ONBOARDING.md docs/archive/
git mv docs/TICKET-PROFILE-OPTIMIZATION.md docs/archive/
git mv docs/TICKET-WORKFLOW-PROFILES.md docs/archive/
git mv docs/TOKEN-OPTIMIZATION.md docs/archive/
git mv docs/optimization-phases docs/archive/
```

- [ ] **Step 3: Verify git history preserved**

```bash
# Check that history follows the moved files
git log --follow docs/archive/LOCAL-ADOPTION.md | head -5
git log --follow docs/archive/TOKEN-OPTIMIZATION.md | head -5
```

Expected: Full commit history visible for archived files.

- [ ] **Step 4: Commit archive moves**

```bash
git commit -m "docs: archive deprecated documentation files

Moved to docs/archive/ with git mv (history preserved):
- AGENT-PROFILES.md
- CHANGELOG-DYNAMIC-PROFILES.md
- CHANGES-SUMMARY.md
- DYNAMIC-CONTEXT-OPTIMIZATION.md
- LOCAL-ADOPTION.md
- MONOREPO-QUICK-START.md
- MONOREPO-SUMMARY.md
- MONOREPO-SUPPORT-SOLUTION.md
- PROFILE-QUICK-REFERENCE.md
- SAFE-CONTEXT-REDUCTION.md
- TEAM-ONBOARDING.md
- TICKET-PROFILE-OPTIMIZATION.md
- TICKET-WORKFLOW-PROFILES.md
- TOKEN-OPTIMIZATION.md
- optimization-phases/ (entire directory)

Content consolidated into SETUP.md, ADVANCED.md, CHANGELOG.md.
All information preserved in new docs.
Full git history maintained via git mv."
```

---

## Task 6: Add Deprecation Notices to Archived Docs

**Files:**
- Modify: All files in `docs/archive/`

- [ ] **Step 1: Add deprecation notice to each archived doc**

For each file in docs/archive/, prepend:

```bash
# Script to add deprecation notices
for file in docs/archive/*.md; do
  if [[ -f "$file" ]]; then
    echo "Adding deprecation notice to $file"

    # Create temp file with notice + original content
    cat > "${file}.tmp" << 'NOTICE'
> ⚠️ **ARCHIVED:** This document has been consolidated. See:
> - [docs/SETUP.md](../SETUP.md) for setup and adoption
> - [docs/ADVANCED.md](../ADVANCED.md) for advanced topics
> - [docs/CHANGELOG.md](../CHANGELOG.md) for change history

---

NOTICE
    cat "$file" >> "${file}.tmp"
    mv "${file}.tmp" "$file"
  fi
done
```

- [ ] **Step 2: Run the script to add notices**

```bash
bash # (run the script from Step 1)
```

- [ ] **Step 3: Verify notices added**

```bash
head -10 docs/archive/LOCAL-ADOPTION.md
head -10 docs/archive/TOKEN-OPTIMIZATION.md
```

Expected: Deprecation notice at top of each file.

- [ ] **Step 4: Commit deprecation notices**

```bash
git add docs/archive/
git commit -m "docs: add deprecation notices to archived files

Added notice to all archived docs pointing to:
- SETUP.md for setup/adoption content
- ADVANCED.md for advanced topics
- CHANGELOG.md for version history

Helps users find consolidated content."
```

---

## Task 7: Update README.md References

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read README.md to find references to update**

```bash
cat README.md | grep -n "docs/"
```

Identify all doc references that need updating.

- [ ] **Step 2: Fix SETUP.md link in README.md**

Current (broken):
```markdown
**👉 New here? Start with [SETUP.md](./SETUP.md) — full step-by-step onboarding...**
```

Fixed:
```markdown
**👉 New here? Start with [SETUP.md](./docs/SETUP.md) — full step-by-step onboarding, from host install to shipping your first PR via the `/ticket` workflow.**
```

Apply fix:
```bash
# Use Edit tool or sed
sed -i '' 's|Start with \[SETUP.md\](./SETUP.md)|Start with [SETUP.md](./docs/SETUP.md)|' README.md
```

- [ ] **Step 3: Update Token Optimization section references**

Current:
```markdown
See **[docs/TOKEN-OPTIMIZATION.md](./docs/TOKEN-OPTIMIZATION.md)** and **[docs/DYNAMIC-CONTEXT-OPTIMIZATION.md](./docs/DYNAMIC-CONTEXT-OPTIMIZATION.md)** for complete guides.
```

Updated:
```markdown
See **[docs/ADVANCED.md](./docs/ADVANCED.md#token-optimization)** for the complete optimization guide, including all three phases and the profile system.
```

- [ ] **Step 4: Add reference to CHANGELOG.md**

Add after the "Getting Help" section:

```markdown
## Recent Changes

See [CHANGELOG.md](./docs/CHANGELOG.md) for version history and what's new.
```

- [ ] **Step 5: Verify all references correct**

```bash
# Check no broken links remain
grep -n "docs/" README.md

# Verify new structure referenced
grep -n "SETUP.md" README.md
grep -n "ADVANCED.md" README.md
grep -n "CHANGELOG.md" README.md
grep -n "TROUBLESHOOTING.md" README.md
```

Expected: All 4 main docs referenced, no broken links.

- [ ] **Step 6: Commit README.md updates**

```bash
git add README.md
git commit -m "docs: update README.md references to consolidated docs

- Fix broken SETUP.md link (./SETUP.md -> ./docs/SETUP.md)
- Update Token Optimization section to point to ADVANCED.md
- Add reference to CHANGELOG.md
- All references now point to consolidated documentation structure"
```

---

## Task 8: Search and Update Cross-References

**Files:**
- Potentially modify: Any remaining docs with references to archived files

- [ ] **Step 1: Search for references to archived docs**

```bash
# Search all docs except archive and superpowers
grep -r "MONOREPO-" docs/ --exclude-dir=archive --exclude-dir=superpowers | grep -v "Binary"
grep -r "PROFILE-" docs/ --exclude-dir=archive --exclude-dir=superpowers | grep -v "Binary"
grep -r "TOKEN-OPTIMIZATION" docs/ --exclude-dir=archive --exclude-dir=superpowers | grep -v "Binary"
grep -r "LOCAL-ADOPTION" docs/ --exclude-dir=archive --exclude-dir=superpowers | grep -v "Binary"
grep -r "TEAM-ONBOARDING" docs/ --exclude-dir=archive --exclude-dir=superpowers | grep -v "Binary"
```

- [ ] **Step 2: Update any found references**

For each reference found:
- If in TROUBLESHOOTING.md: Update to point to SETUP.md or ADVANCED.md
- If in other docs: Update to consolidated location

Example:
```markdown
# Old
See [LOCAL-ADOPTION.md](./LOCAL-ADOPTION.md) for details.

# New
See [SETUP.md](./SETUP.md) for adoption details.
```

- [ ] **Step 3: Check superpowers docs for references (informational only)**

```bash
grep -r "MONOREPO-\|PROFILE-\|TOKEN-OPTIMIZATION\|LOCAL-ADOPTION" docs/superpowers/ | grep -v "Binary"
```

Note: Superpowers docs (plans, specs, handoffs) are implementation history - don't update them. They should reference the docs that existed at the time they were written.

- [ ] **Step 4: Commit any cross-reference updates**

```bash
git add docs/
git commit -m "docs: update cross-references to consolidated documentation

Updated remaining references to archived docs:
- Point to SETUP.md for setup/adoption content
- Point to ADVANCED.md for advanced topics
- Removed references to deprecated docs

Left superpowers/ history docs unchanged (historical references)."
```

---

## Task 9: Final Validation

**Files:**
- Verify: All new docs, all moves complete

- [ ] **Step 1: Verify file structure**

```bash
# Check new docs exist
ls -lh docs/SETUP.md docs/ADVANCED.md docs/CHANGELOG.md

# Check archive created and populated
ls -lh docs/archive/ | wc -l
# Expected: 14+ files

# Check TROUBLESHOOTING.md still exists
ls -lh docs/TROUBLESHOOTING.md
```

- [ ] **Step 2: Verify no broken links**

```bash
# Check all markdown files for broken internal links
find docs -name "*.md" -not -path "*/archive/*" -not -path "*/superpowers/*" -exec grep -H "\[.*\](" {} \; > /tmp/all-links.txt

# Manual review of /tmp/all-links.txt for broken links
cat /tmp/all-links.txt
```

- [ ] **Step 3: Verify git history preserved**

```bash
# Test a few archived files
git log --follow docs/archive/LOCAL-ADOPTION.md | head -10
git log --follow docs/archive/MONOREPO-SUPPORT-SOLUTION.md | head -10
git log --follow docs/archive/TOKEN-OPTIMIZATION.md | head -10
```

Expected: Full commit history visible, not just "archived" commit.

- [ ] **Step 4: Verify content completeness**

Review SETUP.md for all prerequisites and adoption content:
```bash
grep -i "prerequisite\|bootstrap\|adopt\|monorepo\|framework" docs/SETUP.md | wc -l
```
Expected: 20+ matches

Review ADVANCED.md for all advanced topics:
```bash
grep -i "monorepo\|profile\|token\|optimization\|orchestrator\|agent" docs/ADVANCED.md | wc -l
```
Expected: 50+ matches

Review CHANGELOG.md for all major changes:
```bash
grep -E "^\#\# \[" docs/CHANGELOG.md
```
Expected: 4+ version entries

- [ ] **Step 5: Verify doc sizes reasonable**

```bash
wc -l docs/SETUP.md docs/ADVANCED.md docs/CHANGELOG.md
```

Expected:
- SETUP.md: 300-500 lines
- ADVANCED.md: 600-1000 lines
- CHANGELOG.md: 100-300 lines

- [ ] **Step 6: Test one setup walkthrough manually**

Read SETUP.md top to bottom and verify:
- [ ] Prerequisites section clear
- [ ] Bootstrap commands work
- [ ] Adoption commands work
- [ ] Profile intro makes sense
- [ ] Next steps links work

---

## Task 10: Create Final Commit and PR

**Files:**
- All changes from previous tasks

- [ ] **Step 1: Review git status**

```bash
git status
```

Expected: All changes committed, nothing staged or unstaged.

- [ ] **Step 2: Review commit log**

```bash
git log --oneline -10
```

Expected commits:
1. Create SETUP.md
2. Create ADVANCED.md
3. Create CHANGELOG.md
4. Archive old docs
5. Add deprecation notices
6. Update README.md
7. Update cross-references
8. (Any additional fixes)

- [ ] **Step 3: Push to feature branch**

```bash
git push origin high-priority-fixes-july-2026
```

- [ ] **Step 4: Create or update PR**

If PR #6 already exists (from previous work):
```bash
gh pr edit 6 --body "$(cat <<'PR_BODY_UPDATE'
[Previous PR content...]

---

## Documentation Consolidation (NEW)

### Added
- **docs/SETUP.md** - Complete new user walkthrough
  - Prerequisites (Node 20+, Python 3.8+, Claude Code)
  - Bootstrap global tool installation
  - Single-framework and multi-framework adoption
  - CLAUDE.md merge strategies
  - First work session guidance
  - Update and uninstall procedures

- **docs/ADVANCED.md** - Deep dive on advanced topics
  - Monorepo support (detection, frameworks, troubleshooting)
  - Profile system (all profiles, switching, custom profiles)
  - Token optimization (3 phases, measuring savings)
  - Orchestrator (budget, retry, stuck detection)
  - Agent profiles (mapping, custom agents)
  - Ticket workflows (profile selection, troubleshooting)

- **docs/CHANGELOG.md** - Standard version history
  - Follows keepachangelog.com format
  - Documents all major changes since project start

### Changed
- Archived 14 documentation files to docs/archive/ (git history preserved)
- Fixed broken README.md link to SETUP.md
- Updated all cross-references to point to consolidated docs

### Impact
- 15 docs → 4 docs in docs/ (73% reduction)
- Single source of truth per topic
- Clear learning path: README → SETUP → ADVANCED → TROUBLESHOOTING
- Zero information loss (all archived with git history)

Implements design from: docs/superpowers/specs/2026-07-17-documentation-consolidation-design.md
PR_BODY_UPDATE
)"
```

Or create new PR if needed:
```bash
gh pr create --title "Documentation Consolidation: SETUP, ADVANCED, CHANGELOG" \
  --body "$(cat <<'PR_BODY'
## Summary

Consolidates 15+ overlapping documentation files into 3 core user-facing documents (SETUP.md, ADVANCED.md, CHANGELOG.md) while preserving all information in docs/archive/.

## Changes

### Added
- **docs/SETUP.md** (400 lines) - Complete new user walkthrough
  - Prerequisites, bootstrap, adoption (single + multi-framework)
  - CLAUDE.md merge strategies, first work session, updates
- **docs/ADVANCED.md** (800 lines) - Deep dive on advanced topics
  - Monorepo, profiles, token optimization, orchestrator, agents, tickets
- **docs/CHANGELOG.md** (200 lines) - Standard keepachangelog.com format
  - All major changes since project start

### Changed
- Archived 14 docs to docs/archive/ with git mv (history preserved)
- Fixed broken README.md → SETUP.md link
- Updated all cross-references to consolidated structure

### Removed
- No content removed, all moved to archive with full history

## Impact

- 73% reduction in active docs (15 → 4)
- Single source of truth per topic
- Clear progression: README → SETUP → ADVANCED → TROUBLESHOOTING
- Zero information loss

## Testing

- [x] All archived files have git history
- [x] All new docs include complete content from sources
- [x] No broken internal links
- [x] README.md references updated
- [x] Deprecation notices added to archived docs
- [x] Manual walkthrough of SETUP.md
- [x] All advanced topics covered in ADVANCED.md
- [x] CHANGELOG.md follows standard format

## Design

Implements: docs/superpowers/specs/2026-07-17-documentation-consolidation-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PR_BODY
)"
```

- [ ] **Step 5: Verify PR created/updated successfully**

```bash
# Get PR URL
gh pr view
```

Check PR includes all commits and has correct description.

---

## Success Criteria

After completing all tasks, verify:

### Quantitative
- [ ] 15 docs in docs/ → 4 docs in docs/ (SETUP, ADVANCED, CHANGELOG, TROUBLESHOOTING)
- [ ] 14 files archived to docs/archive/
- [ ] All archived files have deprecation notices
- [ ] README.md link to SETUP.md works
- [ ] Zero broken internal links in active docs

### Qualitative
- [ ] New user can follow SETUP.md without jumping to other docs
- [ ] ADVANCED.md has single authoritative source per topic
- [ ] CHANGELOG.md follows keepachangelog.com format
- [ ] All content from source docs preserved in new docs or archive
- [ ] Git history preserved for all moved files

### Testing
- [ ] Walk through SETUP.md commands in fresh environment
- [ ] Verify all links resolve correctly
- [ ] Confirm archived docs have deprecation notices
- [ ] Test git log --follow for archived files shows full history

---

## Notes

**Content preservation:**
- Every task explicitly reads source docs and extracts content
- SETUP.md and ADVANCED.md include specific sections to preserve all information
- Archive preserves everything with git history
- Nothing is deleted, only moved

**Git history:**
- All moves use git mv (preserves history automatically)
- Can trace any line back to original author/date
- Archive directory maintains full commit history

**Link maintenance:**
- Task 8 searches for and updates all cross-references
- Superpowers docs left unchanged (historical references)
- Deprecation notices guide users to new locations
