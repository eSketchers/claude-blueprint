// stuck-detector.mjs — heuristic rules for agents that are running but not
// making progress. These are the blockers the operator should address.

/**
 * @typedef {Object} HookEvent
 * @property {number} ts
 * @property {string} kind          pre_tool | post_tool | notification | stop | etc.
 * @property {string} [tool]        Read | Edit | Write | Bash | ...
 * @property {string} [file]
 */

/** Convert a shell-style glob (only `*` is special) to a RegExp, fully anchored. */
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Does this ticket match any whitelist pattern? Patterns are glob-style
 * (`*` wildcard) and checked against both the ticket id (e.g. "gh:org/repo#42")
 * and every label — whichever an operator finds easier to target for their
 * ticket source.
 *
 * @param {{id?:string, labels?:string[]}} ticket
 * @param {string[]} whitelist
 */
export function isWhitelisted(ticket, whitelist) {
  if (!whitelist || whitelist.length === 0) return false;
  const candidates = [ticket?.id, ...(ticket?.labels || [])].filter(Boolean);
  if (candidates.length === 0) return false;

  return whitelist.some(pattern => {
    const re = globToRegExp(pattern);
    return candidates.some(c => re.test(c));
  });
}

/**
 * Evaluate a single ticket against all stuck rules. Returns the first match,
 * or null if the agent is making progress.
 *
 * @param {{status:string, last_event_at?:number, spawned_at?:number, had_file_change?:boolean, pending_stop?:boolean, id?:string, labels?:string[]}} ticket
 * @param {HookEvent[]} recentEvents        Sliding window (most-recent-last) for this ticket
 * @param {{idle_timeout_ms?:number, tool_loop_threshold?:number, thrashing_window?:number, whitelist?:string[]}} config
 * @param {number} [now]
 * @returns {{reason:string, detail:string} | null}
 */
export function detectStuck(ticket, recentEvents, config, now = Date.now()) {
  // Skip tickets already in a terminal/known-waiting state.
  if (['done', 'halted', 'waiting', 'stuck'].includes(ticket.status)) return null;

  // Skip tickets an operator has explicitly excluded from stuck detection —
  // e.g. long research spikes or infra tasks expected to go long without
  // touching a file. Matched against the ticket id and its labels.
  if (isWhitelisted(ticket, config.whitelist)) return null;

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
