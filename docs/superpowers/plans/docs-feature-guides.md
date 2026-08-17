# Docs Feature Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add incremental feature guide updates (Phase 3d) and OVERVIEW.md generation (Phase 3e) to the `/update-docs` command so every push keeps product-level docs current.

**Architecture:** A new standalone command `.claude/commands/update-product-docs.md` handles all product-level doc generation. The existing `/update-docs` command is unchanged — it stays focused on code-level docs. The pre-push hook calls both commands. No new Node scripts are needed for this plan.

**Tech Stack:** Markdown command spec (`.claude/commands/update-docs.md`), no Node scripts.

## Global Constraints

- Feature guides must contain **zero code references** — no file paths, function names, or technical terms
- Written for customer support agents and product owners, not developers
- Incremental: only update the guide(s) affected by the current push — never regenerate all guides
- OVERVIEW.md regenerates only when: `package.json` changes, a new top-level directory is added, or a new `docs/guides/*.md` is created
- All phases are non-fatal — never block a push

**Prerequisite:** docs-ingestion plan must be complete (Phase 0b gap fill is defined there).

---

## File Map

| File | Change |
|------|--------|
| `.claude/commands/update-docs.md` | Add Phase 3d (feature guides) and Phase 3e (OVERVIEW.md) |

---

## Task 1: Add Phase 3d — Incremental feature guide update

**Files:**
- Modify: `.claude/commands/update-docs.md`

**What it does:** After per-file code docs (Phase 3), the LLM reads the diff + commit message, decides which feature guide to update, and rewrites only that guide's prose. New features get a new guide file created.

- [ ] **Step 1: Read the current update-docs.md**

```bash
cat .claude/commands/update-docs.md
```

Note the line where Phase 3c ends and Phase 4 begins — Phase 3d goes between them.

- [ ] **Step 2: Add Phase 3d after Phase 3c**

Insert the following section between Phase 3c and Phase 4 in `.claude/commands/update-docs.md`:

```markdown
## Phase 3d — Feature guide update

Update `docs/guides/*.md` based on what changed in this push.

1. **Infer affected feature(s):** Read the commit message and diff summary. Identify which user-facing feature this change belongs to (e.g., "checkout", "authentication", "user profile"). A single push may affect more than one feature.

2. **For each affected feature:**

   a. **Existing guide found** (`docs/guides/<feature>.md` exists):
      - Read the existing guide
      - Rewrite only the sections that are affected by this change
      - Keep unchanged sections verbatim
      - Update the `> last updated YYYY-MM-DD` byline

   b. **No guide found** (new feature):
      - Read the relevant changed files to understand the feature end-to-end
      - Create `docs/guides/<feature>.md` using the format below
      - Use a clear, user-facing name for the filename (e.g., `password-reset.md`, not `auth-reset-handler.md`)

3. **Feature guide format** (enforced for every write):

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

4. **Rules — non-negotiable:**
   - No code references in output — no file paths, no function names, no import statements
   - Do not read or mention internal implementation details
   - If the diff is too small to determine the feature (e.g., a typo fix), skip Phase 3d entirely
   - Idempotent: re-running on the same diff must produce the same guide content

5. **Skip Phase 3d entirely** if the commit message contains only: `docs:`, `chore:`, `style:`, `test:` prefixes with no feature changes.
```

- [ ] **Step 3: Verify the file looks correct**

```bash
grep -n "Phase 3d\|Phase 3e\|Phase 4" .claude/commands/update-docs.md
```

Expected: Phase 3d appears before Phase 4, no Phase 3e yet.

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/update-docs.md
git commit -m "feat(docs): add Phase 3d — incremental feature guide update"
```

---

## Task 2: Add Phase 3e — OVERVIEW.md generation

**Files:**
- Modify: `.claude/commands/update-docs.md`

**What it does:** Generates or regenerates `docs/OVERVIEW.md` — a plain-language system overview for Mintlify. No file paths. Regenerates only on structural changes.

- [ ] **Step 1: Add Phase 3e after Phase 3d**

Insert between Phase 3d and Phase 4:

```markdown
## Phase 3e — OVERVIEW.md

Generate or regenerate `docs/OVERVIEW.md` — a conceptual system overview without code references.

**Regenerate only if any of these are true:**
- `docs/OVERVIEW.md` does not exist
- `package.json`, `pyproject.toml`, or `requirements.txt` appears in the diff
- A new top-level directory appears in the diff
- A new `docs/guides/*.md` was created in this run (new feature = structural change)

**Otherwise skip** — do not regenerate on routine pushes.

**Content of OVERVIEW.md:**

```markdown
# System Overview
> last updated <YYYY-MM-DD>

## What this product does
<One paragraph: purpose, who uses it, problem it solves. No technical terms.>

## Main components
| Component | What it does |
|-----------|-------------|
| <Name> | <Plain-language description of what this component does for the user> |

(List conceptual components — "Authentication", "Checkout", "Notifications" — not files or modules.
Max 10 rows.)

## How data flows
<2-4 sentences: how a user action moves through the system to produce a result.
Written for a product owner, not a developer. No technical terms.>

## Tech stack
| Layer | Technology |
|-------|-----------|
| <layer> | <technology> |

(Read from package.json or requirements.txt. Layer names: Frontend, Backend, Database, etc.)
```

**Rules:**
- No file paths, no module names, no function names
- "Main components" uses product-level names, not code-level names
- If the project has no `package.json` or `requirements.txt`, omit the Tech stack section
```

- [ ] **Step 2: Verify ordering**

```bash
grep -n "Phase 3d\|Phase 3e\|Phase 4" .claude/commands/update-docs.md
```

Expected: Phase 3d, Phase 3e, Phase 4 in that order.

- [ ] **Step 3: Update Phase 6 deliver summary to include new phases**

Find the Phase 6 interactive summary and add:

```markdown
- Feature guides updated: N (or "skipped — no feature changes detected")
- OVERVIEW.md: regenerated | skipped
```

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/update-docs.md
git commit -m "feat(docs): add Phase 3e — OVERVIEW.md generation"
```

---

## Task 3: Push

- [ ] **Step 1: Verify the command file is coherent**

```bash
grep -n "^## Phase" .claude/commands/update-docs.md
```

Expected output (in order):
```
Phase 0 — Bootstrap
Phase 0b — Gap fill
Phase 1 — Classify
Phase 2 — Plan
Phase 3 — Per-file doc generation
Phase 3b — ARCHITECTURE.md
Phase 3c — Update index files
Phase 3d — Feature guide update
Phase 3e — OVERVIEW.md
Phase 4 — Narration
Phase 5 — Changelog
Phase 6 — Deliver
```

- [ ] **Step 2: Run full test suite (Node scripts unchanged, verify no regressions)**

```bash
node --test tests/scripts/collect-doc-changes.test.mjs tests/scripts/extract-symbols.test.mjs tests/scripts/ingest-docs.test.mjs 2>&1 | tail -8
```

Expected: all PASS

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-Review Against Spec

| Spec requirement | Task |
|-----------------|------|
| AI infers affected feature from diff + commit message | Task 1 Phase 3d step 1 |
| No code references in feature guides | Task 1 Phase 3d rules |
| Feature guide format: title, byline, prose, How it works, Edge cases | Task 1 Phase 3d format |
| New feature → new guide created | Task 1 Phase 3d step 2b |
| Incremental: only update affected guides | Task 1 Phase 3d step 2a |
| OVERVIEW.md: conceptual, no file paths | Task 2 Phase 3e format |
| OVERVIEW.md: regenerate only on structural changes | Task 2 Phase 3e trigger |
| OVERVIEW.md: Main components table (conceptual) | Task 2 Phase 3e format |
| OVERVIEW.md: Data flow narrative | Task 2 Phase 3e format |
| Skip 3d on docs/chore/style/test commits | Task 1 Phase 3d step 5 |
