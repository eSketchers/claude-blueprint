// log-sources/file.mjs — read local log files (plain lines or JSONL).
// Supports exact paths, comma-separated lists, and single-level `*` globs.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { parseRows } from './_shared.mjs';

/** Expand a path pattern into concrete files. Handles `*` in the basename. */
export function expandGlob(pattern) {
  if (!pattern.includes('*')) return existsSync(pattern) ? [pattern] : [];
  const dir = dirname(pattern);
  const baseRe = new RegExp('^' + basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => baseRe.test(f)).map((f) => join(dir, f));
}

export function describe(cfg) {
  return `file path="${cfg.path}" format=${cfg.format || 'lines'}`;
}

export async function fetch(cfg, ctx) {
  if (!cfg.path) throw new Error(`[source:${cfg.name}] 'path' is required for a file source`);
  const patterns = String(cfg.path).split(',').map((p) => p.trim()).filter(Boolean);
  const files = patterns.flatMap(expandGlob);
  const rows = [];
  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    rows.push(...parseRows(content, {
      format: cfg.format || 'lines',
      timestamp_field: cfg.timestamp_field || 'timestamp',
      message_field: cfg.message_field || 'message',
      patterns: ctx.patterns,
    }));
  }
  return rows;
}
