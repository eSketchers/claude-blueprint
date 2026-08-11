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
- **Never re-generate a symbol whose `bodyHash` is unchanged** — reuse its existing prose verbatim (zero cost).
- **Regenerate only inside `<!-- AUTO-DOC:START … -->` / `END` markers.** Prose outside markers is hand-written — never touch it.
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

## Phase 3 — Deterministic inventory blocks

Inside the `AUTO-DOC` markers of the affected section docs, regenerate the factual inventories from the report (endpoints, routes, components, tables). For `schema/migration-log.md` and `CHANGELOG.md`, **append** new entries only (dedupe against what's already there).

## Phase 3b — Symbol reference (if `symbol_reference.enabled`)

1. Run the extractor: `node scripts/extract-symbols.mjs --config <config>` → read `reports/symbols-*.json`.
2. For each module, read the existing reference page under `symbol_reference.output_dir` (default `docs/reference/`) and collect the `<!-- sym:<id> hash:<h> -->` markers already present.
3. **Only** LLM-describe symbols that are new or whose `hash` differs from the marker (respect `max_new_per_run` — if exceeded, do the top N and note the remainder as pending). For each, write a concise "what it does / params / returns" entry, wrapped in `AUTO-DOC` markers, ending with `<!-- sym:<id> hash:<h> -->`.
4. Symbols missing from the report are removed; unchanged symbols are left exactly as-is.

## Phase 4 — Narration (if `llm_narration.enabled`)

Update the prose **outside** the markers (the "why / impact" overview) grounded in the report + a `Read` of the changed files. Keep it tight; don't restate the inventories.

## Phase 5 — Changelog

Append one dated Keep-a-Changelog entry summarizing the merge (Added/Changed/Fixed), deduped against the latest entry.

## Phase 6 — Deliver

The **pre-push hook** (`hooks/pre-push.sample`) calls `scripts/update-docs.sh --in-place`, which stages the generated docs onto the current branch. The hook then commits them so they travel **with the push** — no separate PR, no CI workflow. When invoked directly (e.g. `/update-docs` in an interactive session), print a summary of the sections changed and the symbol counts (new/updated/unchanged).

## Failure modes — fail loud

- Collector/extractor errors → report the exact error, stop. Don't fabricate docs.
- `empty` report → no-op, no PR. A valid outcome.
- ast-grep missing (symbol reference on) → skip Phase 3b with a clear warning; still do the inventory + changelog.
