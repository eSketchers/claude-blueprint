// clickup-source.test.mjs — coverage for orchestrator/sources/clickup.mjs.
//
// Mocks global.fetch rather than a CLI binary (unlike beads-source.test.mjs)
// since ClickUp is a plain REST API — no binary to shim onto PATH. Response
// shapes below are copied from a real GET /team/{id}/task call against a
// live ClickUp workspace made while building this module (trimmed to the
// fields the mapper actually reads), not guessed from docs.
//
// Run: node --test tests/orchestrator/clickup-source.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchClickUp } from '../../orchestrator/sources/clickup.mjs';

function fakeTask(overrides = {}) {
  return {
    id: '86ey9nt7r',
    name: 'Fix footer overlap',
    url: 'https://app.clickup.com/t/86ey9nt7r',
    status: { status: 'in progress', type: 'custom' },
    tags: [{ name: 'frontend' }, { name: 'bug' }],
    text_content: 'Attached screenshots show the issue.',
    description: 'Attached screenshots show the issue.',
    ...overrides,
  };
}

/** Installs a fetch mock for the duration of `fn`, always restoring the real fetch after. */
async function withMockFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = handler;
  try {
    return await fn();
  } finally {
    global.fetch = original;
  }
}

test('fetchClickUp() maps a single page of tasks into the standard ticket shape', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  let capturedUrl, capturedHeaders;
  await withMockFetch(
    async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return {
        ok: true,
        json: async () => ({ tasks: [fakeTask()], last_page: true }),
      };
    },
    async () => {
      const tickets = await fetchClickUp({
        name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN', repo_path: '/repo',
      });
      assert.equal(tickets.length, 1);
      const t = tickets[0];
      assert.equal(t.id, 'cu:86ey9nt7r');
      assert.equal(t.title, 'Fix footer overlap');
      assert.equal(t.url, 'https://app.clickup.com/t/86ey9nt7r');
      assert.equal(t.source, 'clickup');
      assert.equal(t.source_name, 'test');
      assert.equal(t.repo_path, '/repo');
      assert.deepEqual(t.labels, ['frontend', 'bug']);
      assert.equal(t.description, 'Attached screenshots show the issue.');

      assert.match(capturedUrl, /^https:\/\/api\.clickup\.com\/api\/v2\/team\/9999999\/task\?/);
      assert.equal(capturedHeaders.Authorization, 'pk_fake_token');
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() falls back to a constructed URL when the task has none', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  await withMockFetch(
    async () => ({ ok: true, json: async () => ({ tasks: [fakeTask({ url: undefined })], last_page: true }) }),
    async () => {
      const tickets = await fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN' });
      assert.equal(tickets[0].url, 'https://app.clickup.com/t/86ey9nt7r');
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() defaults labels to [] when a task has no tags', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  await withMockFetch(
    async () => ({ ok: true, json: async () => ({ tasks: [fakeTask({ tags: [] })], last_page: true }) }),
    async () => {
      const tickets = await fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN' });
      assert.deepEqual(tickets[0].labels, []);
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() paginates: follows last_page:false across multiple pages until last_page:true', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  const seenPages = [];
  await withMockFetch(
    async (url) => {
      const page = new URL(url).searchParams.get('page');
      seenPages.push(page);
      const isLast = page === '2';
      return {
        ok: true,
        json: async () => ({
          tasks: [fakeTask({ id: `task-page-${page}` })],
          last_page: isLast,
        }),
      };
    },
    async () => {
      const tickets = await fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN' });
      assert.deepEqual(seenPages, ['0', '1', '2']);
      assert.equal(tickets.length, 3);
      assert.deepEqual(tickets.map(t => t.id), ['cu:task-page-0', 'cu:task-page-1', 'cu:task-page-2']);
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() stops paginating once cfg.limit is reached, without fetching unnecessary pages', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return { ok: true, json: async () => ({ tasks: Array.from({ length: 100 }, (_, i) => fakeTask({ id: `t${i}` })), last_page: false }) };
    },
    async () => {
      const tickets = await fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN', limit: 5 });
      assert.equal(tickets.length, 5, 'result must be truncated to limit');
      assert.equal(calls, 1, 'must not fetch a second page once one page already exceeds the limit');
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() sends repeatable statuses[] and assignees[] query params, not comma-joined', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  let capturedUrl;
  await withMockFetch(
    async (url) => { capturedUrl = url; return { ok: true, json: async () => ({ tasks: [], last_page: true }) }; },
    async () => {
      await fetchClickUp({
        name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN',
        status_filter: ['open', 'in progress'], assignee: '12345678',
      });
      const params = new URL(capturedUrl).searchParams;
      assert.deepEqual(params.getAll('statuses[]'), ['open', 'in progress']);
      assert.deepEqual(params.getAll('assignees[]'), ['12345678']);
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() defaults include_closed to false', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  let capturedUrl;
  await withMockFetch(
    async (url) => { capturedUrl = url; return { ok: true, json: async () => ({ tasks: [], last_page: true }) }; },
    async () => {
      await fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN' });
      assert.equal(new URL(capturedUrl).searchParams.get('include_closed'), 'false');
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() throws a clear error on a non-OK HTTP response (e.g. bad token -> 401)', async () => {
  process.env.CU_TEST_TOKEN = 'pk_bad_token';
  await withMockFetch(
    async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }),
    async () => {
      await assert.rejects(
        () => fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN' }),
        /\[source:clickup:test\] ClickUp API returned 401 Unauthorized/,
      );
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() throws if the network request itself fails', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  await withMockFetch(
    async () => { throw new Error('getaddrinfo ENOTFOUND api.clickup.com'); },
    async () => {
      await assert.rejects(
        () => fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN' }),
        /\[source:clickup:test\] request failed: getaddrinfo ENOTFOUND/,
      );
    },
  );
  delete process.env.CU_TEST_TOKEN;
});

test('fetchClickUp() requires team_id', async () => {
  await assert.rejects(
    () => fetchClickUp({ name: 'test', api_token_env: 'CU_TEST_TOKEN' }),
    /missing 'team_id'/,
  );
});

test('fetchClickUp() requires api_token_env', async () => {
  await assert.rejects(
    () => fetchClickUp({ name: 'test', team_id: '9999999' }),
    /missing 'api_token_env'/,
  );
});

test('fetchClickUp() throws a clear error if the configured env var is not set', async () => {
  delete process.env.CU_MISSING_VAR;
  await assert.rejects(
    () => fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_MISSING_VAR' }),
    /env var 'CU_MISSING_VAR' is not set/,
  );
});

test('fetchClickUp() tolerates a malformed JSON body (falls back to empty tasks, no crash)', async () => {
  process.env.CU_TEST_TOKEN = 'pk_fake_token';
  await withMockFetch(
    async () => ({ ok: true, json: async () => { throw new Error('Unexpected token'); } }),
    async () => {
      const tickets = await fetchClickUp({ name: 'test', team_id: '9999999', api_token_env: 'CU_TEST_TOKEN' });
      assert.deepEqual(tickets, []);
    },
  );
  delete process.env.CU_TEST_TOKEN;
});
