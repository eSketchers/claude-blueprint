// guard.test.mjs — tests for .claude/hooks/guard.sh (Tier 1 hook-failure-recovery fix).
//
// Run: node --test tests/hooks/guard.test.mjs
//
// guard.sh wraps a hook invocation so that failures are logged persistently
// to ~/.claude-agency/hook-errors.log instead of only showing up as an
// ephemeral transcript notice. The critical invariant under test: guard.sh
// must be fully transparent to Claude Code's own hook exit-code semantics
// (see https://code.claude.com/docs/en/hooks.md) — exit 2 (blocking) must
// stay exit 2, exit 1 (non-blocking) must stay exit 1, stdout/stderr must
// pass through byte-for-byte, and success must never write to the log.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const GUARD = join(REPO_ROOT, '.claude/hooks/guard.sh');

function makeHome() {
  return mkdtempSync(join(tmpdir(), 'agency-guard-test-'));
}

function writeScript(dir, name, body) {
  const p = join(dir, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

function runGuard(home, hookName, scriptPath, args = []) {
  return spawnSync(GUARD, [hookName, scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_AGENCY_HOME: home },
  });
}

function readErrorLog(home) {
  const p = join(home, 'hook-errors.log');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

test('guard.sh: exit 0 passes through untouched, no log entry written', () => {
  const home = makeHome();
  const scriptDir = mkdtempSync(join(tmpdir(), 'agency-guard-scripts-'));
  const script = writeScript(scriptDir, 'good.sh', 'echo "out"; echo "err" >&2; exit 0');

  const result = runGuard(home, 'test-good', script);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'out\n');
  assert.equal(result.stderr, 'err\n');
  assert.deepEqual(readErrorLog(home), []);
});

test('guard.sh: exit 1 (non-blocking per Claude Code semantics) is preserved exactly, and logged', () => {
  const home = makeHome();
  const scriptDir = mkdtempSync(join(tmpdir(), 'agency-guard-scripts-'));
  const script = writeScript(scriptDir, 'bad.sh', 'echo "partial output"; echo "boom: something broke" >&2; exit 1');

  const result = runGuard(home, 'test-bad', script);

  assert.equal(result.status, 1, 'guard.sh must not change the wrapped hook\'s exit code');
  assert.equal(result.stdout, 'partial output\n');
  assert.match(result.stderr, /boom: something broke/);

  const log = readErrorLog(home);
  assert.equal(log.length, 1);
  assert.equal(log[0].hook, 'test-bad');
  assert.equal(log[0].exit_code, 1);
  assert.match(log[0].stderr, /boom: something broke/);
  assert.ok(log[0].ts);
});

test('guard.sh: exit 2 (blocking per Claude Code semantics) is preserved exactly — critical, must never be swallowed or remapped', () => {
  const home = makeHome();
  const scriptDir = mkdtempSync(join(tmpdir(), 'agency-guard-scripts-'));
  const script = writeScript(scriptDir, 'blocking.sh', 'echo "block this action" >&2; exit 2');

  const result = runGuard(home, 'test-blocking', script);

  assert.equal(result.status, 2, 'exit 2 must reach Claude Code unchanged or the action will not actually be blocked');
  assert.match(result.stderr, /block this action/);

  const log = readErrorLog(home);
  assert.equal(log.length, 1);
  assert.equal(log[0].exit_code, 2);
});

test('guard.sh: a crashing/missing script (e.g. command not found) is caught, not fatal to guard.sh itself', () => {
  const home = makeHome();
  const missing = join(tmpdir(), 'this-script-does-not-exist-' + Date.now() + '.sh');

  const result = runGuard(home, 'test-crash', missing);

  assert.notEqual(result.status, 0);
  assert.equal(result.status, 127, 'shell "command not found" convention');

  const log = readErrorLog(home);
  assert.equal(log.length, 1);
  assert.equal(log[0].hook, 'test-crash');
  assert.equal(log[0].exit_code, 127);
});

test('guard.sh: forwards extra arguments to the wrapped script', () => {
  const home = makeHome();
  const scriptDir = mkdtempSync(join(tmpdir(), 'agency-guard-scripts-'));
  const script = writeScript(scriptDir, 'args.sh', 'echo "args: $*"; exit 0');

  const result = runGuard(home, 'test-args', script, ['prompt_submit', 'extra']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'args: prompt_submit extra\n');
});

test('guard.sh: multiple failures append to the log rather than overwrite it', () => {
  const home = makeHome();
  const scriptDir = mkdtempSync(join(tmpdir(), 'agency-guard-scripts-'));
  const script = writeScript(scriptDir, 'bad.sh', 'exit 1');

  runGuard(home, 'first-failure', script);
  runGuard(home, 'second-failure', script);
  runGuard(home, 'third-failure', script);

  const log = readErrorLog(home);
  assert.equal(log.length, 3);
  assert.deepEqual(log.map(l => l.hook), ['first-failure', 'second-failure', 'third-failure']);
});

test('guard.sh: creates ~/.claude-agency/ if it does not exist yet (fresh machine)', () => {
  const home = join(mkdtempSync(join(tmpdir(), 'agency-guard-fresh-')), 'does-not-exist-yet');
  const scriptDir = mkdtempSync(join(tmpdir(), 'agency-guard-scripts-'));
  const script = writeScript(scriptDir, 'bad.sh', 'exit 1');

  const result = runGuard(home, 'test-fresh-home', script);

  assert.equal(result.status, 1);
  assert.ok(existsSync(join(home, 'hook-errors.log')));
});

test('guard.sh: long stderr is truncated in the log so one runaway hook cannot balloon the log file', () => {
  const home = makeHome();
  const scriptDir = mkdtempSync(join(tmpdir(), 'agency-guard-scripts-'));
  const longMsg = 'x'.repeat(5000);
  const script = writeScript(scriptDir, 'verbose.sh', `echo "${longMsg}" >&2; exit 1`);

  const result = runGuard(home, 'test-verbose', script);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim().length, 5000, 'full stderr should still reach Claude Code / the transcript');

  const log = readErrorLog(home);
  assert.ok(log[0].stderr.length <= 510, 'the persisted log line should be capped, not the passthrough stderr');
});
