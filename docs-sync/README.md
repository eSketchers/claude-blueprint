# Auto-Updating Documentation (docs-sync)

Keeps an in-repo `docs/` folder current so humans and Claude can understand the project. On merge
to a configured branch it diffs the change, classifies files into **backend / schema / frontend**,
regenerates the affected doc sections + a **module/function reference**, and opens a **draft PR**.
The bot never writes to a protected branch — the PR review is the gate.

## Pieces

| File | Role |
|------|------|
| `scripts/collect-doc-changes.mjs` | Zero-dep deterministic classifier: `git diff` → detect frameworks → classify each path (`schema > backend > frontend`) → change-report JSON. |
| `scripts/extract-symbols.mjs` | ast-grep-based symbol extractor: enumerates exported functions/classes + signatures, hashes each body (the incremental-skip key). |
| `.claude/commands/update-docs.md` → `/update-docs` | Reads the reports → regenerates inventories inside `AUTO-DOC` markers → LLM-describes only changed symbols → appends a changelog entry. |
| `scripts/update-docs.sh` | The integration **seam**: any trigger calls `update-docs.sh --range A..B` and gets a draft PR. |
| `docs-sync/config.example.json` | Copy to `config.json` (gitignored). Branches, section toggles, `symbol_reference`, mappings. |
| `templates/update-docs.yml` | GitHub Actions workflow shipped into adopted projects. |

## Setup (adopted project)

1. Adoption copies these files and generates `docs-sync/config.json` (see the blueprint's `adopt.sh`).
2. Edit `docs-sync/config.json`: set `enabled`, the trigger `branches`, section toggles, and any per-framework `mappings`.
3. **Add the `ANTHROPIC_API_KEY` repo secret** (GitHub → Settings → Secrets → Actions) — the Actions path needs it; a script can't set it.
4. Verify: `gh workflow run update-docs.yml` or `bash scripts/update-docs.sh --local --dry-run`.

## Docs kept elsewhere? (first-run bootstrap)

If a project has **no in-repo docs**, the first *interactive* `/update-docs` run asks whether the
docs live somewhere else (Notion / Confluence / GitBook / ReadMe / a URL). If you give a link, it's
written into `docs/README.md` (a "📚 Documentation lives here → …" pointer, committed) and recorded
in `docs-sync/config.json` (`external_docs`) so it never re-asks. Choose "generate in this repo" to
scaffold `docs/` instead. Headless/CI runs (`--no-prompt`) never prompt — they just honour whatever
`external_docs.url` is already set. Pre-seed it by filling `external_docs` in the config. The link is
only stored, never scraped (importing external content is a separate opt-in step).

## Swap the trigger (n8n / orchestrator / cron)

GitHub Actions is the default, but the tool is **transport-agnostic** — everything meets at one
seam: `bash scripts/update-docs.sh --range A..B`. To drive it from elsewhere, point that trigger at
the seam; nothing else changes:

- **n8n** — GitHub "push to `staging`/`main`" webhook → a runner (repo + `node`/`ast-grep`/`gh` + `ANTHROPIC_API_KEY`) → `update-docs.sh --range <before>..<after>` → post the draft-PR link to Slack.
- **Orchestrator** — add a merge-watch source that spawns the wrapper (reuses its budget/notify machinery).
- **Cron / local `post-merge` hook** — already covered by `update-docs.sh` + `hooks/post-merge.sample`.

## Verification

```bash
node --test tests/scripts/collect-doc-changes.test.mjs tests/scripts/extract-symbols.test.mjs
node scripts/collect-doc-changes.mjs --range HEAD~5..HEAD --dry-run
bash scripts/update-docs.sh --local --dry-run
```
