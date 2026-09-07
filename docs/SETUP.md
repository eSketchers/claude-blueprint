# Setup Guide

Complete walkthrough for setting up the Claude Agency Blueprint in your project.

## Prerequisites

**Required tools:**
- **Node.js 20+** - For Claude Code and various tooling
- **Python 3.8+** - For pre-commit hooks and Python tooling
- **Claude Code CLI** - The foundation
- **[uv](https://docs.astral.sh/uv/)** - Required by `bootstrap.sh` to install the `serena` MCP server (`uvx --from git+... serena-mcp-server`). Serena's own maintainers explicitly recommend installing it only via `uv` — other methods (pip, marketplaces) are documented upstream as outdated/unsupported — so this isn't optional if you want the serena MCP working.

Install:
```bash
# macOS
brew install git jq pre-commit node python@3.11 gh uv
npm install -g @anthropic-ai/claude-code
pip install --user pre-commit

# Ubuntu
sudo apt install git jq python3-pip nodejs npm gh
curl -LsSf https://astral.sh/uv/install.sh | sh
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

**Example custom sections:**

```markdown
# Claude Code Configuration — Python Project

## Our Team Context
- Sprint cadence: 2 weeks
- Architecture decisions: see docs/ADRs/
- Production access: read-only via AWS SSO

<!-- BEGIN BLUEPRINT -->
[Blueprint-maintained content here]
<!-- END BLUEPRINT -->

## Our Custom Tools
- Use our internal CLI: `mycorp-cli` for deployments
- Monitoring dashboard: https://grafana.mycorp.com
```

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

## Alternative Layout: Nested Blueprint

If you prefer to keep the blueprint inside your project instead of in a sibling directory:

```bash
cd ~/work/my-backend-project
git clone --recurse-submodules <blueprint-url> .agency
./.agency/scripts/bootstrap.sh

# Now use adoption with nested layout:
./.agency/scripts/adopt.sh --framework python
./.agency/scripts/adopt.sh --frameworks "python,nextjs"
./.agency/scripts/adopt.sh --detect
```

**Pros:** Self-contained, no env var needed
**Cons:** Blueprint cloned once per project (more disk space)

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
