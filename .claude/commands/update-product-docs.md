---
description: Generate and maintain product-level documentation — feature guides, system overview, and what's new — for customer support, product owners, and new team members. Publishes via docs/guides/, docs/OVERVIEW.md, docs/WHATS-NEW.md, and Docsify deployment files (index.html, README.md, _sidebar.md).
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
3. **If `docs/` exists and contains files, and `--bootstrap` was NOT passed, and NOT `--no-prompt`:**
   - Ask the operator: "A `docs/` folder already exists. Do you have existing documentation you want to preserve? (yes/no)"
   - If **yes**: run incremental update (Phase 2a) — do not overwrite existing guides.
   - If **no**: run bootstrap (Phase 2b) — regenerate everything from scratch.
4. **Run bootstrap (Phase 2b) automatically (no prompt) if any of these are true:**
   - `--bootstrap` flag is passed
   - `docs/guides/` is empty or does not exist
   - `docs/OVERVIEW.md` does not exist
   - `--no-prompt` is passed and `docs/guides/` is empty
5. **Run incremental update (Phase 2a) automatically (no prompt) if:**
   - `--no-prompt` is passed and `docs/guides/` already has `.md` files

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

## Phase 5 — mint.json

Always generate or update `docs/mint.json` — this is what Mintlify reads to build the site.

**Full regeneration when any of these are true:**
- `docs/mint.json` does not exist
- `--bootstrap` was passed
- A guide was added, renamed, or deleted in this run

**Partial update (navigation only) otherwise** — rebuild the `navigation` array from the current `docs/guides/` contents, keep all other `mint.json` fields (colors, name, etc.) unchanged.

**Generate by scanning `docs/` structure:**

```json
{
  "name": "<project_name from config.mintlify.project_name, or directory name>",
  "navigation": [
    {
      "group": "What's New",
      "pages": ["WHATS-NEW"]
    },
    {
      "group": "Product Guides",
      "pages": ["guides/<feature1>", "guides/<feature2>", ...]
    },
    {
      "group": "System Overview",
      "pages": ["OVERVIEW"]
    }
  ],
  "colors": {
    "primary": "#0D9373"
  }
}
```

**Rules:**
- Only include pages that actually exist in `docs/`
- Omit "What's New" group if `docs/WHATS-NEW.md` does not exist
- Omit "Product Guides" group if `docs/guides/` is empty
- Omit "System Overview" group if `docs/OVERVIEW.md` does not exist
- Page paths are relative to `docs/` and have no `.md` extension: `"guides/checkout"` not `"guides/checkout.md"`
- Never include code-level docs (`src/`, `backend.md`, `frontend.md`, `ARCHITECTURE.md`, `CHANGELOG.md`) in navigation

**If `scripts/generate-mint-json.mjs` exists**, use it:
```bash
node scripts/generate-mint-json.mjs --config <config>
```

**Otherwise**, write `docs/mint.json` directly from the scan above.

## Phase 5b — Docsify deployment files

Generate the three files needed to serve docs via Docsify on Netlify (or any static host). These work for **any git host** — GitHub, GitLab, or Bitbucket.

**Always generate or update these files** — they are idempotent and safe to regenerate on every run.

### `docs/index.html`

Write exactly this file (replace `<project_name>` with the project directory name or `config.mintlify.project_name` if set):

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title><project_name> Docs</title>
    <link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify-themeable@0/dist/css/theme-simple.css">
  </head>
  <body>
    <div id="app"></div>
    <script>
      window.$docsify = {
        name: '<project_name>',
        loadSidebar: true,
        subMaxLevel: 2,
        search: 'auto'
      }
    </script>
    <script src="//cdn.jsdelivr.net/npm/docsify/lib/docsify.min.js"></script>
    <script src="//cdn.jsdelivr.net/npm/docsify/lib/plugins/search.min.js"></script>
  </body>
</html>
```

### `docs/README.md`

Write only if `docs/README.md` does not already exist:

```markdown
# Welcome

Select a topic from the sidebar to get started.
```

### `docs/_sidebar.md`

Always regenerate from the current `docs/` structure:

```markdown
- [What's New](WHATS-NEW.md)
- [Overview](OVERVIEW.md)
- **Guides**
  - [<Feature Name>](guides/<feature>.md)
  - ... (one line per guide file in docs/guides/)
```

**Rules:**
- Omit "What's New" line if `docs/WHATS-NEW.md` does not exist
- Omit "Overview" line if `docs/OVERVIEW.md` does not exist
- Omit "Guides" section if `docs/guides/` is empty
- Feature name in the sidebar link is the guide's `# Title` heading, not the filename
- Never include code-level docs (ARCHITECTURE.md, CHANGELOG.md) in the sidebar

**Netlify deployment instructions** — print once after generating these files (interactive mode only):

```
Netlify deployment (works with GitHub, GitLab, and Bitbucket):
1. Go to netlify.com → Add new site → Import an existing project
2. Connect your git provider and select this repo
3. Set Publish directory: docs
4. Leave Build command empty
5. Click Deploy
```

## Phase 6 — Deliver

**Pre-push hook (`--no-prompt`):** all generated files are already on disk — the hook's `git add docs/` and `git commit --amend --no-edit` picks them up alongside the code-level docs from `/update-docs`.

**Interactive:** print a summary:
- Feature guides updated: N
- Feature guides created: N
- OVERVIEW.md: regenerated | skipped
- WHATS-NEW.md: entry appended | skipped
- mint.json: regenerated | skipped
- index.html: written | skipped
- _sidebar.md: regenerated | skipped
- README.md: written | already existed

## Failure modes — fail loud, never block

- Guide generation fails for a feature → warn, skip that guide, continue
- OVERVIEW.md generation fails → warn, skip, continue
- WHATS-NEW.md write fails → warn, skip, continue
- mint.json generation fails → warn, skip, continue
- index.html / _sidebar.md / README.md write fails → warn, skip, continue
- Config missing → stop and tell the operator
