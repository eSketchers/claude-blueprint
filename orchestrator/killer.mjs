// killer.mjs — force-kill logic for halted tickets.
//
// spawn.mjs launches the agent with `detached: true`, making it its own
// process-group leader. Killing only the top-level pid would leave behind
// any subprocesses the CLI forks (git, test runners, etc.) — so we signal
// the whole group via the negative pid.
//
// Extracted from server.mjs so it can be unit-tested without importing the
// daemon's top-level side effects (config load, process.exit, setInterval).

/** Is this pid still alive? */
export function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export class Killer {
  /**
   * @param {{registry: import('./registry.mjs').Registry, notifier: import('./notifier.mjs').Notifier, graceMs?: number, kill?: (pid:number, signal:string) => void, isAlive?: (pid:number) => boolean}} deps
   */
  constructor({ registry, notifier, graceMs = 30_000, kill = process.kill.bind(process), isAlive: isAliveFn = isAlive }) {
    this.registry = registry;
    this.notifier = notifier;
    this.graceMs = graceMs;
    this._kill = kill;
    this._isAlive = isAliveFn;
    this.sigkillTimers = new Map(); // ticketId -> timeoutId
  }

  /** True if a SIGKILL grace timer is already pending for this ticket. */
  isPending(ticketId) {
    return this.sigkillTimers.has(ticketId);
  }

  /** Terminate a halted ticket's spawned agent (process group). */
  kill(ticketId, pid, reason) {
    if (!pid || this.isPending(ticketId)) return;

    if (!this._isAlive(pid)) {
      this.registry.update(ticketId, { killed_at: Date.now(), kill_signal: null });
      return;
    }

    console.log(`[killswitch] SIGTERM -> pid ${pid} (group) for ${ticketId} (${reason})`);
    try { this._kill(-pid, 'SIGTERM'); } catch (e) { console.error(`[killswitch] SIGTERM failed for ${ticketId}:`, e.message); }
    this.registry.update(ticketId, { kill_signal: 'SIGTERM', kill_sent_at: Date.now() });

    const timeoutId = setTimeout(() => {
      this.sigkillTimers.delete(ticketId);
      if (this._isAlive(pid)) {
        console.log(`[killswitch] SIGTERM did not stop ${ticketId} within ${this.graceMs}ms, sending SIGKILL -> pid ${pid} (group)`);
        try { this._kill(-pid, 'SIGKILL'); } catch (e) { console.error(`[killswitch] SIGKILL failed for ${ticketId}:`, e.message); }
        this.registry.update(ticketId, { kill_signal: 'SIGKILL', killed_at: Date.now() });
        this.notifier.notify('error', {
          title: `Force-killed ${ticketId}`,
          body: `Did not exit within ${this.graceMs}ms of SIGTERM; sent SIGKILL.`,
          ticket_id: ticketId,
        });
      } else {
        this.registry.update(ticketId, { killed_at: Date.now() });
      }
    }, this.graceMs);
    timeoutId.unref?.();

    this.sigkillTimers.set(ticketId, timeoutId);
  }

  /**
   * Sweep every ticket whose status implies an agent may be running and
   * force-kill any that should be halted per budget rules — including
   * tickets that stopped emitting events entirely and so never hit the
   * per-event halt check in server.mjs's onEvent().
   *
   * @param {import('./budget.mjs').Budget} budget
   */
  sweep(budget) {
    const active = new Set(['spawning', 'in_progress', 'stuck', 'waiting', 'halted']);
    for (const ticket of this.registry.list()) {
      if (!active.has(ticket.status) || !ticket.spawned_pid) continue;

      const halt = budget.shouldHalt(ticket.id);
      if (!halt.halt) continue;

      if (ticket.status !== 'halted') {
        this.registry.update(ticket.id, { status: 'halted', halt_reason: halt.reason });
        this.notifier.notify('budget_cap', { title: `Halted ${ticket.id}`, body: halt.reason, ticket_id: ticket.id });
      }
      if (ticket.kill_signal === 'SIGKILL' && !this._isAlive(ticket.spawned_pid)) continue;
      this.kill(ticket.id, ticket.spawned_pid, halt.reason);
    }
  }
}
