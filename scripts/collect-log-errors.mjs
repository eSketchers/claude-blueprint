#!/usr/bin/env node
// collect-log-errors.mjs — multi-source error collector for /log-triage.
//
// Reads recent errors from any configured log source (CloudWatch, GCP, Azure,
// Datadog, Sentry, Loki, Elasticsearch, or the universal command/file adapters),
// clusters raw lines into stable "signatures" (collapsing timestamps / UUIDs /
// numbers so the same error groups together), ranks clusters by occurrence, and
// writes a JSON report grouped by the service each source is bound to.
//
// Zero-dependency: each source is a small adapter under scripts/log-sources/ that
// drives a CLI or HTTP API. Mirrors the orchestrator's `sources[]` + `type`
// convention (orchestrator/sources/*).
//
//   node scripts/collect-log-errors.mjs --config log-triage/config.json
//   node scripts/collect-log-errors.mjs --config log-triage/config.json --hours 12
//   node scripts/collect-log-errors.mjs --config log-triage/config.json --dry-run
//
// Exit codes: 0 ok, 1 config/usage error, 2 one or more source queries failed.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cloudwatch from './log-sources/cloudwatch.mjs';
import * as gcp from './log-sources/gcp.mjs';
import * as azure from './log-sources/azure.mjs';
import * as datadog from './log-sources/datadog.mjs';
import * as sentry from './log-sources/sentry.mjs';
import * as loki from './log-sources/loki.mjs';
import * as elasticsearch from './log-sources/elasticsearch.mjs';
import * as command from './log-sources/command.mjs';
import * as file from './log-sources/file.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

export const SOURCE_REGISTRY = {
  cloudwatch, gcp, azure, datadog, sentry, loki, elasticsearch, command, file,
};

// Re-exported so the CloudWatch Insights query stays unit-testable as buildQuery.
export const buildQuery = cloudwatch.buildInsightsQuery;

// ---------------- arg parsing ----------------

export function parseArgs(argv) {
  const args = { config: null, hours: null, out: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.config = argv[++i];
    else if (a === '--hours') args.hours = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

const USAGE = `Usage: node scripts/collect-log-errors.mjs --config <path> [--hours N] [--out <path>] [--dry-run]`;

// ---------------- clustering (provider-agnostic) ----------------

/** Collapse volatile fields so recurrences of the same error map to one signature. */
export function signature(message) {
  return String(message)
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<ts>')
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<uuid>')
    .replace(/\b0x[0-9a-fA-F]+\b/g, '<hex>')
    .replace(/\b[0-9a-fA-F]{16,}\b/g, '<hex>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '<email>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cluster {timestamp, message, source} rows by signature, ranked by count desc. */
export function cluster(rows, minOccurrences = 1) {
  const map = new Map();
  for (const r of rows) {
    const sig = signature(r.message);
    if (!sig) continue;
    let c = map.get(sig);
    if (!c) {
      c = { signature: sig, count: 0, sample: r.message, first_seen: r.timestamp || '', last_seen: r.timestamp || '', sources: new Set() };
      map.set(sig, c);
    }
    c.count++;
    if (r.source) c.sources.add(r.source);
    const ts = r.timestamp || '';
    if (ts && (!c.first_seen || ts < c.first_seen)) c.first_seen = ts;
    if (ts && (!c.last_seen || ts > c.last_seen)) c.last_seen = ts;
  }
  return [...map.values()]
    .filter((c) => c.count >= minOccurrences)
    .sort((a, b) => b.count - a.count)
    .map((c) => ({ ...c, sources: [...c.sources] }));
}

// ---------------- main ----------------

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(String(e.message)); console.error(USAGE); process.exit(1); }
  if (args.help) { console.log(USAGE); return; }
  if (!args.config) { console.error('error: --config is required\n' + USAGE); process.exit(1); }

  const configPath = resolve(args.config);
  if (!existsSync(configPath)) { console.error(`error: config not found: ${configPath}`); process.exit(1); }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  const patterns = config.query?.pattern || ['ERROR'];
  const hours = args.hours ?? config.query?.lookback_hours ?? 24;
  const limit = config.query?.limit ?? 1000;
  const minOcc = config.query?.min_occurrences ?? 1;

  const sources = (config.sources || []).filter((s) => s.enabled);
  if (!sources.length) {
    console.error('error: no sources with "enabled": true in config. Nothing to scan.');
    process.exit(1);
  }

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - hours * 3600;
  const ctx = { startTime, endTime, hours, patterns, limit };

  // service bindings (repo/base/feedback/assignee), referenced by source.service
  const serviceMap = new Map((config.services || []).map((s) => [s.name, s]));
  const defaults = config.defaults || {};

  if (args.dryRun) {
    console.log(`# dry-run — would scan ${hours}h across ${sources.length} source(s); no network calls made\n`);
    for (const s of sources) {
      const mod = SOURCE_REGISTRY[s.type];
      const desc = mod?.describe ? mod.describe(s, ctx) : '(unknown type)';
      console.log(`# [${s.type}:${s.name}] service=${s.service || '(none)'} -> ${desc}`);
    }
    return;
  }

  // Fetch every enabled source, tag rows with their service binding.
  const rowsByService = new Map();
  for (const s of sources) {
    const mod = SOURCE_REGISTRY[s.type];
    if (!mod) { console.error(`[collect] unknown source type: ${s.type} (source ${s.name})`); process.exitCode = 2; continue; }
    process.stderr.write(`[collect] fetching ${s.type}:${s.name} (${hours}h) ...\n`);
    let rows = [];
    try {
      rows = await mod.fetch(s, ctx);
    } catch (e) {
      process.stderr.write(`[collect] ERROR on ${s.type}:${s.name}: ${e.message}\n`);
      process.exitCode = 2;
      continue;
    }
    const svc = s.service || '_unassigned';
    if (!rowsByService.has(svc)) rowsByService.set(svc, []);
    rowsByService.get(svc).push(...rows.map((r) => ({ ...r, source: `${s.type}:${s.name}` })));
  }

  const perService = [];
  for (const [svcName, rows] of rowsByService) {
    const binding = serviceMap.get(svcName) || {};
    perService.push({
      service: svcName,
      repo: binding.repo || null,
      repo_path: binding.repo_path || null,
      base_branch: binding.base_branch || defaults.default_base_branch || 'staging',
      feedback_command: binding.feedback_command || null,
      assignee: binding.assignee || defaults.assignee || null,
      raw_lines: rows.length,
      clusters: cluster(rows, minOcc),
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    window_hours: hours,
    sources: sources.map((s) => ({ type: s.type, name: s.name, service: s.service || null })),
    services: perService,
    total_clusters: perService.reduce((n, s) => n + s.clusters.length, 0),
  };

  const outDir = join(REPO_ROOT, 'reports');
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/g, '-');
  const outPath = args.out ? resolve(args.out) : join(outDir, `log-triage-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Wrote ${outPath}`);
  console.log(`Sources: ${sources.length} | services: ${perService.length} | total clusters: ${report.total_clusters}`);
  for (const s of perService) {
    const top = s.clusters[0];
    console.log(`  - ${s.service}: ${s.clusters.length} clusters, ${s.raw_lines} raw lines`
      + (top ? ` | top (${top.count}×): ${top.signature.slice(0, 80)}` : ''));
  }
}

if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  main();
}
