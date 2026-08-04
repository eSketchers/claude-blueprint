// log-sources/elasticsearch.mjs — Elasticsearch / OpenSearch _search adapter.
// Auth: api_key_env -> "Authorization: ApiKey <key>" (optional).

import { httpJson, requireEnv, normalizeTimestamp, toMessage, getField, matchesPatterns } from './_shared.mjs';

/** Pure: map an ES `_search` response to rows. */
export function parseElasticsearch(payload, { timestamp_field = '@timestamp', message_field = 'message', patterns } = {}) {
  const hits = payload?.hits?.hits || [];
  return hits
    .map((h) => {
      const s = h._source || {};
      return {
        timestamp: normalizeTimestamp(getField(s, timestamp_field)),
        message: toMessage(getField(s, message_field) ?? s),
      };
    })
    .filter((r) => r.message)
    .filter((r) => matchesPatterns(r.message, patterns));
}

function buildBody(cfg, ctx) {
  if (cfg.query) return cfg.query; // full ES query DSL override
  const tsField = cfg.timestamp_field || '@timestamp';
  const msgField = cfg.message_field || 'message';
  const should = (ctx.patterns || []).map((p) => ({ match_phrase: { [msgField]: p } }));
  return {
    size: Math.min(ctx.limit, 1000),
    sort: [{ [tsField]: 'desc' }],
    query: {
      bool: {
        filter: [{ range: { [tsField]: { gte: new Date(ctx.startTime * 1000).toISOString() } } }],
        ...(should.length ? { should, minimum_should_match: 1 } : {}),
      },
    },
  };
}

export function describe(cfg) {
  return `elasticsearch ${cfg.base_url} index=${cfg.index || '_all'}`;
}

export async function fetch(cfg, ctx) {
  if (!cfg.base_url) throw new Error(`[source:${cfg.name}] 'base_url' is required for an elasticsearch source`);
  const base = cfg.base_url.replace(/\/$/, '');
  const headers = {};
  if (cfg.api_key_env) headers.authorization = `ApiKey ${requireEnv(cfg.api_key_env, cfg.name)}`;
  const payload = await httpJson(`${base}/${cfg.index || '_all'}/_search`, {
    method: 'POST', headers, body: buildBody(cfg, ctx),
  });
  return parseElasticsearch(payload, { timestamp_field: cfg.timestamp_field, message_field: cfg.message_field, patterns: ctx.patterns });
}
