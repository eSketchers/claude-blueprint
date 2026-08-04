// log-sources/cloudwatch.mjs — AWS CloudWatch Logs Insights adapter.
// Drives the `aws logs` CLI (read-only). Filtering is pushed server-side via
// the Insights query, so no client-side pattern filter is needed.

import { execFileSync } from 'node:child_process';

/** Build a Logs Insights query string from the pattern list. */
export function buildInsightsQuery(patterns, limit) {
  const alts = (patterns && patterns.length ? patterns : ['ERROR'])
    .map((p) => String(p).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('|');
  return [
    'fields @timestamp, @message',
    `filter @message like /(?i)(${alts})/`,
    'sort @timestamp desc',
    `limit ${limit}`,
  ].join('\n| ');
}

/** Pure: turn Insights `results` (array of arrays of {field,value}) into rows. */
export function parseCloudwatchResults(results, logGroup) {
  return (results || [])
    .map((row) => {
      const rec = Object.fromEntries(row.map((f) => [f.field, f.value]));
      return { timestamp: rec['@timestamp'] || '', message: rec['@message'] || '', logGroup };
    })
    .filter((r) => r.message);
}

function aws(profile, region, subArgs) {
  const base = [];
  if (profile) base.push('--profile', profile);
  if (region) base.push('--region', region);
  return execFileSync('aws', [...base, ...subArgs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function queryLogGroup({ profile, region, logGroup, queryStr, startTime, endTime }) {
  const startOut = aws(profile, region, [
    'logs', 'start-query',
    '--log-group-name', logGroup,
    '--start-time', String(startTime),
    '--end-time', String(endTime),
    '--query-string', queryStr,
    '--output', 'json',
  ]);
  const queryId = JSON.parse(startOut).queryId;

  const deadline = Date.now() + 120000; // 2 min cap per group
  let results = null;
  while (Date.now() < deadline) {
    execFileSync('sleep', ['2']);
    const out = aws(profile, region, ['logs', 'get-query-results', '--query-id', queryId, '--output', 'json']);
    const parsed = JSON.parse(out);
    if (parsed.status === 'Complete') { results = parsed.results; break; }
    if (parsed.status === 'Failed' || parsed.status === 'Cancelled') {
      throw new Error(`query ${parsed.status} for ${logGroup}`);
    }
  }
  if (results === null) throw new Error(`query timed out for ${logGroup}`);
  return parseCloudwatchResults(results, logGroup);
}

export function describe(cfg, ctx) {
  const q = buildInsightsQuery(ctx.patterns, ctx.limit).replace(/\n/g, ' ');
  return `cloudwatch profile=${cfg.profile || 'default'} region=${cfg.region || 'us-east-1'} `
    + `groups=[${(cfg.log_groups || []).join(', ')}] query="${q}"`;
}

export async function fetch(cfg, ctx) {
  const profile = cfg.profile || 'default';
  const region = cfg.region || process.env.AWS_REGION || 'us-east-1';
  const queryStr = buildInsightsQuery(ctx.patterns, ctx.limit);
  const rows = [];
  for (const logGroup of cfg.log_groups || []) {
    rows.push(...queryLogGroup({ profile, region, logGroup, queryStr, startTime: ctx.startTime, endTime: ctx.endTime }));
  }
  return rows;
}
