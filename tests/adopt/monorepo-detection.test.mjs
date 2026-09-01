// monorepo-detection.test.mjs — Tier 2 (Cross-Cutting Issue 5 / Adoption
// Issue 2): tests for scripts/adopt.sh's --detect and --frameworks paths.
//
// scripts/test-adopt.sh already covers --framework <single> extensively
// (sibling/nested layout, idempotency, force, uninstall, doctor) across all
// 4 frameworks — this file does NOT duplicate that. It covers the two paths
// that had zero test coverage before this fix: --detect (auto-detection
// heuristics) and --frameworks (explicit multi-framework monorepo adoption).
//
// Run: node --test tests/adopt/monorepo-detection.test.mjs
//
// Some tests intentionally assert CURRENT (limited) behavior rather than
// "fixed" behavior — see the "Known limitations" block — because this ticket
// is about adding test coverage for the existing heuristics, not rewriting
// them. Where detection is known to miss something, the test documents that
// as a locked-in, visible fact rather than leaving it an undiscovered gap.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const ADOPT = join(REPO_ROOT, 'scripts/adopt.sh');

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), 'adopt-detect-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

function runAdopt(dir, args) {
  return spawnSync(ADOPT, args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, BLUEPRINT_DIR: REPO_ROOT },
    timeout: 30_000,
  });
}

function writeJSON(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

// ---------- --detect: root-level, single framework ----------

test('--detect: finds a root-level Python project (pyproject.toml)', () => {
  const dir = freshProject();
  try {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 1 framework\(s\): python/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--detect: finds a root-level Next.js project (package.json with "next" dependency)', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'package.json'), { name: 'x', dependencies: { next: '^14.0.0' } });
    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 1 framework\(s\): nextjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--detect: finds a root-level NestJS project (package.json with "@nestjs/core")', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'package.json'), { name: 'x', dependencies: { '@nestjs/core': '^10.0.0' } });
    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 1 framework\(s\): nestjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--detect: plain package.json with neither next nor @nestjs/core falls back to "node"', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'package.json'), { name: 'x', dependencies: { express: '^4.0.0' } });
    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 1 framework\(s\): node/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--detect: requirements.txt alone is sufficient to detect python (no pyproject.toml needed)', () => {
  const dir = freshProject();
  try {
    writeFileSync(join(dir, 'requirements.txt'), 'django==5.0\n');
    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /python/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--detect: exits non-zero with a clear message when no framework markers exist anywhere', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--detect']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Auto-detection found no frameworks/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- --detect: monorepo (root + subdirectories) ----------

test('--detect: monorepo with Python at root AND Next.js in frontend/ detects both', () => {
  const dir = freshProject();
  try {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    mkdirSync(join(dir, 'frontend'));
    writeJSON(join(dir, 'frontend', 'package.json'), { name: 'web', dependencies: { next: '^14.0.0' } });

    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 2 framework\(s\)/);
    assert.match(result.stdout, /python/);
    assert.match(result.stdout, /nextjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--detect: scans every documented subdirectory name (backend, frontend, api, web, mobile, apps, services)', () => {
  const SUBDIRS = ['backend', 'frontend', 'api', 'web', 'mobile', 'apps', 'services'];
  for (const subdir of SUBDIRS) {
    const dir = freshProject();
    try {
      mkdirSync(join(dir, subdir));
      writeFileSync(join(dir, subdir, 'requirements.txt'), 'flask\n');

      const result = runAdopt(dir, ['--detect']);
      assert.equal(result.status, 0, `${subdir}: ${result.stderr}`);
      assert.match(result.stdout, /python/, `detection should find python inside ${subdir}/`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('--detect: same framework in root AND a subdirectory is deduplicated, not double-counted', () => {
  const dir = freshProject();
  try {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "root"\n');
    mkdirSync(join(dir, 'backend'));
    writeFileSync(join(dir, 'backend', 'requirements.txt'), 'flask\n');

    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 1 framework\(s\): python/, 'python at root + python in backend/ should count once, not twice');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--detect: three distinct frameworks across root + two subdirectories are all found', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'package.json'), { name: 'root', dependencies: { next: '^14.0.0' } }); // root: nextjs
    mkdirSync(join(dir, 'backend'));
    writeFileSync(join(dir, 'backend', 'pyproject.toml'), '[project]\nname = "api"\n'); // backend: python
    mkdirSync(join(dir, 'services'));
    writeJSON(join(dir, 'services', 'package.json'), { name: 'svc', dependencies: { '@nestjs/core': '^10.0.0' } }); // services: nestjs

    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 3 framework\(s\)/);
    for (const fw of ['nextjs', 'python', 'nestjs']) {
      assert.match(result.stdout, new RegExp(fw), `expected ${fw} in output`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- --frameworks: explicit multi-framework (bypasses detection entirely) ----------

test('--frameworks: accepts an explicit comma-separated list without needing any framework marker files', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--frameworks', 'python,nextjs']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Adopting for 2 framework\(s\): python nextjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--frameworks: rejects an unknown framework name in the list', () => {
  const dir = freshProject();
  try {
    const result = runAdopt(dir, ['--frameworks', 'python,cobol']);
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Known limitations (documented, not silently "fixed") ----------
// These lock in CURRENT detection gaps as visible, tested facts rather than
// leaving them as an undiscovered surprise for the next person to hit in a
// real client repo. detect_frameworks() in adopt.sh does a single-level scan
// of 6 hardcoded subdirectory names — no recursion, no nx/lerna/pnpm-workspace
// awareness.

test('KNOWN LIMITATION: a framework nested two levels deep (apps/backend/api/) is NOT detected', () => {
  const dir = freshProject();
  try {
    mkdirSync(join(dir, 'apps', 'backend', 'api'), { recursive: true });
    writeFileSync(join(dir, 'apps', 'backend', 'api', 'pyproject.toml'), '[project]\nname = "x"\n');

    const result = runAdopt(dir, ['--detect']);
    // detect_frameworks() only scans project_root/<subdir> one level deep,
    // so apps/backend/api/pyproject.toml is invisible to it. This should
    // fail with "no frameworks found" today — if this test starts failing
    // because detection now finds it, the limitation note here (and the
    // "Adopt Issue 2" writeup) should be updated, not just deleted.
    assert.notEqual(result.status, 0, 'detection is not expected to recurse past one subdirectory level');
    assert.match(result.stderr, /Auto-detection found no frameworks/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('KNOWN LIMITATION: a non-standard subdirectory name (e.g. "server/") is NOT scanned', () => {
  const dir = freshProject();
  try {
    mkdirSync(join(dir, 'server'));
    writeFileSync(join(dir, 'server', 'pyproject.toml'), '[project]\nname = "x"\n');

    const result = runAdopt(dir, ['--detect']);
    // Only backend/frontend/api/web/mobile/apps/services are scanned.
    assert.notEqual(result.status, 0, '"server/" is not one of the 7 hardcoded subdirectory names detect_frameworks() checks');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FIXED (was a known limitation): package.json "workspaces" globs are now scanned, finding real frameworks inside an nx-style monorepo', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'nx.json'), { npmScope: 'myorg' });
    writeJSON(join(dir, 'package.json'), { name: 'monorepo-root', private: true, workspaces: ['packages/*'] });
    mkdirSync(join(dir, 'packages', 'api'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'api', 'requirements.txt'), 'flask\n');

    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    // "node" (root package.json, no next/@nestjs/core) + "python" (resolved
    // via the workspaces glob into packages/api/) — both found, not just
    // the root falling through to a single generic "node" as it used to.
    assert.match(result.stdout, /Auto-detected 2 framework\(s\): node python/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FIXED (was a known limitation): lerna.json\'s "packages" glob is scanned', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'lerna.json'), { packages: ['packages/*'] });
    mkdirSync(join(dir, 'packages', 'api'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'api', 'requirements.txt'), 'flask\n');

    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 1 framework\(s\): python/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FIXED (was a known limitation): pnpm-workspace.yaml\'s "packages" glob is scanned', () => {
  const dir = freshProject();
  try {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    mkdirSync(join(dir, 'apps', 'web'), { recursive: true });
    writeJSON(join(dir, 'apps', 'web', 'package.json'), { name: 'web', dependencies: { next: '^14.0.0' } });

    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Auto-detected 1 framework\(s\): nextjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('workspace-glob scanning dedupes against the same framework found via a hardcoded subdirectory name', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'package.json'), { name: 'root', workspaces: ['backend'] });
    mkdirSync(join(dir, 'backend'));
    writeFileSync(join(dir, 'backend', 'requirements.txt'), 'flask\n');

    const result = runAdopt(dir, ['--detect']);
    assert.equal(result.status, 0, result.stderr);
    // "backend" matches both the hardcoded-subdir loop AND the workspaces
    // glob ("backend" as a literal, non-wildcard entry) — python must be
    // counted once, not twice.
    assert.match(result.stdout, /Auto-detected 2 framework\(s\): node python/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('KNOWN LIMITATION (genuinely remaining): a bare nx.json with no package.json "workspaces" field and no other resolvable frameworks fails with a specific, actionable error', () => {
  const dir = freshProject();
  try {
    writeJSON(join(dir, 'nx.json'), { npmScope: 'myorg' });
    // No package.json, no lerna.json, no pnpm-workspace.yaml — nx.json alone
    // has no glob field of its own (confirmed against Nx's own docs/repo),
    // so there is genuinely nothing to scan.
    const result = runAdopt(dir, ['--detect']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Detected an Nx workspace.*couldn't resolve its project directories/);
    assert.match(result.stderr, /--frameworks/, 'should point the user at the manual override');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
