// log-sources/command.mjs — universal adapter. Runs an arbitrary shell command
// (any CLI / query that emits log lines or JSON) and parses its stdout. This is
// the escape hatch that makes log-triage work with ANY provider without a
// dedicated adapter. Filtering is client-side via the global patterns.

import { execSync } from 'node:child_process';
import { parseRows } from './_shared.mjs';

export function describe(cfg) {
  return `command run="${cfg.run}" format=${cfg.format || 'lines'}`;
}

export async function fetch(cfg, ctx) {
  if (!cfg.run) throw new Error(`[source:${cfg.name}] 'run' is required for a command source`);
  const stdout = execSync(cfg.run, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
    env: { ...process.env, LOG_TRIAGE_HOURS: String(ctx.hours ?? '') },
  });
  return parseRows(stdout, {
    format: cfg.format || 'lines',
    timestamp_field: cfg.timestamp_field || 'timestamp',
    message_field: cfg.message_field || 'message',
    patterns: ctx.patterns,
  });
}
