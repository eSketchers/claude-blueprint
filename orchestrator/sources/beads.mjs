// sources/beads.mjs — pull ready tasks from a beads (bd) issue graph.
// https://github.com/gastownhall/beads — a Dolt-backed, dependency-aware
// issue tracker built for agent workflows. Requires the `bd` CLI installed
// (`brew install beads`) and a `.beads/` database already initialized in the
// target repo (`bd init`), plus `bd metrics off` + `git config beads.role
// contributor` run once per machine so stdout stays pure JSON with no banner
// noise mixed in.
//
// This module only reads (`bd ready --json`) — claiming and closing issues
// are separate exported functions the caller invokes explicitly around
// spawn/completion, mirroring how registry.claim()/update() are called
// today rather than being folded into fetch itself.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * @param {{
 *   name: string,
 *   repo_path: string,         // local clone containing .beads/ (also cwd for `bd`)
 *   beads_dir?: string,        // override BEADS_DIR; default lets bd discover via repo_path
 *   limit?: number,
 * }} cfg
 * @returns {Promise<Array<{id:string, title:string, url:null, source:string, repo_path:string, labels:string[], description:string, kind:string}>>}
 */
export async function fetchBeads(cfg) {
  if (!cfg.repo_path) throw new Error(`[source:beads:${cfg.name}] missing 'repo_path'`);

  const env = { ...process.env };
  if (cfg.beads_dir) env.BEADS_DIR = cfg.beads_dir;

  let stdout;
  try {
    ({ stdout } = await execFileP('bd', ['ready', '--json'], {
      cwd: cfg.repo_path,
      env,
      timeout: 15000,
    }));
  } catch (e) {
    throw new Error(`[source:beads:${cfg.name}] bd exec failed: ${e.message || e}`);
  }

  let rows;
  try { rows = JSON.parse(stdout); } catch { rows = []; }
  if (!Array.isArray(rows)) rows = [];

  if (cfg.limit) rows = rows.slice(0, cfg.limit);

  return rows.map(r => ({
    id: `bd:${r.id}`,
    title: r.title,
    url: null,
    source: 'beads',
    source_name: cfg.name,
    repo_path: cfg.repo_path,
    labels: r.labels || [],
    description: r.description || '',
    kind: r.issue_type || 'task',
    _bd_id: r.id,
    _repo_path: cfg.repo_path,
    _beads_dir: cfg.beads_dir || null,
  }));
}

/** Mark a beads issue as claimed/in-progress. Call after a successful spawn. */
export async function claimBeadsTicket(ticket) {
  if (!ticket._bd_id) return;
  const env = { ...process.env };
  if (ticket._beads_dir) env.BEADS_DIR = ticket._beads_dir;
  await execFileP('bd', ['update', ticket._bd_id, '--claim', '--json'], {
    cwd: ticket._repo_path,
    env,
    timeout: 15000,
  });
}

/** Close a beads issue. Call after the ticket's work completes. */
export async function closeBeadsTicket(ticket, reason = 'completed') {
  if (!ticket._bd_id) return;
  const env = { ...process.env };
  if (ticket._beads_dir) env.BEADS_DIR = ticket._beads_dir;
  await execFileP('bd', ['close', ticket._bd_id, '--reason', reason, '--json'], {
    cwd: ticket._repo_path,
    env,
    timeout: 15000,
  });
}
