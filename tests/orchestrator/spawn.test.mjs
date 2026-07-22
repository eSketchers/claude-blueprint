// spawn.test.mjs — coverage for orchestrator/spawn.mjs, in particular the
// Orchestrator Issue 5 fix (session→ticket correlation): CLAUDE_SESSION_ID
// is now set to the ticket's own id before spawning, rather than left for
// Claude Code to generate its own UUID, so agency-emit.sh's hook events
// carry a predictable session_id that server.mjs can exact-match back to
// the ticket via registry.spawned_session_id.
//
// Run: node --test tests/orchestrator/spawn.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { spawnTicketAgent } from '../../orchestrator/spawn.mjs';

function makeTicket(overrides = {}) {
  return {
    ticket_id: 'gh:org/repo#42',
    ticket_url: 'https://github.com/org/repo/issues/42',
    repo_path: '/tmp',
    title: 'Test ticket',
    ...overrides,
  };
}

// spawn.mjs's log file always starts with a "cmd: <the exact command line>"
// header, so the literal source text of the child's -e script is echoed
// into the log verbatim. A naive marker like "console.log('SESSION_ID=' +
// ...)" therefore appears in the log BEFORE the process even runs, purely
// from the echoed header — any predicate checking for that literal string
// resolves instantly on the wrong content. To search only for the child's
// actual stdout, the marker must be built via concatenation/join in the
// child script so it never appears as one contiguous string in the source.
function markerScript(envVarExpr) {
  return `process.stdout.write(["MARK","BEGIN",(${envVarExpr}),"MARK","END"].join(":"))`;
}
const MARKER_RE = (value) => new RegExp(`MARK:BEGIN:${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:MARK:END`);

function waitForLogContent(logFile, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (existsSync(logFile)) {
        const content = readFileSync(logFile, 'utf8');
        if (predicate(content)) return resolve(content);
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`timed out waiting for log content in ${logFile}`));
      setTimeout(poll, 50);
    };
    poll();
  });
}

test('spawnTicketAgent() sets CLAUDE_SESSION_ID to the ticket_id for a real spawned process', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'spawn-test-logs-'));
  try {
    const ticket = makeTicket({ ticket_id: 'gh:org/repo#101' });
    const result = spawnTicketAgent(
      ticket,
      { command: 'node', args: ['-e', markerScript('process.env.CLAUDE_SESSION_ID')] },
      logDir,
    );
    assert.equal(result.dry_run, false);
    assert.ok(result.pid, 'should have a real pid');

    const content = await waitForLogContent(result.logFile, c => c.includes('MARK:END'));
    assert.match(content, MARKER_RE('gh:org/repo#101'));
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

test('spawnTicketAgent() overrides an explicit spec.env.CLAUDE_SESSION_ID with the ticket_id — predictable correlation always wins', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'spawn-test-logs-'));
  try {
    const ticket = makeTicket({ ticket_id: 'fs:local:my-ticket' });
    const result = spawnTicketAgent(
      ticket,
      {
        command: 'node',
        args: ['-e', markerScript('process.env.CLAUDE_SESSION_ID')],
        env: { CLAUDE_SESSION_ID: 'some-other-value-that-should-be-overridden' },
      },
      logDir,
    );
    const content = await waitForLogContent(result.logFile, c => c.includes('MARK:END'));
    assert.match(content, MARKER_RE('fs:local:my-ticket'));
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

test('spawnTicketAgent() --dry-run never actually spawns a process', () => {
  const logDir = mkdtempSync(join(tmpdir(), 'spawn-test-logs-'));
  try {
    const ticket = makeTicket();
    const result = spawnTicketAgent(
      ticket,
      { command: 'node', args: ['-e', 'process.exit(0)'], dry_run: true },
      logDir,
    );
    assert.equal(result.dry_run, true);
    assert.equal(result.pid, null);
    assert.equal(result.logFile, null);
    assert.match(result.command, /^DRY-RUN would spawn:/);
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});

test('spawnTicketAgent() still passes through the rest of process.env alongside CLAUDE_SESSION_ID', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'spawn-test-logs-'));
  try {
    const ticket = makeTicket({ ticket_id: 'gh:org/repo#7' });
    const result = spawnTicketAgent(
      ticket,
      {
        command: 'node',
        args: ['-e', markerScript('process.env.MY_CUSTOM_VAR + "|" + process.env.CLAUDE_SESSION_ID')],
        env: { MY_CUSTOM_VAR: 'hello' },
      },
      logDir,
    );
    const content = await waitForLogContent(result.logFile, c => c.includes('MARK:END'));
    assert.match(content, MARKER_RE('hello|gh:org/repo#7'));
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});
