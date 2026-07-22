#!/usr/bin/env node
// agent-stats.mjs — per-agent usage stats derived from ~/.claude-agency/events.jsonl.
// Addresses Agent System Issue 4 ("No agent performance metrics").
//
//   node orchestrator/agent-stats.mjs                 # print today's stats as a table
//   node orchestrator/agent-stats.mjs --since 7d      # last 7 days (also: 24h, 30d, all)
//   node orchestrator/agent-stats.mjs --json          # machine-readable
//
// Honest scope note: there is currently no failure/error signal anywhere in
// the hook event stream (.claude/hooks/agency-emit.sh never emits a "kind"
// for a failed tool call or a crashed subagent — a failed agent looks
// identical to a succeeded one: it just stops emitting events). So this
// intentionally does NOT report a success/failure rate, unlike the original
// design spec's "agent_results: {status: success}" sketch — that would
// require inventing a proxy signal that doesn't reflect reality. What IS
// reported is real, directly observable from the event stream: how many
// sessions used each agent, how much tool-call volume, how long sessions
// ran, and how many tickets/files each agent touched.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Read and parse every line of events.jsonl. Unlike dashboard/event-reader.mjs
 * (capped at a 10k rolling cache for live-view performance), this reads the
 * full file — agent stats should reflect complete history, not a recent window.
 */
export function readAllEvents(eventsPath) {
  if (!existsSync(eventsPath)) return [];
  const raw = readFileSync(eventsPath, 'utf8');
  const events = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* skip malformed lines */ }
  }
  return events;
}

const SINCE_MS = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, all: Infinity };

/**
 * @param {{events: object[], since?: string, now?: number}} opts
 * @returns {{since:string, generated_at:number, agents: Array<object>}}
 */
export function buildAgentStats({ events, since = '7d', now = Date.now() }) {
  const windowMs = SINCE_MS[since] ?? SINCE_MS['7d'];
  const cutoff = windowMs === Infinity ? 0 : now - windowMs;

  const byAgent = new Map(); // agent name -> accumulator

  const getAgent = (name) => {
    let a = byAgent.get(name);
    if (!a) {
      a = {
        agent: name,
        sessions: new Set(),      // distinct session_id+agent_id keys
        tool_calls: 0,
        tools_used: new Map(),    // tool name -> count
        tickets: new Set(),
        subagent_stops: 0,
        first_seen: null,
        last_seen: null,
        // session_id/agent_id -> {first, last} for duration calc
        _sessionSpans: new Map(),
      };
      byAgent.set(name, a);
    }
    return a;
  };

  for (const ev of events) {
    if (!ev.ts || ev.ts < cutoff) continue;
    const name = ev.agent || '_root';
    if (name === '_root') continue; // only track named subagents, not the main session
    const a = getAgent(name);

    const sessionKey = `${ev.session_id}/${ev.agent_id || ''}`;
    a.sessions.add(sessionKey);
    if (ev.ticket) a.tickets.add(ev.ticket);

    a.first_seen = a.first_seen === null ? ev.ts : Math.min(a.first_seen, ev.ts);
    a.last_seen  = a.last_seen  === null ? ev.ts : Math.max(a.last_seen,  ev.ts);

    const span = a._sessionSpans.get(sessionKey) || { first: ev.ts, last: ev.ts };
    span.first = Math.min(span.first, ev.ts);
    span.last  = Math.max(span.last,  ev.ts);
    a._sessionSpans.set(sessionKey, span);

    if (ev.kind === 'pre_tool' && ev.tool) {
      a.tool_calls += 1;
      a.tools_used.set(ev.tool, (a.tools_used.get(ev.tool) || 0) + 1);
    }
    if (ev.kind === 'subagent_stop') a.subagent_stops += 1;
  }

  const agents = [...byAgent.values()].map(a => {
    const durations = [...a._sessionSpans.values()].map(s => s.last - s.first);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const avgDurationMs = durations.length ? Math.round(totalDuration / durations.length) : 0;

    const topTools = [...a.tools_used.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count }));

    return {
      agent: a.agent,
      session_count: a.sessions.size,
      ticket_count: a.tickets.size,
      tool_calls: a.tool_calls,
      avg_tool_calls_per_session: a.sessions.size ? Math.round((a.tool_calls / a.sessions.size) * 10) / 10 : 0,
      subagent_stops: a.subagent_stops,
      avg_session_duration_ms: avgDurationMs,
      top_tools: topTools,
      first_seen: a.first_seen,
      last_seen: a.last_seen,
    };
  }).sort((x, y) => y.session_count - x.session_count);

  return { since, generated_at: now, agents };
}

export function formatTable(stats) {
  const lines = [];
  lines.push(`Agent usage stats (since: ${stats.since})`);
  lines.push('');
  if (stats.agents.length === 0) {
    lines.push('No subagent activity recorded in this window.');
    return lines.join('\n');
  }

  const header = ['agent', 'sessions', 'tickets', 'tool_calls', 'avg/session', 'avg_duration', 'top_tool'];
  const rows = stats.agents.map(a => [
    a.agent,
    String(a.session_count),
    String(a.ticket_count),
    String(a.tool_calls),
    String(a.avg_tool_calls_per_session),
    formatDuration(a.avg_session_duration_ms),
    a.top_tools[0] ? `${a.top_tools[0].tool} (${a.top_tools[0].count})` : '—',
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const pad = (s, w) => s + ' '.repeat(w - s.length);

  lines.push(header.map((h, i) => pad(h, widths[i])).join('  '));
  lines.push(widths.map(w => '-'.repeat(w)).join('  '));
  for (const row of rows) lines.push(row.map((c, i) => pad(c, widths[i])).join('  '));

  lines.push('');
  lines.push('Note: no success/failure rate is shown — the event stream has no signal');
  lines.push('for a failed tool call or crashed subagent (see agent-stats.mjs header comment).');

  return lines.join('\n');
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ---------------- CLI ----------------

function parseArgs(argv) {
  const out = { since: '7d', json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--since') out.since = argv[++i];
  }
  if (!(out.since in SINCE_MS)) {
    console.error(`[agent-stats] invalid --since "${out.since}" (must be one of: ${Object.keys(SINCE_MS).join(', ')})`);
    process.exit(1);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const HOME = process.env.CLAUDE_AGENCY_HOME || join(homedir(), '.claude-agency');
  const eventsPath = join(HOME, 'events.jsonl');

  const events = readAllEvents(eventsPath);
  const stats = buildAgentStats({ events, since: args.since });

  console.log(args.json ? JSON.stringify(stats, null, 2) : formatTable(stats));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
