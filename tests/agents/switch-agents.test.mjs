// switch-agents.test.mjs — Tier 3 (Agent System Issue 1: profile switching
// is destructive) regression tests for scripts/switch-agents.sh.
//
// Before this fix: switching profiles did `rm -f .claude/agents/*.md` then
// `cp` the new profile's files back in from an `agents.backup/` copy. An
// interrupted run (Ctrl-C, jq failure, disk full) between those two steps
// left .claude/agents/ empty with no easy recovery path.
//
// After this fix: .claude/agents-all/ holds the canonical real files;
// .claude/agents/ contains only symlinks into it. Switching profiles only
// ever adds/removes symlinks — the real content in agents-all/ is never
// touched, so an interrupted run is trivially recoverable by re-running the
// script (any profile), and nothing is ever unrecoverable.
//
// Run: node --test tests/agents/switch-agents.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, lstatSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const SCRIPT_SOURCE = join(REPO_ROOT, 'scripts/switch-agents.sh');
const PROFILES_SOURCE = join(REPO_ROOT, '.claude/agents.profiles.json');

const AGENTS = ['architect', 'backend-dev', 'data-engineer', 'devops', 'frontend-dev', 'qa-lead'];

/** Build a scratch project with a scripts/ + .claude/ layout matching what switch-agents.sh expects. */
function makeProject({ withRealAgents = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'switch-agents-test-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });

  const script = join(root, 'scripts', 'switch-agents.sh');
  writeFileSync(script, readFileSync(SCRIPT_SOURCE));
  spawnSync('chmod', ['+x', script]);

  writeFileSync(join(root, '.claude', 'agents.profiles.json'), readFileSync(PROFILES_SOURCE));

  if (withRealAgents) {
    for (const agent of AGENTS) {
      writeFileSync(join(root, '.claude', 'agents', `${agent}.md`), `# ${agent}\ncontent for ${agent}\n`);
    }
  }

  return root;
}

function runSwitch(root, profile) {
  return spawnSync(join(root, 'scripts', 'switch-agents.sh'), [profile], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function agentsDirEntries(root) {
  return readdirSync(join(root, '.claude', 'agents'));
}

function isSymlink(root, name) {
  return lstatSync(join(root, '.claude', 'agents', name)).isSymbolicLink();
}

test('first run migrates real agent files into agents-all/ and leaves only symlinks in agents/', () => {
  const root = makeProject();
  try {
    const result = runSwitch(root, 'frontend');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Migrating existing agents/);

    const allFiles = readdirSync(join(root, '.claude', 'agents-all'));
    assert.equal(allFiles.length, AGENTS.length, 'every original agent file should be migrated to agents-all/');

    const active = agentsDirEntries(root);
    assert.deepEqual(active.sort(), ['architect.md', 'frontend-dev.md', 'qa-lead.md'], 'only the frontend profile\'s agents should be active');
    for (const name of active) assert.ok(isSymlink(root, name), `${name} should be a symlink, not a real file`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('agents-all/ content is preserved exactly through migration (no data loss)', () => {
  const root = makeProject();
  try {
    runSwitch(root, 'ticket');
    const content = readFileSync(join(root, '.claude', 'agents-all', 'architect.md'), 'utf8');
    assert.equal(content, '# architect\ncontent for architect\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('switching profiles replaces symlinks correctly (old profile\'s extra agents removed, new profile\'s added)', () => {
  const root = makeProject();
  try {
    runSwitch(root, 'fullstack'); // architect, frontend-dev, backend-dev, qa-lead
    assert.deepEqual(agentsDirEntries(root).sort(), ['architect.md', 'backend-dev.md', 'frontend-dev.md', 'qa-lead.md']);

    runSwitch(root, 'minimal'); // architect only
    assert.deepEqual(agentsDirEntries(root).sort(), ['architect.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CORE FIX: an interrupted run (symlinks cleared, script never got to recreate them) is fully recoverable by re-running — no data ever lost', () => {
  const root = makeProject();
  try {
    runSwitch(root, 'ticket');

    // Simulate the exact failure mode this fix targets: something kills the
    // script after symlinks are cleared but before they're recreated.
    for (const name of agentsDirEntries(root)) {
      rmSync(join(root, '.claude', 'agents', name));
    }
    assert.equal(agentsDirEntries(root).length, 0, 'simulated interruption: agents/ is empty');

    // agents-all/ must be untouched — this is the property that makes recovery trivial.
    const allFiles = readdirSync(join(root, '.claude', 'agents-all'));
    assert.equal(allFiles.length, AGENTS.length, 'agents-all/ must survive an interrupted symlink-clearing step');

    // Recovery: just re-run the script.
    const recovered = runSwitch(root, 'ticket');
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(agentsDirEntries(root).length, AGENTS.length, 'all agents restored after re-running');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a real (non-symlink) file left in .claude/agents/ is preserved with a warning, never silently deleted', () => {
  const root = makeProject();
  try {
    runSwitch(root, 'minimal');
    writeFileSync(join(root, '.claude', 'agents', 'custom-agent.md'), 'hand-added, not managed by profiles');

    const result = runSwitch(root, 'backend');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Skipping non-symlink file, not removing/);

    const content = readFileSync(join(root, '.claude', 'agents', 'custom-agent.md'), 'utf8');
    assert.equal(content, 'hand-added, not managed by profiles');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unknown profile is rejected with a clear error, listing available profiles', () => {
  const root = makeProject();
  try {
    const result = runSwitch(root, 'nonexistent-profile');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('re-running the same profile twice is idempotent (no errors, same resulting symlinks)', () => {
  const root = makeProject();
  try {
    runSwitch(root, 'devops');
    const first = agentsDirEntries(root).sort();

    const result = runSwitch(root, 'devops');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(agentsDirEntries(root).sort(), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a project with no real agent files yet and an empty agents-all/ fails clearly instead of silently activating nothing', () => {
  const root = makeProject({ withRealAgents: false });
  try {
    const result = runSwitch(root, 'ticket');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /empty/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
