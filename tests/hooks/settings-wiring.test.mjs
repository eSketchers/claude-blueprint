// settings-wiring.test.mjs — verifies .claude/settings.json actually routes
// every registered hook command through guard.sh, and that guard.sh's
// argument parsing lines up with how settings.json invokes it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const settings = JSON.parse(readFileSync(REPO_ROOT + '.claude/settings.json', 'utf8'));

function allCommands() {
  const commands = [];
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        if (hook.type === 'command') commands.push({ event, command: hook.command });
      }
    }
  }
  return commands;
}

test('every registered hook command routes through guard.sh', () => {
  const commands = allCommands();
  assert.ok(commands.length > 0, 'sanity check: settings.json should have at least one hook registered');

  for (const { event, command } of commands) {
    assert.match(
      command,
      /^\.claude\/hooks\/guard\.sh\s+\S+\s+\.claude\/hooks\/\S+\.sh/,
      `${event} hook "${command}" should be wrapped by guard.sh as: guard.sh <name> <real-script.sh> [args]`
    );
  }
});

test('each guard.sh invocation has a unique, descriptive hook name (no collisions across events)', () => {
  const commands = allCommands();
  const names = commands.map(({ command }) => command.split(/\s+/)[1]);

  assert.equal(new Set(names).size, names.length, 'hook names passed to guard.sh should be unique so hook-errors.log entries are distinguishable');
});

test('the real script path in each guard.sh invocation actually exists on disk', () => {
  const commands = allCommands();

  for (const { event, command } of commands) {
    const scriptPath = command.split(/\s+/)[2];
    assert.ok(existsSync(REPO_ROOT + scriptPath), `${event}: script ${scriptPath} referenced by guard.sh should exist`);
  }
});
