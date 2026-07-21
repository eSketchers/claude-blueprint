// detect-profile.test.mjs — Tier 4 (Token Optimization Issue 2: no automatic
// profile detection) tests for .claude/hooks/detect-profile.sh.
//
// Maps ticket text to a recommended .claude/agents.profiles.json profile
// (minimal/frontend/backend/fullstack/devops/data/ticket), logs the
// recommendation + rationale to ~/.claude-agency/events.jsonl, and never
// switches anything itself — .claude/commands/ticket.md's Phase 0 calls it
// and only prompts the user if the recommendation differs from what's active.
//
// Run: node --test tests/hooks/detect-profile.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const SCRIPT = join(REPO_ROOT, '.claude/hooks/detect-profile.sh');

function run(ticketText, currentProfile) {
  const home = mkdtempSync(join(tmpdir(), 'detect-profile-test-'));
  const args = currentProfile ? [ticketText, currentProfile] : [ticketText];
  const result = spawnSync(SCRIPT, args, {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_AGENCY_HOME: home },
    timeout: 10_000,
  });
  return { ...result, home };
}

function lastEvent(home) {
  const p = join(home, 'events.jsonl');
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
  return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
}

test('pure frontend ticket recommends "frontend"', () => {
  const { stdout, status } = run('Add a React component with Tailwind styling for the user profile card');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'frontend');
});

test('pure backend ticket recommends "backend"', () => {
  const { stdout, status } = run('Add a new API endpoint with a database migration for user preferences');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'backend');
});

test('frontend + backend keywords together recommend "fullstack"', () => {
  const { stdout, status } = run('Build a React UI that calls a new backend API endpoint and stores results in the database');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'fullstack');
});

test('devops-only ticket recommends "devops"', () => {
  const { stdout, status } = run('Set up Docker and Terraform for the new Kubernetes deployment');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'devops');
});

test('data-only ticket recommends "data"', () => {
  const { stdout, status } = run('Build an ETL pipeline that loads data into the warehouse via dbt models');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'data');
});

test('no clear signal recommends "minimal"', () => {
  const { stdout, status } = run('Investigate why the tests are flaky sometimes');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'minimal');
});

test('a ticket touching 3+ categories recommends the broad "ticket" profile, not a partial one', () => {
  const { stdout, status } = run('Build an ETL pipeline with an API endpoint, a React dashboard, and Docker deployment');
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'ticket');
});

test('REGRESSION: the devops "deploy" keyword does not greedily swallow the rest of the sentence', () => {
  // Earlier draft had a `pipeline.*deploy` alternative in the devops regex —
  // the unbounded `.*` matched from "pipeline" all the way to "deploy" across
  // the whole ticket text, producing a garbled "keyword" that was actually
  // most of the sentence. Fixed by removing the redundant alternative
  // (bare "deploy" already covers it). This test locks that fix in.
  const { stderr } = run('Build an ETL pipeline with an API endpoint, a React dashboard, and Docker deployment');
  const devopsLine = stderr.split('\n').find(l => l.includes('DevOps keywords:'));
  assert.ok(devopsLine, 'expected a DevOps keywords line in stderr output');
  assert.ok(devopsLine.length < 60, `DevOps keywords line should be a short keyword list, not a full sentence: "${devopsLine}"`);
  assert.match(devopsLine, /deploy/);
  assert.match(devopsLine, /docker/);
  assert.doesNotMatch(devopsLine, /dashboard/, 'should not have swallowed unrelated words from elsewhere in the sentence');
});

test('rationale is printed to stderr, recommendation alone to stdout (so callers can safely capture just the profile name)', () => {
  const { stdout, stderr } = run('Add a React component');
  assert.equal(stdout.trim(), 'frontend');
  assert.match(stderr, /Rationale:/);
  assert.match(stderr, /Recommended profile: frontend/);
});

test('when current profile matches the recommendation, stderr says no action needed', () => {
  const { stderr } = run('Add a React component', 'frontend');
  assert.match(stderr, /already matches — no action needed/);
});

test('when current profile differs from the recommendation, stderr flags the mismatch', () => {
  const { stderr } = run('Add a React component', 'minimal');
  assert.match(stderr, /differs from recommendation/);
});

test('emits a profile_detected event to events.jsonl with the recommended profile', () => {
  const { home } = run('Add a React component with Tailwind styling');
  const event = lastEvent(home);
  assert.ok(event, 'expected an event to be logged');
  assert.equal(event.kind, 'profile_detected');
  assert.match(event.extra, /profile=frontend/);
});

test('emits current/match fields in the event when a current profile is passed', () => {
  const { home } = run('Add a React component', 'minimal');
  const event = lastEvent(home);
  assert.equal(event.kind, 'profile_detected');
  assert.match(event.extra, /profile=frontend/);
  assert.match(event.extra, /current=minimal/);
  assert.match(event.extra, /match=no/);
});

test('missing ticket text argument is a clear error, not a crash', () => {
  const result = spawnSync(SCRIPT, [], { encoding: 'utf8', timeout: 5000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing ticket text/);
});

test('devops + one other category (not >=3) still recommends the broad "ticket" profile, never a lone unmatched-agent profile', () => {
  // 2 categories where one is devops doesn't map to any single named profile
  // (there's no "devops+frontend" profile) — must fall back to "ticket"
  // rather than silently picking "devops" or "frontend" and missing an agent.
  const { stdout } = run('Add a React dashboard for our Kubernetes cluster metrics');
  assert.equal(stdout.trim(), 'ticket');
});

test('REGRESSION: frontend+devops must not silently drop the devops signal (branch-order bug found and fixed during implementation)', () => {
  // An earlier draft checked `has_frontend == 1` before checking whether
  // exactly-2-categories were matched, so a ticket matching both "react"
  // (frontend) and "kubernetes" (devops) took the frontend-only branch and
  // returned "frontend" — silently losing the devops signal and recommending
  // a profile with no devops agent, even though devops keywords were
  // genuinely present. Fixed by checking CATEGORY_COUNT == 2 before any
  // single-category branch. This test targets that exact scenario directly.
  const { stdout, stderr } = run('Add a React dashboard for our Kubernetes cluster metrics');
  assert.equal(stdout.trim(), 'ticket', 'must escalate to ticket, not silently pick frontend and drop the devops signal');
  assert.match(stderr, /Frontend keywords: react/);
  assert.match(stderr, /DevOps keywords: *kubernetes/);
});

test('REGRESSION: backend+data must not silently drop either signal (same branch-order class of bug)', () => {
  const { stdout, stderr } = run('Add an API endpoint that reads from the analytics warehouse');
  assert.equal(stdout.trim(), 'ticket');
  assert.match(stderr, /Backend keywords:.*(api|endpoint)/);
  assert.match(stderr, /Data keywords:.*warehouse/);
});
