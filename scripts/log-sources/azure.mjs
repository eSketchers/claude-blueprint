// log-sources/azure.mjs — Azure Monitor Log Analytics adapter via the `az` CLI.

import { execFileSync } from 'node:child_process';
import { normalizeTimestamp, toMessage, getField, pickArray, matchesPatterns } from './_shared.mjs';

function buildQuery(cfg, hours) {
  if (cfg.query) return cfg.query;
  const table = cfg.table || 'AppTraces';
  return `${table} | where TimeGenerated > ago(${hours}h) | where SeverityLevel >= 3 or Message has "ERROR" | project TimeGenerated, Message | take 1000`;
}

/** Pure: map `az monitor log-analytics query --output json` rows to log rows. */
export function parseAzure(payload, { timestamp_field = 'TimeGenerated', message_field = 'Message', patterns } = {}) {
  const rows = typeof payload === 'string' ? JSON.parse(payload) : payload;
  return pickArray(rows)
    .map((r) => ({
      timestamp: normalizeTimestamp(getField(r, timestamp_field)),
      message: toMessage(getField(r, message_field) ?? r),
    }))
    .filter((r) => r.message)
    .filter((r) => matchesPatterns(r.message, patterns));
}

export function describe(cfg, ctx) {
  return `azure workspace=${cfg.workspace_id} query='${buildQuery(cfg, ctx.hours)}'`;
}

export async function fetch(cfg, ctx) {
  if (!cfg.workspace_id) throw new Error(`[source:${cfg.name}] 'workspace_id' is required for an azure source`);
  const out = execFileSync('az', [
    'monitor', 'log-analytics', 'query',
    '--workspace', cfg.workspace_id,
    '--analytics-query', buildQuery(cfg, ctx.hours),
    '--output', 'json',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  return parseAzure(out, { timestamp_field: cfg.timestamp_field, message_field: cfg.message_field, patterns: ctx.patterns });
}
