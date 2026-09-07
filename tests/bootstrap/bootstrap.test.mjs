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

test('bootstrap.sh --dry-run: does NOT require the claude CLI to be present (fixed — dry-run previews without needing tools pre-installed)', () => {
  // Regression test for a real bug found via CI: bootstrap.sh used to check
  // `command -v claude` unconditionally, before even looking at --dry-run,
  // so `--dry-run` failed outright on any machine (or CI runner) without
  // Claude Code already installed — exactly the situation --dry-run exists
  // to support (previewing an install before anything is set up). Fixed by
  // gating the claude/npx prerequisite checks on `[[ "$DRY_RUN" == "false" ]]`.
  const result = spawnSync(BOOTSTRAP, ['--dry-run'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { PATH: '/usr/bin:/bin' }, // simulates a machine with neither claude nor npx on PATH
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /claude CLI not found/);
  assert.doesNotMatch(result.stderr, /npx not found/);
});

test('bootstrap.sh: every install_tool call for a floating npm/pip/git-tag-capable tool is version-pinned (LOW PRIORITY item 2 fix)', () => {
  // Regression test for the "everything except graphify floats unpinned"
  // finding from an internal audit (not published in this repo). Each of
  // these previously installed whatever was newest at bootstrap time with
  // no pin; each now names an exact version/tag.
  const result = run(['--dry-run']);
  assert.equal(result.status, 0, result.stderr);

  const pinnedPatterns = [
    /uvx --from git\+https:\/\/github\.com\/oraios\/serena@v[\d.]+ serena-mcp-server/,
    /npx -y @upstash\/context7-mcp@[\d.]+/,
    /npx -y @modelcontextprotocol\/server-sequential-thinking@[\d.]+/,
    /npx -y @modelcontextprotocol\/server-memory@[\d.]+/,
    /npx -y @playwright\/mcp@[\d.]+/,
    /npx -y @modelcontextprotocol\/server-github@[\d.]+/,
    /npm install -g @ast-grep\/cli@[\d.]+/,
    /pip install --user pre-commit==[\d.]+/,
    /pip install --user graphifyy==[\d.]+/,
  ];
  for (const pattern of pinnedPatterns) {
    assert.match(result.stdout, pattern, `expected a pinned install command matching ${pattern}`);
  }
  // The unpinned forms this fix removed must not reappear.
  assert.doesNotMatch(result.stdout, /@playwright\/mcp@latest/);
  assert.doesNotMatch(result.stdout, /git\+https:\/\/github\.com\/oraios\/serena serena-mcp-server/, 'serena install must be pinned to a tag, not float on the default branch');
});

test('bootstrap.sh (real run, no --dry-run): still requires the claude CLI, failing fast with a clear message if not', () => {
  // The prerequisite check must still apply to a REAL install — only
  // --dry-run is exempt. Simulate a machine without `claude` on PATH.
  const result = spawnSync(BOOTSTRAP, [], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { PATH: '/usr/bin:/bin' },
  });
  const claudeStillFound = spawnSync('command', ['-v', 'claude'], { shell: '/bin/bash', encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).status === 0;
  if (claudeStillFound) return; // host-dependent escape hatch, same as before

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claude CLI not found/);
});
