// budget.mjs — cap enforcement + kill switch.
// We approximate spend from hook event counts (configurable rate).
// Real token counting is v2 — this is a circuit breaker, not billing.

import { existsSync } from 'node:fs';

export class Budget {
  /**
   * @param {{daily_usd_cap:number, per_ticket_usd_cap:number, cost_per_event_usd:number, killswitch_file:string}} config
   * @param {import('./registry.mjs').Registry} registry
   */
  constructor(config, registry) {
    this.config = {
      daily_usd_cap: 25,
      per_ticket_usd_cap: 2,
      cost_per_event_usd: 0.001,
      killswitch_file: null,
      ...config,
    };
    this.registry = registry;
  }

  /** Is the kill switch tripped? */
  killed() {
    return this.config.killswitch_file && existsSync(this.config.killswitch_file);
  }

  /** Can we spawn a new agent right now? */
  canSpawn() {
    if (this.killed()) return { ok: false, reason: 'killswitch active' };
    const today = this.registry.todaySpend();
    if (today >= this.config.daily_usd_cap) {
      return { ok: false, reason: `daily cap hit ($${today.toFixed(2)} / $${this.config.daily_usd_cap})` };
    }
    return { ok: true };
  }

  /** Should we halt an in-flight ticket? */
  shouldHalt(ticketId) {
    if (this.killed()) return { halt: true, reason: 'killswitch active' };
    const spent = this.registry.ticketSpend(ticketId);
    if (spent >= this.config.per_ticket_usd_cap) {
      return { halt: true, reason: `ticket cap hit ($${spent.toFixed(2)} / $${this.config.per_ticket_usd_cap})` };
    }
    const today = this.registry.todaySpend();
    if (today >= this.config.daily_usd_cap) {
      return { halt: true, reason: `daily cap hit ($${today.toFixed(2)} / $${this.config.daily_usd_cap})` };
    }
    return { halt: false };
  }

  /** Attribute a hook event to a ticket's running total */
  chargeEvent(ticketId) {
    if (!ticketId) return;
    this.registry.addSpend(ticketId, this.config.cost_per_event_usd);
  }

  /** Crossed a threshold since last report? Returns { warn, reason } or null */
  checkThresholds() {
    const today = this.registry.todaySpend();
    const cap = this.config.daily_usd_cap;
    if (today >= cap * 0.9 && today < cap) return { warn: true, reason: `90% of daily cap used ($${today.toFixed(2)} / $${cap})` };
    if (today >= cap) return { warn: true, reason: `daily cap hit ($${today.toFixed(2)} / $${cap})` };
    return null;
  }
}
