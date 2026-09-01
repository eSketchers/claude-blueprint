// graphify-hook.test.mjs — Token Optimization Issue 3 ("Graphify not
// incremental by default") tests for scripts/adopt.sh's graphify git-hook
// integration.
//
// Key finding that shaped this fix: the design doc's original spec assumed
// adopt.sh would need to hand-write a `.git/hooks/post-commit` script
// calling `graphify update --incremental`. Investigation of the vendored
// graphify tool found it already ships a mature, idempotent `graphify hook
// install` subcommand — installs both post-commit AND post-checkout hooks,
// respects core.hooksPath (Husky), and calls an AST-only, no-LLM, per-file
// cached rebuild. The actual gap was narrower: adopt.sh never called it.
//
// Testing strategy (revised as part of HIGH PRIORITY Issue 3 of the
// 2026-08-26 codebase audit): the real `graphifyy` package (pinned to the
// exact version scripts/bootstrap.sh installs — see PINNED_VERSION below)
// is installed into an isolated venv and exercised for real in the tests
// that can observe genuine CLI behavior (a real hook install actually
// writing .git/hooks/post-commit + post-checkout). A mock binary is kept
// only for the two scenarios a real CLI can't be made to simulate on
// demand: an install command that fails, and graphify being absent from
// PATH entirely. This replaces the previous all-mock approach, which
// existed only because this test environment's system Python (3.9) was
// below graphify's >=3.10 requirement — an isolated venv solves that
// without needing a newer system Python.
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

// Must match scripts/bootstrap.sh's pinned `graphifyy==X.Y.Z` version exactly
// — the whole point of pinning is that this is the one version everything
// in this repo is verified against.
const PINNED_VERSION = '0.9.50';

/**
 * Ensures a real, pinned-version `graphify` CLI is available on PATH for
 * this test run, installing it into an isolated venv (never global) if not
 * already present at REPO_ROOT/.venv-graphify — the same location used
 * throughout this repo's own graphify-based tooling. Returns the bin dir to
 * prepend to PATH, or null if it couldn't be set up (e.g. no python3.10+
 * available), in which case tests requiring the real CLI are skipped rather
 * than failed — this keeps the suite green on a machine that genuinely has
 * no way to get a compatible Python, while still running for real wherever
 * one exists (including CI, which now provisions Python 3.11 for this job).
 */
function ensureRealGraphify() {
  const venvDir = join(REPO_ROOT, '.venv-graphify');
  const binDir = join(venvDir, 'bin');
  const graphifyBin = join(binDir, 'graphify');

  if (existsSync(graphifyBin)) {
    const version = spawnSync(graphifyBin, ['--version'], { encoding: 'utf8' }).stdout.trim();
    if (version.includes(PINNED_VERSION)) return binDir;
  }

  // Find a usable Python >=3.10, checking generic names first (what
  // actions/setup-python and most local installs actually expose on PATH)
  // before falling back to version-specific binaries — don't assume either
  // naming convention.
  const candidates = ['python3', 'python', 'python3.12', 'python3.11', 'python3.10'];
  let pythonBin = null;
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ['-c', 'import sys; exit(0 if sys.version_info >= (3, 10) else 1)']);
    if (check.status === 0) { pythonBin = candidate; break; }
  }
  if (!pythonBin) return null;

  mkdirSync(venvDir, { recursive: true });
  const venvResult = spawnSync(pythonBin, ['-m', 'venv', venvDir], { encoding: 'utf8' });
  if (venvResult.status !== 0) return null;

  const installResult = spawnSync(join(binDir, 'pip'), ['install', '--quiet', `graphifyy==${PINNED_VERSION}`], { encoding: 'utf8' });
  if (installResult.status !== 0) return null;

  return binDir;
}

const REAL_GRAPHIFY_BIN = ensureRealGraphify();

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

/** A mock `graphify` binary on a scratch PATH dir, recording its invocations to a log file. Used only for scenarios a real CLI can't be made to simulate on demand (a failing install, or graphify being absent). */
function makeMockGraphify(callLogPath, { fail = false } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'graphify-mock-bin-'));
  const script = join(binDir, 'graphify');
  writeFileSync(script, `#!/usr/bin/env bash\necho "$@" >> "${callLogPath}"\n${fail ? 'exit 1' : 'exit 0'}\n`);
  chmodSync(script, 0o755);
  return binDir;
}

function runAdopt(dir, args, { graphifyBinDir, noGraphify = false } = {}) {
  const env = { ...process.env, BLUEPRINT_DIR: REPO_ROOT };
  if (noGraphify) {
    // Strip any real graphify from PATH, and don't add one — simulates "not installed".
    env.PATH = (process.env.PATH || '').split(':').filter(p => !p.includes('graphify')).join(':');
  } else if (graphifyBinDir) {
    env.PATH = `${graphifyBinDir}:${process.env.PATH || ''}`;
  }
  return spawnSync(ADOPT, args, { cwd: dir, encoding: 'utf8', env, timeout: 60_000 });
}

test('adopt.sh actually installs real post-commit + post-checkout git hooks via the real, pinned graphify CLI', { skip: !REAL_GRAPHIFY_BIN && 'no Python >=3.10 available to install the real graphify CLI' }, () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python'], { graphifyBinDir: REAL_GRAPHIFY_BIN });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(dir, '.git/hooks/post-commit')), 'graphify should have installed a real post-commit hook');
    assert.ok(existsSync(join(dir, '.git/hooks/post-checkout')), 'graphify should have installed a real post-checkout hook');
    const hookContent = readFileSync(join(dir, '.git/hooks/post-commit'), 'utf8');
    assert.match(hookContent, /graphify/i, 'the installed hook should actually reference graphify, not be an empty stub');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--dry-run prints "graphify hook install" as a DRY line and never actually invokes it', { skip: !REAL_GRAPHIFY_BIN && 'no Python >=3.10 available to install the real graphify CLI' }, () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--dry-run'], { graphifyBinDir: REAL_GRAPHIFY_BIN });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY: graphify hook install/);
    assert.equal(existsSync(join(dir, '.git/hooks/post-commit')), false, 'graphify must not actually install hooks during --dry-run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--no-graphify-hook skips the hook install entirely, with no mention of graphify', { skip: !REAL_GRAPHIFY_BIN && 'no Python >=3.10 available to install the real graphify CLI' }, () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--framework', 'python', '--no-graphify-hook'], { graphifyBinDir: REAL_GRAPHIFY_BIN });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(dir, '.git/hooks/post-commit')), false, 'graphify hooks must not be installed when --no-graphify-hook is passed');
    assert.doesNotMatch(result.stdout + result.stderr, /graphify/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
  // A real CLI can't be told to fail on demand — a controllable mock is the
  // right tool for this specific scenario, unlike the tests above.
  const dir = freshProject();
  const callLog = join(dir, 'graphify-calls.log');
  const mockBin = makeMockGraphify(callLog, { fail: true });
  try {
    const result = runAdopt(dir, ['--framework', 'python'], { graphifyBinDir: mockBin });
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
