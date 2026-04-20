#!/usr/bin/env node
// server.mjs — the orchestrator daemon.
//
// Every tick it:
//   1. Polls each configured source for new tickets
//   2. Filters out tickets we've already seen (registry)
//   3. Checks budget + kill switch before spawning anything
//   4. Spawns a headless Claude Code session per new ticket
//   5. Tails ~/.claude-agency/events.jsonl for blocker / completion events
//   6. Routes to the notifier (Slack / console)

import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { Registry }        from './registry.mjs';
import { Budget }          from './budget.mjs';
import { Notifier }        from './notifier.mjs';
import { spawnTicketAgent } from './spawn.mjs';
import { fetchGithub }     from './sources/github.mjs';

const CONFIG_PATH = process.env.AGENCY_ORCH_CONFIG || resolve('config/orchestrator.json');
const HOME        = process.env.CLAUDE_AGENCY_HOME || join(homedir(), '.claude-agency');
const LOG_DIR     = join(HOME, 'agent-logs');

if (!existsSync(CONFIG_PATH)) {
  console.error(`[orchestrator] config not found: ${CONFIG_PATH}`);
  console.error(`[orchestrator] copy config/orchestrator.example.json to ${CONFIG_PATH} and edit.`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

// Expand ~ in killswitch path
if (config.budget?.killswitch_file?.startsWith('~')) {
  config.budget.killswitch_file = join(homedir(), config.budget.killswitch_file.slice(1));
}

const registry = new Registry(HOME);
const budget   = new Budget(config.budget || {}, registry);
const notifier = new Notifier(config.notifier || {});

console.log(`[orchestrator] home=${HOME}`);
console.log(`[orchestrator] config=${CONFIG_PATH}`);
console.log(`[orchestrator] sources=${(config.sources || []).filter(s => s.enabled !== false).map(s => `${s.type}:${s.name}`).join(', ') || '(none enabled)'}`);
console.log(`[orchestrator] daily cap=$${config.budget?.daily_usd_cap} · per-ticket cap=$${config.budget?.per_ticket_usd_cap}`);
if (config.spawn?.dry_run) console.log(`[orchestrator] SPAWN DRY RUN — no real sessions will start`);

// ---------- Intake tick ----------

async function intakeTick() {
  if (!budget.canSpawn().ok) {
    const why = budget.canSpawn().reason;
    console.log(`[intake] skipping (${why})`);
    if (why.includes('cap hit')) await notifier.notify('budget_cap', { title: why });
    return;
  }

  for (const src of (config.sources || [])) {
    if (src.enabled === false) continue;

    let tickets = [];
    try {
      if (src.type === 'github') tickets = await fetchGithub(src);
      else {
        console.warn(`[intake] unknown source type: ${src.type}`);
        continue;
      }
    } catch (e) {
      console.error(`[intake] source error:`, e.message);
      await notifier.notify('error', { title: `Source ${src.name} failed`, body: e.message });
      continue;
    }

    for (const t of tickets) {
      if (registry.has(t.id)) continue;
      if (!budget.canSpawn().ok) break;

      const reg = {
        source:      t.source,
        source_name: t.source_name,
        title:       t.title,
        url:         t.url,
        repo_path:   t.repo_path,
        labels:      t.labels,
      };
      registry.claim(t.id, reg);

      console.log(`[intake] claimed ${t.id} — "${t.title}"`);
      const spec = { ...config.spawn };
      const result = spawnTicketAgent({
        ticket_id:  t.id,
        ticket_url: t.url,
        repo_path:  t.repo_path,
        title:      t.title,
      }, spec, LOG_DIR);

      registry.update(t.id, {
        status: result.dry_run ? 'dry_run' : 'in_progress',
        spawned_pid: result.pid,
        spawned_at:  Date.now(),
        log_file:    result.logFile,
        command:     result.command,
      });

      await notifier.notify('info', {
        title: `Agent spawned for ${t.title}`,
        ticket_id: t.id,
        link: t.url,
        body: `Tracking in dashboard. Log: ${result.logFile || '(dry-run)'}`,
      });
    }
  }
}

// ---------- Event-log tail (blockers, completions) ----------

const EVENTS = join(HOME, 'events.jsonl');
let lastOffset = existsSync(EVENTS) ? statSync(EVENTS).size : 0;

function sessionToTicketId(sessionId) {
  // Match a session to a ticket by cross-referencing the registry.
  // We store spawned_session_id when available; for now match by ticket prefix or by any in_progress.
  // First, try exact session mapping:
  for (const t of registry.list()) {
    if (t.spawned_session_id === sessionId) return t.id;
  }
  return null;
}

function onEvent(ev) {
  const ticketId = sessionToTicketId(ev.session_id) || (ev.ticket ? ev.ticket : null);
  if (!ticketId) return;

  // Charge the ticket for this event
  budget.chargeEvent(ticketId);
  const halt = budget.shouldHalt(ticketId);
  if (halt.halt) {
    const prev = registry.get(ticketId);
    if (prev && prev.status !== 'halted') {
      registry.update(ticketId, { status: 'halted', halt_reason: halt.reason });
      notifier.notify('budget_cap', {
        title: `Halted ${ticketId}`,
        body: halt.reason,
        ticket_id: ticketId,
      });
    }
  }

  // Blocker notification
  if (ev.kind === 'notification') {
    notifier.notify('blocker', {
      title: `Blocker on ${ticketId}`,
      ticket_id: ticketId,
      body: ev.notif || 'Agent needs input',
      link: 'http://127.0.0.1:7842',
    });
    registry.update(ticketId, { status: 'waiting', last_question: ev.notif || '' });
  }
  // Completion (best-effort: a stop event with no recent notification)
  if (ev.kind === 'stop') {
    const prev = registry.get(ticketId);
    if (prev && prev.status !== 'halted' && prev.status !== 'done') {
      registry.update(ticketId, { status: 'done' });
      notifier.notify('ticket_complete', {
        title: `Finished ${prev.title || ticketId}`,
        ticket_id: ticketId,
        link: prev.url,
      });
    }
  }
}

function tailEvents() {
  if (!existsSync(EVENTS)) return;
  const size = statSync(EVENTS).size;
  if (size < lastOffset) { lastOffset = 0; } // log was truncated
  if (size === lastOffset) return;

  const buf = Buffer.alloc(size - lastOffset);
  const fd = openSync(EVENTS, 'r');
  try {
    readSync(fd, buf, 0, buf.length, lastOffset);
  } finally {
    closeSync(fd);
  }
  lastOffset = size;

  for (const line of buf.toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    try { onEvent(JSON.parse(line)); } catch {}
  }
}

// ---------- Main loop ----------

const TICK = Number(config.tick_interval_ms || 60_000);

async function tick() {
  try {
    await intakeTick();
    tailEvents();
    const warn = budget.checkThresholds();
    if (warn?.warn) await notifier.notify('budget_cap', { title: warn.reason });
  } catch (e) {
    console.error('[tick] error:', e);
  }
}

console.log(`[orchestrator] starting main loop, tick every ${TICK}ms`);
tick();
const timer = setInterval(tick, TICK);

process.on('SIGINT', () => { console.log('\n[orchestrator] SIGINT — shutting down'); clearInterval(timer); process.exit(0); });
process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
