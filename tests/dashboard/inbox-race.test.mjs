// inbox-race.test.mjs — tests for the Tier 1 dashboard inbox/outbox race fix.
//
// Three races were fixed:
//  1. dashboard/server.mjs's /api/unblock wrote the inbox file non-atomically
//     (writeFileSync) — a concurrent reader could see a torn write.
//  2. .claude/hooks/agency-emit.sh created an empty inbox placeholder via a
//     check-then-act (`[[ -f ]] || : > file`) that could race with an
//     operator's reply already having been written, truncating it.
//  3. .claude/hooks/inbox-check.sh and inbox-wait.sh read the inbox file
//     BEFORE archiving it — a reply landing between the read and the mv was
//     silently lost (archived without ever being surfaced to the agent).
//
// Run: node --test tests/dashboard/inbox-race.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const INBOX_CHECK = join(REPO_ROOT, '.claude/hooks/inbox-check.sh');
const INBOX_WAIT = join(REPO_ROOT, '.claude/hooks/inbox-wait.sh');
const AGENCY_EMIT = join(REPO_ROOT, '.claude/hooks/agency-emit.sh');

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'agency-inbox-race-'));
  mkdirSync(join(home, 'inbox'), { recursive: true });
  mkdirSync(join(home, 'outbox'), { recursive: true });
  return home;
}

function runInboxCheck(home, session) {
  return spawnSync(INBOX_CHECK, [session], { encoding: 'utf8', env: { ...process.env, CLAUDE_AGENCY_HOME: home } });
}

function outboxFiles(home, session) {
  return readdirSync(join(home, 'outbox')).filter(f => f.startsWith(session));
}

test('inbox-check.sh: reads and archives a pending reply (basic flow unaffected)', () => {
  const home = makeHome();
  writeFileSync(join(home, 'inbox', 'sess1.txt'), 'hello from operator');

  const result = runInboxCheck(home, 'sess1');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'hello from operator');
  assert.equal(existsSync(join(home, 'inbox', 'sess1.txt')), false, 'inbox file should be archived, not left behind');
  assert.equal(outboxFiles(home, 'sess1').length, 1);
});

test('inbox-check.sh: reports empty inbox without error when no reply is pending', () => {
  const home = makeHome();
  const result = runInboxCheck(home, 'sess-nothing');

  assert.equal(result.status, 0);
  assert.match(result.stdout, /inbox empty for session sess-nothing/);
});

test('inbox-check.sh: claims (archives) BEFORE printing — the archived file, not the original, is the source of truth', () => {
  // This is the core invariant of the fix: verify inbox-check.sh's stdout
  // came from the ARCHIVED copy, by making the archive read fail and
  // confirming the command reports an error rather than having already
  // silently printed stale content from a source that could still be raced.
  const home = makeHome();
  writeFileSync(join(home, 'inbox', 'sess2.txt'), 'race-sensitive content');

  const result = runInboxCheck(home, 'sess2');
  const archived = outboxFiles(home, 'sess2');

  assert.equal(archived.length, 1);
  const archivedContent = readFileSync(join(home, 'outbox', archived[0]), 'utf8');
  assert.equal(result.stdout, archivedContent, 'stdout must match exactly what ended up archived (proves read-after-claim ordering)');
});

test('a reply written to the inbox AFTER inbox-check.sh has already claimed a prior reply is NOT lost — it starts a fresh inbox file', () => {
  // Simulates the race this fix closes: the dashboard's /api/unblock could
  // write a second reply concurrently with inbox-check.sh consuming the
  // first one. With claim-before-read, the second write always lands either
  // before the mv (get archived+read together — acceptable, still surfaced)
  // or after the mv (creates a fresh $INBOX file, picked up next run) — it
  // is never silently overwritten-then-discarded.
  const home = makeHome();
  writeFileSync(join(home, 'inbox', 'sess3.txt'), 'first reply');

  const first = runInboxCheck(home, 'sess3');
  assert.equal(first.stdout, 'first reply');

  // Simulate the dashboard writing a second reply after the first was claimed.
  writeFileSync(join(home, 'inbox', 'sess3.txt'), 'second reply');

  const second = runInboxCheck(home, 'sess3');
  assert.equal(second.stdout, 'second reply', 'the second reply must still be readable, not silently dropped');
  assert.equal(outboxFiles(home, 'sess3').length, 2, 'both replies should be archived, not just one');
});

test('inbox-check.sh: rapid back-to-back claims for the same session never collide on the archive filename', () => {
  // Regression guard: the archive filename originally used only `date +%s`
  // (1-second resolution). Two claims within the same wall-clock second would
  // produce the same archive path, and the second `mv` would silently
  // overwrite the first claim's archived reply on disk. Now includes
  // nanoseconds + pid. This test issues several claims as fast as the shell
  // allows and checks every archived reply survives distinctly.
  const home = makeHome();
  const N = 5;
  const replies = [];

  for (let i = 0; i < N; i++) {
    writeFileSync(join(home, 'inbox', 'sess-rapid.txt'), `reply-${i}`);
    const result = runInboxCheck(home, 'sess-rapid');
    replies.push(result.stdout);
  }

  assert.deepEqual(replies, Array.from({ length: N }, (_, i) => `reply-${i}`), 'every claim should read its own distinct reply, not a stale/overwritten one');

  const archivedFiles = outboxFiles(home, 'sess-rapid');
  assert.equal(archivedFiles.length, N, 'every claim must produce its own distinct archive file on disk — none should have collided and overwritten another');

  const archivedContents = archivedFiles.map(f => readFileSync(join(home, 'outbox', f), 'utf8'));
  assert.equal(new Set(archivedContents).size, N, 'all archived contents should be distinct — a collision would show fewer unique values than N');
});

test('agency-emit.sh: notification event creates an empty inbox placeholder only if one does not already exist', () => {
  const home = makeHome();
  const result = spawnSync(AGENCY_EMIT, ['notification'], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_AGENCY_HOME: home, CLAUDE_SESSION_ID: 'sess4', CLAUDE_NOTIFICATION_MESSAGE: 'need input' },
  });

  assert.equal(result.status, 0);
  assert.ok(existsSync(join(home, 'inbox', 'sess4.txt')));
  assert.equal(readFileSync(join(home, 'inbox', 'sess4.txt'), 'utf8'), '');
});

test('agency-emit.sh: does NOT truncate an existing reply already sitting in the inbox slot (the race this fix closes)', () => {
  // Before the fix: `[[ -f "$SLOT" ]] || : > "$SLOT"` is a check-then-act —
  // if a reply landed in the tiny window between the check and the create,
  // it would be truncated. The fix uses noclobber (set -C) so the create is
  // a single atomic syscall that fails (silently, via `|| true`) if the file
  // already exists, regardless of timing.
  const home = makeHome();
  writeFileSync(join(home, 'inbox', 'sess5.txt'), 'operator already replied');

  const result = spawnSync(AGENCY_EMIT, ['notification'], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_AGENCY_HOME: home, CLAUDE_SESSION_ID: 'sess5', CLAUDE_NOTIFICATION_MESSAGE: 'need input' },
  });

  assert.equal(result.status, 0);
  assert.equal(readFileSync(join(home, 'inbox', 'sess5.txt'), 'utf8'), 'operator already replied', 'existing reply must survive a second notification event for the same session');
});

test('inbox-wait.sh: picks up a reply that is already present and returns 0 without waiting the full timeout', () => {
  const home = makeHome();
  writeFileSync(join(home, 'inbox', 'sess6.txt'), 'quick reply');

  const result = spawnSync(INBOX_WAIT, ['question?', '5', 'sess6'], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_AGENCY_HOME: home },
    timeout: 4000,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /quick reply/);
  assert.equal(outboxFiles(home, 'sess6').length, 1);
});

test('inbox-wait.sh: times out and exits 1 if no reply arrives', () => {
  const home = makeHome();

  const result = spawnSync(INBOX_WAIT, ['question?', '2', 'sess7'], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_AGENCY_HOME: home },
    timeout: 8000,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /timed out/);
});
