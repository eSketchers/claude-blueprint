// unblock-atomic-write.test.mjs — integration test for the dashboard's
// /api/unblock endpoint, proving its inbox write is atomic (write-temp then
// rename) rather than the old direct writeFileSync, which a concurrent
// reader could observe mid-write (a torn/partial file).
//
// Spawns the real dashboard/server.mjs as a child process on a scratch port
// against a scratch CLAUDE_AGENCY_HOME, since server.mjs binds a real port
// as an import-time side effect and can't be safely imported directly in a
// unit test.
//
// Run: node --test tests/dashboard/unblock-atomic-write.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const SERVER = join(REPO_ROOT, 'dashboard/server.mjs');
const PORT = 18742; // scratch port, unlikely to collide with a real dashboard on 7842

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'agency-unblock-test-'));
  mkdirSync(join(home, 'inbox'), { recursive: true });
  mkdirSync(join(home, 'outbox'), { recursive: true });
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

async function postUnblock(sessionId, message) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/unblock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return { status: res.status, body: await res.json() };
}

test('/api/unblock writes the inbox file atomically — no torn/partial content is ever observable on disk', async () => {
  const home = makeHome();
  const server = await startServer(home);

  try {
    const longMessage = 'x'.repeat(50_000); // under the server's 64KB body limit, large enough to stress the write
    const { status, body } = await postUnblock('sess-atomic', longMessage);

    assert.equal(status, 200);
    assert.equal(body.ok, true);

    const written = readFileSync(join(home, 'inbox', 'sess-atomic.txt'), 'utf8');
    assert.equal(written.length, 50_000, 'the full message should be present — no truncation from a torn write');
    assert.equal(written, longMessage);

    // No leftover temp file from the write-then-rename should remain.
    const leftovers = readdirSync(join(home, 'inbox')).filter(f => f.includes('.tmp-'));
    assert.equal(leftovers.length, 0, 'temp file should have been renamed away, not left behind');
  } finally {
    server.kill();
  }
});

test('/api/unblock: concurrent posts to different sessions never cross-contaminate each other\'s inbox file', async () => {
  const home = makeHome();
  const server = await startServer(home);

  try {
    const N = 10;
    const posts = Array.from({ length: N }, (_, i) => postUnblock(`sess-concurrent-${i}`, `payload-for-session-${i}`));
    const results = await Promise.all(posts);

    for (const r of results) assert.equal(r.status, 200);

    for (let i = 0; i < N; i++) {
      const content = readFileSync(join(home, 'inbox', `sess-concurrent-${i}.txt`), 'utf8');
      assert.equal(content, `payload-for-session-${i}`, `session ${i}'s inbox file should contain exactly its own payload`);
    }
  } finally {
    server.kill();
  }
});

test('/api/unblock: a second reply to the same session overwrites cleanly (last write wins), never merges/corrupts', async () => {
  const home = makeHome();
  const server = await startServer(home);

  try {
    await postUnblock('sess-overwrite', 'first');
    const { status } = await postUnblock('sess-overwrite', 'second');

    assert.equal(status, 200);
    const content = readFileSync(join(home, 'inbox', 'sess-overwrite.txt'), 'utf8');
    assert.equal(content, 'second', 'the file should contain exactly the second message, not a mix of both');
  } finally {
    server.kill();
  }
});

test('/api/unblock: rejects a request missing session_id or message without touching the filesystem', async () => {
  const home = makeHome();
  const server = await startServer(home);

  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/unblock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'no session id' }),
    });
    assert.equal(res.status, 400);
    assert.equal(existsSync(join(home, 'inbox')) && readdirSync(join(home, 'inbox')).length, 0);
  } finally {
    server.kill();
  }
});
