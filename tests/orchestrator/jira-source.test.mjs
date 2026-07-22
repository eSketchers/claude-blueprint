// jira-source.test.mjs — coverage for orchestrator/sources/jira.mjs.
//
// Mocks global.fetch. The response envelope (`issues[]`, `total`,
// `startAt`) and per-issue shape (`key`, `fields.summary`, `fields.labels`
// as a plain string array, `fields.status.name`, `fields.description`) were
// confirmed against a real, public, live Jira instance (issues.apache.org)
// while building jira.mjs. That instance is Jira Server/Data Center on the
// v2 endpoint, not Cloud v3 (no private Cloud account was available to
// test against) — see jira.mjs's header comment for what that does and
// doesn't confirm, in particular that Cloud v3's `description` field can be
// an Atlassian Document Format object rather than a plain string, which
// this module handles by treating any non-string description as absent.
//
// Run: node --test tests/orchestrator/jira-source.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJira } from '../../orchestrator/sources/jira.mjs';

function fakeIssue(overrides = {}) {
  return {
    key: 'ENG-123',
    fields: {
      summary: 'Fix footer overlap',
      description: 'Footer overlaps the nav on mobile.',
      labels: ['frontend', 'bug'],
      status: { name: 'Open' },
    },
    ...overrides,
  };
}

async function withMockFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = handler;
  try { return await fn(); } finally { global.fetch = original; }
}

const BASE_CFG = { name: 'test', base_url: 'https://acme.atlassian.net', email_env: 'JIRA_TEST_EMAIL', api_token_env: 'JIRA_TEST_TOKEN' };

test('fetchJira() maps a single page into the standard ticket shape', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  let capturedUrl, capturedHeaders;
  await withMockFetch(
    async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return { ok: true, json: async () => ({ issues: [fakeIssue()], total: 1, startAt: 0 }) };
    },
    async () => {
      const tickets = await fetchJira({ ...BASE_CFG, repo_path: '/repo' });
      assert.equal(tickets.length, 1);
      const t = tickets[0];
      assert.equal(t.id, 'jira:ENG-123');
      assert.equal(t.title, 'Fix footer overlap');
      assert.equal(t.url, 'https://acme.atlassian.net/browse/ENG-123');
      assert.equal(t.source, 'jira');
      assert.equal(t.source_name, 'test');
      assert.equal(t.repo_path, '/repo');
      assert.deepEqual(t.labels, ['frontend', 'bug']);
      assert.equal(t.description, 'Footer overlaps the nav on mobile.');

      assert.match(capturedUrl, /^https:\/\/acme\.atlassian\.net\/rest\/api\/3\/search\?/);
      const expectedAuth = `Basic ${Buffer.from('me@acme.com:fake_token').toString('base64')}`;
      assert.equal(capturedHeaders.Authorization, expectedAuth);
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() strips a trailing slash from base_url before building URLs', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  await withMockFetch(
    async () => ({ ok: true, json: async () => ({ issues: [fakeIssue()], total: 1, startAt: 0 }) }),
    async () => {
      const tickets = await fetchJira({ ...BASE_CFG, base_url: 'https://acme.atlassian.net/' });
      assert.equal(tickets[0].url, 'https://acme.atlassian.net/browse/ENG-123');
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() defaults labels to [] when fields.labels is missing', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  await withMockFetch(
    async () => ({ ok: true, json: async () => ({ issues: [fakeIssue({ fields: { summary: 'x', status: { name: 'Open' } } })], total: 1, startAt: 0 }) }),
    async () => {
      const tickets = await fetchJira(BASE_CFG);
      assert.deepEqual(tickets[0].labels, []);
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() treats a non-string description (e.g. ADF object) as absent rather than guessing', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  await withMockFetch(
    async () => ({
      ok: true,
      json: async () => ({
        issues: [fakeIssue({ fields: { summary: 'x', labels: [], status: { name: 'Open' }, description: { type: 'doc', content: [] } } })],
        total: 1, startAt: 0,
      }),
    }),
    async () => {
      const tickets = await fetchJira(BASE_CFG);
      assert.equal(tickets[0].description, '');
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() sends the configured jql, defaulting to "statusCategory != Done"', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  let capturedUrl;
  await withMockFetch(
    async (url) => { capturedUrl = url; return { ok: true, json: async () => ({ issues: [], total: 0, startAt: 0 }) }; },
    async () => {
      await fetchJira(BASE_CFG);
      assert.equal(new URL(capturedUrl).searchParams.get('jql'), 'statusCategory != Done');
    },
  );
  await withMockFetch(
    async (url) => { capturedUrl = url; return { ok: true, json: async () => ({ issues: [], total: 0, startAt: 0 }) }; },
    async () => {
      await fetchJira({ ...BASE_CFG, jql: 'project = ENG' });
      assert.equal(new URL(capturedUrl).searchParams.get('jql'), 'project = ENG');
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() paginates via startAt until startAt reaches total', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  const seenStartAts = [];
  await withMockFetch(
    async (url) => {
      const startAt = Number(new URL(url).searchParams.get('startAt'));
      seenStartAts.push(startAt);
      return { ok: true, json: async () => ({ issues: [fakeIssue({ key: `ENG-${startAt}` })], total: 3, startAt }) };
    },
    async () => {
      const tickets = await fetchJira(BASE_CFG);
      assert.deepEqual(seenStartAts, [0, 1, 2]);
      assert.equal(tickets.length, 3);
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() stops paginating once cfg.limit is reached', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return { ok: true, json: async () => ({ issues: Array.from({ length: 50 }, (_, i) => fakeIssue({ key: `ENG-${i}` })), total: 500, startAt: 0 }) };
    },
    async () => {
      const tickets = await fetchJira({ ...BASE_CFG, limit: 5 });
      assert.equal(tickets.length, 5);
      assert.equal(calls, 1, 'must not fetch a second page once one page already exceeds the limit');
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() throws a clear error on a non-OK HTTP response (e.g. bad credentials -> 401)', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'bad_token';
  await withMockFetch(
    async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }),
    async () => {
      await assert.rejects(
        () => fetchJira(BASE_CFG),
        /\[source:jira:test\] Jira API returned 401 Unauthorized/,
      );
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() throws if the network request itself fails', async () => {
  process.env.JIRA_TEST_EMAIL = 'me@acme.com';
  process.env.JIRA_TEST_TOKEN = 'fake_token';
  await withMockFetch(
    async () => { throw new Error('getaddrinfo ENOTFOUND acme.atlassian.net'); },
    async () => {
      await assert.rejects(
        () => fetchJira(BASE_CFG),
        /\[source:jira:test\] request failed: getaddrinfo ENOTFOUND/,
      );
    },
  );
  delete process.env.JIRA_TEST_EMAIL;
  delete process.env.JIRA_TEST_TOKEN;
});

test('fetchJira() requires base_url, email_env, and api_token_env', async () => {
  await assert.rejects(() => fetchJira({ name: 'test', email_env: 'A', api_token_env: 'B' }), /missing 'base_url'/);
  await assert.rejects(() => fetchJira({ name: 'test', base_url: 'https://x.atlassian.net', api_token_env: 'B' }), /missing 'email_env'/);
  await assert.rejects(() => fetchJira({ name: 'test', base_url: 'https://x.atlassian.net', email_env: 'A' }), /missing 'api_token_env'/);
});

test('fetchJira() throws a clear error if email_env or api_token_env is not set', async () => {
  delete process.env.JIRA_MISSING_EMAIL;
  process.env.JIRA_SET_TOKEN = 'x';
  await assert.rejects(
    () => fetchJira({ name: 'test', base_url: 'https://x.atlassian.net', email_env: 'JIRA_MISSING_EMAIL', api_token_env: 'JIRA_SET_TOKEN' }),
    /env var 'JIRA_MISSING_EMAIL' is not set/,
  );
  delete process.env.JIRA_SET_TOKEN;
});
