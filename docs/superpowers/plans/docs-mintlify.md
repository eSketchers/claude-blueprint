# Docs Mintlify Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate `docs/mint.json` and `docs/WHATS-NEW.md`, keeping Mintlify in sync with the project's docs on every push.

**Architecture:** A new pure-Node ESM script (`scripts/generate-mint-json.mjs`) scans `docs/guides/` and generates `mint.json` with audience-split navigation. The `/update-docs` command gains Phase 3f (mint.json sync) and Phase 5b (WHATS-NEW.md). `adopt.sh` prints Mintlify connection instructions after `--ingest`. Config gains a `mintlify` block.

**Tech Stack:** Node 20 ESM, `node:fs`, `node:path`, `node:test`.

## Global Constraints

- Zero external dependencies — pure Node ESM
- All tests use `node:test` + `node:assert/strict`
- Run tests with: `node --test tests/scripts/generate-mint-json.test.mjs`
- `mint.json` is only regenerated when guides are added, renamed, or deleted (A/R/D entries) — not on every push
- `WHATS-NEW.md` is append-only — never rewrite history
- WHATS-NEW.md uses plain language — no file paths, no technical terms
- All errors non-fatal

**Prerequisites:** docs-ingestion and docs-feature-guides plans complete.

---

## File Map

| File | Change |
|------|--------|
| `scripts/generate-mint-json.mjs` | Create: buildNavigation + generateMintJson + main() |
| `tests/scripts/generate-mint-json.test.mjs` | Create: unit tests |
| `.claude/commands/update-docs.md` | Add Phase 3f (mint.json) and Phase 5b (WHATS-NEW.md) |
| `scripts/adopt.sh` | Print Mintlify setup instructions when --ingest completes |

---

## Task 1: generate-mint-json.mjs — buildNavigation() + generateMintJson()

**Files:**
- Create: `scripts/generate-mint-json.mjs`
- Create: `tests/scripts/generate-mint-json.test.mjs`

**Interfaces:**
- Produces:
  - `buildNavigation(docsDir: string): Array<{group:string, pages:string[]}>` — scans docs/ structure
  - `generateMintJson(docsDir: string, projectName: string): object` — full mint.json object

- [ ] **Step 1: Write failing tests**

Create `tests/scripts/generate-mint-json.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNavigation, generateMintJson } from '../../scripts/generate-mint-json.mjs';

test('buildNavigation(): includes What\'s New when WHATS-NEW.md exists', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'mint-test-'));
  writeFileSync(join(docsDir, 'WHATS-NEW.md'), '## Aug\n- Fix');

  const nav = buildNavigation(docsDir);
  const group = nav.find(g => g.group === "What's New");
  assert.ok(group, 'What\'s New group must exist');
  assert.deepEqual(group.pages, ['WHATS-NEW']);
});

test('buildNavigation(): omits What\'s New when WHATS-NEW.md is absent', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'mint-test-'));
  const nav = buildNavigation(docsDir);
  assert.ok(!nav.find(g => g.group === "What's New"));
});

test('buildNavigation(): lists guides in Product Guides group', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'mint-test-'));
  mkdirSync(join(docsDir, 'guides'), { recursive: true });
  writeFileSync(join(docsDir, 'guides', 'checkout.md'), '# Checkout');
  writeFileSync(join(docsDir, 'guides', 'authentication.md'), '# Auth');

  const nav = buildNavigation(docsDir);
  const group = nav.find(g => g.group === 'Product Guides');
  assert.ok(group, 'Product Guides group must exist');
  assert.ok(group.pages.includes('guides/checkout'), 'must include checkout');
  assert.ok(group.pages.includes('guides/authentication'), 'must include authentication');
});

test('buildNavigation(): omits Product Guides when guides/ is empty', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'mint-test-'));
  mkdirSync(join(docsDir, 'guides'), { recursive: true });
  const nav = buildNavigation(docsDir);
  assert.ok(!nav.find(g => g.group === 'Product Guides'));
});

test('buildNavigation(): includes System Overview when OVERVIEW.md exists', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'mint-test-'));
  writeFileSync(join(docsDir, 'OVERVIEW.md'), '# Overview');

  const nav = buildNavigation(docsDir);
  const group = nav.find(g => g.group === 'System Overview');
  assert.ok(group, 'System Overview group must exist');
  assert.deepEqual(group.pages, ['OVERVIEW']);
});

test('generateMintJson(): produces valid mint.json shape', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'mint-test-'));
  mkdirSync(join(docsDir, 'guides'), { recursive: true });
  writeFileSync(join(docsDir, 'guides', 'checkout.md'), '# Checkout');
  writeFileSync(join(docsDir, 'OVERVIEW.md'), '# Overview');
  writeFileSync(join(docsDir, 'WHATS-NEW.md'), '## Aug\n- Fix');

  const mint = generateMintJson(docsDir, 'My Project');
  assert.equal(mint.name, 'My Project');
  assert.ok(Array.isArray(mint.navigation));
  assert.ok(mint.navigation.length >= 3, 'must have at least 3 groups');
  assert.equal(mint.colors?.primary, '#0D9373');
});

test('generateMintJson(): works with no guides and no optional files', () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'mint-test-'));
  const mint = generateMintJson(docsDir, 'Empty Project');
  assert.equal(mint.name, 'Empty Project');
  assert.ok(Array.isArray(mint.navigation));
  assert.equal(mint.navigation.length, 0);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
node --test tests/scripts/generate-mint-json.test.mjs 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../../scripts/generate-mint-json.mjs'`

- [ ] **Step 3: Create scripts/generate-mint-json.mjs**

```js
#!/usr/bin/env node
// generate-mint-json.mjs — generates docs/mint.json for Mintlify.
// Scans docs/guides/, docs/OVERVIEW.md, docs/WHATS-NEW.md and builds navigation.

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

/**
 * Build the Mintlify navigation array from the docs/ folder.
 * Groups: "What's New", "Product Guides", "System Overview".
 * @param {string} docsDir  absolute path to docs/
 * @returns {Array<{group:string, pages:string[]}>}
 */
export function buildNavigation(docsDir) {
  const groups = [];

  // "What's New" — WHATS-NEW.md
  if (existsSync(join(docsDir, 'WHATS-NEW.md'))) {
    groups.push({ group: "What's New", pages: ['WHATS-NEW'] });
  }

  // "Product Guides" — docs/guides/*.md
  const guidesDir = join(docsDir, 'guides');
  if (existsSync(guidesDir)) {
    const guides = readdirSync(guidesDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => `guides/${basename(f, '.md')}`);
    if (guides.length > 0) {
      groups.push({ group: 'Product Guides', pages: guides });
    }
  }

  // "System Overview" — OVERVIEW.md
  if (existsSync(join(docsDir, 'OVERVIEW.md'))) {
    groups.push({ group: 'System Overview', pages: ['OVERVIEW'] });
  }

  return groups;
}

/**
 * Generate the full mint.json object.
 * @param {string} docsDir  absolute path to docs/
 * @param {string} projectName
 * @returns {object}
 */
export function generateMintJson(docsDir, projectName) {
  return {
    name: projectName,
    navigation: buildNavigation(docsDir),
    colors: { primary: '#0D9373' },
  };
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
node --test tests/scripts/generate-mint-json.test.mjs 2>&1 | tail -10
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-mint-json.mjs tests/scripts/generate-mint-json.test.mjs
git commit -m "feat(mintlify): add generate-mint-json.mjs with buildNavigation and generateMintJson"
```

---

## Task 2: Add main() CLI entry + smoke test

**Files:**
- Modify: `scripts/generate-mint-json.mjs`

**Interfaces:**
- CLI: `node scripts/generate-mint-json.mjs --config <path>` — writes `docs/mint.json`

- [ ] **Step 1: Append main() to generate-mint-json.mjs**

```js
// ---- CLI entry ----

async function main() {
  const args = process.argv.slice(2);
  const configPath = args[args.indexOf('--config') + 1] ?? join(REPO_ROOT, 'docs-sync', 'config.json');

  if (!existsSync(configPath)) {
    console.error(`[generate-mint-json] Config not found: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const docsDir = resolve(REPO_ROOT, config.docs?.output_dir ?? 'docs');
  const projectName = config.mintlify?.project_name ?? 'Project Docs';

  const mint = generateMintJson(docsDir, projectName);
  const outPath = join(docsDir, 'mint.json');
  writeFileSync(outPath, JSON.stringify(mint, null, 2) + '\n', 'utf8');
  console.log(`[generate-mint-json] Wrote ${outPath} (${mint.navigation.length} navigation groups)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
```

- [ ] **Step 2: Run tests — confirm still passing**

```bash
node --test tests/scripts/generate-mint-json.test.mjs 2>&1 | tail -10
```

Expected: 7 PASS

- [ ] **Step 3: Smoke-test CLI**

```bash
node scripts/generate-mint-json.mjs --config docs-sync/config.example.json 2>&1
```

Expected: prints "Wrote docs/mint.json (N navigation groups)" without error.

- [ ] **Step 4: Verify mint.json is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/mint.json','utf8')); console.log('valid')"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-mint-json.mjs docs/mint.json
git commit -m "feat(mintlify): add CLI entry to generate-mint-json.mjs"
```

---

## Task 3: Add Phase 3f (mint.json) and Phase 5b (WHATS-NEW.md) to update-docs.md

**Files:**
- Modify: `.claude/commands/update-docs.md`

- [ ] **Step 1: Add Phase 3f after Phase 3e**

Insert between Phase 3e and Phase 4:

```markdown
## Phase 3f — mint.json sync

Regenerate `docs/mint.json` **only** if any guide was added, renamed, or deleted in this run (i.e., `entry.status` is `A`, `R`, or `D` for a file in `docs/guides/`). Routine `M` (modified) pushes do not touch `mint.json`.

If regeneration is needed:
```bash
node scripts/generate-mint-json.mjs --config <config>
```

This writes `docs/mint.json` with the current navigation structure. The script is idempotent — re-running on the same docs/ state produces identical output.

**First-run:** If `docs/mint.json` does not exist at all, always generate it regardless of the diff.

**Skip Phase 3f** if `config.mintlify.enabled` is `false` or not set.
```

- [ ] **Step 2: Add Phase 5b after Phase 5**

Insert between Phase 5 (Changelog) and Phase 6 (Deliver):

```markdown
## Phase 5b — What's New

Append one plain-language entry to `docs/WHATS-NEW.md`. Same trigger as Phase 5 (Changelog) — runs on every push.

**Format:**

```markdown
## <Month YYYY>
- <What changed for the user — one line per change>
- Fixed: <what was broken and how it behaves now>
```

**Rules:**
- No code references — no file names, no function names, no technical terms
- Write for a customer support agent: "Checkout now supports PayPal", not "Added PayPal handler to src/checkout/PaymentSelector.jsx"
- Append only — never rewrite existing entries
- Dedupe: if the latest entry in WHATS-NEW.md is already for this month and covers the same changes, skip
- If `docs/WHATS-NEW.md` does not exist, create it with the entry as the first content
- **Skip Phase 5b** if `config.mintlify.enabled` is `false` or not set
```

- [ ] **Step 3: Update Phase 6 deliver summary**

Add to the interactive summary in Phase 6:

```markdown
- WHATS-NEW.md: entry appended | skipped
- mint.json: regenerated | skipped
```

- [ ] **Step 4: Verify phase ordering**

```bash
grep -n "^## Phase" .claude/commands/update-docs.md
```

Expected order:
```
Phase 0, Phase 0b, Phase 1, Phase 2, Phase 3, Phase 3b, Phase 3c, Phase 3d, Phase 3e, Phase 3f, Phase 4, Phase 5, Phase 5b, Phase 6
```

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/update-docs.md
git commit -m "feat(mintlify): add Phase 3f (mint.json sync) and Phase 5b (WHATS-NEW.md)"
```

---

## Task 4: adopt.sh — print Mintlify setup instructions

**Files:**
- Modify: `scripts/adopt.sh`

**What:** After `--ingest` completes, print clear instructions for connecting the repo to Mintlify.

- [ ] **Step 1: Find the ingest block added in docs-ingestion plan**

```bash
grep -n "ingest\|INGEST\|mintlify" scripts/adopt.sh | head -20
```

Note the line where the ingest block ends (the `fi` closing the `if [[ $INGEST -eq 1 ]]` block).

- [ ] **Step 2: Add Mintlify instructions inside the INGEST block, after consolidation**

Inside the `if [[ $INGEST -eq 1 && $DRY_RUN -eq 0 ]]` block, append after the `node ... ingest-docs.mjs` call:

```bash
    # Generate initial mint.json
    if [[ -f "$PROJECT_ROOT/docs-sync/config.json" ]]; then
      node "$BLUEPRINT_RESOLVED/scripts/generate-mint-json.mjs" \
        --config "$PROJECT_ROOT/docs-sync/config.json" || true
    fi

    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "  Mintlify setup (one-time)"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "  1. Go to https://mintlify.com and create an account"
    log "  2. New project → Connect GitHub → select this repo"
    log "  3. Set docs folder: docs/"
    log "  4. Set branch: master (or your default branch)"
    log "  5. Update docs-sync/config.json:"
    log "       mintlify.enabled: true"
    log "       mintlify.project_name: \"<Your Project Name>\""
    log "  6. Push — Mintlify will auto-deploy on every push"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

- [ ] **Step 3: Verify no syntax errors in adopt.sh**

```bash
bash -n scripts/adopt.sh && echo "syntax ok"
```

Expected: `syntax ok`

- [ ] **Step 4: Commit**

```bash
git add scripts/adopt.sh
git commit -m "feat(mintlify): print setup instructions after --ingest in adopt.sh"
```

---

## Task 5: Full test suite + push

- [ ] **Step 1: Run full test suite**

```bash
node --test tests/scripts/collect-doc-changes.test.mjs tests/scripts/extract-symbols.test.mjs tests/scripts/ingest-docs.test.mjs tests/scripts/generate-mint-json.test.mjs 2>&1
```

Expected: all tests PASS, 0 failures.

- [ ] **Step 2: Verify mint.json is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/mint.json','utf8')); console.log('valid')"
```

- [ ] **Step 3: Verify adopt.sh syntax**

```bash
bash -n scripts/adopt.sh && echo "syntax ok"
```

- [ ] **Step 4: Verify phase ordering in update-docs.md**

```bash
grep -n "^## Phase" .claude/commands/update-docs.md
```

Expected: Phase 0 through Phase 6 in order with all sub-phases present.

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review Against Spec

| Spec requirement | Task |
|-----------------|------|
| mint.json auto-generated and kept in sync | Task 1+2 generate-mint-json.mjs |
| Navigation: What's New, Product Guides, System Overview groups | Task 1 buildNavigation |
| mint.json only regenerates on A/R/D entries | Task 3 Phase 3f trigger |
| mint.json first-run always generates | Task 3 Phase 3f |
| Skip when mintlify.enabled is false | Task 3 Phase 3f + 5b |
| WHATS-NEW.md append-only, plain language | Task 3 Phase 5b rules |
| WHATS-NEW.md: no code references | Task 3 Phase 5b rules |
| WHATS-NEW.md deduplication | Task 3 Phase 5b dedup rule |
| adopt.sh prints Mintlify setup instructions | Task 4 |
| config mintlify block | docs-ingestion plan Task 5 |
| Per-file code docs NOT in mint.json navigation | Task 1 buildNavigation (only guides/, OVERVIEW, WHATS-NEW) |
