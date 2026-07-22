// precommit-and-preview.test.mjs — Tier 2 remaining-MEDIUM-issues work
// (2026-07-20): Adoption Issue 6 (pre-commit config selection manual) and
// Adoption Issue 3 (no adoption preview mode).
//
// scripts/adopt.sh already auto-selected the correct pre-commit template
// from the detected framework(s) — that part of Issue 6 was already done.
// The one real gap was no way to OVERRIDE the auto-selection; this file
// tests the new --precommit-template flag that fills it.
//
// For Issue 3, --dry-run already existed but never showed real diffs for
// files that would be MODIFIED (only "would create/would modify" commands).
// This file tests the new --dry-run --diff combination, which computes the
// real merge/overwrite result and diffs it against the existing file.
//
// Run: node --test tests/adopt/precommit-and-preview.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const ADOPT = join(REPO_ROOT, 'scripts/adopt.sh');

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), 'adopt-precommit-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

function runAdopt(dir, args) {
  return spawnSync(ADOPT, args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT },
    timeout: 30_000,
  });
}

// ---------- --precommit-template ----------

test('--precommit-template node forces the Node template for a Python project', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--precommit-template', 'node']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /does not match detected framework/, 'should warn about the mismatch');

    const config = readFileSync(join(dir, '.pre-commit-config.yaml'), 'utf8');
    const nodeTemplate = readFileSync(join(REPO_ROOT, 'pre-commit/.pre-commit-config.node.yaml'), 'utf8');
    assert.equal(config, nodeTemplate);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--precommit-template python forces the Python template and matches without a warning for a Python project', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--precommit-template', 'python']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /does not match detected framework/);

    const config = readFileSync(join(dir, '.pre-commit-config.yaml'), 'utf8');
    const pythonTemplate = readFileSync(join(REPO_ROOT, 'pre-commit/.pre-commit-config.python.yaml'), 'utf8');
    assert.equal(config, pythonTemplate);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--precommit-template merged forces the merged config even for a single framework', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--precommit-template', 'merged']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /forced by --precommit-template merged/);

    const config = readFileSync(join(dir, '.pre-commit-config.yaml'), 'utf8');
    assert.match(config, /black/, 'merged config should include python hooks');
    assert.match(config, /eslint/, 'merged config should include node hooks even though only python was requested');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--precommit-template rejects an invalid value', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--precommit-template', 'rust']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid --precommit-template/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('without --precommit-template, auto-detection still works exactly as before (regression guard)', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python']);
    assert.equal(result.status, 0, result.stderr);
    const config = readFileSync(join(dir, '.pre-commit-config.yaml'), 'utf8');
    const pythonTemplate = readFileSync(join(REPO_ROOT, 'pre-commit/.pre-commit-config.python.yaml'), 'utf8');
    assert.equal(config, pythonTemplate);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('multi-framework adoption still auto-merges correctly without an explicit override (regression guard)', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--frameworks', 'python,nextjs']);
    assert.equal(result.status, 0, result.stderr);
    const config = readFileSync(join(dir, '.pre-commit-config.yaml'), 'utf8');
    assert.match(config, /black/);
    assert.match(config, /eslint/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- --dry-run --diff ----------

test('--dry-run without --diff does not print a unified diff (existing behavior unchanged)', () => {
  const dir = freshProject();
  try {
    runAdopt(dir, ['--framework', 'python']); // real adopt first
    const result = runAdopt(dir, ['--framework', 'python', '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    // adopt.sh indents diff output (`sed 's/^/    /'`), so match with leading
    // whitespace allowed; without --diff there should be no "---"/"+++" pair at all.
    assert.doesNotMatch(result.stdout, /^\s*---\s/m, 'no unified diff header without --diff');
    assert.match(result.stdout, /Merge blueprint sections into/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--dry-run --diff shows a real unified diff for the CLAUDE.md merge, and does not modify the file', () => {
  const dir = freshProject();
  try {
    runAdopt(dir, ['--framework', 'python']); // real adopt first

    const before = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    // Add a user section after the markers, like a real user would.
    writeFileSync(join(dir, 'CLAUDE.md'), before + '\n## My Custom Section\nSome custom notes.\n');
    const withUserSection = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');

    const result = runAdopt(dir, ['--framework', 'python', '--dry-run', '--diff']);
    assert.equal(result.status, 0, result.stderr);
    // adopt.sh indents diff lines (`sed 's/^/    /'`) before printing them.
    assert.match(result.stdout, /^\s*---\s/m, 'expected a unified diff header');
    assert.match(result.stdout, /^\s*\+\+\+\s/m);

    // File on disk must be completely untouched by a dry run.
    const after = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    assert.equal(after, withUserSection, '--dry-run must never modify CLAUDE.md, even with --diff');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--dry-run --diff with --merge-strategy overwrite shows a diff against the full replacement, not just a "would cp" line', () => {
  const dir = freshProject();
  try {
    runAdopt(dir, ['--framework', 'python']);
    const before = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    writeFileSync(join(dir, 'CLAUDE.md'), before + '\nExtra line that overwrite will discard.\n');

    const result = runAdopt(dir, ['--framework', 'python', '--dry-run', '--diff', '--merge-strategy', 'overwrite']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^\s*---\s/m);
    assert.match(result.stdout, /-Extra line that overwrite will discard\./, 'diff should show the discarded line being removed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DRY RUN completion message says nothing was written, distinct from a real adoption', () => {
  const dir = freshProject();
  try {
    const dryResult = runAdopt(dir, ['--framework', 'python', '--dry-run']);
    assert.equal(dryResult.status, 0, dryResult.stderr);
    assert.match(dryResult.stdout, /DRY RUN complete — nothing was written/);
    assert.doesNotMatch(dryResult.stdout, /Adoption complete\./, 'dry-run must not claim adoption completed');

    const realResult = runAdopt(dir, ['--framework', 'python']);
    assert.equal(realResult.status, 0, realResult.stderr);
    assert.match(realResult.stdout, /Adoption complete\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
