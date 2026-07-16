#!/usr/bin/env node
// server.mjs — lightweight dashboard for the claude-agency blueprint.
// Zero runtime deps. Reads ~/.claude-agency/events.jsonl, derives live state,
// serves /api/state.json and static assets on :7842.

import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, watch, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildDigest, formatMarkdown } from '../orchestrator/digest.mjs';
import { WebSocketServer } from 'ws';
import { EventReader } from './event-reader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.AGENCY_PORT || 7842);
const HOME = process.env.CLAUDE_AGENCY_HOME || join(homedir(), '.claude-agency');
const EVENTS = join(HOME, 'events.jsonl');
const INBOX = join(HOME, 'inbox');
const OUTBOX = join(HOME, 'outbox');
const STATIC_DIR = join(__dirname, 'public');

// Agent role → emoji avatar + zone
const AVATARS = {
  'architect':      '🏛️',
  'frontend-dev':   '🎨',
  'backend-dev':    '⚙️',
  'data-engineer':  '📦',
  'devops':         '🚀',
  'qa-lead':        '📊',
  'tester':         '🧪',
  'code-reviewer':  '🔍',
  'reviewer':       '🔍',
  'coder':          '🧑‍💻',
  'researcher':     '🔬',
  'planner':        '🗺️',
  '_root':          '👤',
};

mkdirSync(HOME, { recursive: true });
mkdirSync(INBOX, { recursive: true });
mkdirSync(OUTBOX, { recursive: true });
if (!existsSync(EVENTS)) writeFileSync(EVENTS, '');

// ---------- State derivation ----------

// Initialize EventReader for efficient incremental reading
const eventReader = new EventReader(EVENTS, {
  maxCacheSize: 10000,
  rotateThreshold: 100 * 1024 * 1024
});

// Initialize cache on startup
await eventReader.readAll();

/**
 * In-memory state, rebuilt from cached events (efficient O(cache) not O(file)).
 */
function buildState() {
  // Use cached events instead of reading file
  const events = eventReader.cache;
  const agents = new Map();   // key: session_id + '/' + (agent_id || '')
  const tickets = new Map();  // key: ticket slug

  const IDLE_MS = 60_000; // if no event for 60s, consider agent idle

  for (const ev of events) {

    const key = `${ev.session_id}/${ev.agent_id || ''}`;
    const ticketKey = ev.ticket || ev.branch || '(main)';

    // Upsert ticket
    const ticket = tickets.get(ticketKey) || {
      id: ticketKey,
      repo: ev.repo,
      branch: ev.branch,
      repo_path: ev.repo_path,
      first_seen: ev.ts,
      last_activity: ev.ts,
      events: 0,
      agents: new Set(),
      status: 'active',
    };
    ticket.last_activity = Math.max(ticket.last_activity, ev.ts);
    ticket.events += 1;
    ticket.agents.add(key);
    tickets.set(ticketKey, ticket);

    // Upsert agent
    const agent = agents.get(key) || {
      id: key,
      session_id: ev.session_id,
      agent_id: ev.agent_id || null,
      name: ev.agent || '_root',
      ticket: ticketKey,
      repo: ev.repo,
      branch: ev.branch,
      status: 'idle',
      current_tool: null,
      current_file: null,
      last_prompt: null,
      last_notif: null,
      last_activity: ev.ts,
      created_at: ev.ts,
    };
    agent.last_activity = Math.max(agent.last_activity, ev.ts);

    switch (ev.kind) {
      case 'session_start':
        agent.status = 'working';
        break;
      case 'prompt_submit':
        agent.last_prompt = ev.prompt || null;
        agent.status = 'working';
        break;
      case 'pre_tool':
        agent.status = 'working';
        agent.current_tool = ev.tool || null;
        agent.current_file = ev.file || null;
        break;
      case 'post_tool':
        agent.current_tool = null;
        break;
      case 'notification':
        agent.status = 'waiting';
        agent.last_notif = ev.notif || 'Needs input';
        break;
      case 'stop':
      case 'subagent_stop':
        if (agent.status !== 'waiting') agent.status = 'idle';
        agent.current_tool = null;
        agent.current_file = null;
        break;
    }
    agents.set(key, agent);
  }

  // Age check: agents with no activity in IDLE_MS drop from working → idle
  const now = Date.now();
  for (const a of agents.values()) {
    if (a.status === 'working' && (now - a.last_activity) > IDLE_MS) {
      a.status = 'idle';
    }
    a.avatar = AVATARS[a.name] || '🤖';
    a.idle_for_ms = now - a.last_activity;
  }

  // Convert sets for JSON
  const ticketList = [...tickets.values()].map(t => ({
    ...t,
    agents: [...t.agents],
  })).sort((a, b) => b.last_activity - a.last_activity);

  return {
    generated_at: now,
    agency_home: HOME,
    agents: [...agents.values()].sort((a, b) => b.last_activity - a.last_activity),
    tickets: ticketList,
    counts: {
      total:   agents.size,
      working: [...agents.values()].filter(a => a.status === 'working').length,
      waiting: [...agents.values()].filter(a => a.status === 'waiting').length,
      idle:    [...agents.values()].filter(a => a.status === 'idle').length,
    },
    stats: eventReader.getStats(),
  };
}

// ---------- HTTP routing ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function serveStatic(req, res, path) {
  const safe = resolve(STATIC_DIR, '.' + path);
  if (!safe.startsWith(STATIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  const final = existsSync(safe) && statSync(safe).isFile()
    ? safe
    : join(STATIC_DIR, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(final)] || 'text/plain' });
  createReadStream(final).pipe(res);
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = []; let total = 0;
  for await (const c of req) { total += c.length; if (total > limit) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/state.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(buildState()));
  }

  if (url.pathname === '/api/unblock' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const { session_id, message } = body;
      if (!session_id || typeof message !== 'string') {
        res.writeHead(400); return res.end('session_id + message required');
      }
      const safe = session_id.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const slot = join(INBOX, `${safe}.txt`);
      writeFileSync(slot, message);
      // Also log the user's unblock as an event so it shows in the timeline
      appendFileSync(EVENTS, JSON.stringify({
        ts: Date.now(),
        kind: 'user_unblock',
        session_id,
        extra: message.slice(0, 500),
      }) + '\n');
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, slot }));
    } catch (e) {
      res.writeHead(500); return res.end(String(e));
    }
  }

  if (url.pathname === '/api/events.jsonl') {
    if (!existsSync(EVENTS)) { res.writeHead(200); return res.end(''); }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return createReadStream(EVENTS).pipe(res);
  }

  if (url.pathname === '/api/digest') {
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const cfgPath = process.env.AGENCY_ORCH_CONFIG;
    const config  = cfgPath && existsSync(cfgPath)
      ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
    const digest  = buildDigest({ home: HOME, date, config });
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ...digest, markdown: formatMarkdown(digest) }));
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, home: HOME }));
  }

  if (url.pathname === '/api/stats') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(eventReader.getStats()));
  }

  if (req.method === 'GET') return serveStatic(req, res, url.pathname === '/' ? '/index.html' : url.pathname);
  res.writeHead(404); res.end('not found');
});

// WebSocket server
const wss = new WebSocketServer({ server });

let eventWatcher = null;

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('[dashboard] WebSocket client connected');

  // Send current state immediately
  ws.send(JSON.stringify({
    type: 'full_state',
    data: buildState()
  }));

  ws.on('close', () => {
    console.log('[dashboard] WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.error('[dashboard] WebSocket error:', err);
  });
});

// Watch events.jsonl for changes and use EventReader for efficient reading
function startEventWatcher() {
  if (eventWatcher) return; // Already watching

  eventWatcher = watch(EVENTS, async (eventType) => {
    if (eventType === 'change') {
      const newEvents = await eventReader.readNew();

      if (newEvents.length > 0) {
        // Broadcast to all connected clients
        const message = JSON.stringify({
          type: 'incremental_events',
          data: newEvents
        });

        wss.clients.forEach((client) => {
          if (client.readyState === 1) { // OPEN
            client.send(message);
          }
        });

        // Check if rotation needed
        if (eventReader.shouldRotate()) {
          console.log('[dashboard] Event log rotation needed (>100MB)');
          // Could trigger rotation here
        }
      }
    }
  });
}

// Start watching when server starts
startEventWatcher();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[agency-dashboard] http://127.0.0.1:${PORT}`);
  console.log(`[agency-dashboard] reading events from ${EVENTS}`);
});
