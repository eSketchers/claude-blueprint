// sources/jira.mjs — pull issues from Jira (Cloud) via the REST API, using
// JQL for filtering.
//
// Auth: HTTP Basic with your Atlassian account email + an API token
// (id.atlassian.com -> Security -> API tokens), base64-encoded, per
// Atlassian's documented Jira Cloud auth scheme.
//
// Verified against a real, public, live Jira instance (issues.apache.org,
// Jira Server/Data Center on the /rest/api/2 search endpoint — the same
// instance used because no private Jira Cloud account was available while
// building this) for: /search?jql=...&fields=... request shape, response
// envelope (`issues[]`, `total`, `startAt`, `maxResults`), and per-issue
// shape (`key`, `fields.summary`, `fields.labels` as a plain string array,
// `fields.status.name`, `fields.description`).
//
// NOT independently verified (flagged rather than silently assumed):
// - Jira Cloud's REST API v3 (used here, vs. the v2 endpoint actually probed)
//   renders `fields.description` as an Atlassian Document Format (ADF)
//   object, not a plain string, on modern Cloud instances — v2 (Server/DC,
//   what was actually reachable to test against) returns a plain string.
//   This module treats a non-string description as absent (falls back to
//   '') rather than guessing at ADF-to-text extraction, since getting that
//   wrong silently would be worse than an empty description.
// - Basic-auth behavior (email:token) was not exercised against a real
//   Cloud instance — only documented, not empirically confirmed here.

/**
 * @param {{
 *   name: string,
 *   base_url: string,           // e.g. "https://your-domain.atlassian.net"
 *   email_env: string,          // env var name holding your Atlassian account email
 *   api_token_env: string,      // env var name holding your Jira API token
 *   jql?: string,               // e.g. "project = ENG AND statusCategory != Done"
 *   limit?: number,
 *   repo_path?: string,
 * }} cfg
 * @returns {Promise<Array<{id:string, title:string, url:string, source:string, repo_path:string, labels:string[], description:string}>>}
 */
export async function fetchJira(cfg) {
  if (!cfg.base_url) throw new Error(`[source:jira:${cfg.name}] missing 'base_url'`);
  if (!cfg.email_env) throw new Error(`[source:jira:${cfg.name}] missing 'email_env'`);
  if (!cfg.api_token_env) throw new Error(`[source:jira:${cfg.name}] missing 'api_token_env'`);

  const email = process.env[cfg.email_env];
  if (!email) throw new Error(`[source:jira:${cfg.name}] env var '${cfg.email_env}' is not set`);
  const token = process.env[cfg.api_token_env];
  if (!token) throw new Error(`[source:jira:${cfg.name}] env var '${cfg.api_token_env}' is not set`);

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const baseUrl = cfg.base_url.replace(/\/$/, '');
  const jql = cfg.jql || 'statusCategory != Done';

  const issues = [];
  let startAt = 0;
  const pageSize = 50;
  const maxPages = cfg.limit ? Math.ceil(cfg.limit / pageSize) : 10; // hard cap: never fetch unbounded pages
  let page = 0;

  while (page < maxPages) {
    const params = new URLSearchParams();
    params.set('jql', jql);
    params.set('startAt', String(startAt));
    params.set('maxResults', String(pageSize));
    params.set('fields', 'summary,description,labels,status');

    let res;
    try {
      res = await fetch(`${baseUrl}/rest/api/3/search?${params.toString()}`, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
      });
    } catch (e) {
      throw new Error(`[source:jira:${cfg.name}] request failed: ${e.message || e}`);
    }
    if (!res.ok) {
      throw new Error(`[source:jira:${cfg.name}] Jira API returned ${res.status} ${res.statusText}`);
    }

    let body;
    try { body = await res.json(); } catch { body = {}; }
    const rows = Array.isArray(body.issues) ? body.issues : [];
    issues.push(...rows);

    const total = body.total ?? rows.length;
    startAt += rows.length;
    if (rows.length === 0 || startAt >= total) break;
    page += 1;
  }

  const limited = cfg.limit ? issues.slice(0, cfg.limit) : issues;

  return limited.map(i => ({
    id: `jira:${i.key}`,
    title: i.fields?.summary || i.key,
    url: `${baseUrl}/browse/${i.key}`,
    source: 'jira',
    source_name: cfg.name,
    repo_path: cfg.repo_path || null,
    labels: Array.isArray(i.fields?.labels) ? i.fields.labels : [],
    // Cloud v3 can return description as an ADF object rather than a plain
    // string; rather than guess at extracting text from it, treat anything
    // non-string as absent.
    description: typeof i.fields?.description === 'string' ? i.fields.description : '',
  }));
}
