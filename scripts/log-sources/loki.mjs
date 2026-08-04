// log-sources/loki.mjs — Grafana Loki query_range adapter.

import { httpJson, normalizeTimestamp, matchesPatterns } from './_shared.mjs';

/** Pure: flatten a Loki query_range response (streams of [ns, line]) to rows. */
export function parseLoki(payload, patterns) {
  const result = payload?.data?.result || [];
  const rows = [];
  for (const stream of result) {
    for (const [ns, line] of stream.values || []) {
      rows.push({ timestamp: normalizeTimestamp(Math.floor(Number(ns) / 1e6)), message: String(line) });
    }
  }
  return rows.filter((r) => matchesPatterns(r.message, patterns));
}

export function describe(cfg) {
  return `loki ${cfg.base_url} query='${cfg.query || '{job=~".+"} |= "ERROR"'}'`;
}

export async function fetch(cfg, ctx) {
  if (!cfg.base_url) throw new Error(`[source:${cfg.name}] 'base_url' is required for a loki source`);
  const base = cfg.base_url.replace(/\/$/, '');
  const q = cfg.query || '{job=~".+"} |= "ERROR"';
  const url = `${base}/loki/api/v1/query_range`
    + `?query=${encodeURIComponent(q)}`
    + `&start=${ctx.startTime * 1e9}&end=${ctx.endTime * 1e9}&limit=${ctx.limit}&direction=backward`;
  const headers = {};
  if (cfg.tenant) headers['X-Scope-OrgID'] = cfg.tenant;
  const payload = await httpJson(url, { headers });
  return parseLoki(payload, ctx.patterns);
}
