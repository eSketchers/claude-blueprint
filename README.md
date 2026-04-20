# Claude Agency Blueprint

Reusable Claude Code baseline for all agency projects. Clone into a new project root, or copy `.claude/` + the appropriate `CLAUDE.md` template.

## Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| **Plugin** | [superpowers](https://github.com/obra/superpowers) | TDD, git-worktrees, code-review skills |
| **Skill** | [graphify](https://github.com/safishamsi/graphify) | Post-commit codebase knowledge graph |
| **MCP** | [serena](https://github.com/oraios/serena) | Fast semantic code search (LSP-based) |
| **MCP** | [context7](https://github.com/upstash/context7) | Live library docs |
| **MCP** | sequential-thinking | Structured reasoning |
| **MCP** | memory | Persistent knowledge graph |
| **MCP** | playwright | Browser E2E tests |
| **MCP** | github | PRs / issues |
| **CLI** | [claude-flow](https://github.com/ruvnet/claude-flow) | Multi-agent swarm orchestration |
| **CLI** | [ast-grep](https://ast-grep.github.io/) | Structural refactors |
| **Hooks** | pre-commit + Flake8 / ESLint / Prettier | Lint on commit |

## Quick Start

```bash
# 1. One-time global install (MCPs, plugins)
./scripts/bootstrap.sh

# 2. Spin up a new project from this blueprint
./scripts/new-project.sh <project-name> <python|node|nextjs|nestjs>
```

## Layout

```
.claude/
  settings.json         Baseline permissions + hooks + MCP config
  agents/               coder, frontend-dev, backend-dev, tester, reviewer, devops
  commands/             Shared slash commands (to add)
  skills/               Drop-in project skills

templates/
  CLAUDE.md.python      Python + Flake8 template
  CLAUDE.md.node        Node / TS template
  CLAUDE.md.nextjs      Next.js template
  CLAUDE.md.nestjs      NestJS microservice template

pre-commit/
  .pre-commit-config.python.yaml
  .pre-commit-config.node.yaml

vendor/                 External tools vendored as git submodules
  superpowers/          Plugin: TDD + worktree + review skills (obra)
  graphify/             Skill: knowledge-graph indexing (safishamsi)
  claude-flow/          MCP: multi-agent swarm orchestration (ruvnet)
  awesome-claude-code/  Reference: curated index of skills/hooks/agents

scripts/
  bootstrap.sh          Install plugins + MCPs globally
  new-project.sh        Clone blueprint into a new project dir
```

## Working with `vendor/`

These are **read-only reference copies** pinned to a known-good commit. Team members can:

- **Inspect source** to understand how a skill/plugin works before trusting it
- **Fork** any of them by adding their own remote
- **Update** via `git submodule update --remote vendor/<name>`
- **Clone the blueprint with submodules**: `git clone --recurse-submodules <blueprint-url>` (or `git submodule update --init` after a plain clone)

Installation still happens via the official marketplaces / registries through `bootstrap.sh` — the vendored copies are for inspection, not installation targets.

## Customizing per Team

Projects extend this baseline by adding a `.claude/settings.local.json` and a project-specific `CLAUDE.md`. Do not edit this blueprint for project-specific tweaks — PR changes back here only when they should apply agency-wide.
