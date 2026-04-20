// sources/filesystem.mjs — pick up tickets from JSON files in a local directory.
// Simpler than a real tracker; ideal for demos, offline work, or file-driven
// pipelines (e.g. an external system drops tickets in a shared folder).
//
// Ticket file format (one JSON file per ticket, .json extension):
// {
//   "id": "polls-001",
//   "title": "Set up Django project",
//   "description": "...",
//   "repo_path": "/abs/path/to/local/clone",
//   "kind": "feature",
//   "labels": ["backend"]
// }

import { readdir, readFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

/**
 * @param {{
 *   name: string,
 *   dir: string,                // directory to poll
 *   processed_dir?: string,     // where to move files after pickup (default: <dir>/processed)
 *   repo_path?: string,         // fallback if tickets don't set their own
 * }} cfg
 */
export async function fetchFilesystem(cfg) {
  if (!cfg.dir) throw new Error(`[source:filesystem:${cfg.name}] missing 'dir'`);
  if (!existsSync(cfg.dir)) return [];

  const processedDir = cfg.processed_dir || join(cfg.dir, 'processed');
  await mkdir(processedDir, { recursive: true });

  const entries = await readdir(cfg.dir, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && extname(e.name).toLowerCase() === '.json')
    .map(e => join(cfg.dir, e.name));

  const out = [];
  for (const path of files) {
    let t;
    try { t = JSON.parse(await readFile(path, 'utf8')); } catch { continue; }
    if (!t.id || !t.title) continue;

    out.push({
      id: `fs:${cfg.name}:${t.id}`,
      title: t.title,
      url:   `file://${path}`,
      source: 'filesystem',
      source_name: cfg.name,
      repo_path: t.repo_path || cfg.repo_path || null,
      labels: t.labels || [],
      description: t.description || '',
      kind: t.kind || 'feature',
      _file: path,
      _processed_dir: processedDir,
    });
  }
  return out;
}

/** Move a ticket file into processed/ after pickup so we don't re-claim it. */
export async function archiveFilesystemTicket(ticket) {
  if (!ticket._file) return;
  const to = join(ticket._processed_dir, basename(ticket._file));
  try { await rename(ticket._file, to); } catch {/* concurrent pickup — ignore */}
}
