# Design: eSketchers Docs Platform

**Status:** Approved

## Problem

eSketchers projects have fragmented documentation — scattered across Google Docs, repo MD files, or missing entirely. There is no consistent structure, no automated maintenance, and no single place where devs, Claude, or customer support/product owners can go to understand how a product works.

## Goal

A fully automated docs platform for every eSketchers project:
- **Ingest** existing docs from wherever they live (Google Docs, project MD files)
- **Generate** what's missing from the codebase
- **Maintain** all docs incrementally on every push (AI-driven, zero developer overhead)
- **Publish** to Mintlify so every audience has a clean, searchable site

## Audiences

| Audience | What they need | Where they access it |
|----------|---------------|----------------------|
| Customer support / product owners | Feature guides, What's New | Mintlify |
| New devs onboarding | System overview, feature guides | Mintlify |
| Devs day-to-day | ARCHITECTURE.md, CHANGELOG.md, per-file code docs | Repo (`docs/`) |
| Claude | ARCHITECTURE.md, per-file code docs, CLAUDE.md | Repo (`docs/`) |

## Doc Types

### Published to Mintlify

| File | Audience | Content |
|------|----------|---------|
| `docs/guides/<feature>.md` | Everyone | Feature-level narrative — no code references, plain language |
| `docs/OVERVIEW.md` | Everyone | System overview — conceptual components, data flow, tech stack. No file paths. |
| `docs/WHATS-NEW.md` | Everyone | Plain-language changelog — "what changed for the user" |

### Repo only (devs + Claude)

| File | Content |
|------|---------|
| `docs/ARCHITECTURE.md` | Technical overview — module map with file paths, entry points |
| `docs/CHANGELOG.md` | Technical append-only changelog (Keep-a-Changelog format) |
| `docs/src/<mirrored-path>.md` | Per-file code docs — exports, dependencies, prose |
| `docs/frontend.md`, `docs/backend.md` | Navigation indexes for per-file docs |

### Never on Mintlify
Per-file code docs (`docs/src/**`) and technical CHANGELOG stay in the repo only.

---

## Sub-Project 1: Ingestion

Runs once per project during adoption or first interactive `/update-docs` run.

### Source Detection

Scan in order:
1. **MD files in the project** — find all `.md` files outside `node_modules/`, `vendor/`, `.git/`, `docs/` (avoid double-importing what's already there)
2. **Google Docs** — check `external_docs.urls` array in config; export each as Markdown
3. **Code** — fallback if no external docs found

### Google Docs Export

Config supports an array of URLs:
```json
"external_docs": {
  "provider": "google-docs",
  "urls": [
    "https://docs.google.com/document/d/ABC/edit",
    "https://docs.google.com/document/d/XYZ/edit"
  ],
  "prompted": true
}
```

Export method: `https://docs.google.com/document/d/<ID>/export?format=md`
- Works for any doc shared as "anyone with link can view" — no API key needed
- Private docs: prompt user to share the link or export manually to a file
- Each doc is saved to `docs/guides/<doc-title>.md` using the document title as filename

### Consolidation

- Project MD files → copied into `docs/` preserving relative structure
- Google Docs exports → written to `docs/guides/`
- Deduplication: never overwrite files that already exist in `docs/`
- Existing content is treated as authoritative — not overwritten

### Completeness Check

After consolidation, prompt interactively:
```
Sources found:
  - README.md, docs/api.md (project MD files)
  - "Product Overview" (Google Docs export)

Are these docs complete enough to publish? [y/N]
```

- **Yes** → skip to Mintlify setup
- **No** → run gap filling (Sub-Project 2)

Skipped entirely in `--no-prompt` / CI mode — always runs gap filling.

---

## Sub-Project 2: Feature Guide Generation

### Bootstrap (first run — no guides exist)

1. AI scans the project: reads `package.json`, entry files, top-level directory structure
2. Identifies user-facing features (not technical modules) — e.g., "Checkout", "Authentication", "User Profile"
3. Reads the relevant code to understand each feature end-to-end
4. Generates `docs/guides/<feature>.md` for each identified feature

### Feature Guide Format

```markdown
# <Feature Name>
> last updated YYYY-MM-DD

One paragraph: what this feature does and the problem it solves for the user.

## How it works
Step-by-step narrative from the user's perspective.
No file names, no function names, no technical terms.

## Edge cases & gotchas
Non-obvious behavior the support team should know about.
(Omit section if nothing notable.)
```

**Rules:**
- No code references — no file paths, no function names, no technical terms
- Written for a customer support agent or product owner, not a developer
- AI reads code to *understand*, but output is a plain-language narrative
- One file per feature — `docs/guides/checkout.md`, `docs/guides/auth.md`

### Incremental Maintenance (every push)

On every push, the pre-push pipeline:
1. Reads the diff + commit message
2. AI infers which feature(s) are affected — no developer tagging required
3. Updates only the affected feature guide(s)
4. Unchanged features are never touched (zero LLM cost)

If the diff introduces a genuinely new feature (AI judges this from the commit), a new guide is created and `mint.json` is updated.

---

## Sub-Project 3: Mintlify Delivery

### How Mintlify Works

Mintlify connects to a GitHub repo via their GitHub app. You configure:
- **Branch:** `master`
- **Docs folder:** `docs/`

On every push to that branch, Mintlify auto-redeploys. No separate push, no CI step needed. The pre-push hook writes docs → amends HEAD → push → Mintlify picks it up automatically.

### mint.json

Auto-generated and kept in sync by the pipeline. Stored at `docs/mint.json`.

```json
{
  "name": "<Project Name>",
  "navigation": [
    {
      "group": "What's New",
      "pages": ["WHATS-NEW"]
    },
    {
      "group": "Product Guides",
      "pages": ["guides/checkout", "guides/authentication", "guides/user-management"]
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

**Regeneration trigger:** Only when guides are added, renamed, or deleted (`A`/`R`/`D` entries). Routine modifications (`M`) do not touch `mint.json`.

### OVERVIEW.md

Conceptual system overview — no file paths. Generated once on bootstrap, regenerated only when: `package.json` changes, a new top-level directory is added, or a new `docs/guides/*.md` is created (indicating a new feature exists).

```markdown
# System Overview
> last updated YYYY-MM-DD

## What this product does
One paragraph — purpose, users, problem solved.

## Main components
| Component | What it does |
|-----------|-------------|
| Authentication | Handles user login, registration, and password reset |
| Checkout | Manages cart, payment processing, and order creation |

## How data flows
Narrative: how a user action moves through the system to produce a result.
2-4 sentences, no technical terms.

## Tech stack
| Layer | Technology |
|-------|-----------|
| Frontend | React |
| Backend | Node.js |
| Database | PostgreSQL |
```

### WHATS-NEW.md

Plain-language product changelog. Appended on every push.

```markdown
## August 2026
- Checkout now supports PayPal and Stripe
- Password reset emails are delivered instantly
- Fixed: cart items were lost after session timeout — now preserved for 24 hours

## July 2026
- Users can now update their profile photo
```

Generated from the same diff + commit message as the technical CHANGELOG.md, but written for a non-technical audience. Both are updated on every push.

---

## Pipeline Changes

### `adopt.sh`
- New `--ingest` flag triggers Sub-Project 1 (ingestion) interactively
- Adds `external_docs.urls` array support to config generation
- Runs Mintlify setup at the end: generates `docs/mint.json`, prints Mintlify connection instructions

### `/update-docs` command
New phases added after existing phases:

- **Phase 3d — Feature guides:** AI reads diff + commit message, updates affected `docs/guides/*.md`
- **Phase 3e — OVERVIEW.md:** Regenerate if project structure changed significantly
- **Phase 5b — WHATS-NEW.md:** Append plain-language entry (alongside existing technical CHANGELOG)
- **Phase 3f — mint.json:** Regenerate if guides were added/removed/renamed

### `docs-sync/config.example.json`
```json
"external_docs": {
  "provider": "google-docs",
  "urls": [],
  "prompted": false
},
"mintlify": {
  "enabled": false,
  "project_name": null
}
```

---

## Onboarding Flow

### New project (no docs anywhere)
```
adopt.sh --detect
  → detects framework
  → creates docs-sync/config.json
  → runs /update-docs interactively
      → Phase 0: no docs found → asks about external docs
      → user provides Google Docs URLs (or none)
      → bootstrap: generates OVERVIEW.md + feature guides from code
      → generates mint.json
      → prints: "Connect this repo to Mintlify at mintlify.com → docs folder: docs/"
```

### Existing project (has Google Docs / MD files)
```
adopt.sh --detect --ingest
  → scans for MD files
  → exports Google Docs
  → consolidates into docs/
  → asks: "Are docs complete?"
      → No → gap fill from code
  → generates OVERVIEW.md, WHATS-NEW.md, mint.json
  → prints Mintlify connection instructions
```

### Every push (maintenance)
```
pre-push hook
  → collect-doc-changes.mjs (what changed)
  → /update-docs --no-prompt
      → per-file code docs (devs/Claude)
      → feature guide update (Mintlify)
      → CHANGELOG.md entry (technical)
      → WHATS-NEW.md entry (plain language)
      → mint.json sync if structure changed
  → amend HEAD with all doc changes
  → push → Mintlify auto-redeploys
```

---

## Error Handling

- Google Docs export fails (private doc) → warn, skip that doc, continue
- Mintlify not connected → docs still generated in `docs/`, warn at end
- Feature guide generation fails → log warning, skip that guide, never block push
- All errors non-fatal — docs pipeline never blocks a push

---

## Out of Scope

- Syncing FROM Mintlify back to the repo
- Importing from Notion, Confluence, or other providers (future)
- Real-time Mintlify preview during development
- User authentication / access control on the Mintlify site (handled by Mintlify settings)
