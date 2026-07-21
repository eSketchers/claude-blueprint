// killer.wiring.test.mjs — smoke test that Killer works against the REAL
// Registry and Budget classes (not fakes), to catch any drift between what
// killer.test.mjs mocks and what server.mjs actually wires together.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Registry } from '../../orchestrator/registry.mjs';
import { Budget } from '../../orchestrator/budget.mjs';
import { Killer } from '../../orchestrator/killer.mjs';

test('Killer + real Registry + real Budget: killswitch trips shouldHalt, sweep kills the real pid', () => {
  const home = mkdtempSync(join(tmpdir(), 'agency-killer-wiring-'));
  try {
    const registry = new Registry(home);
    registry.claim('t1', { spawned_pid: 424242 });
    registry.update('t1', { status: 'in_progress' });

    const killswitchFile = join(home, 'KILLSWITCH');
    writeFileSync(killswitchFile, '');

    const budget = new Budget({ killswitch_file: killswitchFile }, registry);
    const notifier = { calls: [], notify(kind, payload) { this.calls.push({ kind, payload }); } };

    const signals = [];
    const killer = new Killer({
      registry, notifier,
      kill: (pid, sig) => signals.push({ pid, sig }),
      isAlive: () => true, // pretend the (fake) pid is alive so we observe the SIGTERM attempt
    });

    assert.equal(budget.canSpawn().ok, false, 'killswitch should block new spawns');
    assert.equal(budget.shouldHalt('t1').halt, true, 'killswitch should force a halt for the running ticket');

    killer.sweep(budget);

    assert.equal(registry.get('t1').status, 'halted');
    assert.deepEqual(signals[0], { pid: -424242, sig: 'SIGTERM' });
    assert.ok(notifier.calls.some(c => c.kind === 'budget_cap'));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
