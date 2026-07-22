// agent-log-and-stats.test.mjs — integration tests for the dashboard's
// /api/agent-log/:ticket (Dashboard Issue 5: no agent output preview) and
// /api/agent-stats (reuses orchestrator/agent-stats.mjs, Agent System Issue 4).
//
// Spawns the real dashboard/server.mjs on a scratch port, same pattern as
// unblock-atomic-write.test.mjs, since server.mjs binds a real port as an
// import-time side effect and can't be safely imported in a unit test.
//
// Run: node --test tests/dashboard/agent-log-and-stats.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const SERVER = join(REPO_ROOT, 'dashboard/server.mjs');
const PORT = 18743; // distinct scratch port from unblock-atomic-write.test.mjs's 18742

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'agency-agentlog-test-'));
  mkdirSync(join(home, 'inbox'), { recursive: true });
  mkdirSync(join(home, 'outbox'), { recursive: true });
  mkdirSync(join(home, 'agent-logs'), { recursive: true });
  writeFileSync(join(home, 'events.jsonl'), '');
  return home;
}

async function startServer(home) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: REPO_ROOT,
    env: { ...process.env, AGENCY_PORT: String(PORT), CLAUDE_AGENCY_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    let out = '';
    const onData = (chunk) => {
      out += chunk.toString();
      if (out.includes('agency-dashboard')) { child.stdout.off('data', onData); resolve(); }
    };
    child.stdout.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`server exited early with code ${code}`)));
    setTimeout(() => reject(new Error('timed out waiting for server to start')), 5000);
  });

  return child;
}

async function get(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return { status: res.status, body: await res.json() };
}

test('/api/agent-log/:ticket returns the last N lines of a real log file', async () => {
  const home = makeHome();
  const logLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  writeFileSync(join(home, 'agent-logs', 'my-ticket.log'), logLines.join('\n') + '\n');

  const server = await startServer(home);
  try {
    const { status, body } = await get('/api/agent-log/my-ticket?lines=5');
    assert.equal(status, 200);
    assert.equal(body.found, true);
    // File has 20 real lines + a trailing "" from the final \n = 21 elements
    // after split('\n'); the last 5 of those are lines 16-19 plus that "".
    assert.deepEqual(body.lines, ['line 16', 'line 17', 'line 18', 'line 19', '']);
    assert.equal(body.total_lines, 21);
  } finally {
    server.kill();
  }
});

test('/api/agent-log/:ticket returns 404 with found:false for a ticket with no log file', async () => {
  const home = makeHome();
  const server = await startServer(home);
  try {
    const { status, body } = await get('/api/agent-log/no-such-ticket');
    assert.equal(status, 404);
    assert.equal(body.found, false);
    assert.deepEqual(body.lines, []);
  } finally {
    server.kill();
  }
});

test('/api/agent-log/:ticket sanitizes the ticket id the same way spawn.mjs does, preventing path traversal', async () => {
  const home = makeHome();
  const server = await startServer(home);
  try {
    const { status, body } = await get('/api/agent-log/' + encodeURIComponent('../../../etc/passwd'));
    assert.equal(status, 404, 'a traversal attempt must never resolve to a real file outside agent-logs/');
    assert.equal(body.found, false);
  } finally {
    server.kill();
  }
});

test('/api/agent-log/:ticket rejects a missing ticket id', async () => {
  const home = makeHome();
  const server = await startServer(home);
  try {
    const result = await fetch(`http://127.0.0.1:${PORT}/api/agent-log/`);
    assert.equal(result.status, 400);
  } finally {
    server.kill();
  }
});

test('/api/agent-log/:ticket caps the lines param at 1000 even if a larger value is requested', async () => {
  const home = makeHome();
  const bigLog = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n');
  writeFileSync(join(home, 'agent-logs', 'huge-ticket.log'), bigLog);

  const server = await startServer(home);
  try {
    const { body } = await get('/api/agent-log/huge-ticket?lines=999999');
    assert.ok(body.lines.length <= 1000, `expected <=1000 lines, got ${body.lines.length}`);
  } finally {
    server.kill();
  }
});

test('/api/agent-stats reuses orchestrator/agent-stats.mjs and reflects real events.jsonl content', async () => {
  const home = makeHome();
  writeFileSync(join(home, 'events.jsonl'), [
    JSON.stringify({ ts: 1000, kind: 'session_start', session_id: 's1', agent: 'backend-dev', agent_id: 'a1', ticket: 't1' }),
    JSON.stringify({ ts: 1100, kind: 'pre_tool', tool: 'Read', session_id: 's1', agent: 'backend-dev', agent_id: 'a1', ticket: 't1' }),
  ].join('\n') + '\n');

  const server = await startServer(home);
  try {
    const { status, body } = await get('/api/agent-stats?since=all');
    assert.equal(status, 200);
    assert.equal(body.agents.length, 1);
    assert.equal(body.agents[0].agent, 'backend-dev');
    assert.equal(body.agents[0].tool_calls, 1);
  } finally {
    server.kill();
  }
});

test('/api/agent-stats defaults to a 7d window when no ?since param is given', async () => {
  const home = makeHome();
  const server = await startServer(home);
  try {
    const { status, body } = await get('/api/agent-stats');
    assert.equal(status, 200);
    assert.equal(body.since, '7d');
  } finally {
    server.kill();
  }
});
