// agent-stats.test.mjs — tests for orchestrator/agent-stats.mjs (Agent System
// Issue 4: "No agent performance metrics").
//
// Deliberately does NOT test success/failure rate — there is no such signal
// anywhere in the hook event stream today (a failed subagent looks
// identical to a succeeded one), so agent-stats.mjs intentionally reports
// only what's honestly derivable: session counts, tool-call volume, ticket
// coverage, and session duration. See the module's header comment.
//
// Run: node --test tests/orchestrator/agent-stats.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentStats, formatTable } from '../../orchestrator/agent-stats.mjs';

function ev(overrides) {
  return { kind: 'pre_tool', session_id: 's1', agent: 'backend-dev', agent_id: 'a1', ticket: 't1', ts: 1000, ...overrides };
}

test('buildAgentStats(): counts distinct sessions per agent, not per event', () => {
  const events = [
    ev({ kind: 'session_start', ts: 1000 }),
    ev({ kind: 'pre_tool', tool: 'Read', ts: 1100 }),
    ev({ kind: 'pre_tool', tool: 'Edit', ts: 1200 }),
    ev({ session_id: 's2', agent_id: 'a2', kind: 'session_start', ts: 2000 }),
    ev({ session_id: 's2', agent_id: 'a2', kind: 'pre_tool', tool: 'Read', ts: 2100 }),
  ];
  const stats = buildAgentStats({ events, since: 'all' });
  const backend = stats.agents.find(a => a.agent === 'backend-dev');
  assert.equal(backend.session_count, 2);
  assert.equal(backend.tool_calls, 3);
});

test('buildAgentStats(): the main/root session (empty agent name) is excluded entirely', () => {
  const events = [
    { kind: 'pre_tool', tool: 'Read', session_id: 'main', agent: '', ticket: 't1', ts: 1000 },
    { kind: 'pre_tool', tool: 'Read', session_id: 'main', ticket: 't1', ts: 1100 }, // no agent field at all
  ];
  const stats = buildAgentStats({ events, since: 'all' });
  assert.equal(stats.agents.length, 0);
});

test('buildAgentStats(): tracks distinct tickets per agent', () => {
  const events = [
    ev({ ticket: 't1', kind: 'session_start' }),
    ev({ ticket: 't1', kind: 'pre_tool', tool: 'Read' }),
    ev({ session_id: 's2', agent_id: 'a2', ticket: 't2', kind: 'session_start', ts: 5000 }),
  ];
  const stats = buildAgentStats({ events, since: 'all' });
  const backend = stats.agents.find(a => a.agent === 'backend-dev');
  assert.equal(backend.ticket_count, 2);
});

test('buildAgentStats(): avg_session_duration_ms is the mean of (last_event_ts - first_event_ts) per session', () => {
  const events = [
    ev({ session_id: 's1', agent_id: 'a1', kind: 'session_start', ts: 1000 }),
    ev({ session_id: 's1', agent_id: 'a1', kind: 'subagent_stop', ts: 1300 }), // duration 300
    ev({ session_id: 's2', agent_id: 'a2', kind: 'session_start', ts: 2000 }),
    ev({ session_id: 's2', agent_id: 'a2', kind: 'subagent_stop', ts: 2700 }), // duration 700
  ];
  const stats = buildAgentStats({ events, since: 'all' });
  const backend = stats.agents.find(a => a.agent === 'backend-dev');
  assert.equal(backend.avg_session_duration_ms, 500); // (300 + 700) / 2
});

test('buildAgentStats(): top_tools is sorted by count descending, capped at 5', () => {
  const events = [
    ev({ kind: 'pre_tool', tool: 'Read', ts: 1000 }),
    ev({ kind: 'pre_tool', tool: 'Read', ts: 1010 }),
    ev({ kind: 'pre_tool', tool: 'Read', ts: 1020 }),
    ev({ kind: 'pre_tool', tool: 'Edit', ts: 1030 }),
    ev({ kind: 'pre_tool', tool: 'Bash', ts: 1040 }),
  ];
  const stats = buildAgentStats({ events, since: 'all' });
  const backend = stats.agents.find(a => a.agent === 'backend-dev');
  assert.equal(backend.top_tools[0].tool, 'Read');
  assert.equal(backend.top_tools[0].count, 3);
});

test('buildAgentStats(): --since window excludes events before the cutoff', () => {
  const now = 100_000_000;
  const events = [
    ev({ ts: now - 100 }), // recent, inside a 24h window
    ev({ session_id: 's-old', agent_id: 'a-old', ts: now - (48 * 3600 * 1000) }), // 48h ago, outside a 24h window
  ];
  const stats = buildAgentStats({ events, since: '24h', now });
  const backend = stats.agents.find(a => a.agent === 'backend-dev');
  assert.equal(backend.session_count, 1, 'the 48h-old session should be excluded from a 24h window');
});

test('buildAgentStats(): "all" window includes everything regardless of age', () => {
  const now = 100_000_000;
  const events = [
    ev({ session_id: 's-ancient', agent_id: 'a-ancient', ts: 1 }), // effectively year-zero
  ];
  const stats = buildAgentStats({ events, since: 'all', now });
  assert.equal(stats.agents[0].session_count, 1);
});

test('buildAgentStats(): agents sorted by session_count descending', () => {
  const events = [
    ev({ agent: 'qa-lead', session_id: 'q1', agent_id: 'qa1', kind: 'session_start' }),
    ev({ agent: 'backend-dev', session_id: 'b1', agent_id: 'b1', kind: 'session_start' }),
    ev({ agent: 'backend-dev', session_id: 'b2', agent_id: 'b2', kind: 'session_start' }),
  ];
  const stats = buildAgentStats({ events, since: 'all' });
  assert.equal(stats.agents[0].agent, 'backend-dev');
  assert.equal(stats.agents[0].session_count, 2);
  assert.equal(stats.agents[1].agent, 'qa-lead');
});

test('buildAgentStats(): empty event list produces an empty agents array, not an error', () => {
  const stats = buildAgentStats({ events: [], since: 'all' });
  assert.deepEqual(stats.agents, []);
});

test('HONESTY CHECK: no success/failure field appears anywhere in the output shape', () => {
  // This is the core scope decision from the design-doc gap: the spec asked
  // for a success/fail rate, but no such signal exists in the event stream.
  // Locking in that the output never claims to have one.
  const events = [ev({ kind: 'session_start' }), ev({ kind: 'subagent_stop', ts: 1500 })];
  const stats = buildAgentStats({ events, since: 'all' });
  const json = JSON.stringify(stats);
  assert.doesNotMatch(json, /success/i);
  assert.doesNotMatch(json, /"status"/i);
  assert.doesNotMatch(json, /fail/i);
});

test('formatTable(): renders a readable table and includes the honesty note about missing success/fail data', () => {
  const events = [ev({ kind: 'session_start' }), ev({ kind: 'pre_tool', tool: 'Read', ts: 1100 })];
  const stats = buildAgentStats({ events, since: 'all' });
  const table = formatTable(stats);
  assert.match(table, /backend-dev/);
  assert.match(table, /no success\/failure rate is shown/i);
});

test('formatTable(): handles the empty-stats case without throwing', () => {
  const stats = buildAgentStats({ events: [], since: '7d' });
  const table = formatTable(stats);
  assert.match(table, /No subagent activity recorded/);
});
