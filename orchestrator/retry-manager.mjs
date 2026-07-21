// retry-manager.mjs - Handle retry logic for failed spawns

export class RetryManager {
  constructor(config = {}) {
    this.config = {
      max_attempts: 3,
      backoff_ms: [5000, 30000, 300000], // 5s, 30s, 5min
      ...config
    };
  }

  /**
   * Should we retry this ticket?
   * @returns {boolean, number} - [should_retry, delay_ms]
   */
  shouldRetry(ticketId, registry) {
    const ticket = registry.get(ticketId);
    if (!ticket) return [false, 0];

    const attempts = ticket.spawn_attempts || 0;
    if (attempts >= this.config.max_attempts) {
      return [false, 0];
    }

    const delay = this.config.backoff_ms[attempts] || 300000;
    return [true, delay];
  }

  /**
   * Mark retry attempt
   */
  markAttempt(ticketId, registry) {
    const ticket = registry.get(ticketId) || {};
    registry.update(ticketId, {
      spawn_attempts: (ticket.spawn_attempts || 0) + 1,
      last_attempt: Date.now()
    });
  }

  /**
   * Mark final failure
   */
  markFailed(ticketId, registry, reason) {
    registry.update(ticketId, {
      status: 'failed',
      failure_reason: reason,
      failed_at: Date.now()
    });
  }
}
