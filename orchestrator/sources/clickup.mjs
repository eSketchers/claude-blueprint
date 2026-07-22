// sources/clickup.mjs — pull tasks from a ClickUp workspace via the v2 REST API.
// Requires a personal API token (ClickUp -> Settings -> Apps -> API Token,
// starts with "pk_") and the numeric team (workspace) ID.
//
// Verified against a real ClickUp workspace while building this module:
// - GET /team/{team_id}/task is team-scoped (no space/list/folder ID needed)
//   and paginates 100 tasks/page via ?page=N, with a `last_page` boolean.
// - Filters (`statuses[]`, `assignees[]`) are repeatable query params, not a
//   single comma-joined value — must be passed with URLSearchParams.append,
//   not .set.
// - An invalid/missing token returns a clean 401, not a body with an `err`
//   field on every failure mode, so status-code checking is the reliable
//   error path (response bodies on error are inconsistent in shape).

const BASE_URL = 'https://api.clickup.com/api/v2';

/**
 * @param {{
 *   name: string,
 *   team_id: string,           // numeric workspace ID
 *   api_token_env: string,     // env var name holding the ClickUp API token
 *   status_filter?: string[],  // e.g. ["open", "in progress"]; omit for all non-closed
 *   assignee?: string,         // numeric ClickUp user id
 *   include_closed?: boolean,  // default false
 *   limit?: number,
 *   repo_path?: string,        // local clone path, required so /ticket can cwd into it
 * }} cfg
 * @returns {Promise<Array<{id:string, title:string, url:string, source:string, repo_path:string, labels:string[], description:string}>>}
 */
export async function fetchClickUp(cfg) {
  if (!cfg.team_id) throw new Error(`[source:clickup:${cfg.name}] missing 'team_id'`);
  if (!cfg.api_token_env) throw new Error(`[source:clickup:${cfg.name}] missing 'api_token_env'`);

  const token = process.env[cfg.api_token_env];
  if (!token) throw new Error(`[source:clickup:${cfg.name}] env var '${cfg.api_token_env}' is not set`);

  const tasks = [];
  let page = 0;
  const maxPages = cfg.limit ? Math.ceil(cfg.limit / 100) : 10; // hard cap: never fetch unbounded pages

  while (page < maxPages) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('include_closed', String(cfg.include_closed ?? false));
    for (const s of cfg.status_filter || []) params.append('statuses[]', s);
    if (cfg.assignee) params.append('assignees[]', cfg.assignee);

    const url = `${BASE_URL}/team/${cfg.team_id}/task?${params.toString()}`;

    let res;
    try {
      res = await fetch(url, { headers: { Authorization: token } });
    } catch (e) {
      throw new Error(`[source:clickup:${cfg.name}] request failed: ${e.message || e}`);
    }
    if (!res.ok) {
      throw new Error(`[source:clickup:${cfg.name}] ClickUp API returned ${res.status} ${res.statusText}`);
    }

    let body;
    try { body = await res.json(); } catch { body = {}; }
    const rows = Array.isArray(body.tasks) ? body.tasks : [];
    tasks.push(...rows);

    if (body.last_page !== false || rows.length === 0) break;
    page += 1;
  }

  const limited = cfg.limit ? tasks.slice(0, cfg.limit) : tasks;

  return limited.map(t => ({
    id: `cu:${t.id}`,
    title: t.name,
    url: t.url || `https://app.clickup.com/t/${t.id}`,
    source: 'clickup',
    source_name: cfg.name,
    repo_path: cfg.repo_path || null,
    labels: (t.tags || []).map(tag => tag.name),
    description: t.text_content || t.description || '',
  }));
}
