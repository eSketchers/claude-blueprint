// agency-emit.test.mjs — coverage for .claude/hooks/agency-emit.sh, in
// particular the HIGH PRIORITY Issue 2 fix (2026-08-26 codebase audit):
// replaced up to 7 per-field `python3 -c` subprocess spawns per hook
// invocation with a single batched python3 call building the whole event
// object at once. Measured ~793ms -> ~135ms per invocation with every
// field populated (worst case) — an ~83% reduction, matching the audit's
// estimate.
//
// This hook fires on both PreToolUse and PostToolUse for every tool call
// in every session using this blueprint, so correctness here matters a lot
// — a malformed event silently corrupts the dashboard/orchestrator's view
// of every session. Tests focus on exactly the cases that made a
// pure-bash rewrite risky: multi-line prompts, embedded quotes and
// backslashes, since CLAUDE_USER_PROMPT is a raw user message that
// realistically contains all of these.
//
// Run: node --test tests/hooks/agency-emit.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const HOOK = join(REPO_ROOT, '.claude/hooks/agency-emit.sh');

function runHook(kind, extraEnv = {}, extraArg) {
  const home = mkdtempSync(join(tmpdir(), 'agency-emit-test-'));
  const args = extraArg !== undefined ? [kind, extraArg] : [kind];
  const result = spawnSync(HOOK, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_AGENCY_HOME: home, ...extraEnv },
    timeout: 10_000,
  });
  const eventsPath = join(home, 'events.jsonl');
  const events = existsSync(eventsPath)
    ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    : [];
  return { result, home, events };
}

test('emits a well-formed event with the always-present fields for a minimal invocation', () => {
  const { result, home, events } = runHook('session_start');
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.kind, 'session_start');
    assert.equal(typeof ev.ts, 'number');
    assert.ok(ev.session_id);
    assert.ok(ev.repo);
    assert.ok(ev.repo_path);
    assert.ok('branch' in ev);
    assert.ok('ticket' in ev);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a multi-line prompt containing quotes and a backslash survives as valid JSON with the exact original content', () => {
  const prompt = 'multi-line\nprompt with "quotes" and a \\backslash';
  const { result, home, events } = runHook('prompt_submit', { CLAUDE_USER_PROMPT: prompt });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(events.length, 1);
    assert.equal(events[0].prompt, prompt, 'the prompt must round-trip exactly, newlines/quotes/backslash intact');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('long prompt/notif/extra fields are truncated to exactly 500 characters', () => {
  const longPrompt = 'x'.repeat(600);
  const { result, home, events } = runHook('prompt_submit', { CLAUDE_USER_PROMPT: longPrompt });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(events[0].prompt.length, 500);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('conditional fields (tool, file, agent, agent_id, prompt, notif, extra) are omitted entirely when empty, not present-but-empty', () => {
  const { result, home, events } = runHook('post_tool');
  try {
    assert.equal(result.status, 0, result.stderr);
    const ev = events[0];
    for (const key of ['tool', 'file', 'agent', 'agent_id', 'prompt', 'notif', 'extra']) {
      assert.ok(!(key in ev), `expected "${key}" to be absent, got: ${JSON.stringify(ev)}`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('conditional fields are present and correct when their env vars are set', () => {
  const { result, home, events } = runHook('pre_tool', {
    CLAUDE_TOOL_NAME: 'Edit',
    CLAUDE_TOOL_FILE_PATH: '/some/file.js',
    CLAUDE_SUBAGENT_TYPE: 'backend-dev',
    CLAUDE_SUBAGENT_ID: 'agent-42',
    CLAUDE_NOTIFICATION_MESSAGE: 'a notification',
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    const ev = events[0];
    assert.equal(ev.tool, 'Edit');
    assert.equal(ev.file, '/some/file.js');
    assert.equal(ev.agent, 'backend-dev');
    assert.equal(ev.agent_id, 'agent-42');
    assert.equal(ev.notif, 'a notification');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('the optional second positional arg is emitted as "extra"', () => {
  const { result, home, events } = runHook('post_tool', {}, 'some extra context');
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(events[0].extra, 'some extra context');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('CLAUDE_SESSION_ID is used verbatim as session_id when set', () => {
  const { result, home, events } = runHook('session_start', { CLAUDE_SESSION_ID: 'gh:org/repo#42' });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(events[0].session_id, 'gh:org/repo#42');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a "notification" kind still creates the inbox slot (noclobber-created placeholder)', () => {
  const { result, home } = runHook('notification', { CLAUDE_SESSION_ID: 'sess-1', CLAUDE_NOTIFICATION_MESSAGE: 'need input' });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(home, 'inbox', 'sess-1.txt')), 'expected an inbox slot to be created for a notification event');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('appends to events.jsonl across repeated invocations rather than overwriting', () => {
  const home = mkdtempSync(join(tmpdir(), 'agency-emit-test-'));
  try {
    for (const kind of ['session_start', 'pre_tool', 'post_tool']) {
      const r = spawnSync(HOOK, [kind], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, CLAUDE_AGENCY_HOME: home } });
      assert.equal(r.status, 0, r.stderr);
    }
    const lines = readFileSync(join(home, 'events.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 3);
    assert.deepEqual(lines.map(l => JSON.parse(l).kind), ['session_start', 'pre_tool', 'post_tool']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
