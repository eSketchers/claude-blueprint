// graphify-hook.test.mjs — Token Optimization Issue 3 ("Graphify not
// incremental by default") tests for scripts/adopt.sh's new graphify
// git-hook integration.
//
// Key finding that shaped this fix: the design doc's original spec assumed
// adopt.sh would need to hand-write a `.git/hooks/post-commit` script
// calling `graphify update --incremental`. Investigation of the vendored
// graphify tool (vendor/graphify/graphify/hooks.py) found it already ships
// a mature, idempotent `graphify hook install` subcommand — installs both
// post-commit AND post-checkout hooks, respects core.hooksPath (Husky),
// appends to an existing hook rather than clobbering it, and calls
// `_rebuild_code()` (AST-only, no LLM, per-file cache) under the hood. The
// actual gap was narrower: adopt.sh never called it. This fix just wires
// the existing capability into the adoption flow, using a mock `graphify`
// binary (a real Python-package install would need Python 3.10+, which this
// test environment doesn't have) that just records how it was invoked.
//
// Run: node --test tests/adopt/graphify-hook.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const ADOPT = join(REPO_ROOT, 'scripts/adopt.sh');

function freshProject() {
  // Deliberately does NOT include "graphify" in the temp dir name — this test
  // asserts on the string "graphify" appearing in adopt.sh's own output, and
  // the project path itself gets printed (e.g. "Project: <path>"), which
  // would produce a false positive if the scratch dir name contained it.
  const dir = mkdtempSync(join(tmpdir(), 'adopt-hooktest-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

/** A mock `graphify` binary on a scratch PATH dir, recording its invocations to a log file. */
function makeMockGraphify(callLogPath, { fail = false } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'graphify-mock-bin-'));
  const script = join(binDir, 'graphify');
  writeFileSync(script, `#!/usr/bin/env bash\necho "$@" >> "${callLogPath}"\n${fail ? 'exit 1' : 'exit 0'}\n`);
  chmodSync(script, 0o755);
  return binDir;
}

function runAdopt(dir, args, { mockGraphifyDir, noGraphify = false } = {}) {
  const env = { ...process.env, BLUEPRINT_DIR: REPO_ROOT };
  if (noGraphify) {
    // Strip any real graphify from PATH, and don't add a mock — simulates "not installed".
    env.PATH = (process.env.PATH || '').split(':').filter(p => !p.includes('graphify')).join(':');
  } else if (mockGraphifyDir) {
    env.PATH = `${mockGraphifyDir}:${process.env.PATH || ''}`;
  }
  return spawnSync(ADOPT, args, { cwd: dir, encoding: 'utf8', env, timeout: 30_000 });
}

test('adopt.sh calls "graphify hook install" during a real adoption when graphify is on PATH', () => {
  const dir = freshProject();
  const callLog = join(dir, 'graphify-calls.log');
  const mockBin = makeMockGraphify(callLog);
  try {
    const result = runAdopt(dir, ['--framework', 'python'], { mockGraphifyDir: mockBin });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(callLog), 'the mock graphify binary should have been invoked');
    const calls = readFileSync(callLog, 'utf8').trim().split('\n');
    assert.ok(calls.includes('hook install'), `expected a "hook install" call, got: ${calls.join(' | ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('--dry-run prints "graphify hook install" as a DRY line and never actually invokes it', () => {
  const dir = freshProject();
  const callLog = join(dir, 'graphify-calls.log');
  const mockBin = makeMockGraphify(callLog);
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--dry-run'], { mockGraphifyDir: mockBin });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY: graphify hook install/);
    assert.equal(existsSync(callLog), false, 'graphify must not actually be invoked during --dry-run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('--no-graphify-hook skips the hook install entirely, with no mention of graphify', () => {
  const dir = freshProject();
  const callLog = join(dir, 'graphify-calls.log');
  const mockBin = makeMockGraphify(callLog);
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--no-graphify-hook'], { mockGraphifyDir: mockBin });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(callLog), false, 'graphify must not be invoked when --no-graphify-hook is passed');
    assert.doesNotMatch(result.stdout + result.stderr, /graphify/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('adoption completes successfully even when graphify is not installed at all (non-fatal)', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python'], { noGraphify: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /graphify not installed.*skipping/i);
    assert.ok(existsSync(join(dir, '.claude', '.adopted-from-blueprint')), 'adoption must still fully succeed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adoption completes successfully even when "graphify hook install" itself fails (non-fatal, warned)', () => {
  const dir = freshProject();
  const callLog = join(dir, 'graphify-calls.log');
  const mockBin = makeMockGraphify(callLog, { fail: true });
  try {
    const result = runAdopt(dir, ['--framework', 'python'], { mockGraphifyDir: mockBin });
    assert.equal(result.status, 0, result.stderr, 'a failing graphify hook install must not abort the whole adoption');
    assert.match(result.stderr, /graphify hook install failed \(non-fatal/);
    assert.ok(existsSync(join(dir, '.claude', '.adopted-from-blueprint')), 'adoption must still fully succeed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('the "not installed" message points to bootstrap.sh and the opt-out flag', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python'], { noGraphify: true });
    assert.match(result.stdout, /bootstrap\.sh/);
    assert.match(result.stdout, /--no-graphify-hook/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
