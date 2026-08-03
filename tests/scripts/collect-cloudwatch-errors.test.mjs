// collect-cloudwatch-errors.test.mjs — tests for the pure helpers in
// scripts/collect-cloudwatch-errors.mjs (signature clustering + query build).
//
// The AWS-facing code (start-query/get-query-results) is intentionally NOT
// unit-tested here: it just shells out to `aws logs` and is exercised by the
// --dry-run path + a real supervised run. These tests lock down the logic that
// determines whether "the same error" groups together.
//
// Run: node --test tests/scripts/collect-cloudwatch-errors.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { signature, cluster, buildQuery } from '../../scripts/collect-cloudwatch-errors.mjs';

test('signature(): collapses timestamps, uuids, hex, ip, email, and numbers', () => {
  const a = signature('2026-08-03T10:00:00Z ERROR order 12 failed for cart 6f1e2c3d-1111-2222-3333-444455556666 at 0xABCD from 10.0.0.5 (u@x.io)');
  const b = signature('2026-08-01T22:14:59.5Z ERROR order 987 failed for cart aaaa1111-2222-3333-4444-555566667777 at 0x12 from 192.168.1.1 (dev@lula.com)');
  assert.equal(a, b, 'volatile fields should collapse to the same signature');
  assert.match(a, /<ts> ERROR order <n> failed for cart <uuid> at <hex> from <ip> \(<email>\)/);
});

test('signature(): collapses digits even when glued to letters (30s)', () => {
  assert.equal(signature('db timeout after 30s'), signature('db timeout after 45s'));
});

test('signature(): distinct errors stay distinct', () => {
  assert.notEqual(signature('ERROR null pointer in OrderService'), signature('ERROR connection refused to redis'));
});

test('cluster(): counts, ranks by frequency desc, and honors min_occurrences', () => {
  const rows = [
    { timestamp: '2026-08-03T10:00:00Z', message: 'ERROR db timeout after 30s', logGroup: 'lg1' },
    { timestamp: '2026-08-03T11:00:00Z', message: 'ERROR db timeout after 45s', logGroup: 'lg2' },
    { timestamp: '2026-08-03T12:00:00Z', message: 'WARN cache miss', logGroup: 'lg1' },
  ];
  const min2 = cluster(rows, 2);
  assert.equal(min2.length, 1, 'only the 2× cluster survives min_occurrences=2');
  assert.equal(min2[0].count, 2);
  assert.deepEqual(min2[0].log_groups.sort(), ['lg1', 'lg2'], 'dedupes log groups across occurrences');

  const all = cluster(rows, 1);
  assert.equal(all.length, 2);
  assert.equal(all[0].count, 2, 'most frequent cluster ranked first');
});

test('cluster(): tracks first_seen / last_seen window', () => {
  const rows = [
    { timestamp: '2026-08-03T12:00:00Z', message: 'ERROR x 1', logGroup: 'lg1' },
    { timestamp: '2026-08-03T09:00:00Z', message: 'ERROR x 2', logGroup: 'lg1' },
  ];
  const [c] = cluster(rows, 1);
  assert.equal(c.first_seen, '2026-08-03T09:00:00Z');
  assert.equal(c.last_seen, '2026-08-03T12:00:00Z');
});

test('buildQuery(): escapes patterns and applies limit', () => {
  const q = buildQuery(['ERROR', '5xx', 'Exception'], 500);
  assert.match(q, /filter @message like \/\(\?i\)\(ERROR\|5xx\|Exception\)\//);
  assert.match(q, /limit 500/);
});
