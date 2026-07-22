// app.js — tiny vanilla client. WebSocket with polling fallback.
const POLL_MS = 2000;

const $ = (sel) => document.querySelector(sel);

// WebSocket support
let ws = null;
let reconnectTimeout = null;
let fallbackInterval = null;

function connectWebSocket() {
  // Clear any existing reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    // Stop polling if we were in fallback mode
    if (fallbackInterval) {
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === 'full_state') {
        // Replace entire state
        updateUI(message.data);
      } else if (message.type === 'incremental_events') {
        // Apply incremental updates
        applyIncrementalUpdates(message.data);
      }
    } catch (err) {
      console.error('Failed to process WebSocket message:', err);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected, falling back to polling');
    ws = null;

    // Start polling as fallback
    if (!fallbackInterval) {
      fallbackInterval = setInterval(fetchState, POLL_MS);
    }

    // Try to reconnect after 5 seconds
    reconnectTimeout = setTimeout(connectWebSocket, 5000);
  };
}

// Update UI with state data
function updateUI(state) {
  render(state);
}

// Apply incremental updates
function applyIncrementalUpdates(events) {
  // For simplicity, just refetch full state
  fetchState();
}

function fmtAgo(ms) {
  if (ms < 60_000)      return Math.floor(ms / 1000) + 's ago';
  if (ms < 3_600_000)   return Math.floor(ms / 60_000) + 'm ago';
  if (ms < 86_400_000)  return Math.floor(ms / 3_600_000) + 'h ago';
  return Math.floor(ms / 86_400_000) + 'd ago';
}

function agentCard(a) {
  const card = document.createElement('div');
  card.className = 'card';
  if (a.status === 'waiting') card.classList.add('actionable');
  const head = document.createElement('div');
  head.className = 'card-head';
  head.innerHTML = `
    <span class="avatar">${a.avatar}</span>
    <div>
      <div class="card-name">${escapeHtml(a.name)}</div>
      <div class="card-sub">
        <span class="pulse ${a.status}"></span>
        ${escapeHtml(a.status)}
        ${a.ticket ? `· <span class="tag">${escapeHtml(a.ticket)}</span>` : ''}
      </div>
    </div>
  `;
  card.appendChild(head);

  if (a.current_tool) {
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = `${a.current_tool}${a.current_file ? ' ' + short(a.current_file) : ''}`;
    card.appendChild(meta);
  }
  if (a.last_notif && a.status === 'waiting') {
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = `"${a.last_notif}"`;
    card.appendChild(meta);
  }
  const foot = document.createElement('div');
  foot.className = 'card-meta';
  foot.textContent = `${a.repo || ''} · ${fmtAgo(a.idle_for_ms)}`;
  card.appendChild(foot);

  if (a.status === 'waiting') {
    card.addEventListener('click', () => openUnblockModal(a));
  }
  return card;
}

function ticketRow(t) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><code>${escapeHtml(t.id)}</code></td>
    <td>${escapeHtml(t.repo || '')}</td>
    <td>${t.agents.length}</td>
    <td>${fmtAgo(Date.now() - t.last_activity)}</td>
    <td><button class="ghost view-logs-btn">View Logs</button></td>
  `;
  tr.querySelector('.view-logs-btn').addEventListener('click', () => openLogModal(t.id));
  return tr;
}

// Log viewer modal — polls /api/agent-log/:ticket on an interval while open.
// Deliberately polling, not WebSocket-pushed: keeps this feature self-contained
// (no per-ticket server-side file watchers / subscription bookkeeping) while
// still satisfying the core ask (see what an agent is doing without shelling
// into agent-logs/*.log by hand).
const LOG_POLL_MS = 2000;
let logModalInterval = null;

function closeLogModal() {
  if (logModalInterval) { clearInterval(logModalInterval); logModalInterval = null; }
  $('#modal-root').innerHTML = '';
}

async function refreshLogModal(ticketId) {
  const pre = document.getElementById('log-modal-content');
  if (!pre) { closeLogModal(); return; } // modal was closed since the last tick
  try {
    const r = await fetch(`/api/agent-log/${encodeURIComponent(ticketId)}?lines=200`);
    if (r.status === 404) {
      pre.textContent = '(no log file yet for this ticket)';
      return;
    }
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const wasAtBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
    pre.textContent = data.lines.join('\n');
    if (wasAtBottom) pre.scrollTop = pre.scrollHeight;
  } catch {/* transient network errors — leave prior content visible */}
}

function openLogModal(ticketId) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal modal-wide">
        <h3>Log: <code>${escapeHtml(ticketId)}</code></h3>
        <pre id="log-modal-content" class="log-viewer">Loading…</pre>
        <div class="actions">
          <button class="ghost" id="log-modal-close">Close</button>
        </div>
      </div>
    </div>
  `;
  $('#log-modal-close').addEventListener('click', closeLogModal);
  refreshLogModal(ticketId);
  if (logModalInterval) clearInterval(logModalInterval);
  logModalInterval = setInterval(() => refreshLogModal(ticketId), LOG_POLL_MS);
}

function render(state) {
  $('#c-working').textContent = state.counts.working;
  $('#c-waiting').textContent = state.counts.waiting;
  $('#c-idle').textContent    = state.counts.idle;
  $('#updated').textContent   = new Date(state.generated_at).toLocaleTimeString();

  const working = state.agents.filter(a => a.status === 'working');
  const waiting = state.agents.filter(a => a.status === 'waiting');
  const idle    = state.agents.filter(a => a.status === 'idle');

  paint('#cards-working', working.map(agentCard));
  paint('#cards-waiting', waiting.map(agentCard));
  paint('#cards-idle',    idle.map(agentCard));

  const tbody = $('#ticket-table tbody');
  tbody.replaceChildren(...state.tickets.map(ticketRow));
}

function paint(sel, nodes) {
  const root = $(sel);
  root.replaceChildren(...nodes);
}

// Unblock modal
function openUnblockModal(agent) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h3>Unblock ${escapeHtml(agent.name)} <small>(${escapeHtml(agent.session_id)})</small></h3>
        ${agent.last_notif ? `<div class="notif">${escapeHtml(agent.last_notif)}</div>` : ''}
        <textarea id="unblock-text" placeholder="Reply that clears the roadblock..."></textarea>
        <div class="actions">
          <button class="ghost" id="unblock-cancel">Cancel</button>
          <button id="unblock-send">Send</button>
        </div>
      </div>
    </div>
  `;
  $('#unblock-cancel').addEventListener('click', () => root.innerHTML = '');
  $('#unblock-send').addEventListener('click', async () => {
    const message = $('#unblock-text').value.trim();
    if (!message) return;
    try {
      const r = await fetch('/api/unblock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: agent.session_id, message }),
      });
      if (!r.ok) throw new Error(await r.text());
      root.innerHTML = '';
      toast(`Reply sent to ${agent.name}. If they're on /wait-for-reply, they'll resume in a few seconds.`);
      tick();
    } catch (e) {
      alert('Failed to send: ' + e.message);
    }
  });
  $('#unblock-text').focus();
}

async function fetchState() {
  try {
    const r = await fetch('/api/state.json');
    const state = await r.json();
    render(state);
  } catch {/* transient network errors are fine */}
}

async function tick() {
  // Only fetch if WebSocket is not connected
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    await fetchState();
  }
  try {
    const r = await fetch('/api/digest');
    if (r.ok) renderDigest(await r.json());
  } catch {}
}

function renderDigest(d) {
  $('#digest-date').textContent = d.date;
  const c = d.counts || {};
  const spend = d.daily_cap_usd != null
    ? `$${(d.spend_today_usd||0).toFixed(2)} / $${d.daily_cap_usd}`
    : `$${(d.spend_today_usd||0).toFixed(2)}`;
  $('#digest-summary').innerHTML = `
    <span class="stat"><b>${c.picked_up||0}</b> picked up</span>
    <span class="stat"><b class="ok">${c.completed||0}</b> done</span>
    <span class="stat"><b class="warn">${c.blocked||0}</b> blocked</span>
    <span class="stat"><b class="warn">${c.stuck||0}</b> stuck</span>
    <span class="stat"><b>${c.active||0}</b> active</span>
    <span class="stat"><b class="danger">${c.halted||0}</b> halted</span>
    <span class="stat">💰 ${spend}</span>
  `;
  $('#digest-md').textContent = d.markdown || '';
}

// "Send now" — on-demand digest delivery (uses the orchestrator's Slack webhook).
// Client-only handler: hits the digest endpoint to render, then advises the user
// to `./scripts/daily-digest.sh --send` for Slack delivery (dashboard alone can't
// call notifier because it doesn't hold the webhook URL).
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('digest-send');
  if (btn) btn.addEventListener('click', () => {
    toast('To send to Slack, run:  node orchestrator/digest.mjs --send  (or cron the same)');
  });
});

function toast(msg, ms = 4500) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._tid);
  toast._tid = setTimeout(() => t.classList.remove('show'), ms);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function short(p) {
  if (!p) return '';
  const parts = p.split('/');
  return parts.slice(-2).join('/');
}

// Connect WebSocket on page load
connectWebSocket();

// Initial tick and periodic polling (only used as fallback when WebSocket fails)
tick();
setInterval(tick, POLL_MS);
