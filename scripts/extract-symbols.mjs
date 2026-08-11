#!/usr/bin/env node
// extract-symbols.mjs — symbol-level reference extractor for /update-docs.
//
// Enumerates exported functions/classes (with signatures) across the repo using
// ast-grep's JSON output, hashes each symbol's body, and emits a symbols report.
// The /update-docs command then LLM-describes only the symbols whose hash changed
// (git-native incremental: unchanged symbols keep their existing prose).
//
// ast-grep is the only headless-capable extractor (serena is MCP-interactive;
// graphify is module-level). Install: `npm i -g @ast-grep/cli` (bootstrap.sh does
// this; the update-docs workflow adds an install step since CI lacks it).
//
//   node scripts/extract-symbols.mjs --config docs-sync/config.json --dry-run
//
// Exit codes: 0 ok, 1 usage, 2 ast-grep missing/failed.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { globToRegExp } from './collect-doc-changes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/vendor/**', '**/dist/**', '**/build/**', '**/.git/**', '**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/tests/**', '**/migrations/**'];

// ast-grep patterns per language for the public/exported symbols we document.
const PATTERNS = {
  ts: [
    { kind: 'function', lang: 'ts', pattern: 'export function $NAME($$$ARGS) { $$$ }' },
    { kind: 'function', lang: 'ts', pattern: 'export default function $NAME($$$ARGS) { $$$ }' },
    { kind: 'class', lang: 'ts', pattern: 'export class $NAME { $$$ }' },
    { kind: 'class', lang: 'ts', pattern: 'export default class $NAME { $$$ }' },
    { kind: 'const', lang: 'ts', pattern: 'export const $NAME = ($$$ARGS) => $$$' },
  ],
  js: [
    { kind: 'function', lang: 'js', pattern: 'export function $NAME($$$ARGS) { $$$ }' },
    { kind: 'function', lang: 'js', pattern: 'export default function $NAME($$$ARGS) { $$$ }' },
    { kind: 'class', lang: 'js', pattern: 'export class $NAME { $$$ }' },
    { kind: 'class', lang: 'js', pattern: 'export default class $NAME { $$$ }' },
  ],
  // tsx / jsx: same patterns as ts/js but ast-grep parses JSX syntax correctly.
  tsx: [
    { kind: 'component', lang: 'tsx', pattern: 'export function $NAME($$$ARGS) { $$$ }' },
    { kind: 'component', lang: 'tsx', pattern: 'export default function $NAME($$$ARGS) { $$$ }' },
    { kind: 'class', lang: 'tsx', pattern: 'export class $NAME { $$$ }' },
    { kind: 'class', lang: 'tsx', pattern: 'export default class $NAME { $$$ }' },
    { kind: 'const', lang: 'tsx', pattern: 'export const $NAME = ($$$ARGS) => $$$' },
  ],
  jsx: [
    { kind: 'component', lang: 'jsx', pattern: 'export function $NAME($$$ARGS) { $$$ }' },
    { kind: 'component', lang: 'jsx', pattern: 'export default function $NAME($$$ARGS) { $$$ }' },
    { kind: 'class', lang: 'jsx', pattern: 'export class $NAME { $$$ }' },
  ],
  python: [
    { kind: 'function', lang: 'python', pattern: 'def $NAME($$$ARGS):\n    $$$' },
    { kind: 'class', lang: 'python', pattern: 'class $NAME:\n    $$$' },
  ],
};

/** Return the ast-grep patterns for a framework's languages. */
export function symbolPatterns(framework) {
  if (framework === 'python' || framework === 'django-react') return [...PATTERNS.python, ...PATTERNS.ts];
  if (framework === 'react' || framework === 'nextjs') return [...PATTERNS.ts, ...PATTERNS.tsx, ...PATTERNS.jsx, ...PATTERNS.js];
  return [...PATTERNS.ts, ...PATTERNS.js];
}

/** First non-empty line of a snippet (the signature). */
function firstLine(text) {
  return String(text).split('\n').map((l) => l.trim()).find(Boolean) || '';
}

/** Best-effort symbol name when ast-grep metavariables are absent. */
function extractName(text, kind) {
  const s = firstLine(text);
  const m = kind === 'class'
    ? s.match(/class\s+([A-Za-z_$][\w$]*)/)
    : s.match(/(?:function|const|def)\s+([A-Za-z_$][\w$]*)/);
  return m ? m[1] : '';
}

/**
 * Normalize ast-grep `--json` matches to symbol records.
 * @param {string|object[]} json  ast-grep --json output
 * @param {string} kind
 * @returns {Array<{file:string, name:string, kind:string, signature:string, line:number}>}
 */
export function parseAstGrepJson(json, kind) {
  const matches = typeof json === 'string' ? JSON.parse(json) : json;
  return (Array.isArray(matches) ? matches : [])
    .map((m) => {
      const name = m.metaVariables?.single?.NAME?.text || extractName(m.text || '', kind);
      return {
        file: m.file || '',
        name,
        kind,
        signature: firstLine(m.text || ''),
        line: m.range?.start?.line ?? 0,
      };
    })
    .filter((s) => s.name);
}

/** Stable per-symbol id used as the doc marker key. */
export function symbolId(moduleFile, name, kind) {
  return `${moduleFile}::${kind}:${name}`;
}

/** sha256 of the normalized symbol body — the incremental-skip key. */
export function bodyHash(text) {
  const norm = String(text).replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

/**
 * Compare current symbols against previously-recorded hashes.
 * @param {Record<string,string>} prevHashes  {id: hash}
 * @param {Array<{id:string, hash:string}>} current
 */
export function diffSymbols(prevHashes, current) {
  const prev = prevHashes || {};
  const curIds = new Set(current.map((c) => c.id));
  const added = [], changed = [], unchanged = [];
  for (const c of current) {
    if (!(c.id in prev)) added.push(c.id);
    else if (prev[c.id] !== c.hash) changed.push(c.id);
    else unchanged.push(c.id);
  }
  const removed = Object.keys(prev).filter((id) => !curIds.has(id));
  return { added, changed, removed, unchanged };
}

/** Include/exclude filter for which files to scan (exported symbols only). */
export function scopeFilter(path, { include = [], exclude = [] } = {}) {
  const ex = [...DEFAULT_EXCLUDE, ...exclude];
  if (ex.some((g) => globToRegExp(g).test(path))) return false;
  if (include.length && !include.some((g) => globToRegExp(g).test(path))) return false;
  return true;
}

// ---------------- main (needs ast-grep) ----------------

function hasAstGrep() {
  try { execFileSync('ast-grep', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function parseArgs(argv) {
  const a = { config: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--config') a.config = argv[++i];
    else if (t === '--dry-run') a.dryRun = true;
    else if (t === '-h' || t === '--help') a.help = true;
    else throw new Error(`unknown argument: ${t}`);
  }
  return a;
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(String(e.message)); process.exit(1); }
  if (args.help) { console.log('Usage: node scripts/extract-symbols.mjs [--config <path>] [--dry-run]'); return; }

  const config = args.config && existsSync(resolve(args.config)) ? JSON.parse(readFileSync(resolve(args.config), 'utf8')) : {};
  const langs = config.symbol_reference?.languages || ['ts', 'tsx', 'jsx', 'js', 'python'];
  const patterns = langs.flatMap((l) => PATTERNS[l] || []);

  if (args.dryRun) {
    console.log('# dry-run — would run ast-grep for:');
    for (const p of patterns) console.log(`#   [${p.lang}/${p.kind}] ${p.pattern.replace(/\n/g, ' ')}`);
    console.log(`# ast-grep available: ${hasAstGrep()}`);
    return;
  }

  if (!hasAstGrep()) {
    console.error('error: ast-grep not found. Install with: npm i -g @ast-grep/cli');
    process.exit(2);
  }

  const symbols = [];
  for (const p of patterns) {
    let out;
    try { out = execFileSync('ast-grep', ['run', '--pattern', p.pattern, '--lang', p.lang, '--json', '.'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }); }
    catch { continue; }
    for (const s of parseAstGrepJson(out, p.kind)) {
      if (!scopeFilter(s.file, config.symbol_reference || {})) continue;
      symbols.push({ ...s, id: symbolId(s.file, s.name, s.kind), hash: bodyHash(s.signature) });
    }
  }

  const report = { generated_at: new Date().toISOString(), count: symbols.length, symbols };
  const outDir = join(REPO_ROOT, 'reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `symbols-${report.generated_at.replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath} | ${symbols.length} exported symbols`);
}

if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  main();
}
