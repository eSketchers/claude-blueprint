# Auto-Updating Documentation (docs-sync)

Keeps an in-repo `docs/` folder current so humans and Claude can understand the project. On every
**`git push`**, a pre-push hook diffs the commits being pushed, classifies files into **backend /
schema / frontend**, regenerates the affected doc sections + a **module/function reference**, and
commits the updated docs **onto the same branch** — so documentation always travels with the code.
No separate PR, no CI workflow, no secrets needed (uses your local `claude` auth).

## Pieces

| File | Role |
|------|------|
| `scripts/collect-doc-changes.mjs` | Zero-dep deterministic classifier: `git diff` → detect frameworks → classify each path (`schema > backend > frontend`) → change-report JSON. |
| `scripts/extract-symbols.mjs` | ast-grep-based symbol extractor: enumerates exported functions/classes + signatures, hashes each body (the incremental-skip key). |
| `.claude/commands/update-docs.md` → `/update-docs` | Reads the reports → regenerates inventories inside `AUTO-DOC` markers → LLM-describes only changed symbols → appends a changelog entry. |
| `scripts/update-docs.sh` | The integration **seam**: the pre-push hook calls `update-docs.sh --range A..B --in-place`. |
| `hooks/pre-push.sample` | The git hook — installed at `.git/hooks/pre-push` by `adopt.sh`. |
| `docs-sync/config.example.json` | Copy to `config.json` (gitignored). Section toggles, `symbol_reference`, mappings. |

## How it works

1. You run `git push`.
2. The **pre-push hook** fires before the push completes.
3. It computes the range of commits being pushed (local HEAD vs. what's on the remote).
4. It calls `scripts/update-docs.sh --range <range> --in-place --no-prompt`, which runs the collector + `/update-docs` headlessly.
5. If docs changed, the hook commits them onto the current branch.
6. The push completes — your code **and** the updated docs go up together.

If doc generation fails for any reason, the push still goes through (the hook always exits 0).

## Setup (adopted project)

1. `adopt.sh --detect` copies the scripts, generates `docs-sync/config.json`, and installs the pre-push hook.
2. Edit `docs-sync/config.json`: set `enabled`, section toggles, and any per-framework `mappings`.
3. Push something — docs are generated automatically. No secrets, no CI setup needed.

## Docs kept elsewhere? (first-run bootstrap)

If a project has **no in-repo docs**, the first *interactive* `/update-docs` run asks whether the
docs live somewhere else (Notion / Confluence / GitBook / ReadMe / a URL). If you give a link, it's
written into `docs/README.md` and recorded in `docs-sync/config.json` (`external_docs`) so it never
re-asks. Headless runs (`--no-prompt`) honour whatever `external_docs.url` is already set.

## Verification

```bash
node --test tests/scripts/collect-doc-changes.test.mjs tests/scripts/extract-symbols.test.mjs
node scripts/collect-doc-changes.mjs --range HEAD~5..HEAD --dry-run
bash scripts/update-docs.sh --local --in-place --dry-run
```
