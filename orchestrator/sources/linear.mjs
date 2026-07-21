// sources/linear.mjs — pull issues from Linear via its GraphQL API.
// Requires a personal API key (Linear -> Settings -> Account -> Security &
// access -> Personal API keys, starts with "lin_api_").
//
// Schema confirmed via Linear's own live introspection endpoint (no auth
// required for introspection) while building this module — not guessed from
// docs, which were unavailable/truncated at the time:
// - Endpoint: POST https://api.linear.app/graphql, header `Authorization: <key>`
//   (no "Bearer " prefix — confirmed: an invalid key returns a real HTTP 401
//   with a GraphQL `errors[]` body, same auth-error shape as a malformed one).
// - Root field: `issues(filter: IssueFilter, first: Int, after: String)`
//   returns an IssueConnection — standard Relay cursor pagination
//   (`pageInfo { hasNextPage endCursor }`).
// - IssueFilter.team is a TeamFilter; the common exact-match shape is
//   `team: { key: { eq: "ENG" } }` (StringComparator; team "key" is the
//   short prefix used in identifiers like "ENG-123").
// - Issue.labels is a connection (IssueLabelConnection), not a plain array —
//   must query `labels { nodes { name } }`.
// - Issue.state is a WorkflowState object (has .name), not a plain string.
// - Issue.identifier is the human-readable id (e.g. "ENG-123"); Issue.id is
//   the underlying UUID.

const ENDPOINT = 'https://api.linear.app/graphql';

const ISSUES_QUERY = `
  query FetchIssues($filter: IssueFilter, $first: Int, $after: String) {
    issues(filter: $filter, first: $first, after: $after) {
      nodes {
        id
        identifier
        title
        url
        description
        state { name }
        labels { nodes { name } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/**
 * @param {{
 *   name: string,
 *   api_key_env: string,        // env var name holding the Linear API key
 *   team_key?: string,          // team's short key, e.g. "ENG" (identifier prefix)
 *   state_name?: string,        // exact workflow state name, e.g. "Todo"
 *   limit?: number,
 *   repo_path?: string,
 * }} cfg
 * @returns {Promise<Array<{id:string, title:string, url:string, source:string, repo_path:string, labels:string[], description:string}>>}
 */
export async function fetchLinear(cfg) {
  if (!cfg.api_key_env) throw new Error(`[source:linear:${cfg.name}] missing 'api_key_env'`);

  const key = process.env[cfg.api_key_env];
  if (!key) throw new Error(`[source:linear:${cfg.name}] env var '${cfg.api_key_env}' is not set`);

  const filter = {};
  if (cfg.team_key) filter.team = { key: { eq: cfg.team_key } };
  if (cfg.state_name) filter.state = { name: { eq: cfg.state_name } };

  const issues = [];
  let after = null;
  const pageSize = 50;
  const maxPages = cfg.limit ? Math.ceil(cfg.limit / pageSize) : 10; // hard cap: never fetch unbounded pages
  let page = 0;

  while (page < maxPages) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: key },
        body: JSON.stringify({
          query: ISSUES_QUERY,
          variables: { filter, first: pageSize, after },
        }),
      });
    } catch (e) {
      throw new Error(`[source:linear:${cfg.name}] request failed: ${e.message || e}`);
    }
    if (!res.ok) {
      throw new Error(`[source:linear:${cfg.name}] Linear API returned ${res.status} ${res.statusText}`);
    }

    let body;
    try { body = await res.json(); } catch { body = {}; }
    if (body.errors?.length) {
      throw new Error(`[source:linear:${cfg.name}] GraphQL error: ${body.errors[0].message}`);
    }

    const conn = body.data?.issues;
    if (!conn) break;
    issues.push(...conn.nodes);

    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    page += 1;
  }

  const limited = cfg.limit ? issues.slice(0, cfg.limit) : issues;

  return limited.map(i => ({
    id: `lin:${i.identifier}`,
    title: i.title,
    url: i.url,
    source: 'linear',
    source_name: cfg.name,
    repo_path: cfg.repo_path || null,
    labels: (i.labels?.nodes || []).map(l => l.name),
    description: i.description || '',
  }));
}
