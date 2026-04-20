// stuck-detector.mjs — heuristic rules for agents that are running but not
// making progress. These are the blockers the operator should address.

/**
 * @typedef {Object} HookEvent
 * @property {number} ts
 * @property {string} kind          pre_tool | post_tool | notification | stop | etc.
 * @property {string} [tool]        Read | Edit | Write | Bash | ...
 * @property {string} [file]
 */

/**
 * Evaluate a single ticket against all stuck rules. Returns the first match,
 * or null if the agent is making progress.
 *
 * @param {{status:string, last_event_at?:number, spawned_at?:number, had_file_change?:boolean, pending_stop?:boolean}} ticket
 * @param {HookEvent[]} recentEvents        Sliding window (most-recent-last) for this ticket
 * @param {{idle_timeout_ms?:number, tool_loop_threshold?:number, thrashing_window?:number}} config
 * @param {number} [now]
 * @returns {{reason:string, detail:string} | null}
 */
export function detectStuck(ticket, recentEvents, config, now = Date.now()) {
  // Skip tickets already in a terminal/known-waiting state.
  if (['done', 'halted', 'waiting', 'stuck'].includes(ticket.status)) return null;

  const idleTimeout        = config.idle_timeout_ms        ?? 600_000;
  const toolLoopThreshold  = config.tool_loop_threshold    ?? 5;
  const thrashingWindow    = config.thrashing_window       ?? 50;

  const lastAt = ticket.last_event_at || ticket.spawned_at || 0;

  // --- Rule A: idle — session alive but no events in too long ---
  if (lastAt && (now - lastAt) > idleTimeout) {
    return {
      reason: 'idle',
      detail: `no events for ${Math.floor((now - lastAt) / 60_000)}m`,
    };
  }

  if (!recentEvents || recentEvents.length === 0) return null;

  // --- Rule B: stop without file changes — ran, emitted Stop, but never
  //            edited a file. Classic "asked-a-question-and-returned" pattern. ---
  if (ticket.pending_stop && !ticket.had_file_change) {
    return {
      reason: 'stopped_no_changes',
      detail: 'agent stopped without editing any files — probably waiting on an answer it didn\'t call /wait-for-reply for',
    };
  }

  // --- Rule C: tool-loop — same tool on same file N+ times in a row ---
  if (recentEvents.length >= toolLoopThreshold) {
    const tail = recentEvents.slice(-toolLoopThreshold).filter(e => e.kind === 'pre_tool');
    if (tail.length >= toolLoopThreshold) {
      const first = tail[0];
      if (first.tool && first.file &&
          tail.every(e => e.tool === first.tool && e.file === first.file)) {
        return {
          reason: 'tool_loop',
          detail: `${first.tool} on ${first.file} ${tail.length} times in a row`,
        };
      }
    }
  }

  // --- Rule D: thrashing — large window with no Edit/Write activity ---
  if (recentEvents.length >= thrashingWindow) {
    const window = recentEvents.slice(-thrashingWindow);
    const touchedFiles = window.some(e => e.kind === 'pre_tool' && (e.tool === 'Edit' || e.tool === 'Write'));
    if (!touchedFiles) {
      return {
        reason: 'thrashing',
        detail: `${window.length} events without a single Edit/Write — agent may be reading forever`,
      };
    }
  }

  return null;
}
