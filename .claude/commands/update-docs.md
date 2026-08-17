---
description: On merge to a configured branch, regenerate the affected docs (backend / schema / frontend inventories, a module+function reference, and a changelog entry) and open a draft PR. Deterministic classifier + incremental LLM narration.
argument-hint: [--report-only] [--range A..B] [--base <ref>] [--head <ref>] [--config <path>] [--no-prompt]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# /update-docs

You keep an in-repo `docs/` folder current so humans and Claude can understand the project.
Each run: diff the merge, regenerate the affected doc sections, and (unless report-only) leave a
**draft PR**. You never write to protected branches — the PR review is the gate.

Arguments: `$ARGUMENTS`
- `--report-only` — classify + plan the doc edits and print them, but **write nothing**.
- `--range A..B` / `--base` / `--head` — the merge range (default `HEAD~1..HEAD`).
- `--config <path>` — config file (default `docs-sync/config.json`).
- `--no-prompt` — never ask the operator anything (headless/CI). The wrapper `scripts/update-docs.sh` always passes this.

## Guardrails (non-negotiable)

- **Only edit files under `docs.output_dir`** (default `docs/`). Never touch source code.
- **Never invent** an API/table/route/component/symbol that isn't in the change-report or symbols-report.
- **`CHANGELOG.md` is append-only** — add one dated entry, never rewrite history.
- **Idempotent** — re-running on the same range must produce zero `git diff` under `docs/`.
- Respect the config `enabled` gate and the `branches` list.

## Phase 0 — Bootstrap (first run: are the docs elsewhere?)

Runs only in **interactive** mode (skip entirely if `--no-prompt` is set — CI/headless never asks).

1. Decide if the project already has in-repo docs: check whether `docs.output_dir` (default `docs/`) exists and contains any human-written markdown beyond the generated scaffold. Also treat it as "handled" if `external_docs.url` is already set **or** `external_docs.prompted` is true.
2. **If docs are absent and the question hasn't been asked yet**, prompt the operator (use the AskUserQuestion tool):
   > "This project has no documentation in the repo. Do you keep your docs somewhere else?"
   Offer: **Notion**, **Confluence**, **GitBook / ReadMe**, **A wiki / other URL**, **No — generate docs in this repo**.
3. **If they name an external location**, ask for the link, then **add it to the project**:
   - Create/patch `docs/README.md` — write the URL inside its `<!-- AUTO-DOC:START external-docs -->` region as a clear "📚 Documentation lives here → <url>" pointer (provider labelled).
   - Record it in `docs-sync/config.json`: set `external_docs.provider`, `external_docs.url`, and `external_docs.prompted: true` (so it never re-asks). Commit `docs/README.md` (config.json is gitignored).
   - Tell the operator that in-repo generation is now a lightweight companion to the external source of truth (the migration-log + code reference still generate; narrative overview links out).
4. **If they choose in-repo** (or decline), set `external_docs.prompted: true` and scaffold the `docs/` tree, then continue normally.
5. Never fetch or scrape the external site — only store the link. (Importing external content is a separate, opt-in step.)

## Phase 1 — Classify

1. Resolve the config (default `docs-sync/config.json`); if missing, tell the operator to `cp docs-sync/config.example.json docs-sync/config.json`, then stop.
   Respect the `enabled` gate. For the `branches` list: an **empty array means all branches** — never skip on that basis. Only skip if the list is non-empty and the current branch is not in it.
2. Run the deterministic collector:
   ```bash
   node scripts/collect-doc-changes.mjs --config <config> --range <A..B>
   ```
   Read the newest `reports/doc-changes-*.json`. If `empty: true`, **no-op** — print "no doc-relevant changes" and stop (open no PR).

## Phase 2 — Plan

For each `sections.*` that is enabled **and** has a non-empty bucket, list the doc files you'll regenerate. If `--report-only`, print the plan and **stop**.

## Phase 3 — Per-file doc generation

For each file in `buckets.backend + buckets.frontend + buckets.schema` from the report:

1. **Compute doc path:** mirror the source path under `docs/`.
   - `src/components/Board.jsx` → `docs/src/components/Board.md`
   - `app/api/orders/route.ts` → `docs/app/api/orders/route.md`

2. **Hash-skip check:** if the file's doc already exists and the file's `bodyHash` (from the symbols report) is unchanged since last run — reuse existing prose verbatim. Skip LLM generation entirely.

3. **Read inputs for this file:**
   - Symbols: filter `reports/symbols-*.json` to entries where `file == this path`
   - Imports: read `fileImports[path]` from the change report

4. **Generate or update `docs/<mirrored-path>.md`** with this structure:

   ```markdown
   # <relative-path>
   > <kind> — last updated <YYYY-MM-DD>

   <One paragraph: what this file does and why it exists. Grounded in the diff.
   Never invent — only describe what is in the changed lines.>

   ## Exports
   | Symbol | Kind | Signature |
   |--------|------|-----------|
   | <name> | <kind> | `<signature>` |

   (Omit section if no exports found.)

   ## Dependencies
   - `<name>` → `<from>`

   Only list local imports (those starting with `.`). Omit external packages.
   Omit section if no local imports.

   ## Notes
   <Non-obvious implementation detail, if any. Omit section entirely if nothing to add.>
   ```

5. **Deleted files:** if `entry.status === 'D'`, delete the corresponding `docs/<mirrored-path>.md` if it exists.

6. **New directories:** create parent directories under `docs/` as needed before writing.

## Phase 3b — ARCHITECTURE.md

Regenerate `docs/ARCHITECTURE.md` if **any** of these are true:
- `docs/ARCHITECTURE.md` does not exist (first run)
- `package.json`, `pyproject.toml`, or `requirements.txt` appears in the diff
- The main entry file appears in the diff: `src/index.*`, `src/main.*`, `app.py`, `main.py`, `manage.py`
- A new directory appears in the diff (path with `/` where the parent dir is new)

Otherwise skip — do not regenerate on routine pushes.

**Content of ARCHITECTURE.md:**

```markdown
# Architecture
> last updated <YYYY-MM-DD>

## What this project is
<One paragraph: purpose, users, problem it solves.>

## Tech stack
| Layer | Technology |
|-------|-----------|
| <layer> | <technology> |

(Read from package.json dependencies or requirements.txt.)

## Module map
| Path | Role |
|------|------|
| <path> | <what it does> |

(Cover top-level directories and key files only. Max 15 rows.)

## Data flow
<Narrative: how data/state moves through the system. 2-4 sentences.>

## Entry points
<List main entry files with one-line descriptions.>
```

## Phase 3c — Update index files

After per-file generation, update the section index files to reflect any structural changes (files added, renamed, deleted):

- `docs/frontend.md` — list all `.md` files under `docs/src/` that correspond to frontend files
- `docs/backend.md` — same for backend files
- `docs/schema.md` — same for schema/migration files

**Index file format:**

```markdown
# Frontend
> Auto-generated index — last updated <YYYY-MM-DD>

## <directory>
- [<filename>](<relative-link-to-doc>) — <one-line description from that file's first prose sentence>

```

**Trigger:** Only regenerate an index file if files were added, renamed, or deleted in this push (i.e., `entry.status` is `A`, `R`, or `D`). Routine `M` (modified) pushes do not touch index files.

**Migration (first run only):** If `docs/frontend.md` exists and contains `AUTO-DOC` markers or detailed symbol tables (indicating the old monolithic format), rewrite it as the index format above. Same for `docs/backend.md` and `docs/schema.md`. If `docs/reference/` exists, delete it — its content is now in per-file docs.

## Phase 4 — Narration (if `llm_narration.enabled`)

Update the prose **outside** the markers (the "why / impact" overview) grounded in the report + a `Read` of the changed files. Keep it tight; don't restate the inventories.

## Phase 5 — Changelog

Append one dated Keep-a-Changelog entry summarizing the merge (Added/Changed/Fixed), deduped against the latest entry.

## Phase 6 — Deliver

When invoked via the pre-push hook (`--no-prompt`): all generated/updated doc files under `docs/` are already written to disk — the hook's `git add docs/` picks them up and amends HEAD.

When invoked interactively: print a summary:
- Files regenerated: N
- Files skipped (hash unchanged): N
- ARCHITECTURE.md: regenerated | skipped
- Index files updated: yes | no

## Failure modes — fail loud

- Collector/extractor errors → report the exact error, stop. Don't fabricate docs.
- `empty` report → no-op, no PR. A valid outcome.
- ast-grep missing (symbol reference on) → skip Phase 3b with a clear warning; still do the inventory + changelog.
