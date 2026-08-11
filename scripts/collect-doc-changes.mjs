#!/usr/bin/env node
// collect-doc-changes.mjs — deterministic doc-change classifier for /update-docs.
//
// Diffs a merge range, classifies each changed file into backend / schema /
// frontend / other buckets per detected framework, extracts diff-only facts, and
// writes a JSON change-report. Zero-dependency Node ESM (matches the blueprint's
// collector convention): drives `git` via execFileSync, pure exports + guarded
// main(). The LLM narration pass (/update-docs) consumes the report.
//
//   node scripts/collect-doc-changes.mjs --config docs-sync/config.json
//   node scripts/collect-doc-changes.mjs --range HEAD~5..HEAD --dry-run
//
// Exit codes: 0 ok, 1 config/usage error, 2 git error.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Per-framework path conventions for the three surfaces (globs, framework-root-relative).
export const DEFAULT_MAPPINGS = {
  python: {
    backend: ['**/*.py', 'src/**'],
    schema: ['**/migrations/**', 'alembic/versions/**', '**/models.py'],
    frontend: [],
  },
  node: {
    backend: ['src/**'],
    schema: ['prisma/schema.prisma', 'prisma/migrations/**', 'migrations/**', 'db/migrations/**', '**/drizzle/**'],
    frontend: [],
  },
  // React / Vue / Svelte / Angular SPAs — all source is frontend; no backend surface.
  react: {
    backend: [],
    schema: [],
    frontend: ['src/**', 'public/**', 'components/**', 'pages/**', 'app/**', 'lib/**'],
  },
  nextjs: {
    backend: ['app/api/**', 'pages/api/**'],
    schema: ['prisma/schema.prisma', 'prisma/migrations/**'],
    frontend: ['app/**', 'components/**', 'src/**', 'pages/**', 'styles/**'],
  },
  nestjs: {
    backend: ['src/**'],
    schema: ['src/**/migrations/**', 'src/**/entities/**', '**/*.entity.ts', 'prisma/migrations/**'],
    frontend: [],
  },
  'django-react': {
    backend: ['backend/**'],
    schema: ['backend/**/migrations/**', 'backend/**/models.py'],
    frontend: ['frontend/src/**', 'frontend/**'],
  },
};

const BUCKET_ORDER = ['schema', 'backend', 'frontend']; // precedence: schema wins over backend wins over frontend

// ---------------- import extraction ----------------

/**
 * Extract import/require statements from file content.
 * @param {string} content  file source
 * @param {'js'|'ts'|'python'} lang
 * @returns {Array<{name:string, from:string, local:boolean}>}
 */
export function extractImports(content, lang = 'js') {
  const results = [];
  if (lang === 'python') {
    // `import os` and `from .models import User`
    const re = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
      const from = (m[1] || m[2]).trim();
      results.push({ from, local: from.startsWith('.') });
    }
  } else {
    // ES import: import X from '...' / import { X } from '...' / import '...'
    const esRe = /import\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = esRe.exec(content)) !== null) {
      const from = m[1];
      results.push({ from, local: from.startsWith('.') });
    }
    // CommonJS require()
    const cjsRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = cjsRe.exec(content)) !== null) {
      const from = m[1];
      results.push({ from, local: from.startsWith('.') });
    }
  }
  return results;
}

/** Read file content at HEAD for import extraction. Returns '' on error. */
function readFileAtHead(path) {
  try { return execFileSync('git', ['show', `HEAD:${path}`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }); }
  catch { return ''; }
}

// ---------------- framework detection (port of adopt.sh detect_frameworks) ----------------

/**
 * Detect frameworks + their roots. IO is injected for testability.
 * @param {string} root
 * @param {{readFile:(p:string)=>string, exists:(p:string)=>boolean}} io
 * @returns {Array<{framework:string, root:string}>}
 */
export function detectFrameworks(root, io) {
  const out = [];
  const seen = new Set();
  const add = (framework, r) => { const k = `${framework}@${r}`; if (!seen.has(k)) { seen.add(k); out.push({ framework, root: r }); } };
  const pkgHas = (p, dep) => { try { return io.readFile(p).includes(`"${dep}"`); } catch { return false; } };

  const classifyDir = (dir) => {
    const rel = dir === root ? '' : dir.slice(root.length + 1);
    const j = (f) => `${dir}/${f}`;
    if (io.exists(j('pyproject.toml')) || io.exists(j('requirements.txt')) || io.exists(j('setup.py')) || io.exists(j('manage.py'))) {
      add('python', rel);
    }
    if (io.exists(j('package.json'))) {
      const pkg = j('package.json');
      if (pkgHas(pkg, 'next')) add('nextjs', rel);
      else if (pkgHas(pkg, '@nestjs/core')) add('nestjs', rel);
      else if (pkgHas(pkg, 'react') || pkgHas(pkg, 'vue') || pkgHas(pkg, '@angular/core') || pkgHas(pkg, 'svelte') || pkgHas(pkg, 'solid-js')) add('react', rel);
      else add('node', rel);
    }
  };

  classifyDir(root);
  for (const sub of ['backend', 'frontend', 'api', 'web', 'apps', 'services', 'mobile']) {
    const dir = `${root}/${sub}`;
    if (io.exists(dir)) classifyDir(dir);
  }
  return out;
}

// ---------------- glob matching (no minimatch dependency) ----------------

/** Expand `{a,b}` alternations into a list of brace-free globs (handles multiple/nested). */
function expandBraces(glob) {
  const open = glob.indexOf('{');
  if (open === -1) return [glob];
  let depth = 0, close = -1;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === '{') depth++;
    else if (glob[i] === '}' && --depth === 0) { close = i; break; }
  }
  if (close === -1) return [glob];
  const prefix = glob.slice(0, open), suffix = glob.slice(close + 1);
  return glob.slice(open + 1, close).split(',').flatMap((m) => expandBraces(prefix + m + suffix));
}

/** Convert one brace-free glob (supports **, *, ?) to a regex body. */
function chunkToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return re;
}

/** Convert a glob (supports **, *, {a,b}) to an anchored RegExp. */
export function globToRegExp(glob) {
  const bodies = expandBraces(glob).map(chunkToRegex);
  return new RegExp('^(?:' + bodies.join('|') + ')$');
}

// ---------------- mapping + classification ----------------

/** Build per-framework, root-prefixed bucket globs merged with config overrides. */
export function resolveMapping(frameworks, configMappings = {}) {
  const list = frameworks.length ? frameworks : [{ framework: 'node', root: '' }];
  return list.map(({ framework, root }) => {
    const base = DEFAULT_MAPPINGS[framework] || DEFAULT_MAPPINGS.node;
    const override = configMappings[framework] || {};
    const prefix = (g) => (root ? `${root}/${g}` : g);
    const buckets = {};
    for (const b of BUCKET_ORDER) buckets[b] = (override[b] || base[b] || []).map(prefix);
    return { framework, root, buckets };
  });
}

/** Classify one path into schema|backend|frontend|other (precedence schema>backend>frontend). */
export function classifyPath(path, mappings) {
  for (const bucket of BUCKET_ORDER) {
    for (const m of mappings) {
      if (m.buckets[bucket].some((g) => globToRegExp(g).test(path))) return bucket;
    }
  }
  return 'other';
}

/** Parse `git diff --name-status` output. Handles A/M/D and R<score>\told\tnew. */
export function parseDiff(nameStatus) {
  const entries = [];
  for (const line of String(nameStatus).split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0][0]; // A|M|D|R|C
    const path = parts.length >= 3 ? parts[2] : parts[1]; // rename/copy -> new path
    if (path) entries.push({ status, path });
  }
  return entries;
}

/** Extract diff-only facts (no file reads) from classified entries. */
export function extractFacts(entries, mappings) {
  const facts = { schema_migrations: [], backend_changes: [], frontend_changes: [] };
  for (const e of entries) {
    const bucket = classifyPath(e.path, mappings);
    if (bucket === 'schema') {
      const isMigration = /migration|alembic|schema\.prisma|\.entity\./i.test(e.path);
      facts.schema_migrations.push({ path: e.path, status: e.status, migration: isMigration });
    } else if (bucket === 'backend') {
      facts.backend_changes.push({ path: e.path, status: e.status });
    } else if (bucket === 'frontend') {
      facts.frontend_changes.push({ path: e.path, status: e.status });
    }
  }
  return facts;
}

/** Assemble the change-report; empty=true when every bucket except `other` is empty. */
export function buildChangeReport({ base, head, frameworks, entries, mappings, facts }) {
  const buckets = { backend: [], schema: [], frontend: [], other: [] };
  for (const e of entries) buckets[classifyPath(e.path, mappings)].push(e);
  const empty = buckets.backend.length === 0 && buckets.schema.length === 0 && buckets.frontend.length === 0;

  // Per-file import metadata (skip deleted files)
  const fileImports = {};
  for (const e of entries) {
    if (e.status === 'D') continue;
    const ext = e.path.split('.').pop() || '';
    const lang = ['py'].includes(ext) ? 'python' : 'js';
    const content = readFileAtHead(e.path);
    if (content) fileImports[e.path] = extractImports(content, lang);
  }

  return { base, head, frameworks, buckets, facts, fileImports, empty };
}

// ---------------- git + range resolution ----------------

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Resolve base..head from args (priority: --range → --base/--head → HEAD~1..HEAD). */
export function resolveRange(args) {
  if (args.range) { const [b, h] = args.range.split('..'); return { base: b, head: h || 'HEAD' }; }
  if (args.base || args.head) return { base: args.base || 'HEAD~1', head: args.head || 'HEAD' };
  return { base: 'HEAD~1', head: 'HEAD' };
}

// ---------------- arg parsing + main ----------------

export function parseArgs(argv) {
  const a = { config: null, base: null, head: null, range: null, out: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--config') a.config = argv[++i];
    else if (t === '--base') a.base = argv[++i];
    else if (t === '--head') a.head = argv[++i];
    else if (t === '--range') a.range = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--dry-run') a.dryRun = true;
    else if (t === '-h' || t === '--help') a.help = true;
    else throw new Error(`unknown argument: ${t}`);
  }
  return a;
}

const USAGE = 'Usage: node scripts/collect-doc-changes.mjs [--config <path>] [--range A..B | --base <ref> --head <ref>] [--dry-run]';

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(String(e.message)); console.error(USAGE); process.exit(1); }
  if (args.help) { console.log(USAGE); return; }

  const config = args.config && existsSync(resolve(args.config))
    ? JSON.parse(readFileSync(resolve(args.config), 'utf8')) : {};
  const io = { readFile: (p) => readFileSync(p, 'utf8'), exists: (p) => existsSync(p) };
  const frameworks = detectFrameworks(REPO_ROOT, io);
  const mappings = resolveMapping(frameworks, config.mappings || {});
  const { base, head } = resolveRange(args);

  if (args.dryRun) {
    console.log(`# dry-run — range ${base}..${head}`);
    console.log(`# frameworks: ${frameworks.map((f) => `${f.framework}@${f.root || '.'}`).join(', ') || '(none)'}`);
    for (const m of mappings) console.log(`# ${m.framework}@${m.root || '.'}: ` + BUCKET_ORDER.map((b) => `${b}=[${m.buckets[b].join(',')}]`).join(' '));
    return;
  }

  let nameStatus;
  try { nameStatus = git(['diff', '--name-status', `${base}..${head}`]); }
  catch (e) { console.error(`[collect-doc-changes] git diff failed: ${e.message}`); process.exit(2); }

  const entries = parseDiff(nameStatus);
  const facts = extractFacts(entries, mappings);
  const report = buildChangeReport({ base, head, frameworks, entries, mappings, facts });
  report.generated_at = new Date().toISOString();

  const outDir = join(REPO_ROOT, 'reports');
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/g, '-');
  const outPath = args.out ? resolve(args.out) : join(outDir, `doc-changes-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Wrote ${outPath}`);
  console.log(`Range ${base}..${head} | changed ${entries.length} | ` +
    `backend ${report.buckets.backend.length} schema ${report.buckets.schema.length} frontend ${report.buckets.frontend.length}` +
    (report.empty ? ' | EMPTY (no doc-relevant changes)' : ''));
}

if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  main();
}
