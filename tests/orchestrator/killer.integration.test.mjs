// killer.integration.test.mjs — proves Killer.kill() actually terminates a
// real detached process group, including a grandchild process the top-level
// process spawns — the exact shape of `claude -p /ticket ...` potentially
// forking git/test-runner/etc. subprocesses.
//
// Run: node --test tests/orchestrator/killer.integration.test.mjs
//
// Skipped automatically on platforms without POSIX process groups (Windows).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';

import { Killer, isAlive } from '../../orchestrator/killer.mjs';

const skip = platform() === 'win32';

function makeRegistry(initial = {}) {
  const tickets = { ...initial };
  return {
    get(id) { return tickets[id] || null; },
    update(id, patch) { tickets[id] = { ...tickets[id], ...patch }; },
    list() { return Object.values(tickets); },
  };
}

function makeNotifier() {
  return { notify: async () => {} };
}

/**
 * Spawn a detached shell that itself forks a grandchild (`sleep 60 &`), mirroring
 * spawn.mjs's `detached: true` — the shell is the process-group leader, and the
 * background `sleep` is a grandchild inside the same group.
 */
function spawnDetachedTree() {
  const child = spawn('sh', ['-c', 'sleep 60 & echo "grandchild pid: $!"; wait'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  child.unref();

  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/grandchild pid: (\d+)/);
      if (m) {
        child.stdout.off('data', onData);
        resolve({ parentPid: child.pid, grandchildPid: Number(m[1]) });
      }
    };
    child.stdout.on('data', onData);
    child.on('error', reject);
    setTimeout(() => reject(new Error('timed out waiting for grandchild pid')), 5000);
  });
}

test('kill(): SIGTERM to the process group also kills a grandchild process, not just the parent', { skip }, async () => {
  const { parentPid, grandchildPid } = await spawnDetachedTree();

  assert.ok(isAlive(parentPid), 'parent should be running before kill');
  assert.ok(isAlive(grandchildPid), 'grandchild should be running before kill');

  const registry = makeRegistry({ t1: { id: 't1', status: 'halted', spawned_pid: parentPid } });
  const killer = new Killer({ registry, notifier: makeNotifier(), graceMs: 2000 });

  killer.kill('t1', parentPid, 'killswitch active');

  // Give the OS a moment to actually deliver/process the signal.
  await new Promise(r => setTimeout(r, 300));

  assert.ok(!isAlive(parentPid), 'parent should be dead after SIGTERM to the group');
  assert.ok(!isAlive(grandchildPid), 'grandchild should also be dead — this is the point of signaling the group, not just the pid');
});

test('kill(): escalates to real SIGKILL against a process that ignores SIGTERM', { skip }, async () => {
  // trap SIGTERM and ignore it, so only SIGKILL can actually stop this one.
  const child = spawn('sh', ['-c', 'trap "" TERM; sleep 60'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  await new Promise(r => setTimeout(r, 200)); // let the trap install

  assert.ok(isAlive(child.pid));

  const registry = makeRegistry({ t1: { id: 't1', status: 'halted', spawned_pid: child.pid } });
  const killer = new Killer({ registry, notifier: makeNotifier(), graceMs: 300 });

  killer.kill('t1', child.pid, 'ticket cap hit');

  // Still alive right after SIGTERM (it's trapped/ignored).
  await new Promise(r => setTimeout(r, 100));
  assert.ok(isAlive(child.pid), 'SIGTERM is trapped, process should survive it');

  // After the grace period, SIGKILL should have landed and it cannot be trapped.
  await new Promise(r => setTimeout(r, 500));
  assert.ok(!isAlive(child.pid), 'SIGKILL should terminate the process even though it ignored SIGTERM');
});
