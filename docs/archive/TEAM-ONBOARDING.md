# Team Onboarding — Claude Agency Blueprint

Welcome. You're about to get the blueprint running against your backend project, locally, on your laptop. This takes ~10 minutes.

## What you get

- Consistent Claude Code setup across every project (role agents, slash commands, skills).
- `/ticket` workflow — paste a ClickUp / Linear / GitHub / Jira URL, Claude plans → reviews → implements → opens PR.
- Backend guardrails — Claude cannot run migrations, touch prod DBs, or push to `main|master|staging|production`.
- Pre-commit hooks (lint on commit).

## What you don't get (and why)

- No shared dashboard or orchestrator. Those are opt-in extras; see `orchestrator/README.md` if you want them later.
- No committed `.claude/` in your backend repo. Each dev adopts locally; your team's config stays per-developer.

## Setup (once per machine)

### 1. Install prereqs

```bash
# macOS
brew install git jq pre-commit node python@3.11 gh
npm install -g @anthropic-ai/claude-code pnpm
pip install --user pre-commit

# Ubuntu
sudo apt install git jq python3-pip nodejs npm gh
npm install -g @anthropic-ai/claude-code pnpm
pip install --user pre-commit
```

Run `claude` once and sign in.

### 2. Clone the blueprint (sibling layout)

```bash
git clone --recurse-submodules <blueprint-url> ~/work/claude-agency-blueprint
~/work/claude-agency-blueprint/scripts/bootstrap.sh     # installs global MCPs + plugins
echo 'export BLUEPRINT_DIR=~/work/claude-agency-blueprint' >> ~/.zshrc   # or .bashrc
source ~/.zshrc
```

(Prefer nested? See `docs/LOCAL-ADOPTION.md` Layout B.)

## Adopt your project (once per repo)

```bash
cd ~/work/my-backend-project
git switch -c chore/agency-adopt-local
"$BLUEPRINT_DIR/scripts/adopt.sh" --framework python   # or node|nextjs|nestjs
```

That's it. Run `claude` in the project. Paste a ticket URL. Work.

## What shows up in your PR

- `CLAUDE.md` — new file or unchanged (adopt won't overwrite yours).
- `.pre-commit-config.yaml` — new file or unchanged.
- `.gitignore` — two lines added.
- Nothing else.

Review with your team, merge.

## Daily loop

- Edit code. `pre-commit` runs on commit.
- Paste ticket URLs. `/ticket` drives plan → review → implement → PR.
- Update the blueprint occasionally: `git -C "$BLUEPRINT_DIR" pull && git -C "$BLUEPRINT_DIR" submodule update --remote`.

## Getting help

- Full guide: `docs/LOCAL-ADOPTION.md`.
- Design rationale: `docs/superpowers/specs/2026-04-21-local-only-adoption-design.md`.
- Troubleshooting section in `docs/LOCAL-ADOPTION.md`.
- Uninstall: `"$BLUEPRINT_DIR/scripts/adopt.sh" --uninstall`.
