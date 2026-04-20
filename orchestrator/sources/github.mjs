// sources/github.mjs — pull issues from a GitHub repo via the `gh` CLI.
// Requires `gh auth login` completed on this host.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * @param {{
 *   name: string,
 *   repo: string,              // "org/repo"
 *   label?: string,            // e.g. "ai-ready"
 *   state?: 'open'|'closed'|'all',
 *   assignee?: string,
 *   limit?: number,
 *   repo_path?: string,        // local clone path (required so /ticket can cwd into it)
 * }} cfg
 * @returns {Promise<Array<{id:string, title:string, url:string, source:string, repo_path:string}>>}
 */
export async function fetchGithub(cfg) {
  const args = [
    'issue', 'list',
    '--repo', cfg.repo,
    '--state', cfg.state || 'open',
    '--limit', String(cfg.limit ?? 30),
    '--json', 'number,title,url,labels,assignees,state',
  ];
  if (cfg.label)    args.push('--label', cfg.label);
  if (cfg.assignee) args.push('--assignee', cfg.assignee);

  let stdout;
  try {
    ({ stdout } = await execFileP('gh', args, { timeout: 15000 }));
  } catch (e) {
    throw new Error(`[source:github:${cfg.name}] gh exec failed: ${e.message || e}`);
  }

  let rows;
  try { rows = JSON.parse(stdout); } catch { rows = []; }

  return rows.map(r => ({
    id: `gh:${cfg.repo}#${r.number}`,
    title: r.title,
    url:   r.url,
    source: 'github',
    source_name: cfg.name,
    repo_path: cfg.repo_path || null,
    labels: (r.labels || []).map(l => l.name),
  }));
}
