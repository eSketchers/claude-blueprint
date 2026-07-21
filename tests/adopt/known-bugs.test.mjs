// known-bugs.test.mjs — regression tests for two bugs found and fixed in
// scripts/adopt.sh while adding integration test coverage (Tier 2 /
// Cross-Cutting Issue 5), then fixed as a follow-up (Tier 3 cleanup):
//
//  1. macOS-only: nested-mode detection failed when the OS temp dir was
//     reached via a symlink (e.g. /var -> /private/var), because SCRIPT_PATH
//     was resolved with a logical `pwd` while PROJECT_ROOT (via `git
//     rev-parse --show-toplevel`) is always canonicalized. Fixed by using
//     `pwd -P` for both SCRIPT_PATH and PROJECT_ROOT.
//  2. OS-agnostic: `--uninstall` and `--doctor` died with "No frameworks
//     specified" because framework validation ran unconditionally before
//     ACTION dispatch, even though neither action touches
//     FRAMEWORK/FRAMEWORKS/PROFILE. Fixed by gating that whole block on
//     `ACTION == "adopt"`.
//
// This file now asserts the FIXED behavior directly (no more `test.todo()` —
// see git history for the prior version of this file, written when the bugs
// were only documented, not yet fixed).
//
// Run: node --test tests/adopt/known-bugs.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:os';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const ADOPT = join(REPO_ROOT, 'scripts/adopt.sh');

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), 'adopt-bugfix-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

test('FIXED (macOS): nested-mode adoption succeeds when the project dir is reached via a symlinked path', { skip: platform() !== 'darwin' }, () => {
  const dir = freshProject();
  try {
    mkdirSync(join(dir, '.agency'));
    cpSync(REPO_ROOT, join(dir, '.agency'), { recursive: true });

    const result = spawnSync(join(dir, '.agency/scripts/adopt.sh'), ['--framework', 'python'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 30_000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Mode: nested/);
    assert.ok(existsSync(join(dir, '.claude', '.adopted-from-blueprint')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FIXED: --uninstall works without a framework flag, since uninstall never needed one', () => {
  const dir = freshProject();
  try {
    const adopted = spawnSync(ADOPT, ['--framework', 'python'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT }, timeout: 30_000,
    });
    assert.equal(adopted.status, 0, adopted.stderr);
    assert.ok(existsSync(join(dir, '.claude')));

    const uninstalled = spawnSync(ADOPT, ['--uninstall'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT }, timeout: 30_000,
    });

    assert.equal(uninstalled.status, 0, uninstalled.stderr);
    assert.equal(existsSync(join(dir, '.claude')), false, '.claude/ should be removed by uninstall');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FIXED: --doctor works without a framework flag, and its dead-symlink detection actually runs', () => {
  // Adopt once with a blueprint copy, then delete that copy so the symlinks
  // it created point nowhere — doctor should detect this and exit non-zero,
  // driven by its OWN logic (not an upstream "no frameworks" failure, which
  // is what made the pre-fix version of this test pass for the wrong reason).
  const dir = freshProject();
  const blueprintCopy = mkdtempSync(join(tmpdir(), 'adopt-bugfix-blueprint-'));
  cpSync(REPO_ROOT, blueprintCopy, { recursive: true });

  try {
    const adopted = spawnSync(ADOPT, ['--framework', 'python'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, BLUEPRINT_DIR: blueprintCopy }, timeout: 30_000,
    });
    assert.equal(adopted.status, 0, adopted.stderr);

    rmSync(blueprintCopy, { recursive: true, force: true }); // orphan the symlinks

    const result = spawnSync(ADOPT, ['--doctor', '--quiet'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT }, timeout: 30_000,
    });

    assert.notEqual(result.status, 0, 'doctor should report dead symlinks, not fail on missing --framework');
    assert.doesNotMatch(result.stderr, /No frameworks specified/, 'the failure must come from real doctor logic, not framework validation');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FIXED: --doctor still works (and reports healthy) for a fresh, non-orphaned adoption', () => {
  const dir = freshProject();
  const adopted = spawnSync(ADOPT, ['--framework', 'python'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT }, timeout: 30_000,
  });
  assert.equal(adopted.status, 0, adopted.stderr);

  try {
    const result = spawnSync(ADOPT, ['--doctor', '--quiet'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT }, timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--adopt (the default action) still requires a framework flag — the fix only exempts uninstall/doctor', () => {
  const dir = freshProject();
  try {
    const result = spawnSync(ADOPT, [], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT }, timeout: 30_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No frameworks specified/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
