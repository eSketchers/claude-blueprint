// app.js — tiny vanilla client. Polls /api/state.json every 2s.
const POLL_MS = 2000;

const $ = (sel) => document.querySelector(sel);

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
  `;
  return tr;
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

async function tick() {
  try {
    const r = await fetch('/api/state.json');
    const state = await r.json();
    render(state);
  } catch {/* transient network errors are fine */}
}

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

tick();
setInterval(tick, POLL_MS);
