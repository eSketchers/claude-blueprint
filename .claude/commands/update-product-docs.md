---
description: Generate and maintain product-level documentation — feature guides, system overview, and what's new — for customer support, product owners, and new team members. Publishes to Mintlify via docs/guides/, docs/OVERVIEW.md, and docs/WHATS-NEW.md.
argument-hint: [--bootstrap] [--config <path>] [--no-prompt]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /update-product-docs

You generate and maintain **product-level documentation** — plain language, no code references, written for customer support agents, product owners, and anyone onboarding to the project.

Arguments: `$ARGUMENTS`
- `--bootstrap` — scan the full codebase and generate all feature guides from scratch (first run).
- `--config <path>` — config file (default `docs-sync/config.json`).
- `--no-prompt` — headless/CI mode; never ask the operator anything.

## Guardrails (non-negotiable)

- **Zero code references in output** — no file paths, no function names, no import statements, no technical terms. Write as if explaining to a customer support agent.
- **Only write under `docs/guides/`, `docs/OVERVIEW.md`, and `docs/WHATS-NEW.md`**. Never touch source code or code-level docs.
- **Never invent features** that are not present in the codebase or the diff.
- **`WHATS-NEW.md` is append-only** — add one entry, never rewrite history.
- **Idempotent** — re-running on the same diff produces the same output.
- **Non-fatal** — never block a push. If a guide fails to generate, warn and continue.

## Phase 1 — Bootstrap check

1. Read config (`docs-sync/config.json`). If missing, tell the operator to `cp docs-sync/config.example.json docs-sync/config.json` and stop.
2. Check if `docs/guides/` exists and contains any `.md` files.
3. **Run bootstrap (Phase 2b) if any of these are true:**
   - `--bootstrap` flag is passed
   - `docs/guides/` is empty or does not exist
   - `docs/OVERVIEW.md` does not exist
4. Otherwise run incremental update (Phase 2a).

## Phase 2a — Incremental feature guide update

Runs on every push when guides already exist.

1. **Infer affected feature(s):** Read the git diff summary and commit message (`git log -1 --pretty=%B` + `git diff --stat HEAD~1..HEAD`). Identify which user-facing feature(s) the change belongs to.

2. **Skip entirely** if the commit message prefix is one of: `docs:`, `chore:`, `style:`, `test:`, `ci:` — these don't affect product behavior.

3. **For each affected feature:**

   **a. Existing guide** (`docs/guides/<feature>.md` exists):
   - Read the current guide
   - Rewrite only the sections affected by this change
   - Keep unchanged sections verbatim
   - Update the `> last updated YYYY-MM-DD` byline to today's date

   **b. New feature** (no guide exists):
   - Read the relevant changed files to understand the feature end-to-end
   - Create `docs/guides/<feature>.md` (see format below)
   - Use a clear user-facing name: `password-reset.md`, not `auth-reset-handler.md`

4. **Feature guide format** (enforced for every write):

```markdown
# <Feature Name>
> last updated <YYYY-MM-DD>

<One paragraph: what this feature does and the problem it solves for the user.>

## How it works
<Step-by-step narrative from the user's perspective.
No file names. No function names. No technical terms.
Write as if explaining to a customer support agent.>

## Edge cases & gotchas
<Non-obvious behavior the support team should know about.
Omit this section entirely if there is nothing notable.>
```

## Phase 2b — Bootstrap (first run)

Runs when `--bootstrap` is passed or `docs/guides/` is empty.

1. Read the project structure: `package.json` (or `requirements.txt`), entry files, top-level directories.
2. Identify user-facing features — not technical modules. Think in terms of what a user does: "Login", "Checkout", "Password Reset", "User Profile", "Notifications".
3. For each feature: read the relevant source files to understand the flow end-to-end.
4. Write `docs/guides/<feature>.md` for each feature using the format in Phase 2a.
5. After all guides are written, continue to Phase 3.

## Phase 3 — OVERVIEW.md

Generate or regenerate `docs/OVERVIEW.md` — a plain-language system overview.

**Regenerate only if any of these are true:**
- `docs/OVERVIEW.md` does not exist
- `package.json`, `pyproject.toml`, or `requirements.txt` changed in the diff
- A new top-level directory appeared in the diff
- A new `docs/guides/*.md` was created in this run (new feature = structural change)
- `--bootstrap` was passed

**Otherwise skip** — do not regenerate on routine pushes.

**Content of OVERVIEW.md:**

```markdown
# System Overview
> last updated <YYYY-MM-DD>

## What this product does
<One paragraph: purpose, who uses it, the problem it solves. No technical terms.>

## Main components
| Component | What it does |
|-----------|-------------|
| <Name> | <Plain-language description for a product owner> |

(List conceptual components — "Authentication", "Checkout", "Notifications" — not files or modules. Max 10 rows.)

## How data flows
<2-4 sentences: how a user action moves through the system to produce a result.
Written for a product owner. No technical terms.>

## Tech stack
| Layer | Technology |
|-------|-----------|
| <layer> | <technology> |

(Read from package.json or requirements.txt. Use layer names: Frontend, Backend, Database, etc. Omit section if neither file exists.)
```

## Phase 4 — WHATS-NEW.md

Append one plain-language entry to `docs/WHATS-NEW.md`.

**Trigger:** Runs on every push, same as Phase 2a. Skip if the commit is `docs:`, `chore:`, `style:`, `test:`, or `ci:`.

**Format:**

```markdown
## <Month YYYY>
- <What changed for the user — one line per change, plain language>
- Fixed: <what was broken and how it works now>
```

**Rules:**
- No code references — no file names, no function names
- "Checkout now supports PayPal", not "Added PayPal handler to PaymentSelector.jsx"
- Append only — never rewrite existing entries
- Dedupe: if the latest entry already covers these same changes, skip
- Create the file with this header if it does not exist:

```markdown
# What's New

```

## Phase 5 — mint.json sync

Regenerate `docs/mint.json` **only** if any guide was added, renamed, or deleted in this run. Skip if only existing guides were modified.

**Also run on `--bootstrap`** (first time).

**Skip if** `config.mintlify.enabled` is `false` or not set.

```bash
node scripts/generate-mint-json.mjs --config <config>
```

This writes `docs/mint.json` with the current navigation structure. Idempotent.

## Phase 6 — Deliver

**Pre-push hook (`--no-prompt`):** all generated files are already on disk — the hook's `git add docs/` and `git commit --amend --no-edit` picks them up alongside the code-level docs from `/update-docs`.

**Interactive:** print a summary:
- Feature guides updated: N
- Feature guides created: N
- OVERVIEW.md: regenerated | skipped
- WHATS-NEW.md: entry appended | skipped
- mint.json: regenerated | skipped

## Failure modes — fail loud, never block

- Guide generation fails for a feature → warn, skip that guide, continue
- OVERVIEW.md generation fails → warn, skip, continue
- WHATS-NEW.md write fails → warn, skip, continue
- mint.json generation fails → warn, skip, continue
- Config missing → stop and tell the operator
