// killer.test.mjs — unit tests for orchestrator/killer.mjs (Tier 0 force-kill fix).
//
// Run: node --test tests/orchestrator/killer.test.mjs
//
// These use injected fake kill/isAlive/registry/notifier so they run fast and
// don't touch real processes. See killer.integration.test.mjs for a real
// process-group kill using actual child processes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Killer } from '../../orchestrator/killer.mjs';

function makeRegistry(initial = {}) {
  const tickets = { ...initial };
  return {
    tickets,
    updates: [],
    get(id) { return tickets[id] || null; },
    update(id, patch) {
      tickets[id] = { ...tickets[id], ...patch };
      this.updates.push({ id, patch });
    },
    list() { return Object.values(tickets); },
  };
}

function makeNotifier() {
  const calls = [];
  return { calls, notify: async (kind, payload) => { calls.push({ kind, payload }); } };
}

function makeFakeProcess({ aliveUntilKilled = 'never' } = {}) {
  // aliveUntilKilled: 'never' | 'sigterm' | 'sigkill' — which signal actually stops the "process"
  let stopped = false;
  const signals = [];
  return {
    signals,
    kill(pid, signal) {
      signals.push({ pid, signal });
      if (aliveUntilKilled === 'sigterm' && signal === 'SIGTERM') stopped = true;
      if (aliveUntilKilled === 'sigkill' && signal === 'SIGKILL') stopped = true;
    },
    isAlive() { return !stopped; },
  };
}

test('kill(): sends SIGTERM to the negative pid (process group), not the bare pid', () => {
  const registry = makeRegistry({ t1: { id: 't1', spawned_pid: 4242, status: 'halted' } });
  const notifier = makeNotifier();
  const fake = makeFakeProcess({ aliveUntilKilled: 'sigterm' });
  const killer = new Killer({ registry, notifier, graceMs: 30_000, kill: fake.kill, isAlive: () => fake.isAlive() });

  killer.kill('t1', 4242, 'killswitch active');

  assert.equal(fake.signals.length, 1);
  assert.deepEqual(fake.signals[0], { pid: -4242, signal: 'SIGTERM' });
  assert.equal(registry.get('t1').kill_signal, 'SIGTERM');
});

test('kill(): escalates to SIGKILL after graceMs if SIGTERM did not stop it', () => {
  const registry = makeRegistry({ t1: { id: 't1', spawned_pid: 99, status: 'halted' } });
  const notifier = makeNotifier();
  const fake = makeFakeProcess({ aliveUntilKilled: 'sigkill' });
  const killer = new Killer({ registry, notifier, graceMs: 20, kill: fake.kill, isAlive: () => fake.isAlive() });

  killer.kill('t1', 99, 'ticket cap hit');

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(fake.signals.length, 2);
      assert.deepEqual(fake.signals[0], { pid: -99, signal: 'SIGTERM' });
      assert.deepEqual(fake.signals[1], { pid: -99, signal: 'SIGKILL' });
      assert.equal(registry.get('t1').kill_signal, 'SIGKILL');
      assert.ok(registry.get('t1').killed_at);
      assert.ok(notifier.calls.some(c => c.kind === 'error' && /Force-killed/.test(c.payload.title)));
      resolve();
    }, 40);
  });
});

test('kill(): does not escalate if the process exits after SIGTERM within the grace period', () => {
  const registry = makeRegistry({ t1: { id: 't1', spawned_pid: 7, status: 'halted' } });
  const notifier = makeNotifier();
  const fake = makeFakeProcess({ aliveUntilKilled: 'sigterm' });
  const killer = new Killer({ registry, notifier, graceMs: 20, kill: fake.kill, isAlive: () => fake.isAlive() });

  killer.kill('t1', 7, 'killswitch active');

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(fake.signals.length, 1, 'should not have sent SIGKILL once SIGTERM succeeded');
      assert.equal(registry.get('t1').killed_at !== undefined, true);
      resolve();
    }, 40);
  });
});

test('kill(): is a no-op (no signal sent) if the pid is already dead', () => {
  const registry = makeRegistry({ t1: { id: 't1', spawned_pid: 5, status: 'halted' } });
  const notifier = makeNotifier();
  const signals = [];
  const killer = new Killer({
    registry, notifier, graceMs: 30_000,
    kill: (pid, signal) => signals.push({ pid, signal }),
    isAlive: () => false,
  });

  killer.kill('t1', 5, 'killswitch active');

  assert.equal(signals.length, 0);
  assert.equal(registry.get('t1').kill_signal, null);
});

test('kill(): does not schedule a second SIGKILL timer if called again while one is pending', () => {
  const registry = makeRegistry({ t1: { id: 't1', spawned_pid: 11, status: 'halted' } });
  const notifier = makeNotifier();
  const fake = makeFakeProcess({ aliveUntilKilled: 'never' });
  const killer = new Killer({ registry, notifier, graceMs: 50, kill: fake.kill, isAlive: () => fake.isAlive() });

  killer.kill('t1', 11, 'killswitch active');
  killer.kill('t1', 11, 'killswitch active'); // duplicate call — e.g. re-entrant sweep + onEvent race
  killer.kill('t1', 11, 'killswitch active');

  assert.equal(fake.signals.filter(s => s.signal === 'SIGTERM').length, 1, 'only the first call should send SIGTERM');
  assert.ok(killer.isPending('t1'));
});

test('kill(): missing pid is a no-op', () => {
  const registry = makeRegistry({ t1: { id: 't1', status: 'halted' } });
  const notifier = makeNotifier();
  const signals = [];
  const killer = new Killer({ registry, notifier, kill: (pid, sig) => signals.push({ pid, sig }) });

  killer.kill('t1', null, 'killswitch active');
  killer.kill('t1', undefined, 'killswitch active');

  assert.equal(signals.length, 0);
});

test('sweep(): kills active tickets that budget.shouldHalt() flags, and marks them halted', () => {
  const registry = makeRegistry({
    running: { id: 'running', status: 'in_progress', spawned_pid: 100 },
    clean:   { id: 'clean',   status: 'in_progress', spawned_pid: 101 },
    done:    { id: 'done',    status: 'done',         spawned_pid: 102 },
  });
  const notifier = makeNotifier();
  const fake = makeFakeProcess({ aliveUntilKilled: 'sigterm' });
  const killer = new Killer({ registry, notifier, kill: fake.kill, isAlive: () => fake.isAlive() });

  const budget = {
    shouldHalt(id) {
      return id === 'running' ? { halt: true, reason: 'killswitch active' } : { halt: false };
    },
  };

  killer.sweep(budget);

  assert.equal(registry.get('running').status, 'halted');
  assert.equal(registry.get('clean').status, 'in_progress');
  assert.equal(registry.get('done').status, 'done');
  assert.equal(fake.signals.length, 1);
  assert.deepEqual(fake.signals[0], { pid: -100, signal: 'SIGTERM' });
  assert.ok(notifier.calls.some(c => c.kind === 'budget_cap' && c.payload.ticket_id === 'running'));
});

test('sweep(): catches a ticket already marked halted (e.g. by onEvent) that never got killed', () => {
  // Simulates a hung agent: status flipped to 'halted' by a prior event, but
  // the agent then stopped emitting events entirely, so onEvent()'s kill call
  // never fired. The sweep is the only thing that will still kill it.
  const registry = makeRegistry({
    stuckHalted: { id: 'stuckHalted', status: 'halted', halt_reason: 'ticket cap hit', spawned_pid: 200 },
  });
  const notifier = makeNotifier();
  const fake = makeFakeProcess({ aliveUntilKilled: 'sigterm' });
  const killer = new Killer({ registry, notifier, kill: fake.kill, isAlive: () => fake.isAlive() });
  const budget = { shouldHalt: () => ({ halt: true, reason: 'ticket cap hit' }) };

  killer.sweep(budget);

  assert.equal(fake.signals.length, 1);
  assert.deepEqual(fake.signals[0], { pid: -200, signal: 'SIGTERM' });
});

test('sweep(): skips tickets with no spawned_pid (e.g. dry-run) without error', () => {
  const registry = makeRegistry({ dry: { id: 'dry', status: 'dry_run', spawned_pid: null } });
  const notifier = makeNotifier();
  const killer = new Killer({ registry, notifier, kill: () => assert.fail('should not signal a dry-run ticket') });
  const budget = { shouldHalt: () => ({ halt: true, reason: 'killswitch active' }) };

  assert.doesNotThrow(() => killer.sweep(budget));
});

test('sweep(): does not re-signal a ticket already confirmed dead after SIGKILL', () => {
  const registry = makeRegistry({
    t1: { id: 't1', status: 'halted', spawned_pid: 300, kill_signal: 'SIGKILL' },
  });
  const notifier = makeNotifier();
  const signals = [];
  const killer = new Killer({
    registry, notifier,
    kill: (pid, sig) => signals.push({ pid, sig }),
    isAlive: () => false, // confirmed dead
  });
  const budget = { shouldHalt: () => ({ halt: true, reason: 'killswitch active' }) };

  killer.sweep(budget);

  assert.equal(signals.length, 0);
});
