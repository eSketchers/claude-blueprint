#!/usr/bin/env node
// collect-cloudwatch-errors.mjs — read-only CloudWatch error collector for /log-triage.
//
// Runs a CloudWatch Logs Insights query per configured log group, clusters the raw
// error lines into stable "signatures" (collapsing timestamps / UUIDs / numbers so
// the same error groups together), ranks clusters by occurrence, and writes a JSON
// report under reports/. Zero-dependency: drives the `aws logs` CLI via child_process,
// matching the blueprint's Node-ESM + no-npm-deps convention.
//
//   node scripts/collect-cloudwatch-errors.mjs --config cloudwatch-triage/config.json
//   node scripts/collect-cloudwatch-errors.mjs --config cloudwatch-triage/config.json --hours 12
//   node scripts/collect-cloudwatch-errors.mjs --config ... --dry-run   # print the query, don't hit AWS
//
// Exit codes: 0 ok, 1 config/usage error, 2 AWS query error.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ---------------- arg parsing ----------------

function parseArgs(argv) {
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

const USAGE = `Usage: node scripts/collect-cloudwatch-errors.mjs --config <path> [--hours N] [--out <path>] [--dry-run]`;

// ---------------- clustering ----------------

/**
 * Collapse volatile fields in a log line so recurrences of the same error map to
 * one signature. Order matters: most-specific patterns first.
 * @param {string} message
 * @returns {string}
 */
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

/**
 * Cluster raw {timestamp, message} rows by signature, ranked by count desc.
 * @param {Array<{timestamp:string, message:string, logGroup:string}>} rows
 * @param {number} minOccurrences
 */
export function cluster(rows, minOccurrences = 1) {
  const map = new Map();
  for (const r of rows) {
    const sig = signature(r.message);
    if (!sig) continue;
    let c = map.get(sig);
    if (!c) {
      c = {
        signature: sig,
        count: 0,
        sample: r.message,
        first_seen: r.timestamp,
        last_seen: r.timestamp,
        log_groups: new Set(),
      };
      map.set(sig, c);
    }
    c.count++;
    c.log_groups.add(r.logGroup);
    if (r.timestamp < c.first_seen) c.first_seen = r.timestamp;
    if (r.timestamp > c.last_seen) c.last_seen = r.timestamp;
  }
  return [...map.values()]
    .filter((c) => c.count >= minOccurrences)
    .sort((a, b) => b.count - a.count)
    .map((c) => ({ ...c, log_groups: [...c.log_groups] }));
}

// ---------------- CloudWatch query ----------------

/**
 * Build a Logs Insights query string from the config's pattern list.
 * @param {string[]} patterns
 * @param {number} limit
 */
export function buildQuery(patterns, limit) {
  const alts = (patterns && patterns.length ? patterns : ['ERROR'])
    .map((p) => String(p).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('|');
  return [
    'fields @timestamp, @message',
    `filter @message like /(?i)(${alts})/`,
    'sort @timestamp desc',
    `limit ${limit}`,
  ].join('\n| ');
}

function aws(profile, region, subArgs) {
  const base = [];
  if (profile) base.push('--profile', profile);
  if (region) base.push('--region', region);
  return execFileSync('aws', [...base, ...subArgs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Run a Logs Insights query against one log group and return matched rows.
 */
function queryLogGroup({ profile, region, logGroup, queryStr, startTime, endTime }) {
  const startOut = aws(profile, region, [
    'logs', 'start-query',
    '--log-group-name', logGroup,
    '--start-time', String(startTime),
    '--end-time', String(endTime),
    '--query-string', queryStr,
    '--output', 'json',
  ]);
  const queryId = JSON.parse(startOut).queryId;

  // Poll until Complete/Failed/Cancelled (Insights is async).
  const deadline = Date.now() + 120000; // 2 min cap per group
  let results = null;
  while (Date.now() < deadline) {
    execFileSync('sleep', ['2']);
    const out = aws(profile, region, ['logs', 'get-query-results', '--query-id', queryId, '--output', 'json']);
    const parsed = JSON.parse(out);
    if (parsed.status === 'Complete') { results = parsed.results; break; }
    if (parsed.status === 'Failed' || parsed.status === 'Cancelled') {
      throw new Error(`query ${parsed.status} for ${logGroup}`);
    }
  }
  if (results === null) throw new Error(`query timed out for ${logGroup}`);

  // results: array of arrays of {field, value}
  return results.map((row) => {
    const rec = Object.fromEntries(row.map((f) => [f.field, f.value]));
    return { timestamp: rec['@timestamp'] || '', message: rec['@message'] || '', logGroup };
  }).filter((r) => r.message);
}

// ---------------- main ----------------

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(String(e.message)); console.error(USAGE); process.exit(1); }
  if (args.help) { console.log(USAGE); return; }
  if (!args.config) { console.error('error: --config is required\n' + USAGE); process.exit(1); }

  const configPath = resolve(args.config);
  if (!existsSync(configPath)) { console.error(`error: config not found: ${configPath}`); process.exit(1); }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  const profile = config.aws?.profile || 'default';
  const region = config.aws?.region || process.env.AWS_REGION || 'us-east-1';
  const patterns = config.query?.pattern || ['ERROR'];
  const hours = args.hours ?? config.query?.lookback_hours ?? 24;
  const limit = config.query?.limit ?? 1000;
  const minOcc = config.query?.min_occurrences ?? 1;
  const queryStr = buildQuery(patterns, limit);

  const services = (config.services || []).filter((s) => s.enabled);
  if (!services.length) {
    console.error('error: no services with "enabled": true in config. Nothing to scan.');
    process.exit(1);
  }

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - hours * 3600;

  if (args.dryRun) {
    console.log(`# dry-run — would query ${hours}h across profile=${profile} region=${region}\n`);
    console.log(`# query string:\n${queryStr}\n`);
    for (const s of services) console.log(`# ${s.name}: ${(s.log_groups || []).join(', ')}`);
    return;
  }

  const perService = [];
  for (const s of services) {
    const rows = [];
    for (const lg of s.log_groups || []) {
      process.stderr.write(`[collect] querying ${s.name} :: ${lg} (${hours}h) ...\n`);
      try {
        rows.push(...queryLogGroup({ profile, region, logGroup: lg, queryStr, startTime, endTime }));
      } catch (e) {
        process.stderr.write(`[collect] ERROR on ${lg}: ${e.message}\n`);
        process.exitCode = 2;
      }
    }
    const clusters = cluster(rows, minOcc);
    perService.push({
      service: s.name,
      repo: s.repo || null,
      repo_path: s.repo_path || null,
      base_branch: s.base_branch || config.defaults?.default_base_branch || 'staging',
      feedback_command: s.feedback_command || null,
      assignee: s.assignee || config.defaults?.assignee || null,
      log_groups: s.log_groups || [],
      raw_lines: rows.length,
      clusters,
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    window_hours: hours,
    region,
    profile,
    query: queryStr,
    services: perService,
    total_clusters: perService.reduce((n, s) => n + s.clusters.length, 0),
  };

  const outDir = join(REPO_ROOT, 'reports');
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/g, '-');
  const outPath = args.out ? resolve(args.out) : join(outDir, `cloudwatch-triage-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Wrote ${outPath}`);
  console.log(`Services scanned: ${perService.length} | total clusters: ${report.total_clusters}`);
  for (const s of perService) {
    const top = s.clusters[0];
    console.log(`  - ${s.service}: ${s.clusters.length} clusters, ${s.raw_lines} raw lines` +
      (top ? ` | top (${top.count}×): ${top.signature.slice(0, 80)}` : ''));
  }
}

// Only run main() when invoked directly (allows importing the pure fns for tests).
if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  main();
}
