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

---

## Step 1 — Check existing docs

1. Read config (`docs-sync/config.json`). If missing, tell the operator to `cp docs-sync/config.example.json docs-sync/config.json` and stop.
2. Check if `docs/guides/` exists and contains any `.md` files.
3. **If `docs/` exists and has content, and `--bootstrap` was NOT passed, and NOT `--no-prompt`:**
   - Ask the operator: "A `docs/` folder already exists. Do you want to preserve the existing docs and do an incremental update, or regenerate everything from scratch? (preserve/regenerate)"
   - **preserve** → run incremental update (Step 2, incremental mode)
   - **regenerate** → run full bootstrap (Step 2, bootstrap mode)
4. **Run bootstrap automatically (no prompt) if any of these are true:**
   - `--bootstrap` flag is passed
   - `docs/guides/` is empty or does not exist
   - `docs/OVERVIEW.md` does not exist
5. **Run incremental automatically (no prompt) if:**
   - `--no-prompt` is passed and `docs/guides/` already has `.md` files

### 1b — Collect external doc links (interactive mode only)

Skip this section entirely if `--no-prompt` is passed — use `config.external_docs.urls` directly.

**Check config for existing links:**
- Read `external_docs.urls` from `docs-sync/config.json`
- If the array is empty or missing, ask the operator:

  > "Do you have any external docs to include? Paste a comma-separated list of URLs (Google Docs, Notion, Confluence, etc.) or press Enter to skip:"

- If the operator provides URLs:
  - Parse the comma-separated list, trim whitespace from each URL
  - Save them back to `docs-sync/config.json` under `external_docs.urls` — so future runs skip this prompt
  - Print: "Saved N link(s) to docs-sync/config.json. You won't be asked again unless you clear them."

- If URLs already exist in config, ask:

  > "Found N external doc link(s) in config. Use these, replace them, or skip? (use/replace/skip)"
  - **use** → proceed with existing URLs
  - **replace** → ask for a new comma-separated list, overwrite `external_docs.urls` in config
  - **skip** → ignore external docs for this run only

**In `--no-prompt` mode:** read `external_docs.urls` from config silently and proceed.

**After collecting URLs:** fetch each URL's content and incorporate it into Step 2 as additional context when generating or updating feature guides. Treat the external doc content as product-level input — do not copy it verbatim, use it to understand what the feature does from a business perspective.

---

## Step 2 — Prepare the docs

### 2a — Understand the project structure

Before writing any docs, map the project:

1. **Identify all frontends and backends:**
   - Look for multiple `package.json`, `requirements.txt`, `pyproject.toml`, or `Dockerfile` files across subdirectories
   - Common patterns: `frontend/`, `backend/`, `api/`, `web/`, `mobile/`, `admin/`, `client/`, `server/`
   - Each distinct app is a separate component — note its name and purpose

2. **Identify how components connect:**
   - Look for API base URLs, environment variables, proxy configs, or service references that link one component to another
   - Write a plain-language connection map: "The mobile app talks to the API server. The admin panel also uses the same API. The API server stores data in the database."

3. **Identify user-facing features per component:**
   - Think in terms of what a user does, not what the code does
   - Examples: "Login", "Checkout", "Password Reset", "Push Notifications", "Admin Dashboard"
   - Group features by which component(s) they touch

### 2b — Generate or update guides

**Incremental mode** (existing docs preserved):
1. Read the git diff summary and commit message (`git log -1 --pretty=%B` + `git diff --stat HEAD~1..HEAD`)
2. Skip entirely if the commit prefix is `docs:`, `chore:`, `style:`, `test:`, or `ci:`
3. Identify which feature(s) the change affects
4. For each affected feature:
   - **Existing guide** → rewrite only the changed sections, keep the rest verbatim, update the `> last updated YYYY-MM-DD` byline
   - **New feature** → create `docs/guides/<feature>.md` using the format below

**Bootstrap mode** (full generation):
1. For each user-facing feature identified in Step 2a: read the relevant source files end-to-end
2. Write `docs/guides/<feature>.md` for each feature using the format below
3. Use clear user-facing names: `password-reset.md`, not `auth-reset-handler.md`

**Feature guide format** (enforced for every write):

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

**Generate or regenerate `docs/OVERVIEW.md`:**

Regenerate if: does not exist, `--bootstrap` passed, `package.json`/`pyproject.toml`/`requirements.txt` changed, new top-level directory appeared, or a new guide was created in this run. Otherwise skip.

```markdown
# System Overview
> last updated <YYYY-MM-DD>

## What this product does
<One paragraph: purpose, who uses it, the problem it solves. No technical terms.>

## Components and how they connect
| Component | What it does | Who uses it |
|-----------|-------------|-------------|
| <Name> | <Plain-language description> | <Users / Admins / Mobile app / etc.> |

<2-4 sentences describing how the components talk to each other, from a product owner's perspective.>

## How data flows
<2-4 sentences: how a user action moves through the system to produce a result. No technical terms.>

## Tech stack
| Layer | Technology |
|-------|-----------|
| <layer> | <technology> |
```

**Append to `docs/WHATS-NEW.md`:**

Skip if commit prefix is `docs:`, `chore:`, `style:`, `test:`, or `ci:`. Dedupe if the latest entry already covers these changes. Create the file with a `# What's New` header if it does not exist.

```markdown
## <Month YYYY>
- <What changed for the user — one line per change, plain language>
- Fixed: <what was broken and how it works now>
```

---

## Step 3 — Verify active feature coverage

After all guides are written or updated, verify completeness and relevance:

1. **Identify active features:**
   - Scan routes, endpoints, nav menus, and entry points across all components
   - A feature is **active** if it has live routes/endpoints and is reachable by a user
   - A feature is **inactive** if: it is behind a disabled feature flag, all its routes are commented out, it has no UI entry point, or it is clearly marked as deprecated/WIP in the code

2. **For each active feature:** confirm a guide exists in `docs/guides/`. If a guide is missing, create it now (Step 2 format).

3. **For each inactive feature:** if a guide exists for it, add a notice at the top of the guide:
   ```markdown
   > **Note:** This feature is currently inactive and not available to users.
   ```
   Do not delete the guide — it may become active again.

4. **Skip features that are:** internal admin tools not visible to end users, developer-only endpoints, health check or monitoring routes.

---

## Step 4 — Remove duplications

After all guides are finalized, scan for overlapping content:

1. **Read all guides in `docs/guides/`**

2. **Identify duplications:**
   - Two guides that describe the same feature under different names → merge into one, delete the other, update `_sidebar.md`
   - A section in one guide that repeats content from another → remove the duplicate section and add a one-line cross-reference: "For details on X, see the [Feature Name] guide."
   - An OVERVIEW.md section that copies a guide verbatim → replace with a one-sentence summary and a link to the guide

3. **Do not merge guides that describe related but distinct features** — only merge when they cover the exact same user-facing capability.

4. **After merging:** update `docs/_sidebar.md` to reflect any removed or renamed guides.

---

## Phase 5 — mint.json

Always generate or update `docs/mint.json`.

**Full regeneration when any of these are true:**
- `docs/mint.json` does not exist
- `--bootstrap` was passed
- A guide was added, renamed, or deleted in this run

**Partial update (navigation only) otherwise.**

```json
{
  "name": "<project_name from config or directory name>",
  "navigation": [
    { "group": "What's New", "pages": ["WHATS-NEW"] },
    { "group": "Product Guides", "pages": ["guides/<feature1>", "guides/<feature2>"] },
    { "group": "System Overview", "pages": ["OVERVIEW"] }
  ],
  "colors": { "primary": "#0D9373" }
}
```

Rules: only include pages that exist, omit empty groups, no `.md` extension in paths, never include ARCHITECTURE.md or CHANGELOG.md.

---

## Phase 5b — Docsify deployment files

Generate three files for Netlify/static hosting. Works for GitHub, GitLab, and Bitbucket.

### `docs/index.html`

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

Write only if it does not already exist:

```markdown
# Welcome

Select a topic from the sidebar to get started.
```

### `docs/_sidebar.md`

Always regenerate from current `docs/` structure:

```markdown
- [What's New](WHATS-NEW.md)
- [Overview](OVERVIEW.md)
- **Guides**
  - [<Feature Name>](guides/<feature>.md)
```

Rules: omit sections for files that don't exist, use the guide's `# Title` heading not the filename, never include ARCHITECTURE.md or CHANGELOG.md.

**Print once in interactive mode after generating:**

```
Netlify deployment (works with GitHub, GitLab, and Bitbucket):
1. Go to netlify.com → Add new site → Import an existing project
2. Connect your git provider and select this repo
3. Set Publish directory: docs
4. Leave Build command empty
5. Click Deploy
```

---

## Phase 6 — Deliver

**Pre-push hook (`--no-prompt`):** all generated files are already on disk — the hook's `git add docs/` and `git commit --amend --no-edit` picks them up.

**Interactive:** print a summary:
- Feature guides updated: N
- Feature guides created: N
- Inactive features flagged: N
- Duplicate sections removed: N
- OVERVIEW.md: regenerated | skipped
- WHATS-NEW.md: entry appended | skipped
- mint.json: regenerated | skipped
- index.html: written | skipped
- _sidebar.md: regenerated | skipped
- README.md: written | already existed

---

## Failure modes — fail loud, never block

- Guide generation fails for a feature → warn, skip that guide, continue
- OVERVIEW.md generation fails → warn, skip, continue
- WHATS-NEW.md write fails → warn, skip, continue
- mint.json generation fails → warn, skip, continue
- index.html / _sidebar.md / README.md write fails → warn, skip, continue
- Step 3 verification fails → warn, skip, continue
- Step 4 deduplication fails → warn, skip, continue
- Config missing → stop and tell the operator
