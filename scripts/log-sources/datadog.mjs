// log-sources/datadog.mjs — Datadog Logs Search API adapter.
// Needs api_key_env + app_key_env pointing at env vars holding the keys.

import { httpJson, requireEnv, normalizeTimestamp, toMessage, matchesPatterns } from './_shared.mjs';

/** Pure: map a Datadog `/logs/events/search` response to rows. */
export function parseDatadog(payload, patterns) {
  const data = (payload && payload.data) || [];
  return data
    .map((d) => {
      const a = d.attributes || {};
      return {
        timestamp: normalizeTimestamp(a.timestamp),
        message: toMessage(a.message ?? a.attributes?.message ?? a.attributes ?? ''),
      };
    })
    .filter((r) => r.message)
    .filter((r) => matchesPatterns(r.message, patterns));
}

export function describe(cfg) {
  return `datadog site=${cfg.site || 'datadoghq.com'} query="${cfg.query || 'status:error'}"`;
}

export async function fetch(cfg, ctx) {
  const site = cfg.site || 'datadoghq.com';
  const apiKey = requireEnv(cfg.api_key_env || 'DD_API_KEY', cfg.name);
  const appKey = requireEnv(cfg.app_key_env || 'DD_APP_KEY', cfg.name);
  const payload = await httpJson(`https://api.${site}/api/v2/logs/events/search`, {
    method: 'POST',
    headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey },
    body: {
      filter: {
        query: cfg.query || 'status:error',
        from: new Date(ctx.startTime * 1000).toISOString(),
        to: new Date(ctx.endTime * 1000).toISOString(),
      },
      page: { limit: Math.min(ctx.limit, 1000) },
      sort: '-timestamp',
    },
  });
  return parseDatadog(payload, ctx.patterns);
}
