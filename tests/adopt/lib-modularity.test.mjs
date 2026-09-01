// lib-modularity.test.mjs — HIGH PRIORITY Issue 4 (2026-08-26 codebase
// audit): scripts/adopt.sh's complexity/growth problem. detect_frameworks(),
// smart_merge_claude_md()/generate_claude_md(), and generate_precommit_config()
// were extracted from adopt.sh (1012 -> 513 lines) into scripts/lib/*.sh.
//
// This file does NOT re-test the functions' behavior — that's already
// covered end-to-end by tests/adopt/monorepo-detection.test.mjs (19 tests),
// tests/adopt/precommit-and-preview.test.mjs, and scripts/test-adopt.sh
// (53 assertions across all 4 frameworks x 2 layouts), all of which still
// pass unchanged against the refactored adopt.sh. What this file proves is
// the actual point of the extraction: each lib file is genuinely
// independently sourceable and usable outside adopt.sh's dispatch flow,
// not just a cosmetic file split that still secretly depends on adopt.sh's
// internals to even parse.
//
// Run: node --test tests/adopt/lib-modularity.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const LIB_DIR = join(REPO_ROOT, 'scripts/lib');

test('detect-frameworks.sh is self-contained: sourceable and usable with nothing else defined', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lib-modularity-'));
  try {
    writeFileSync(join(dir, 'requirements.txt'), 'flask\n');
    const script = `set -euo pipefail\nsource "${LIB_DIR}/detect-frameworks.sh"\ndetect_frameworks "${dir}"`;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'python');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detect-frameworks.sh: workspace-glob scanning (the fix this refactor carried over) still works when sourced standalone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lib-modularity-'));
  try {
    writeFileSync(join(dir, 'lerna.json'), JSON.stringify({ packages: ['packages/*'] }));
    mkdirSync(join(dir, 'packages', 'api'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'api', 'requirements.txt'), 'flask\n');

    const script = `set -euo pipefail\nsource "${LIB_DIR}/detect-frameworks.sh"\ndetect_frameworks "${dir}"`;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'python');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claude-md.sh: smart_merge_claude_md() is sourceable and usable once its documented dependencies (log/warn, DRY_RUN, SHOW_DIFF) are provided', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lib-modularity-'));
  try {
    const targetFile = join(dir, 'CLAUDE.md');
    const sourceFile = join(dir, 'source.md');
    writeFileSync(targetFile, 'existing content, no markers\n');
    writeFileSync(sourceFile, 'new content\n');

    const script = `
      set -euo pipefail
      log()  { :; }
      warn() { :; }
      DRY_RUN=0
      SHOW_DIFF=0
      source "${LIB_DIR}/claude-md.sh"
      smart_merge_claude_md "${targetFile}" "${sourceFile}" overwrite
      cat "${targetFile}"
    `;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'new content\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('precommit-config.sh: generate_precommit_config() is sourceable and usable once its documented dependencies are provided', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lib-modularity-'));
  try {
    mkdirSync(join(dir, 'pre-commit'), { recursive: true });
    writeFileSync(join(dir, 'pre-commit', '.pre-commit-config.python.yaml'), 'repos: []\n');

    const script = `
      set -euo pipefail
      log()  { :; }
      warn() { :; }
      die()  { echo "die: $*" >&2; exit 1; }
      PROJECT_ROOT="${dir}/project"
      mkdir -p "$PROJECT_ROOT"
      BLUEPRINT_RESOLVED="${dir}"
      DRY_RUN=0
      PRECOMMIT_TEMPLATE=""
      source "${LIB_DIR}/precommit-config.sh"
      generate_precommit_config python
      cat "$PROJECT_ROOT/.pre-commit-config.yaml"
    `;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'repos: []\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('all three lib files parse cleanly on their own (bash -n), independent of adopt.sh', () => {
  for (const file of ['detect-frameworks.sh', 'claude-md.sh', 'precommit-config.sh']) {
    const result = spawnSync('bash', ['-n', join(LIB_DIR, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('adopt.sh shrank substantially and now only contains flag-parsing/dispatch, not the three extracted generators', () => {
  const adoptSh = spawnSync('cat', [join(REPO_ROOT, 'scripts/adopt.sh')], { encoding: 'utf8' }).stdout;
  const lineCount = adoptSh.split('\n').length;
  assert.ok(lineCount < 600, `expected adopt.sh to be well under 600 lines after extraction, got ${lineCount}`);
  assert.doesNotMatch(adoptSh, /^detect_frameworks\(\)/m, 'detect_frameworks should be sourced, not defined inline');
  assert.doesNotMatch(adoptSh, /^smart_merge_claude_md\(\)/m, 'smart_merge_claude_md should be sourced, not defined inline');
  assert.doesNotMatch(adoptSh, /^generate_precommit_config\(\)/m, 'generate_precommit_config should be sourced, not defined inline');
  assert.match(adoptSh, /source "\$BLUEPRINT_RESOLVED\/scripts\/lib\/detect-frameworks\.sh"/);
  assert.match(adoptSh, /source "\$BLUEPRINT_RESOLVED\/scripts\/lib\/claude-md\.sh"/);
  assert.match(adoptSh, /source "\$BLUEPRINT_RESOLVED\/scripts\/lib\/precommit-config\.sh"/);
});
