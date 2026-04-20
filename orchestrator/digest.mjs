#!/usr/bin/env node
// digest.mjs — build a daily rollup from registry + events + agent-logs.
// Can be invoked as a library (buildDigest / formatMarkdown) or as a CLI:
//
//   node orchestrator/digest.mjs                    # print today's markdown to stdout
//   node orchestrator/digest.mjs --date 2026-04-19  # past date
//   node orchestrator/digest.mjs --json             # machine-readable
//   node orchestrator/digest.mjs --send             # also POST to Slack via Notifier
//   node orchestrator/digest.mjs --write            # also persist to ~/.claude-agency/digests/<date>.md

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { Notifier } from './notifier.mjs';

// ---------------- Core library ----------------

function dayKey(ts) { return new Date(ts).toISOString().slice(0, 10); }

/**
 * Derive the digest struct for a given date.
 * @param {{home:string, date:string, config?:object}} opts
 */
export function buildDigest({ home, date, config }) {
  const regPath = join(home, 'registry.json');
  const registry = existsSync(regPath)
    ? JSON.parse(readFileSync(regPath, 'utf8'))
    : { tickets: {}, daily_spend: {} };

  const tickets = Object.values(registry.tickets || {});

  // Buckets
  const completed = [];
  const blocked   = [];
  const active    = [];
  const stuck     = [];
  const halted    = [];
  const pickedUp  = [];

  const onDay = (ts) => ts && dayKey(ts) === date;

  for (const t of tickets) {
    // "Happened today" uses updated_at (for status transitions) or claimed_at (for new intake).
    const touchedToday = onDay(t.updated_at) || onDay(t.claimed_at);

    if (t.status === 'done' && onDay(t.updated_at)) {
      completed.push({
        id: t.id, title: t.title || t.id, url: t.url, pr_url: t.pr_url,
        completed_at: t.updated_at, spend_usd: t.spend_usd || 0,
      });
    }
    if (t.status === 'waiting') {
      blocked.push({
        id: t.id, title: t.title || t.id,
        question: t.last_question || '(no question text)',
        waiting_since: t.updated_at,
      });
    }
    if (t.status === 'in_progress' || t.status === 'spawning') {
      active.push({
        id: t.id, title: t.title || t.id,
        started_at: t.spawned_at || t.claimed_at,
        repo: t.repo_path, spend_usd: t.spend_usd || 0,
      });
    }
    if (t.status === 'stuck') {
      stuck.push({
        id: t.id, title: t.title || t.id,
        reason: t.stuck_reason, detail: t.stuck_detail,
        stuck_since: t.stuck_since,
      });
    }
    if (t.status === 'halted') {
      halted.push({ id: t.id, title: t.title || t.id, reason: t.halt_reason });
    }
    if (onDay(t.claimed_at)) {
      pickedUp.push({ id: t.id, title: t.title || t.id, claimed_at: t.claimed_at });
    }
  }

  // Sort by time where relevant
  completed.sort((a,b) => (b.completed_at||0) - (a.completed_at||0));
  pickedUp.sort((a,b)  => (b.claimed_at||0)   - (a.claimed_at||0));
  active.sort((a,b)    => (b.started_at||0)   - (a.started_at||0));

  return {
    date,
    generated_at: Date.now(),
    spend_today_usd: registry.daily_spend?.[date] || 0,
    daily_cap_usd:   config?.budget?.daily_usd_cap ?? null,
    counts: {
      completed: completed.length,
      blocked:   blocked.length,
      active:    active.length,
      stuck:     stuck.length,
      halted:    halted.length,
      picked_up: pickedUp.length,
    },
    completed: completed.slice(0, 20),
    blocked:   blocked.slice(0, 20),
    active:    active.slice(0, 20),
    stuck:     stuck.slice(0, 20),
    halted:    halted.slice(0, 20),
    picked_up: pickedUp.slice(0, 20),
  };
}

/**
 * Human-friendly markdown rendering suitable for Slack / email / terminal.
 */
export function formatMarkdown(d) {
  const lines = [];
  lines.push(`📅 *Agency daily — ${d.date}*`);
  lines.push('');
  const spendLine = d.daily_cap_usd != null
    ? `💰 Spend: $${d.spend_today_usd.toFixed(2)} / $${d.daily_cap_usd} daily cap`
    : `💰 Spend: $${d.spend_today_usd.toFixed(2)}`;
  lines.push(spendLine);
  lines.push(`Δ today: ${d.counts.picked_up} picked up · ${d.counts.completed} done · ${d.counts.blocked} blocked · ${d.counts.stuck} stuck · ${d.counts.halted} halted · ${d.counts.active} active`);
  lines.push('');

  const section = (emoji, title, items, render) => {
    if (!items.length) return;
    lines.push(`${emoji} *${title}* (${items.length})`);
    for (const item of items) lines.push(`  · ${render(item)}`);
    lines.push('');
  };

  section('✅', 'Completed', d.completed,
    t => `\`${t.id}\` ${t.title}${t.pr_url ? ` — ${t.pr_url}` : ''}`);
  section('🛑', 'Blocked (waiting on you)', d.blocked,
    t => `\`${t.id}\` ${t.title} — "${t.question}"`);
  section('⏸️', 'Stuck (heuristic)', d.stuck,
    t => `\`${t.id}\` ${t.title} — ${t.reason}: ${t.detail || ''}`);
  section('🔄', 'Active', d.active,
    t => `\`${t.id}\` ${t.title}${t.spend_usd ? ` · $${t.spend_usd.toFixed(2)}` : ''}`);
  section('⛔', 'Halted (budget / kill-switch)', d.halted,
    t => `\`${t.id}\` ${t.title} — ${t.reason}`);
  section('🆕', 'Picked up today', d.picked_up,
    t => `\`${t.id}\` ${t.title}`);

  if (!d.counts.completed && !d.counts.blocked && !d.counts.active &&
      !d.counts.stuck && !d.counts.halted && !d.counts.picked_up) {
    lines.push('_Quiet day — no agent activity._');
  }

  return lines.join('\n');
}

// ---------------- CLI ----------------

function parseArgs(argv) {
  const out = { date: dayKey(Date.now()), json: false, send: false, write: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json')       out.json = true;
    else if (a === '--send')  out.send = true;
    else if (a === '--write') out.write = true;
    else if (a === '--date')  out.date = argv[++i];
  }
  return out;
}

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(process.argv);

  const HOME = process.env.CLAUDE_AGENCY_HOME || join(homedir(), '.claude-agency');
  const CFG  = process.env.AGENCY_ORCH_CONFIG
            || resolve(__dirname, '..', 'config', 'orchestrator.json');
  const config = existsSync(CFG) ? JSON.parse(readFileSync(CFG, 'utf8')) : {};

  const digest = buildDigest({ home: HOME, date: args.date, config });

  if (args.json) {
    console.log(JSON.stringify(digest, null, 2));
  } else {
    console.log(formatMarkdown(digest));
  }

  if (args.write) {
    const dir = join(HOME, 'digests');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${args.date}.md`);
    writeFileSync(file, formatMarkdown(digest));
    console.error(`[digest] wrote ${file}`);
  }

  if (args.send) {
    const notifier = new Notifier(config.notifier || {});
    await notifier.notify('info', {
      title: `Agency daily — ${args.date}`,
      body: formatMarkdown(digest),
    });
    console.error(`[digest] sent via notifier`);
  }
}

// Run CLI if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
