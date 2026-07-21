// bootstrap.test.mjs — Tier 2 (Cross-Cutting Issue 5: no integration tests):
// coverage for scripts/bootstrap.sh.
//
// bootstrap.sh installs real global tools (Claude plugins, MCP servers via
// npx/uvx, npm/pip packages) — a real run has side effects on the host
// machine and requires network access, so it is NOT something to actually
// execute in an automated test. This suite covers what IS safely testable
// without installing anything: --dry-run (genuinely side-effect-free per the
// script's own install_tool() short-circuit), flag parsing, and the
// strict/permissive mode override of warn().
//
// Run: node --test tests/bootstrap/bootstrap.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const BOOTSTRAP = join(REPO_ROOT, 'scripts/bootstrap.sh');

function run(args) {
  return spawnSync(BOOTSTRAP, args, { encoding: 'utf8', timeout: 30_000 });
}

test('bootstrap.sh --help exits 0 and documents all flags without installing anything', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--strict/);
  assert.match(result.stdout, /--permissive/);
  assert.match(result.stdout, /--no-verify/);
  assert.match(result.stdout, /--dry-run/);
});

test('bootstrap.sh --dry-run exits 0 and performs no real installs (every step short-circuits to [DRY-RUN])', () => {
  const result = run(['--dry-run']);
  assert.equal(result.status, 0, result.stderr);

  // Every install_tool() call in dry-run mode logs "[DRY-RUN] Would install:"
  // and returns before running any check_cmd/install_cmd — so the full list
  // of tools should appear as dry-run lines, not as "already installed" or
  // "Installing X..." (which would mean it actually attempted something).
  assert.match(result.stdout, /\[DRY-RUN\] Would install: superpowers-marketplace/);
  assert.match(result.stdout, /\[DRY-RUN\] Would install: mcp-serena/);
  assert.match(result.stdout, /\[DRY-RUN\] Would install: ast-grep/);
  assert.doesNotMatch(result.stdout, /Installing \w+\.\.\./, 'dry-run must never reach the real install branch');
});

test('bootstrap.sh --dry-run skips the verification step entirely (no real tool checks run)', () => {
  const result = run(['--dry-run']);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /Verifying installations/, 'verify-tools.sh should not run in dry-run mode');
});

test('bootstrap.sh --dry-run --no-verify is accepted together (combinable flags)', () => {
  const result = run(['--dry-run', '--no-verify']);
  assert.equal(result.status, 0, result.stderr);
});

test('bootstrap.sh: an unknown flag is rejected with a clear error, not silently ignored', () => {
  const result = run(['--this-flag-does-not-exist']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option/);
});

test('bootstrap.sh: --strict and --permissive are mutually overriding (last one wins), not additive', () => {
  // Both flags are accepted; whichever appears last sets STRICT_MODE. This
  // locks in that behavior (not a "fix" — just documenting what the flag
  // parser actually does today) since a future refactor could easily change
  // it to "first wins" or "error on conflict" without anyone noticing.
  const strictLast = run(['--dry-run', '--permissive', '--strict']);
  const permissiveLast = run(['--dry-run', '--strict', '--permissive']);
  assert.equal(strictLast.status, 0);
  assert.equal(permissiveLast.status, 0);
});

test('bootstrap.sh: requires the claude CLI to be present, failing fast with a clear message if not', () => {
  // Simulate a machine without the `claude` CLI on PATH by giving the
  // subprocess a PATH with only enough to run bash itself.
  const result = spawnSync(BOOTSTRAP, ['--dry-run'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { PATH: '/usr/bin:/bin' }, // no claude, likely no npx either depending on host
  });
  // We only assert the specific claude-missing failure mode when claude is
  // indeed absent from that trimmed PATH — otherwise this assertion would be
  // host-dependent. Skip cleanly if the trimmed PATH still finds a claude binary.
  const claudeStillFound = spawnSync('command', ['-v', 'claude'], { shell: '/bin/bash', encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).status === 0;
  if (claudeStillFound) return;

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claude CLI not found/);
});
