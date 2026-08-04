// log-sources/gcp.mjs — Google Cloud Logging adapter via the `gcloud` CLI.

import { execFileSync } from 'node:child_process';
import { normalizeTimestamp, toMessage, matchesPatterns } from './_shared.mjs';

/** Pure: map `gcloud logging read --format=json` entries to rows. */
export function parseGcp(payload, patterns) {
  const entries = typeof payload === 'string' ? JSON.parse(payload) : payload;
  return (Array.isArray(entries) ? entries : [])
    .map((e) => ({
      timestamp: normalizeTimestamp(e.timestamp || e.receiveTimestamp),
      message: toMessage(e.textPayload ?? e.jsonPayload?.message ?? e.jsonPayload ?? e.protoPayload ?? ''),
    }))
    .filter((r) => r.message)
    .filter((r) => matchesPatterns(r.message, patterns));
}

function buildFilter(cfg, hours) {
  if (cfg.filter) return cfg.filter;
  return `severity>=ERROR AND timestamp>="${new Date(Date.now() - hours * 3600 * 1000).toISOString()}"`;
}

export function describe(cfg, ctx) {
  return `gcp project=${cfg.project || '(default)'} filter='${buildFilter(cfg, ctx.hours)}' limit=${ctx.limit}`;
}

export async function fetch(cfg, ctx) {
  const args = ['logging', 'read', buildFilter(cfg, ctx.hours), '--format=json', `--limit=${ctx.limit}`];
  if (cfg.project) args.push(`--project=${cfg.project}`);
  const out = execFileSync('gcloud', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  return parseGcp(out, ctx.patterns);
}
