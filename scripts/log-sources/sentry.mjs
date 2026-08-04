// log-sources/sentry.mjs — Sentry issues adapter (each unresolved issue = one row).
// Needs token_env pointing at an env var holding a Sentry auth token.

import { httpJson, requireEnv, normalizeTimestamp, matchesPatterns } from './_shared.mjs';

/** Pure: map a Sentry issues list response to rows. */
export function parseSentry(issues, patterns) {
  return (Array.isArray(issues) ? issues : [])
    .map((i) => ({
      timestamp: normalizeTimestamp(i.lastSeen),
      message: `${i.title || i.metadata?.value || '(issue)'}${i.culprit ? ` @ ${i.culprit}` : ''} [${i.count ?? '?'} events]`,
    }))
    .filter((r) => matchesPatterns(r.message, patterns));
}

export function describe(cfg) {
  return `sentry ${cfg.base_url || 'https://sentry.io'} org=${cfg.org} project=${cfg.project}`;
}

export async function fetch(cfg, ctx) {
  const base = (cfg.base_url || 'https://sentry.io').replace(/\/$/, '');
  const token = requireEnv(cfg.token_env || 'SENTRY_AUTH_TOKEN', cfg.name);
  const period = `${ctx.hours}h`;
  const url = `${base}/api/0/projects/${cfg.org}/${cfg.project}/issues/`
    + `?query=${encodeURIComponent('is:unresolved')}&statsPeriod=${period}&limit=${Math.min(ctx.limit, 100)}`;
  const issues = await httpJson(url, { headers: { authorization: `Bearer ${token}` } });
  return parseSentry(issues, ctx.patterns);
}
