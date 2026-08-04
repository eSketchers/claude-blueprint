// collect-doc-changes.test.mjs — tests for the deterministic doc-change classifier.
// Pure functions only; the git call is exercised via --dry-run + real runs.
//
// Run: node --test tests/scripts/collect-doc-changes.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectFrameworks, globToRegExp, resolveMapping, classifyPath,
  parseDiff, extractFacts, buildChangeReport,
} from '../../scripts/collect-doc-changes.mjs';

function fakeIO(files) {
  const set = new Set(files);
  return {
    exists: (p) => set.has(p) || [...set].some((f) => f.startsWith(p + '/')),
    readFile: (p) => (files[p] !== undefined ? files[p] : (set.has(p) ? '' : (() => { throw new Error('ENOENT'); })())),
  };
}

test('detectFrameworks(): single Next.js repo at root', () => {
  const io = { exists: (p) => p === '/r/package.json', readFile: () => '{"dependencies":{"next":"14"}}' };
  const fw = detectFrameworks('/r', io);
  assert.deepEqual(fw, [{ framework: 'nextjs', root: '' }]);
});

test('detectFrameworks(): django-react monorepo (python backend + node frontend)', () => {
  const present = new Set(['/r/backend', '/r/backend/manage.py', '/r/frontend', '/r/frontend/package.json']);
  const io = {
    exists: (p) => present.has(p),
    readFile: (p) => (p === '/r/frontend/package.json' ? '{"dependencies":{"react":"18"}}' : ''),
  };
  const fw = detectFrameworks('/r', io);
  assert.ok(fw.some((f) => f.framework === 'python' && f.root === 'backend'));
  assert.ok(fw.some((f) => f.framework === 'node' && f.root === 'frontend'));
});

test('detectFrameworks(): none', () => {
  assert.deepEqual(detectFrameworks('/r', { exists: () => false, readFile: () => '' }), []);
});

test('globToRegExp(): **, *, {a,b}', () => {
  assert.ok(globToRegExp('src/**').test('src/a/b/c.ts'));
  assert.ok(globToRegExp('**/migrations/**').test('backend/app/migrations/0001.py'));
  assert.ok(globToRegExp('*.py').test('models.py'));
  assert.ok(!globToRegExp('*.py').test('a/b.py'));
  assert.ok(globToRegExp('prisma/{schema.prisma,migrations/**}').test('prisma/schema.prisma'));
});

test('classifyPath(): schema > backend > frontend precedence', () => {
  const m = resolveMapping([{ framework: 'nestjs', root: '' }]);
  assert.equal(classifyPath('src/users/migrations/0001.ts', m), 'schema'); // migration under src -> schema, not backend
  assert.equal(classifyPath('src/users/users.service.ts', m), 'backend');
  assert.equal(classifyPath('README.md', m), 'other');
});

test('classifyPath(): nextjs frontend vs api', () => {
  const m = resolveMapping([{ framework: 'nextjs', root: '' }]);
  assert.equal(classifyPath('app/api/orders/route.ts', m), 'backend');
  assert.equal(classifyPath('app/dashboard/page.tsx', m), 'frontend');
  assert.equal(classifyPath('prisma/migrations/1_init/migration.sql', m), 'schema');
});

test('resolveMapping(): monorepo root-prefixes globs + honors overrides', () => {
  const m = resolveMapping([{ framework: 'django-react', root: '' }], { 'django-react': { frontend: ['web/**'] } });
  assert.ok(m[0].buckets.frontend.includes('web/**'));
  assert.equal(classifyPath('backend/app/migrations/0002.py', m), 'schema');
});

test('parseDiff(): A/M/D and rename', () => {
  const d = parseDiff('A\tsrc/a.ts\nM\tsrc/b.ts\nD\tsrc/c.ts\nR100\tsrc/old.ts\tsrc/new.ts');
  assert.deepEqual(d, [
    { status: 'A', path: 'src/a.ts' },
    { status: 'M', path: 'src/b.ts' },
    { status: 'D', path: 'src/c.ts' },
    { status: 'R', path: 'src/new.ts' },
  ]);
});

test('extractFacts(): flags migrations', () => {
  const m = resolveMapping([{ framework: 'python', root: '' }]);
  const facts = extractFacts([{ status: 'A', path: 'app/migrations/0003_add.py' }, { status: 'M', path: 'app/views.py' }], m);
  assert.equal(facts.schema_migrations.length, 1);
  assert.equal(facts.schema_migrations[0].migration, true);
  assert.equal(facts.backend_changes.length, 1);
});

test('buildChangeReport(): buckets + empty flag', () => {
  const m = resolveMapping([{ framework: 'node', root: '' }]);
  const empty = buildChangeReport({ base: 'a', head: 'b', frameworks: [], entries: [{ status: 'M', path: 'README.md' }], mappings: m, facts: {} });
  assert.equal(empty.empty, true);
  const nonEmpty = buildChangeReport({ base: 'a', head: 'b', frameworks: [], entries: [{ status: 'M', path: 'src/x.ts' }], mappings: m, facts: {} });
  assert.equal(nonEmpty.empty, false);
  assert.equal(nonEmpty.buckets.backend.length, 1);
});
