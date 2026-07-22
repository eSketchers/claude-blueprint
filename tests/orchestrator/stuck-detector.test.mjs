// stuck-detector.test.mjs — tests for orchestrator/stuck-detector.mjs,
// focused on the new configurable whitelist (Tier 1: stuck-detection may
// false-positive). Also covers the pre-existing rules so a future change
// can't silently break them alongside the whitelist addition.
//
// Run: node --test tests/orchestrator/stuck-detector.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { detectStuck, isWhitelisted } from '../../orchestrator/stuck-detector.mjs';

const BASE_CONFIG = { idle_timeout_ms: 600_000, tool_loop_threshold: 5, thrashing_window: 50 };

test('isWhitelisted(): matches an exact ticket id', () => {
  assert.equal(isWhitelisted({ id: 'gh:org/repo#42' }, ['gh:org/repo#42']), true);
  assert.equal(isWhitelisted({ id: 'gh:org/repo#43' }, ['gh:org/repo#42']), false);
});

test('isWhitelisted(): supports a * glob against the ticket id', () => {
  assert.equal(isWhitelisted({ id: 'gh:org/repo#42' }, ['gh:org/repo#*']), true);
  assert.equal(isWhitelisted({ id: 'fs:local:research-9' }, ['fs:*:research-*']), true);
  assert.equal(isWhitelisted({ id: 'fs:local:feature-9' }, ['fs:*:research-*']), false);
});

test('isWhitelisted(): matches against labels, not just the id', () => {
  assert.equal(isWhitelisted({ id: 'gh:org/repo#1', labels: ['backend', 'long-running'] }, ['long-running']), true);
  assert.equal(isWhitelisted({ id: 'gh:org/repo#1', labels: ['backend'] }, ['long-running']), false);
});

test('isWhitelisted(): glob matches a label prefix', () => {
  assert.equal(isWhitelisted({ id: 'gh:org/repo#1', labels: ['research-spike'] }, ['research-*']), true);
});

test('isWhitelisted(): does not partial-match — pattern must match the whole candidate string', () => {
  // "research" should NOT match "research-spike" unless the pattern has a wildcard.
  assert.equal(isWhitelisted({ id: 'x', labels: ['research-spike'] }, ['research']), false);
});

test('isWhitelisted(): empty/missing whitelist never matches anything', () => {
  assert.equal(isWhitelisted({ id: 'gh:org/repo#1', labels: ['anything'] }, []), false);
  assert.equal(isWhitelisted({ id: 'gh:org/repo#1' }, undefined), false);
});

test('isWhitelisted(): a ticket with no id and no labels never matches', () => {
  assert.equal(isWhitelisted({}, ['*']), false);
});

test('isWhitelisted(): glob special characters other than * are escaped, not treated as regex', () => {
  // A literal "+" or "." in a ticket id must not behave like regex metacharacters.
  assert.equal(isWhitelisted({ id: 'v1.2+build' }, ['v1.2+build']), true);
  assert.equal(isWhitelisted({ id: 'v1X2+build' }, ['v1.2+build']), false, '"." must be literal, not regex "any char"');
});

test('detectStuck(): a whitelisted ticket is never flagged, even when idle past the timeout', () => {
  const ticket = { id: 'gh:org/repo#42', status: 'in_progress', last_event_at: 100, labels: ['research'] };
  const config = { ...BASE_CONFIG, whitelist: ['research'] };

  const result = detectStuck(ticket, [], config, 10_000_000);
  assert.equal(result, null);
});

test('detectStuck(): a whitelisted ticket is never flagged for tool_loop either', () => {
  const events = Array.from({ length: 6 }, () => ({ kind: 'pre_tool', tool: 'Read', file: 'a.py' }));
  const ticket = { id: 'gh:org/repo#42', status: 'in_progress', last_event_at: 1000, labels: ['long-running'] };
  const config = { ...BASE_CONFIG, whitelist: ['long-running'] };

  const result = detectStuck(ticket, events, config, 1500);
  assert.equal(result, null);
});

test('detectStuck(): a non-whitelisted ticket is still flagged normally (whitelist does not disable detection globally)', () => {
  const ticket = { id: 'gh:org/repo#99', status: 'in_progress', last_event_at: 100, labels: ['backend'] };
  const config = { ...BASE_CONFIG, whitelist: ['research-*'] };

  const result = detectStuck(ticket, [], config, 10_000_000);
  assert.ok(result);
  assert.equal(result.reason, 'idle');
});

test('detectStuck(): whitelist defaults to disabled (no config.whitelist) — existing behavior unchanged', () => {
  const ticket = { id: 'gh:org/repo#1', status: 'in_progress', last_event_at: 100 };
  const result = detectStuck(ticket, [], BASE_CONFIG, 10_000_000);
  assert.ok(result);
  assert.equal(result.reason, 'idle');
});

// --- Pre-existing rule coverage, to guard against regressions from this change ---

test('detectStuck(): idle rule fires after idle_timeout_ms with no events', () => {
  const ticket = { status: 'in_progress', last_event_at: 100 };
  const result = detectStuck(ticket, [], BASE_CONFIG, 700_000);
  assert.equal(result?.reason, 'idle');
});

test('detectStuck(): idle rule does not fire before the timeout', () => {
  const ticket = { status: 'in_progress', last_event_at: 100 };
  const result = detectStuck(ticket, [], BASE_CONFIG, 100_000);
  assert.equal(result, null);
});

test('detectStuck(): last_event_at of exactly 0 is treated as "no timestamp yet" (falsy), not "the epoch" — idle rule does not fire', () => {
  // Documents existing behavior: `lastAt = ticket.last_event_at || ticket.spawned_at || 0`
  // then `if (lastAt && ...)` — a literal 0 timestamp is indistinguishable from "absent"
  // and short-circuits the idle check entirely, even far in the future.
  const ticket = { status: 'in_progress', last_event_at: 0 };
  const result = detectStuck(ticket, [], BASE_CONFIG, 10_000_000);
  assert.equal(result, null);
});

test('detectStuck(): terminal statuses are always skipped regardless of whitelist', () => {
  for (const status of ['done', 'halted', 'waiting', 'stuck']) {
    const ticket = { status, last_event_at: 0 };
    assert.equal(detectStuck(ticket, [], BASE_CONFIG, 10_000_000), null, `status=${status}`);
  }
});

test('detectStuck(): stopped_no_changes fires when pending_stop is set and no file was ever touched', () => {
  const ticket = { status: 'in_progress', last_event_at: 100, pending_stop: true, had_file_change: false };
  const result = detectStuck(ticket, [{ kind: 'stop' }], BASE_CONFIG, 200);
  assert.equal(result?.reason, 'stopped_no_changes');
});

test('detectStuck(): tool_loop fires on N identical tool+file pre_tool events in a row', () => {
  const events = Array.from({ length: 5 }, () => ({ kind: 'pre_tool', tool: 'Edit', file: 'a.py' }));
  const ticket = { status: 'in_progress', last_event_at: 100 };
  const result = detectStuck(ticket, events, BASE_CONFIG, 200);
  assert.equal(result?.reason, 'tool_loop');
});

test('detectStuck(): thrashing fires when the window has no Edit/Write at all', () => {
  // Distinct files per event so this doesn't also satisfy tool_loop (which is
  // checked first and would otherwise mask the thrashing rule under test).
  const events = Array.from({ length: 50 }, (_, i) => ({ kind: 'pre_tool', tool: 'Read', file: `file-${i}.py` }));
  const ticket = { status: 'in_progress', last_event_at: 100 };
  const result = detectStuck(ticket, events, BASE_CONFIG, 200);
  assert.equal(result?.reason, 'thrashing');
});
