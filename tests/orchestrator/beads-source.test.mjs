// beads-source.test.mjs — coverage for orchestrator/sources/beads.mjs, the
// ticket source adapter for beads (https://github.com/gastownhall/beads), a
// Dolt-backed dependency-graph issue tracker.
//
// Uses a mock `bd` binary on a scratch PATH rather than a real install —
// same convention as tests/adopt/graphify-hook.test.mjs — so CI doesn't need
// Homebrew/Dolt. The mock's JSON responses are copied verbatim from a real
// local `bd` v1.1.0 run (see conversation history / PR description), not
// guessed, since a source module built against a guessed CLI schema is worse
// than not having one.
//
// Run: node --test tests/orchestrator/beads-source.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fetchBeads, claimBeadsTicket, closeBeadsTicket } from '../../orchestrator/sources/beads.mjs';

const READY_JSON = JSON.stringify([
  {
    id: 'beads-e2e-btf',
    title: 'Fix flaky test',
    status: 'open',
    priority: 0,
    issue_type: 'task',
    owner: 'fawadomersid@gmail.com',
    created_at: '2026-07-21T14:36:37Z',
    created_by: 'Fawad Omer',
    updated_at: '2026-07-21T14:36:37Z',
    dependency_count: 0,
    dependent_count: 0,
    comment_count: 0,
  },
  {
    id: 'beads-e2e-hk8',
    title: 'Wire up dashboard endpoint',
    status: 'open',
    priority: 1,
    issue_type: 'task',
    owner: 'fawadomersid@gmail.com',
    created_at: '2026-07-21T14:36:35Z',
    created_by: 'Fawad Omer',
    updated_at: '2026-07-21T14:36:35Z',
    labels: ['backend'],
    dependency_count: 0,
    dependent_count: 0,
    comment_count: 0,
  },
]);

const CLAIM_JSON = JSON.stringify([{
  id: 'beads-e2e-btf',
  title: 'Fix flaky test',
  status: 'in_progress',
  priority: 0,
  issue_type: 'task',
  assignee: 'Fawad Omer',
  owner: 'fawadomersid@gmail.com',
  created_at: '2026-07-21T14:36:37Z',
  created_by: 'Fawad Omer',
  updated_at: '2026-07-21T14:40:00Z',
  started_at: '2026-07-21T14:40:00Z',
}]);

const CLOSE_JSON = JSON.stringify([{
  id: 'beads-e2e-btf',
  title: 'Fix flaky test',
  status: 'closed',
  priority: 0,
  issue_type: 'task',
  assignee: 'Fawad Omer',
  owner: 'fawadomersid@gmail.com',
  created_at: '2026-07-21T14:36:37Z',
  created_by: 'Fawad Omer',
  updated_at: '2026-07-21T14:41:00Z',
  started_at: '2026-07-21T14:40:00Z',
  closed_at: '2026-07-21T14:41:00Z',
  close_reason: 'fixed in test run',
}]);

/**
 * A mock `bd` binary on a scratch PATH dir. Records every invocation (argv,
 * one per line) to a log file, and dispatches canned JSON responses based on
 * the subcommand so fetch/claim/close can each be tested independently.
 * Also emits the real `bd`'s stderr-only "beads.role not configured" warning
 * on every call, unmodified — the module under test must tolerate that
 * (Node's execFile keeps stdout/stderr separate; JSON.parse must never see
 * the warning text) rather than assuming clean stdout.
 */
function makeMockBd(callLogPath, { readyOutput = READY_JSON, exitCode = 0 } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'bd-mock-bin-'));
  const script = join(binDir, 'bd');
  writeFileSync(script, `#!/usr/bin/env bash
echo "$@" >> "${callLogPath}"
echo "warning: beads.role not configured (GH#2950)." >&2
case "$1" in
  ready)
    cat <<'EOF'
${readyOutput}
EOF
    ;;
  update)
    cat <<'EOF'
${CLAIM_JSON}
EOF
    ;;
  close)
    cat <<'EOF'
${CLOSE_JSON}
EOF
    ;;
  *)
    echo "unknown subcommand: $1" >&2
    exit 1
    ;;
esac
exit ${exitCode}
`);
  chmodSync(script, 0o755);
  return binDir;
}

function withMockBdOnPath(mockBinDir, fn) {
  const originalPath = process.env.PATH;
  process.env.PATH = `${mockBinDir}:${originalPath || ''}`;
  return Promise.resolve(fn()).finally(() => { process.env.PATH = originalPath; });
}

test('fetchBeads() maps bd ready --json rows into the standard ticket shape', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      const tickets = await fetchBeads({ name: 'test', repo_path: dir });
      assert.equal(tickets.length, 2);

      const [a, b] = tickets;
      assert.equal(a.id, 'bd:beads-e2e-btf');
      assert.equal(a.title, 'Fix flaky test');
      assert.equal(a.url, null);
      assert.equal(a.source, 'beads');
      assert.equal(a.source_name, 'test');
      assert.equal(a.repo_path, dir);
      assert.deepEqual(a.labels, [], 'ticket with no labels field should default to an empty array');
      assert.equal(a.kind, 'task');

      assert.equal(b.id, 'bd:beads-e2e-hk8');
      assert.deepEqual(b.labels, ['backend']);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('fetchBeads() ignores the mock\'s stderr warning banner — stdout is parsed cleanly as JSON', async () => {
  // Regression guard: a real `bd` run prints "warning: beads.role not
  // configured" on stderr on every invocation until `git config beads.role`
  // is set. If this module ever accidentally merged stdout+stderr (e.g. via
  // { stdio: 'pipe', shell: true } quirks or a naive exec() wrapper), the
  // warning text would corrupt JSON.parse and this test would catch it.
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      const tickets = await fetchBeads({ name: 'test', repo_path: dir });
      assert.equal(tickets.length, 2, 'JSON.parse must succeed despite the stderr warning line');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('fetchBeads() calls "bd ready --json" with cwd set to repo_path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      await fetchBeads({ name: 'test', repo_path: dir });
      const { readFileSync } = await import('node:fs');
      const calls = readFileSync(callLog, 'utf8').trim().split('\n');
      assert.deepEqual(calls, ['ready --json']);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('fetchBeads() honors an explicit BEADS_DIR override', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const mockBin = mkdtempSync(join(tmpdir(), 'bd-mock-bin-'));
  const script = join(mockBin, 'bd');
  const envDumpLog = join(dir, 'env.log');
  writeFileSync(script, `#!/usr/bin/env bash
echo "BEADS_DIR=$BEADS_DIR" >> "${envDumpLog}"
echo '${READY_JSON}'
`);
  chmodSync(script, 0o755);
  try {
    await withMockBdOnPath(mockBin, async () => {
      await fetchBeads({ name: 'test', repo_path: dir, beads_dir: '/custom/.beads' });
      const { readFileSync } = await import('node:fs');
      const log = readFileSync(envDumpLog, 'utf8');
      assert.match(log, /BEADS_DIR=\/custom\/\.beads/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('fetchBeads() respects cfg.limit by truncating the result', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      const tickets = await fetchBeads({ name: 'test', repo_path: dir, limit: 1 });
      assert.equal(tickets.length, 1);
      assert.equal(tickets[0].id, 'bd:beads-e2e-btf');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('fetchBeads() throws a clear, prefixed error when bd exec fails (e.g. not installed)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const originalPath = process.env.PATH;
  // Strip any real/mock bd from PATH entirely.
  process.env.PATH = '/usr/bin:/bin';
  try {
    await assert.rejects(
      () => fetchBeads({ name: 'test', repo_path: dir }),
      /\[source:beads:test\] bd exec failed/,
    );
  } finally {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fetchBeads() requires repo_path', async () => {
  await assert.rejects(
    () => fetchBeads({ name: 'test' }),
    /missing 'repo_path'/,
  );
});

test('fetchBeads() returns an empty array if bd prints non-JSON garbage instead of erroring', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const mockBin = mkdtempSync(join(tmpdir(), 'bd-mock-bin-'));
  const script = join(mockBin, 'bd');
  writeFileSync(script, `#!/usr/bin/env bash\necho "not json at all"\n`);
  chmodSync(script, 0o755);
  try {
    await withMockBdOnPath(mockBin, async () => {
      const tickets = await fetchBeads({ name: 'test', repo_path: dir });
      assert.deepEqual(tickets, []);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('claimBeadsTicket() calls "bd update <id> --claim --json" with the ticket\'s bd id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      const ticket = { _bd_id: 'beads-e2e-btf', _repo_path: dir, _beads_dir: null };
      await claimBeadsTicket(ticket);
      const { readFileSync } = await import('node:fs');
      const calls = readFileSync(callLog, 'utf8').trim().split('\n');
      assert.deepEqual(calls, ['update beads-e2e-btf --claim --json']);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('claimBeadsTicket() is a no-op (does not call bd at all) for a ticket with no _bd_id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      await claimBeadsTicket({ id: 'gh:org/repo#1' }); // e.g. a GitHub-sourced ticket
      const { existsSync } = await import('node:fs');
      assert.equal(existsSync(callLog), false, 'bd must never be invoked for a non-beads ticket');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('closeBeadsTicket() calls "bd close <id> --reason <reason> --json"', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      const ticket = { _bd_id: 'beads-e2e-btf', _repo_path: dir, _beads_dir: null };
      await closeBeadsTicket(ticket, 'fixed in test run');
      const { readFileSync } = await import('node:fs');
      const calls = readFileSync(callLog, 'utf8').trim().split('\n');
      assert.deepEqual(calls, ['close beads-e2e-btf --reason fixed in test run --json']);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('closeBeadsTicket() defaults reason to "completed" when not given', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      const ticket = { _bd_id: 'beads-e2e-btf', _repo_path: dir, _beads_dir: null };
      await closeBeadsTicket(ticket);
      const { readFileSync } = await import('node:fs');
      const calls = readFileSync(callLog, 'utf8').trim().split('\n');
      assert.deepEqual(calls, ['close beads-e2e-btf --reason completed --json']);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});

test('closeBeadsTicket() is a no-op for a ticket with no _bd_id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beads-source-test-'));
  const callLog = join(dir, 'bd-calls.log');
  const mockBin = makeMockBd(callLog);
  try {
    await withMockBdOnPath(mockBin, async () => {
      await closeBeadsTicket({ id: 'fs:local:1' });
      const { existsSync } = await import('node:fs');
      assert.equal(existsSync(callLog), false);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mockBin, { recursive: true, force: true });
  }
});
