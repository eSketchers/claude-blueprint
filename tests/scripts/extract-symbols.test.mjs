// extract-symbols.test.mjs — tests for the symbol extractor's pure functions.
// No ast-grep binary needed: parseAstGrepJson runs on canned --json fixtures.
//
// Run: node --test tests/scripts/extract-symbols.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  symbolPatterns, parseAstGrepJson, symbolId, bodyHash, diffSymbols, scopeFilter,
} from '../../scripts/extract-symbols.mjs';

test('symbolPatterns(): python includes def + class', () => {
  const p = symbolPatterns('python');
  assert.ok(p.some((x) => x.lang === 'python' && x.kind === 'function'));
  assert.ok(p.some((x) => x.lang === 'python' && x.kind === 'class'));
});

test('symbolPatterns(): react includes tsx/jsx component patterns', () => {
  const p = symbolPatterns('react');
  assert.ok(p.some((x) => x.lang === 'tsx' && x.kind === 'component'));
  assert.ok(p.some((x) => x.lang === 'jsx' && x.kind === 'component'));
  assert.ok(p.some((x) => x.pattern.includes('export default function')));
});

test('symbolPatterns(): nextjs includes tsx patterns', () => {
  const p = symbolPatterns('nextjs');
  assert.ok(p.some((x) => x.lang === 'tsx'));
});

test('symbolPatterns(): node does not include tsx patterns', () => {
  const p = symbolPatterns('node');
  assert.ok(!p.some((x) => x.lang === 'tsx'));
});

test('parseAstGrepJson(): uses metaVariables NAME + first-line signature', () => {
  const fixture = [{
    file: 'src/orders.ts',
    text: 'export function createOrder(cart) {\n  return db.save(cart);\n}',
    range: { start: { line: 12 } },
    metaVariables: { single: { NAME: { text: 'createOrder' } } },
  }];
  const [s] = parseAstGrepJson(fixture, 'function');
  assert.equal(s.name, 'createOrder');
  assert.equal(s.kind, 'function');
  assert.equal(s.file, 'src/orders.ts');
  assert.equal(s.line, 12);
  assert.match(s.signature, /export function createOrder\(cart\)/);
});

test('parseAstGrepJson(): falls back to regex name when no metaVariables', () => {
  const [s] = parseAstGrepJson([{ file: 'a.py', text: 'class UserRepo:\n    pass' }], 'class');
  assert.equal(s.name, 'UserRepo');
});

test('parseAstGrepJson(): accepts a JSON string and drops nameless matches', () => {
  const json = JSON.stringify([{ file: 'a.ts', text: '{ noise }' }]);
  assert.deepEqual(parseAstGrepJson(json, 'function'), []);
});

test('symbolId(): stable composite key', () => {
  assert.equal(symbolId('src/a.ts', 'foo', 'function'), 'src/a.ts::function:foo');
});

test('bodyHash(): whitespace-insensitive but content-sensitive', () => {
  assert.equal(bodyHash('function f(a) {  return a; }'), bodyHash('function f(a) {\n  return a;\n}'));
  assert.notEqual(bodyHash('function f(a){return a;}'), bodyHash('function f(a){return b;}'));
});

test('diffSymbols(): added / changed / removed / unchanged', () => {
  const prev = { 'a::function:x': 'h1', 'a::function:y': 'h2', 'a::function:z': 'h3' };
  const cur = [
    { id: 'a::function:x', hash: 'h1' }, // unchanged
    { id: 'a::function:y', hash: 'h2new' }, // changed
    { id: 'a::function:w', hash: 'h9' }, // added
  ];
  const d = diffSymbols(prev, cur);
  assert.deepEqual(d.unchanged, ['a::function:x']);
  assert.deepEqual(d.changed, ['a::function:y']);
  assert.deepEqual(d.added, ['a::function:w']);
  assert.deepEqual(d.removed, ['a::function:z']);
});

test('scopeFilter(): excludes tests/node_modules/migrations; honors include', () => {
  assert.equal(scopeFilter('src/orders.ts', {}), true);
  assert.equal(scopeFilter('src/orders.test.ts', {}), false);
  assert.equal(scopeFilter('node_modules/x/index.js', {}), false);
  assert.equal(scopeFilter('app/migrations/0001.py', {}), false);
  assert.equal(scopeFilter('src/orders.ts', { include: ['lib/**'] }), false);
  assert.equal(scopeFilter('lib/orders.ts', { include: ['lib/**'] }), true);
});
