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

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { Registry }        from './registry.mjs';
import { Budget }          from './budget.mjs';
import { Notifier }        from './notifier.mjs';
import { spawnTicketAgent } from './spawn.mjs';
import { fetchGithub }     from './sources/github.mjs';
import { fetchFilesystem, archiveFilesystemTicket } from './sources/filesystem.mjs';
import { detectStuck }     from './stuck-detector.mjs';
import { buildDigest, formatMarkdown } from './digest.mjs';
import { RetryManager }    from './retry-manager.mjs';
import { Killer }          from './killer.mjs';

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
const stuckCfg = config.stuck || {};
const retryManager = new RetryManager(config.retry || {});
const retryQueue = new Map(); // ticketId -> timeoutId

const killer = new Killer({
  registry,
  notifier,
  graceMs: Number(config.budget?.kill_grace_ms ?? 30_000),
});

// In-memory sliding window of recent events per ticket + last stuck notification time.
// Lost on restart — idle-rule still works off persisted last_event_at.
const EVENT_WINDOW_SIZE = 60;
const ticketEvents = new Map();      // ticket_id -> Event[]
const lastStuckNotifyAt = new Map(); // ticket_id -> ts

console.log(`[orchestrator] home=${HOME}`);
console.log(`[orchestrator] config=${CONFIG_PATH}`);
console.log(`[orchestrator] sources=${(config.sources || []).filter(s => s.enabled !== false).map(s => `${s.type}:${s.name}`).join(', ') || '(none enabled)'}`);
console.log(`[orchestrator] daily cap=$${config.budget?.daily_usd_cap} · per-ticket cap=$${config.budget?.per_ticket_usd_cap}`);
if (config.spawn?.dry_run) console.log(`[orchestrator] SPAWN DRY RUN — no real sessions will start`);

// ---------- Spawn retry handler ----------

function handleSpawnFailure(ticketId, reason) {
  console.error(`[orchestrator] Spawn failed for ${ticketId}: ${reason}`);

  const [shouldRetry, delay] = retryManager.shouldRetry(ticketId, registry);

  if (shouldRetry) {
    retryManager.markAttempt(ticketId, registry);
    console.log(`[orchestrator] Scheduling retry for ${ticketId} in ${delay}ms`);

    const timeoutId = setTimeout(() => {
      retryQueue.delete(ticketId);
      // Re-queue the ticket for processing
      registry.update(ticketId, { status: 'pending' });
    }, delay);

    retryQueue.set(ticketId, timeoutId);
  } else {
    retryManager.markFailed(ticketId, registry, reason);
    console.error(`[orchestrator] Max retries exceeded for ${ticketId}, marking as failed`);

    // Send notification if configured
    notifier.notify('error', {
      title: `Ticket ${ticketId} failed`,
      body: `Failed after ${registry.get(ticketId)?.spawn_attempts || 0} attempts: ${reason}`,
      ticket_id: ticketId,
    });
  }
}

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
      if (src.type === 'github')     tickets = await fetchGithub(src);
      else if (src.type === 'filesystem') tickets = await fetchFilesystem(src);
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

      try {
        const result = spawnTicketAgent({
          ticket_id:  t.id,
          ticket_url: t.url,
          repo_path:  t.repo_path,
          title:      t.title,
        }, spec, LOG_DIR, budget);

        registry.update(t.id, {
          status: result.dry_run ? 'dry_run' : 'in_progress',
          spawned_pid: result.pid,
          spawned_at:  Date.now(),
          log_file:    result.logFile,
          command:     result.command,
        });

        // Monitor for early exit (crash detection)
        if (result.pid && !result.dry_run) {
          setTimeout(() => {
            // Check if process still running after 30s
            try {
              process.kill(result.pid, 0); // Signal 0 = check if alive
            } catch {
              // Process died early - schedule retry
              handleSpawnFailure(t.id, 'Process exited early');
            }
          }, 30000);
        }
      } catch (err) {
        handleSpawnFailure(t.id, err.message);
        continue; // Skip notification below if spawn failed
      }

      await notifier.notify('info', {
        title: `Agent spawned for ${t.title}`,
        ticket_id: t.id,
        link: t.url,
        body: `Tracking in dashboard. Log: ${result.logFile || '(dry-run)'}`,
      });

      // Archive filesystem tickets so we don't re-claim them next tick
      if (t.source === 'filesystem') {
        try { await archiveFilesystemTicket(t); } catch {/* non-fatal */}
      }
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

function appendToWindow(ticketId, ev) {
  let arr = ticketEvents.get(ticketId);
  if (!arr) { arr = []; ticketEvents.set(ticketId, arr); }
  arr.push(ev);
  if (arr.length > EVENT_WINDOW_SIZE) arr.splice(0, arr.length - EVENT_WINDOW_SIZE);
}

function onEvent(ev) {
  const ticketId = sessionToTicketId(ev.session_id) || (ev.ticket ? ev.ticket : null);
  if (!ticketId) return;

  appendToWindow(ticketId, ev);

  // If this ticket was marked stuck and it's emitting substantive events again, clear it.
  const t = registry.get(ticketId);
  if (t?.status === 'stuck' && ev.kind !== 'stop') {
    registry.update(ticketId, {
      status: 'in_progress',
      stuck_reason: null,
      stuck_since: null,
      resumed_at: ev.ts,
      last_event_at: ev.ts,
    });
    notifier.notify('info', {
      title: `Resumed ${ticketId}`,
      ticket_id: ticketId,
      body: `Was stuck (${t.stuck_reason}); emitted ${ev.kind}.`,
    });
  } else {
    // Always persist last_event_at so idle detection survives restart.
    registry.update(ticketId, { last_event_at: ev.ts });
  }

  // Track whether this ticket has ever touched a file — feeds the
  // "stop without changes" heuristic.
  if (ev.kind === 'pre_tool' && (ev.tool === 'Edit' || ev.tool === 'Write')) {
    if (!registry.get(ticketId)?.had_file_change) {
      registry.update(ticketId, { had_file_change: true });
    }
  }

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
    if (prev?.spawned_pid) killer.kill(ticketId, prev.spawned_pid, halt.reason);
  }

  // Blocker notification (explicit, via /wait-for-reply)
  if (ev.kind === 'notification') {
    notifier.notify('blocker', {
      title: `Blocker on ${ticketId}`,
      ticket_id: ticketId,
      body: ev.notif || 'Agent needs input',
      link: 'http://127.0.0.1:7842',
    });
    registry.update(ticketId, { status: 'waiting', last_question: ev.notif || '' });
  }

  // Completion / asked-and-returned (decided on next stuck-check tick):
  // mark the session as pending_stop; the stuck detector resolves it.
  if (ev.kind === 'stop') {
    const prev = registry.get(ticketId);
    if (!prev || prev.status === 'halted' || prev.status === 'done' || prev.status === 'waiting') return;

    if (prev.had_file_change) {
      registry.update(ticketId, { status: 'done', pending_stop: false });
      notifier.notify('ticket_complete', {
        title: `Finished ${prev.title || ticketId}`,
        ticket_id: ticketId,
        link: prev.url,
      });
    } else {
      // Let stuckTick pick it up with the 'stopped_no_changes' rule.
      registry.update(ticketId, { pending_stop: true });
    }
  }
}

// ---------- Stuck-detection tick ----------

function stuckTick() {
  const now = Date.now();
  const reNotifyMs = stuckCfg.re_notify_after_ms ?? 600_000;

  for (const ticket of registry.list()) {
    const window = ticketEvents.get(ticket.id) || [];
    const stuck = detectStuck(ticket, window, stuckCfg, now);
    if (!stuck) continue;

    const alreadyStuck = ticket.status === 'stuck' && ticket.stuck_reason === stuck.reason;
    const lastNotify = lastStuckNotifyAt.get(ticket.id) || 0;
    const cooldownOk = (now - lastNotify) > reNotifyMs;

    if (!alreadyStuck) {
      registry.update(ticket.id, {
        status: 'stuck',
        stuck_reason: stuck.reason,
        stuck_since: now,
        stuck_detail: stuck.detail,
      });
    }

    if (!alreadyStuck || cooldownOk) {
      lastStuckNotifyAt.set(ticket.id, now);
      notifier.notify('blocker', {
        title: `Stuck (${stuck.reason}) on ${ticket.title || ticket.id}`,
        ticket_id: ticket.id,
        body: stuck.detail,
        link: ticket.url || 'http://127.0.0.1:7842',
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

// ---------- Digest auto-schedule ----------

function dayKey(ts = Date.now()) { return new Date(ts).toISOString().slice(0, 10); }

async function digestTick() {
  const d = config.digest;
  if (!d?.enabled || !d.time) return;

  const [hh, mm] = String(d.time).split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return;

  const now = new Date();
  const target = new Date(now); target.setHours(hh, mm, 0, 0);
  if (now < target) return;

  const today = dayKey(Date.now());
  if (registry.state.last_digest_sent === today) return;

  const digest = buildDigest({ home: HOME, date: today, config });
  const md = formatMarkdown(digest);

  if (d.write !== false) {
    try {
      const dir = join(HOME, 'digests');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${today}.md`), md);
    } catch {}
  }

  if (d.send !== false) {
    await notifier.notify('info', {
      title: `Agency daily — ${today}`,
      body: md,
    });
  }

  registry.state.last_digest_sent = today;
  registry._flush();
  console.log(`[digest] sent for ${today} (${digest.counts.completed} done, ${digest.counts.blocked} blocked, ${digest.counts.active} active)`);
}

async function tick() {
  try {
    await intakeTick();
    tailEvents();
    stuckTick();
    killer.sweep(budget);
    await digestTick();
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
