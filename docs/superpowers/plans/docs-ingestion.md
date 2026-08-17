# Docs Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan a project for existing MD files and Google Docs, consolidate them into `docs/`, and ask the operator if they are complete — triggering a code-based gap fill if not.

**Architecture:** A new pure-Node ESM script (`scripts/ingest-docs.mjs`) handles deterministic work: MD file detection, Google Docs export via public share URL, and consolidation into `docs/`. The LLM (`/update-docs` Phase 0) handles interactive prompts and gap filling. `adopt.sh` gains an `--ingest` flag that runs the script. Config gains a `urls` array (replacing the single `url`).

**Tech Stack:** Node 20 ESM, built-in `fetch` (Node 18+), `node:fs`, `node:path`, `node:test`.

## Global Constraints

- Zero external dependencies — pure Node ESM, no npm packages in `scripts/`
- All tests use `node:test` + `node:assert/strict`
- Run tests with: `node --test tests/scripts/ingest-docs.test.mjs`
- All ingestion errors are non-fatal — warn and continue, never throw to caller
- Never overwrite files that already exist in `docs/` — existing content is authoritative
- Google Docs export requires doc shared as "anyone with link can view"

---

## File Map

| File | Change |
|------|--------|
| `scripts/ingest-docs.mjs` | Create: MD detection, Google Docs export, consolidation |
| `tests/scripts/ingest-docs.test.mjs` | Create: unit tests for all exports |
| `docs-sync/config.example.json` | Modify: `url` → `urls` array, add `mintlify` block |
| `.claude/commands/update-docs.md` | Modify: Phase 0 — handle `urls` array, trigger ingest |
| `scripts/adopt.sh` | Modify: add `--ingest` flag |

---

## Task 1: detectMdFiles() + extractDocId()

**Files:**
- Create: `scripts/ingest-docs.mjs`
- Create: `tests/scripts/ingest-docs.test.mjs`

**Interfaces:**
- Produces:
  - `detectMdFiles(projectRoot: string, exclude?: string[]): string[]` — relative paths from projectRoot
  - `extractDocId(url: string): string` — throws on invalid URL

- [ ] **Step 1: Write failing tests**

Create `tests/scripts/ingest-docs.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectMdFiles, extractDocId } from '../../scripts/ingest-docs.mjs';

test('detectMdFiles(): finds .md files, excludes node_modules and docs/', () => {
  const root = mkdtempSync(join(tmpdir(), 'ingest-test-'));
  writeFileSync(join(root, 'README.md'), '# Readme');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'notes.md'), '# Notes');
  mkdirSync(join(root, 'node_modules', 'foo'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'foo', 'README.md'), '# Ignore');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'existing.md'), '# Existing');

  const result = detectMdFiles(root);
  assert.ok(result.includes('README.md'));
  assert.ok(result.includes('src/notes.md'));
  assert.ok(!result.some(p => p.includes('node_modules')), 'must exclude node_modules');
  assert.ok(!result.some(p => p.startsWith('docs/')), 'must exclude docs/');
});

test('detectMdFiles(): returns empty array when no .md files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ingest-test-'));
  writeFileSync(join(root, 'index.js'), 'console.log("hi")');
  assert.deepEqual(detectMdFiles(root), []);
});

test('extractDocId(): parses standard edit URL', () => {
  assert.equal(
    extractDocId('https://docs.google.com/document/d/ABC123xyz/edit'),
    'ABC123xyz'
  );
});

test('extractDocId(): parses URL with no trailing path', () => {
  assert.equal(
    extractDocId('https://docs.google.com/document/d/XYZ_789-abc/'),
    'XYZ_789-abc'
  );
});

test('extractDocId(): throws on non-Google-Docs URL', () => {
  assert.throws(() => extractDocId('https://example.com/foo'), /Cannot parse/);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
node --test tests/scripts/ingest-docs.test.mjs 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../../scripts/ingest-docs.mjs'`

- [ ] **Step 3: Create scripts/ingest-docs.mjs with detectMdFiles and extractDocId**

```js
#!/usr/bin/env node
// ingest-docs.mjs — one-time doc ingestion from project MD files and Google Docs.
// Called by adopt.sh --ingest and /update-docs Phase 0.

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

const DEFAULT_EXCLUDE = ['node_modules', 'vendor', '.git', 'docs', '.next', 'dist', 'build', 'coverage', '.superpowers'];

/**
 * Find all .md files under projectRoot, skipping excluded directories.
 * @param {string} projectRoot
 * @param {string[]} exclude  directory names to skip
 * @returns {string[]}  relative paths from projectRoot
 */
export function detectMdFiles(projectRoot, exclude = DEFAULT_EXCLUDE) {
  const results = [];
  function scan(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const rel = relative(projectRoot, fullPath);
      if (entry.isDirectory()) {
        if (!exclude.some(e => rel === e || rel.startsWith(e + '/'))) scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(rel);
      }
    }
  }
  scan(projectRoot);
  return results;
}

/**
 * Extract the Google Doc ID from a docs.google.com URL.
 * @param {string} url
 * @returns {string}
 */
export function extractDocId(url) {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error(`Cannot parse Google Docs ID from: ${url}`);
  return m[1];
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
node --test tests/scripts/ingest-docs.test.mjs 2>&1 | tail -10
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-docs.mjs tests/scripts/ingest-docs.test.mjs
git commit -m "feat(ingest): add detectMdFiles and extractDocId"
```

---

## Task 2: exportGoogleDoc() + ingestGoogleDocs()

**Files:**
- Modify: `scripts/ingest-docs.mjs`
- Modify: `tests/scripts/ingest-docs.test.mjs`

**Interfaces:**
- Consumes: `extractDocId()` from Task 1
- Produces:
  - `exportGoogleDoc(url: string): Promise<{docId:string, title:string, filename:string, content:string}>` — throws if private or fetch fails
  - `ingestGoogleDocs(urls: string[]): Promise<Array<{docId,title,filename,content}>>` — non-fatal, warns on per-URL errors

- [ ] **Step 1: Write failing tests**

Add to `tests/scripts/ingest-docs.test.mjs`:

```js
import { exportGoogleDoc, ingestGoogleDocs } from '../../scripts/ingest-docs.mjs';

test('exportGoogleDoc(): extracts title from first H1', async () => {
  // Mock fetch for unit test — override global fetch
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => '# Checkout Flow\n\nSome content here.',
  });
  try {
    const result = await exportGoogleDoc('https://docs.google.com/document/d/DOC123/edit');
    assert.equal(result.docId, 'DOC123');
    assert.equal(result.title, 'Checkout Flow');
    assert.equal(result.filename, 'checkout-flow');
    assert.ok(result.content.includes('Checkout Flow'));
  } finally {
    globalThis.fetch = orig;
  }
});

test('exportGoogleDoc(): uses docId as filename when no H1 found', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => 'No heading here, just prose.',
  });
  try {
    const result = await exportGoogleDoc('https://docs.google.com/document/d/NOHDR/edit');
    assert.equal(result.filename, 'nohdr');
  } finally {
    globalThis.fetch = orig;
  }
});

test('exportGoogleDoc(): throws when response looks like HTML login page', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => '<html><head><title>Sign in</title></head><body>accounts.google.com</body></html>',
  });
  try {
    await assert.rejects(
      () => exportGoogleDoc('https://docs.google.com/document/d/PRIVATE/edit'),
      /private/
    );
  } finally {
    globalThis.fetch = orig;
  }
});

test('ingestGoogleDocs(): skips failed exports with a warning, returns successful ones', async () => {
  const orig = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async (url) => {
    callCount++;
    if (url.includes('FAIL')) return { ok: false, status: 403, statusText: 'Forbidden' };
    return { ok: true, text: async () => '# Guide\n\nContent.' };
  };
  try {
    const results = await ingestGoogleDocs([
      'https://docs.google.com/document/d/GOOD/edit',
      'https://docs.google.com/document/d/FAIL/edit',
    ]);
    assert.equal(results.length, 1);
    assert.equal(results[0].docId, 'GOOD');
  } finally {
    globalThis.fetch = orig;
  }
});
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
node --test tests/scripts/ingest-docs.test.mjs 2>&1 | tail -10
```

Expected: FAIL — `exportGoogleDoc is not exported`

- [ ] **Step 3: Add exportGoogleDoc and ingestGoogleDocs to ingest-docs.mjs**

Append after `extractDocId`:

```js
/**
 * Export a single Google Doc as Markdown.
 * The doc must be shared as "anyone with link can view".
 * @param {string} url
 * @returns {Promise<{docId:string, title:string, filename:string, content:string}>}
 */
export async function exportGoogleDoc(url) {
  const docId = extractDocId(url);
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=md`;
  const res = await fetch(exportUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Export failed for ${docId}: HTTP ${res.status} ${res.statusText}`);
  const content = await res.text();
  if (content.includes('accounts.google.com') || content.trimStart().startsWith('<')) {
    throw new Error(`Doc ${docId} is private — share with "anyone with link can view" or export manually`);
  }
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : docId;
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || docId.toLowerCase();
  return { docId, title, filename, content };
}

/**
 * Export all Google Docs from a urls array. Non-fatal: warns on failures.
 * @param {string[]} urls
 * @returns {Promise<Array<{docId:string, title:string, filename:string, content:string}>>}
 */
export async function ingestGoogleDocs(urls) {
  const results = [];
  for (const url of urls) {
    try {
      results.push(await exportGoogleDoc(url));
    } catch (err) {
      console.warn(`[ingest-docs] WARNING: ${err.message}`);
    }
  }
  return results;
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
node --test tests/scripts/ingest-docs.test.mjs 2>&1 | tail -10
```

Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-docs.mjs tests/scripts/ingest-docs.test.mjs
git commit -m "feat(ingest): add exportGoogleDoc and ingestGoogleDocs"
```

---

## Task 3: consolidateDocs()

**Files:**
- Modify: `scripts/ingest-docs.mjs`
- Modify: `tests/scripts/ingest-docs.test.mjs`

**Interfaces:**
- Produces:
  - `consolidateDocs(mdFiles: string[], googleDocExports: Array<{filename:string,content:string}>, projectRoot: string, docsDir: string): Array<{src:string, dest:string, action:'created'|'skipped'}>`

- [ ] **Step 1: Write failing tests**

Add to `tests/scripts/ingest-docs.test.mjs`:

```js
import { consolidateDocs } from '../../scripts/ingest-docs.mjs';
import { readFileSync } from 'node:fs';

test('consolidateDocs(): copies MD files, writes Google Docs to guides/, skips existing', () => {
  const root = mkdtempSync(join(tmpdir(), 'ingest-test-'));
  const docsDir = join(root, 'docs');
  mkdirSync(docsDir, { recursive: true });

  // Source MD files
  writeFileSync(join(root, 'README.md'), '# Hello');
  mkdirSync(join(root, 'notes'), { recursive: true });
  writeFileSync(join(root, 'notes', 'setup.md'), '# Setup');

  // Pre-existing file in docs/ (must be skipped)
  writeFileSync(join(docsDir, 'README.md'), '# Existing — do not overwrite');

  const googleDocExports = [
    { filename: 'checkout-flow', content: '# Checkout Flow\n\nHello.' },
  ];

  const results = consolidateDocs(['README.md', 'notes/setup.md'], googleDocExports, root, docsDir);

  const created = results.filter(r => r.action === 'created');
  const skipped = results.filter(r => r.action === 'skipped');

  // README.md skipped (exists), notes/setup.md + checkout-flow.md created
  assert.equal(created.length, 2);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].src, 'README.md');

  // Verify existing file not overwritten
  assert.equal(readFileSync(join(docsDir, 'README.md'), 'utf8'), '# Existing — do not overwrite');

  // Verify Google Doc written to guides/
  const guide = readFileSync(join(docsDir, 'guides', 'checkout-flow.md'), 'utf8');
  assert.equal(guide, '# Checkout Flow\n\nHello.');

  // Verify notes/setup.md copied preserving path
  const setup = readFileSync(join(docsDir, 'notes', 'setup.md'), 'utf8');
  assert.equal(setup, '# Setup');
});

test('consolidateDocs(): handles empty inputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'ingest-test-'));
  const docsDir = join(root, 'docs');
  mkdirSync(docsDir, { recursive: true });
  const results = consolidateDocs([], [], root, docsDir);
  assert.deepEqual(results, []);
});

test('consolidateDocs(): does not overwrite existing Google Doc in guides/', () => {
  const root = mkdtempSync(join(tmpdir(), 'ingest-test-'));
  const docsDir = join(root, 'docs');
  mkdirSync(join(docsDir, 'guides'), { recursive: true });
  writeFileSync(join(docsDir, 'guides', 'existing-guide.md'), '# Original');

  const results = consolidateDocs([], [{ filename: 'existing-guide', content: '# New — should not appear' }], root, docsDir);
  assert.equal(results[0].action, 'skipped');
  assert.equal(readFileSync(join(docsDir, 'guides', 'existing-guide.md'), 'utf8'), '# Original');
});
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
node --test tests/scripts/ingest-docs.test.mjs 2>&1 | tail -10
```

Expected: FAIL — `consolidateDocs is not exported`

- [ ] **Step 3: Add consolidateDocs to ingest-docs.mjs**

Append after `ingestGoogleDocs`:

```js
/**
 * Consolidate MD files and Google Doc exports into the docs/ folder.
 * Never overwrites existing files.
 * @param {string[]} mdFiles  relative paths from projectRoot (excluding docs/)
 * @param {Array<{filename:string, content:string}>} googleDocExports
 * @param {string} projectRoot
 * @param {string} docsDir  absolute path to docs/
 * @returns {Array<{src:string, dest:string, action:'created'|'skipped'}>}
 */
export function consolidateDocs(mdFiles, googleDocExports, projectRoot, docsDir) {
  const results = [];

  for (const relPath of mdFiles) {
    const dest = join(docsDir, relPath);
    if (existsSync(dest)) {
      results.push({ src: relPath, dest, action: 'skipped' });
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(projectRoot, relPath), dest);
    results.push({ src: relPath, dest, action: 'created' });
  }

  for (const { filename, content } of googleDocExports) {
    const dest = join(docsDir, 'guides', `${filename}.md`);
    if (existsSync(dest)) {
      results.push({ src: filename, dest, action: 'skipped' });
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, 'utf8');
    results.push({ src: filename, dest, action: 'created' });
  }

  return results;
}
```

- [ ] **Step 4: Run all tests — verify all pass**

```bash
node --test tests/scripts/ingest-docs.test.mjs 2>&1 | tail -10
```

Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-docs.mjs tests/scripts/ingest-docs.test.mjs
git commit -m "feat(ingest): add consolidateDocs"
```

---

## Task 4: main() CLI entry point

**Files:**
- Modify: `scripts/ingest-docs.mjs`

**Interfaces:**
- Consumes: `detectMdFiles`, `ingestGoogleDocs`, `consolidateDocs` from Tasks 1-3
- CLI: `node scripts/ingest-docs.mjs --config <path> --project-root <path>`
  - Reads `external_docs.urls` from config
  - Detects MD files in project root
  - Exports Google Docs
  - Consolidates into `docs.output_dir`
  - Prints summary: sources found, files created/skipped

- [ ] **Step 1: Append main() to ingest-docs.mjs**

```js
// ---- CLI entry ----

async function main() {
  const args = process.argv.slice(2);
  const configPath = args[args.indexOf('--config') + 1] ?? join(REPO_ROOT, 'docs-sync', 'config.json');
  const projectRoot = args[args.indexOf('--project-root') + 1] ?? REPO_ROOT;

  if (!existsSync(configPath)) {
    console.error(`[ingest-docs] Config not found: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const docsDir = resolve(projectRoot, config.docs?.output_dir ?? 'docs');
  const urls = config.external_docs?.urls ?? [];

  // 1. Detect MD files
  const mdFiles = detectMdFiles(projectRoot);
  console.log(`[ingest-docs] Found ${mdFiles.length} MD file(s) in project`);

  // 2. Export Google Docs
  let googleDocExports = [];
  if (urls.length > 0) {
    console.log(`[ingest-docs] Exporting ${urls.length} Google Doc(s)...`);
    googleDocExports = await ingestGoogleDocs(urls);
    console.log(`[ingest-docs] Exported ${googleDocExports.length}/${urls.length} Google Doc(s)`);
  }

  // 3. Consolidate
  mkdirSync(docsDir, { recursive: true });
  const results = consolidateDocs(mdFiles, googleDocExports, projectRoot, docsDir);
  const created = results.filter(r => r.action === 'created');
  const skipped = results.filter(r => r.action === 'skipped');

  console.log(`[ingest-docs] Created: ${created.length} | Skipped (already exist): ${skipped.length}`);
  for (const r of created) console.log(`  + ${r.dest}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
node --test tests/scripts/ingest-docs.test.mjs 2>&1 | tail -10
```

Expected: 12 PASS

- [ ] **Step 3: Smoke-test the CLI**

```bash
node scripts/ingest-docs.mjs --config docs-sync/config.example.json 2>&1
```

Expected: prints found MD files count, no errors (even with no Google Docs URLs configured yet).

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest-docs.mjs
git commit -m "feat(ingest): add CLI entry point to ingest-docs.mjs"
```

---

## Task 5: Update config.example.json + update-docs.md Phase 0

**Files:**
- Modify: `docs-sync/config.example.json`
- Modify: `.claude/commands/update-docs.md`

**Interfaces:**
- Config: `external_docs.url` (singular) → `external_docs.urls` (array)
- Config: add `mintlify` block (used by Plan 3)
- Phase 0: handle `urls` array; treat ingestion as a step before prompting

- [ ] **Step 1: Update docs-sync/config.example.json**

Replace the `external_docs` block and add `mintlify`:

```json
  "external_docs": {
    "_comment_1": "For projects whose docs live OUTSIDE the repo. urls: array of Google Docs share links. prompted: set true once asked so it never re-prompts.",
    "provider": null,
    "urls": [],
    "prompted": false
  },

  "mintlify": {
    "_comment": "Set enabled: true and project_name after connecting the repo at mintlify.com.",
    "enabled": false,
    "project_name": null
  },
```

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('docs-sync/config.example.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Update Phase 0 in .claude/commands/update-docs.md**

Replace the existing Phase 0 section with:

```markdown
## Phase 0 — Bootstrap (first run: ingest + are the docs elsewhere?)

Runs only in **interactive** mode (skip entirely if `--no-prompt` is set).

1. Check if the project already has in-repo docs: `docs.output_dir` exists with human-written markdown, OR `external_docs.prompted` is true. If already handled, skip to Phase 1.

2. **Run ingestion first** — before prompting:
   ```bash
   node scripts/ingest-docs.mjs --config <config> --project-root <cwd>
   ```
   This scans for existing MD files and exports any Google Docs listed in `external_docs.urls`. Print what was found.

3. **Prompt the operator** (use the AskUserQuestion tool):
   > "Sources found: [list from ingest output]. Are these docs complete enough to publish? Or do you have Google Docs to add?"

   Offer:
   - **Yes, complete** — proceed to gap fill skip, go to Phase 1
   - **Add Google Docs** — ask for URLs, update `external_docs.urls` in `docs-sync/config.json`, re-run ingestion for the new URLs
   - **No, scan code to fill gaps** — proceed to gap fill (Phase 0b below)
   - **No docs at all** — proceed to gap fill

4. **Set `external_docs.prompted: true`** in `docs-sync/config.json` once done (config is gitignored).

5. **Never fetch or scrape external sites beyond the Google Docs export URLs** — only store other links.

## Phase 0b — Gap fill (when docs are incomplete)

Runs after Phase 0 when the operator says docs are incomplete, OR on first run with no docs at all.

1. Read the project structure: `package.json`, entry files, top-level directories.
2. Check which features already have a guide in `docs/guides/` — identify gaps.
3. For each gap, read the relevant source files to understand the feature end-to-end.
4. Write `docs/guides/<feature>.md` for each missing feature:

   ```markdown
   # <Feature Name>
   > last updated <YYYY-MM-DD>

   <One paragraph: what this feature does and the problem it solves for the user.>

   ## How it works
   <Step-by-step narrative from the user's perspective. No file names, no function names, no technical terms.>

   ## Edge cases & gotchas
   <Non-obvious behavior the support team should know about. Omit section if nothing notable.>
   ```

5. Generate `docs/OVERVIEW.md` if it does not exist (see Phase 3e format).
6. After all guides are written, continue to Phase 1.
```

- [ ] **Step 4: Commit**

```bash
git add docs-sync/config.example.json .claude/commands/update-docs.md
git commit -m "feat(ingest): update config (urls array) and Phase 0 to run ingestion"
```

---

## Task 6: Add --ingest flag to adopt.sh

**Files:**
- Modify: `scripts/adopt.sh`

**Interfaces:**
- CLI: `adopt.sh --detect --ingest` — runs ingestion after adoption setup
- Implementation: call `node scripts/ingest-docs.mjs --config <config> --project-root <project_root>` when `--ingest` is passed

- [ ] **Step 1: Find where adopt.sh parses flags**

```bash
grep -n "\-\-detect\|\-\-force\|DETECT\|FORCE\|parse.*arg\|while.*arg" scripts/adopt.sh | head -20
```

Note the line numbers for flag parsing and the end of the main setup block.

- [ ] **Step 2: Add INGEST flag variable near other flag declarations**

Find the block where `FORCE`, `DRY_RUN`, `DETECT` etc. are declared (near the top of adopt.sh) and add:

```bash
INGEST=0
```

- [ ] **Step 3: Add --ingest to the arg parsing loop**

In the same loop that handles `--force`, `--detect`, etc., add:

```bash
    --ingest) INGEST=1 ;;
```

- [ ] **Step 4: Add ingest execution at the end of the main() function**

After the docs-sync/config.json setup block (near the end of the `main` function, before the final success message), add:

```bash
  # --- Ingestion (if requested) ---
  if [[ $INGEST -eq 1 && $DRY_RUN -eq 0 ]]; then
    if [[ -f "$PROJECT_ROOT/docs-sync/config.json" ]]; then
      log "auto-docs: running ingestion (--ingest)..."
      node "$BLUEPRINT_RESOLVED/scripts/ingest-docs.mjs" \
        --config "$PROJECT_ROOT/docs-sync/config.json" \
        --project-root "$PROJECT_ROOT" || true  # non-fatal
    else
      log "auto-docs: skipping ingestion — docs-sync/config.json not found (run without --ingest first)"
    fi
  fi
```

- [ ] **Step 5: Test the flag is accepted (dry run)**

```bash
bash scripts/adopt.sh --help 2>&1 | head -20
# or check that --ingest doesn't cause parse error:
bash scripts/adopt.sh --dry-run --ingest 2>&1 | tail -5
```

Expected: no "unknown option" error.

- [ ] **Step 6: Run the existing adopt integration test**

```bash
bash scripts/test-adopt.sh 2>&1 | tail -20
```

Expected: passes (or same failure rate as before this change).

- [ ] **Step 7: Commit**

```bash
git add scripts/adopt.sh
git commit -m "feat(ingest): add --ingest flag to adopt.sh"
```

---

## Task 7: Full test suite + push

- [ ] **Step 1: Run full test suite**

```bash
node --test tests/scripts/collect-doc-changes.test.mjs tests/scripts/extract-symbols.test.mjs tests/scripts/ingest-docs.test.mjs 2>&1
```

Expected: all tests PASS, 0 failures.

- [ ] **Step 2: Verify config JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('docs-sync/config.example.json','utf8')); console.log('valid')"
```

- [ ] **Step 3: Smoke-test CLI**

```bash
node scripts/ingest-docs.mjs --config docs-sync/config.example.json 2>&1
```

Expected: prints MD file count, no errors.

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review Against Spec

| Spec requirement | Task |
|-----------------|------|
| Scan for MD files outside node_modules/vendor/.git/docs/ | Task 1 detectMdFiles |
| Google Docs: multiple URLs array | Task 2 ingestGoogleDocs |
| Google Docs export via public share URL, no API key | Task 2 exportGoogleDoc |
| Private docs: warn and skip | Task 2 ingestGoogleDocs (non-fatal) |
| Consolidate: never overwrite existing files | Task 3 consolidateDocs |
| MD files → docs/ preserving structure | Task 3 consolidateDocs |
| Google Docs → docs/guides/ | Task 3 consolidateDocs |
| Completeness check → gap fill if incomplete | Task 5 Phase 0b |
| Feature guide format: no code references | Task 5 Phase 0b format |
| config: urls array (not single url) | Task 5 config update |
| config: mintlify block | Task 5 config update |
| adopt.sh --ingest flag | Task 6 |
| All errors non-fatal | Task 2 non-fatal, Task 6 `|| true` |
