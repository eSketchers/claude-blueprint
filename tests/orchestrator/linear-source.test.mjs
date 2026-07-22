// linear-source.test.mjs — coverage for orchestrator/sources/linear.mjs.
//
// Mocks global.fetch (Linear is a plain GraphQL-over-HTTP API, no CLI to
// shim). Field names and shapes (identifier, url, state.name,
// labels.nodes.name, pageInfo.hasNextPage/endCursor) were confirmed via a
// live, unauthenticated schema introspection query against
// https://api.linear.app/graphql while building linear.mjs — not guessed
// from docs, which redirected/were unavailable at the time. The 401
// auth-error behavior (real HTTP 401, not a 200 with an errors[] body) was
// also confirmed against the real API with a fake key.
//
// Run: node --test tests/orchestrator/linear-source.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLinear } from '../../orchestrator/sources/linear.mjs';

function fakeIssue(overrides = {}) {
  return {
    id: 'uuid-1234',
    identifier: 'ENG-123',
    title: 'Fix footer overlap',
    url: 'https://linear.app/acme/issue/ENG-123/fix-footer-overlap',
    description: 'Footer overlaps the nav on mobile.',
    state: { name: 'Todo' },
    labels: { nodes: [{ name: 'frontend' }, { name: 'bug' }] },
    ...overrides,
  };
}

async function withMockFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = handler;
  try { return await fn(); } finally { global.fetch = original; }
}

test('fetchLinear() maps a single page into the standard ticket shape', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  let capturedBody, capturedHeaders;
  await withMockFetch(
    async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      capturedHeaders = opts.headers;
      return {
        ok: true,
        json: async () => ({
          data: { issues: { nodes: [fakeIssue()], pageInfo: { hasNextPage: false, endCursor: null } } },
        }),
      };
    },
    async () => {
      const tickets = await fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY', team_key: 'ENG', repo_path: '/repo' });
      assert.equal(tickets.length, 1);
      const t = tickets[0];
      assert.equal(t.id, 'lin:ENG-123');
      assert.equal(t.title, 'Fix footer overlap');
      assert.equal(t.url, 'https://linear.app/acme/issue/ENG-123/fix-footer-overlap');
      assert.equal(t.source, 'linear');
      assert.equal(t.source_name, 'test');
      assert.equal(t.repo_path, '/repo');
      assert.deepEqual(t.labels, ['frontend', 'bug']);
      assert.equal(t.description, 'Footer overlaps the nav on mobile.');

      assert.equal(capturedHeaders.Authorization, 'lin_api_fake');
      assert.deepEqual(capturedBody.variables.filter, { team: { key: { eq: 'ENG' } } });
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() applies state_name filter alongside team_key', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  let capturedBody;
  await withMockFetch(
    async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } }) };
    },
    async () => {
      await fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY', team_key: 'ENG', state_name: 'Todo' });
      assert.deepEqual(capturedBody.variables.filter, { team: { key: { eq: 'ENG' } }, state: { name: { eq: 'Todo' } } });
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() defaults labels to [] when a node has none', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  await withMockFetch(
    async () => ({ ok: true, json: async () => ({ data: { issues: { nodes: [fakeIssue({ labels: { nodes: [] } })], pageInfo: { hasNextPage: false, endCursor: null } } } }) }),
    async () => {
      const tickets = await fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY' });
      assert.deepEqual(tickets[0].labels, []);
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() follows cursor pagination via pageInfo.hasNextPage/endCursor', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  const seenAfters = [];
  await withMockFetch(
    async (url, opts) => {
      const { variables } = JSON.parse(opts.body);
      seenAfters.push(variables.after);
      const isLast = variables.after === 'cursor-2';
      return {
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [fakeIssue({ identifier: `ENG-${seenAfters.length}` })],
              pageInfo: { hasNextPage: !isLast, endCursor: isLast ? null : `cursor-${seenAfters.length}` },
            },
          },
        }),
      };
    },
    async () => {
      const tickets = await fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY' });
      assert.deepEqual(seenAfters, [null, 'cursor-1', 'cursor-2']);
      assert.equal(tickets.length, 3);
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() stops paginating once cfg.limit is reached', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: Array.from({ length: 50 }, (_, i) => fakeIssue({ identifier: `ENG-${i}` })),
              pageInfo: { hasNextPage: true, endCursor: 'next' },
            },
          },
        }),
      };
    },
    async () => {
      const tickets = await fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY', limit: 5 });
      assert.equal(tickets.length, 5);
      assert.equal(calls, 1, 'must not fetch a second page once one page already exceeds the limit');
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() throws a clear error on a non-OK HTTP response (e.g. bad key -> 401)', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_bad';
  await withMockFetch(
    async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }),
    async () => {
      await assert.rejects(
        () => fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY' }),
        /\[source:linear:test\] Linear API returned 401 Unauthorized/,
      );
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() throws on a GraphQL-level error in the response body', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  await withMockFetch(
    async () => ({ ok: true, json: async () => ({ errors: [{ message: 'Field "bogus" does not exist' }] }) }),
    async () => {
      await assert.rejects(
        () => fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY' }),
        /\[source:linear:test\] GraphQL error: Field "bogus" does not exist/,
      );
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() throws if the network request itself fails', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  await withMockFetch(
    async () => { throw new Error('getaddrinfo ENOTFOUND api.linear.app'); },
    async () => {
      await assert.rejects(
        () => fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY' }),
        /\[source:linear:test\] request failed: getaddrinfo ENOTFOUND/,
      );
    },
  );
  delete process.env.LIN_TEST_KEY;
});

test('fetchLinear() requires api_key_env', async () => {
  await assert.rejects(() => fetchLinear({ name: 'test' }), /missing 'api_key_env'/);
});

test('fetchLinear() throws a clear error if the configured env var is not set', async () => {
  delete process.env.LIN_MISSING_VAR;
  await assert.rejects(
    () => fetchLinear({ name: 'test', api_key_env: 'LIN_MISSING_VAR' }),
    /env var 'LIN_MISSING_VAR' is not set/,
  );
});

test('fetchLinear() sends no filter fields when neither team_key nor state_name is set', async () => {
  process.env.LIN_TEST_KEY = 'lin_api_fake';
  let capturedBody;
  await withMockFetch(
    async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } }) };
    },
    async () => {
      await fetchLinear({ name: 'test', api_key_env: 'LIN_TEST_KEY' });
      assert.deepEqual(capturedBody.variables.filter, {});
    },
  );
  delete process.env.LIN_TEST_KEY;
});
