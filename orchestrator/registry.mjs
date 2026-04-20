// registry.mjs — JSON-file ticket registry. Tracks what we've seen,
// what's running, what's done. Single writer (the orchestrator).

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export class Registry {
  /**
   * @param {string} home  ~/.claude-agency dir
   */
  constructor(home) {
    this.path = join(home, 'registry.json');
    this.state = existsSync(this.path)
      ? JSON.parse(readFileSync(this.path, 'utf8'))
      : { tickets: {}, daily_spend: {}, updated_at: 0 };
  }

  /** Atomic write via rename */
  _flush() {
    this.state.updated_at = Date.now();
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.path);
  }

  /** Has this ticket ever been picked up? */
  has(ticketId) { return Boolean(this.state.tickets[ticketId]); }

  /** Get a ticket's state or null */
  get(ticketId) { return this.state.tickets[ticketId] || null; }

  /** Record a newly claimed ticket */
  claim(ticketId, fields) {
    this.state.tickets[ticketId] = {
      id: ticketId,
      status: 'spawning',
      claimed_at: Date.now(),
      ...fields,
    };
    this._flush();
  }

  /** Update status + metadata */
  update(ticketId, patch) {
    const prev = this.state.tickets[ticketId];
    if (!prev) return;
    this.state.tickets[ticketId] = { ...prev, ...patch, updated_at: Date.now() };
    this._flush();
  }

  /** List all tickets, optionally filtered by status */
  list(status = null) {
    const all = Object.values(this.state.tickets);
    return status ? all.filter(t => t.status === status) : all;
  }

  // --- Budget tracking (daily spend, keyed by YYYY-MM-DD) ---

  dayKey(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 10);
  }

  addSpend(ticketId, amountUsd) {
    const day = this.dayKey();
    this.state.daily_spend[day] = (this.state.daily_spend[day] || 0) + amountUsd;

    const t = this.state.tickets[ticketId];
    if (t) {
      t.spend_usd = (t.spend_usd || 0) + amountUsd;
      t.updated_at = Date.now();
    }
    this._flush();
  }

  todaySpend() {
    return this.state.daily_spend[this.dayKey()] || 0;
  }

  ticketSpend(ticketId) {
    const t = this.state.tickets[ticketId];
    return t ? (t.spend_usd || 0) : 0;
  }
}
