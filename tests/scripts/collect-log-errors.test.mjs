// collect-log-errors.test.mjs — tests for the multi-source log collector core
// and each adapter's pure payload-parser. No network / CLI / creds needed:
// adapters isolate their fetch call from a pure parse function, tested here on
// canned provider responses.
//
// Run: node --test tests/scripts/collect-log-errors.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { signature, cluster, buildQuery, SOURCE_REGISTRY } from '../../scripts/collect-log-errors.mjs';
import { normalizeTimestamp, matchesPatterns, parseRows, getField } from '../../scripts/log-sources/_shared.mjs';
import { parseCloudwatchResults } from '../../scripts/log-sources/cloudwatch.mjs';
import { parseGcp } from '../../scripts/log-sources/gcp.mjs';
import { parseDatadog } from '../../scripts/log-sources/datadog.mjs';
import { parseSentry } from '../../scripts/log-sources/sentry.mjs';
import { parseLoki } from '../../scripts/log-sources/loki.mjs';
import { parseElasticsearch } from '../../scripts/log-sources/elasticsearch.mjs';

// ---------------- clustering core (provider-agnostic) ----------------

test('signature(): collapses timestamps, uuids, hex, ip, email, numbers', () => {
  const a = signature('2026-08-03T10:00:00Z ERROR order 12 cart 6f1e2c3d-1111-2222-3333-444455556666 at 0xABCD from 10.0.0.5 (u@x.io)');
  const b = signature('2026-08-01T22:14:59.5Z ERROR order 987 cart aaaa1111-2222-3333-4444-555566667777 at 0x12 from 192.168.1.1 (dev@lula.com)');
  assert.equal(a, b);
});

test('cluster(): ranks by count desc, honors min_occurrences, dedupes sources', () => {
  const rows = [
    { timestamp: '2026-08-03T10:00:00Z', message: 'ERROR db timeout after 30s', source: 'cloudwatch:a' },
    { timestamp: '2026-08-03T11:00:00Z', message: 'ERROR db timeout after 45s', source: 'gcp:b' },
    { timestamp: '2026-08-03T12:00:00Z', message: 'WARN cache miss', source: 'cloudwatch:a' },
  ];
  const c = cluster(rows, 2);
  assert.equal(c.length, 1);
  assert.equal(c[0].count, 2);
  assert.deepEqual(c[0].sources.sort(), ['cloudwatch:a', 'gcp:b']);
});

test('SOURCE_REGISTRY: every advertised type is registered with fetch + describe', () => {
  for (const t of ['cloudwatch', 'gcp', 'azure', 'datadog', 'sentry', 'loki', 'elasticsearch', 'command', 'file']) {
    assert.ok(SOURCE_REGISTRY[t], `missing adapter: ${t}`);
    assert.equal(typeof SOURCE_REGISTRY[t].fetch, 'function', `${t}.fetch`);
    assert.equal(typeof SOURCE_REGISTRY[t].describe, 'function', `${t}.describe`);
  }
});

test('buildQuery(): escapes patterns and applies limit (CloudWatch Insights)', () => {
  const q = buildQuery(['ERROR', '5xx', 'Exception'], 500);
  assert.match(q, /filter @message like \/\(\?i\)\(ERROR\|5xx\|Exception\)\//);
  assert.match(q, /limit 500/);
});

// ---------------- shared helpers ----------------

test('normalizeTimestamp(): epoch seconds, millis, ISO, and passthrough', () => {
  assert.equal(normalizeTimestamp(1754200800), '2025-08-03T06:00:00.000Z');
  assert.equal(normalizeTimestamp(1754200800000), '2025-08-03T06:00:00.000Z');
  assert.equal(normalizeTimestamp('2026-08-03T10:00:00Z'), '2026-08-03T10:00:00.000Z');
  assert.equal(normalizeTimestamp(''), '');
});

test('matchesPatterns(): case-insensitive OR; empty patterns match all', () => {
  assert.equal(matchesPatterns('an ERROR happened', ['error']), true);
  assert.equal(matchesPatterns('all good', ['error', 'fatal']), false);
  assert.equal(matchesPatterns('anything', []), true);
});

test('getField(): dotted path', () => {
  assert.equal(getField({ a: { b: { c: 5 } } }, 'a.b.c'), 5);
});

test('parseRows(): lines format filters by pattern', () => {
  const rows = parseRows('ERROR boom\ninfo fine\nFATAL crash', { format: 'lines', patterns: ['error', 'fatal'] });
  assert.deepEqual(rows.map((r) => r.message), ['ERROR boom', 'FATAL crash']);
});

test('parseRows(): jsonl format with field mapping', () => {
  const jsonl = '{"ts":1754200800,"msg":"ERROR a"}\n{"ts":1754200801,"msg":"ok b"}';
  const rows = parseRows(jsonl, { format: 'jsonl', timestamp_field: 'ts', message_field: 'msg', patterns: ['error'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message, 'ERROR a');
  assert.equal(rows[0].timestamp, '2025-08-03T06:00:00.000Z');
});

// ---------------- per-adapter pure parsers ----------------

test('parseCloudwatchResults(): Insights field/value rows', () => {
  const results = [[{ field: '@timestamp', value: '2026-08-03 10:00:00.000' }, { field: '@message', value: 'ERROR x' }]];
  const rows = parseCloudwatchResults(results, '/ecs/orders');
  assert.equal(rows[0].message, 'ERROR x');
  assert.equal(rows[0].logGroup, '/ecs/orders');
});

test('parseGcp(): textPayload + jsonPayload fallback, pattern filter', () => {
  const rows = parseGcp([
    { timestamp: '2026-08-03T10:00:00Z', textPayload: 'ERROR boom' },
    { timestamp: '2026-08-03T10:01:00Z', jsonPayload: { message: 'INFO fine' } },
  ], ['error']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message, 'ERROR boom');
});

test('parseDatadog(): attributes.timestamp + message', () => {
  const rows = parseDatadog({ data: [{ attributes: { timestamp: 1754200800000, message: 'ERROR ddog' } }] }, ['error']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message, 'ERROR ddog');
  assert.equal(rows[0].timestamp, '2025-08-03T06:00:00.000Z');
});

test('parseSentry(): issue -> single row with count', () => {
  const rows = parseSentry([{ title: 'TypeError: x', culprit: 'orders/handler', count: 42, lastSeen: '2026-08-03T10:00:00Z' }], null);
  assert.equal(rows.length, 1);
  assert.match(rows[0].message, /TypeError: x @ orders\/handler \[42 events\]/);
});

test('parseLoki(): flattens streams, converts ns timestamps', () => {
  const rows = parseLoki({ data: { result: [{ stream: { app: 'o' }, values: [['1754200800000000000', 'ERROR loki']] }] } }, ['error']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message, 'ERROR loki');
  assert.equal(rows[0].timestamp, '2025-08-03T06:00:00.000Z');
});

test('parseElasticsearch(): hits._source with field mapping', () => {
  const payload = { hits: { hits: [{ _source: { '@timestamp': '2026-08-03T10:00:00Z', message: 'ERROR es' } }] } };
  const rows = parseElasticsearch(payload, { patterns: ['error'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message, 'ERROR es');
});
