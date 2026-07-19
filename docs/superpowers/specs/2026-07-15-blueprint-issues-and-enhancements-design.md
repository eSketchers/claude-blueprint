# Claude Agency Blueprint: Comprehensive Issues & Enhancements Analysis

**Date:** 2026-07-15
**Analysis Type:** Component-by-Component
**Scope:** Entire claude-agency-blueprint system
**Last Updated:** 2026-07-19

---

## Implementation Status

**✅ COMPLETED (15 issues):**
- 4 CRITICAL priority fixes (3 in PR #6, 1 in PR #5)
- 7 HIGH priority fixes (all in PR #6)
- 3 MEDIUM priority fixes (all in PR #6 - documentation consolidation)
- 1 LOW priority fix (PR #6 - changelog)

**📋 REMAINING (30 issues):**
- 0 CRITICAL priority issues
- 0 HIGH priority issues
- 15 MEDIUM priority issues
- 15 LOW priority issues

### Remaining Issues by Component

**Cross-Cutting Issues (1):**
- Issue 5: No integration tests [MEDIUM]

**Orchestrator (4):**
- Issue 2: No force-kill on halt [MEDIUM]
- Issue 4: GitHub-only source support [MEDIUM]
- Issue 5: Session→ticket correlation approximate [LOW]
- Issue 6: Stuck detection may false-positive [MEDIUM]

**Dashboard (4):**
- Issue 2: No authentication [LOW]
- Issue 3: File-based inbox/outbox race conditions [MEDIUM]
- Issue 5: No agent output preview [MEDIUM]
- Issue 6: No search/filter capability [LOW]

**Agent System (5):**
- Issue 1: Profile switching is destructive [MEDIUM]
- Issue 2: No agent version tracking [LOW]
- Issue 3: Agent profiles hardcoded in JSON [LOW]
- Issue 4: No agent performance metrics [MEDIUM]
- Issue 5: Code-reviewer is superpowers symlink [LOW]

**Adoption & Bootstrap (5):**
- Issue 2: Monorepo auto-detection untested [MEDIUM]
- Issue 3: No adoption preview mode [MEDIUM]
- Issue 4: Adopt script is complex (482 lines) [LOW]
- Issue 5: No uninstall validation [LOW]
- Issue 6: Pre-commit config selection manual [MEDIUM]

**Token Optimization (6):**
- Issue 1: Savings projections unvalidated [MEDIUM]
- Issue 2: No automatic profile detection [MEDIUM]
- Issue 3: Graphify not incremental by default [LOW]
- Issue 4: Template library (Phase 2) incomplete [LOW]
- Issue 5: Module batching not implemented [LOW]
- Issue 6: No token usage analytics [MEDIUM]

**Hooks & Integration (5):**
- Issue 2: Ticket detection regex may miss formats [LOW]
- Issue 3: Agency-emit.sh writes to events.jsonl always [LOW]
- Issue 4: No hook failure recovery [MEDIUM]
- Issue 5: Dynamic-context.sh purpose unclear [LOW]

**Documentation & Developer Experience (1):**
- Issue 6: ASCII diagrams brittle [LOW]

See [Pull Request #6](https://github.com/eSketchers/claude-blueprint/pull/6) for completed implementations.

---

## Executive Summary

This document provides a comprehensive analysis of the claude-agency-blueprint, identifying issues and their solutions across all major components. The analysis follows a component-by-component approach, organizing findings by:

1. **Cross-Cutting Issues** - Affect multiple components
2. **Orchestrator** - Autonomous ticket processing
3. **Dashboard** - Agent visibility & control
4. **Agent System** - Role-specialist agents
5. **Adoption & Bootstrap** - Setup experience
6. **Token Optimization** - Context reduction strategies
7. **Hooks & Integration** - Workflow automation
8. **Documentation & Developer Experience**

Each issue is paired with its solution(s) for immediate actionability.

---

## Cross-Cutting Issues

### Issue 1: No actual token tracking system-wide

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: a43694a)

**Problem:** Budget uses event-count proxy; no visibility into real costs across orchestrator/agents

**Solution:**
- Parse Claude Code `--output-format json` for `total_cost_usd` (confirmed available)
- Update orchestrator/spawn.mjs to capture real costs
- Update budget.mjs with `addRealCost(ticketId, costUsd)` method
- Add cost reporting dashboard showing actual spend per ticket/agent/session

**Implementation Notes:**
```javascript
// spawn.mjs - Change command to JSON output mode
const args = ['-p', '--output-format', 'stream-json', '/ticket', ticketUrl];

// Parse final result event
const resultEvent = JSON.parse(lastLine);
const actualCost = resultEvent.total_cost_usd;

// Update budget with real cost
budget.addRealCost(ticketId, actualCost);
```

---

### Issue 2: ⚠️ Adoption overwrites existing CLAUDE.md

**Priority:** CRITICAL
**Status:** ✅ COMPLETED - PR #6 (Commit: d821fd6)

**Problem:** Users lose their custom configuration when adopting blueprint

**Solution:**
- Implement smart merge in adopt.sh:
  - Detect existing CLAUDE.md
  - Parse user's existing sections
  - Append blueprint sections with markers: `### BEGIN BLUEPRINT` / `### END BLUEPRINT`
  - Preserve user preferences (model, custom instructions, etc.)
- Add `--merge-strategy` flag: `overwrite` | `merge` | `backup-only`

**Implementation Notes:**
```bash
# adopt.sh enhancement
if [[ -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
    log "Existing CLAUDE.md found. Merging with blueprint..."

    # Backup original
    cp CLAUDE.md "CLAUDE.md.backup-$(date +%s)"

    # Parse user sections (everything before any blueprint markers)
    awk '/### BEGIN BLUEPRINT/,/### END BLUEPRINT/{next} {print}' CLAUDE.md > CLAUDE.user.tmp

    # Append blueprint sections with markers
    cat CLAUDE.user.tmp > CLAUDE.md.new
    echo "" >> CLAUDE.md.new
    echo "### BEGIN BLUEPRINT" >> CLAUDE.md.new
    cat "$BLUEPRINT_RESOLVED/templates/CLAUDE.md.$FRAMEWORK" >> CLAUDE.md.new
    echo "### END BLUEPRINT" >> CLAUDE.md.new

    mv CLAUDE.md.new CLAUDE.md
    rm CLAUDE.user.tmp

    log "✓ Merged CLAUDE.md (backup saved)"
fi
```

---

### Issue 3: Configuration backup files not gitignored

**Priority:** CRITICAL (Quick Fix)
**Status:** ✅ COMPLETED - PR #6 (Commit: 334f450)

**Problem:** `settings.json.backup-*`, `agents.backup/` add clutter to repo

**Solution:**
- Add to `.gitignore`: `*.backup-*`, `agents.backup/`
- Update adopt.sh to create backups in `~/.claude-agency/backups/` instead of project root
- Add cleanup command: `./scripts/cleanup-backups.sh --older-than 30d`

**Implementation:**
```bash
# .gitignore additions
*.backup-*
agents.backup/
.claude/settings.json.backup-*
```

---

### Issue 4: Leftover .claude-flow/ directory

**Priority:** CRITICAL (Quick Fix)
**Status:** ✅ COMPLETED - PR #5 (Commit: 5a133e1) - Already merged to master

**Problem:** From removed submodule, contains stale daemon.pid and logs

**Solution:**
- Remove the directory: `rm -rf .claude-flow/`
- Document in CHANGELOG that this directory is obsolete and was removed

**Action:** Can be fixed immediately

**Note:** No need to gitignore since the directory is being permanently removed and won't be recreated.

---

### Issue 5: No integration tests

**Priority:** MEDIUM

**Problem:** Bootstrap, adoption, orchestrator, dashboard have no automated testing

**Solution:**
- Add `tests/integration/` directory
- Create test suite:
  - `test-bootstrap.sh` - Verify all tools install correctly
  - `test-adopt.sh` - Test adoption in sample repos (single framework + monorepo)
  - `test-orchestrator.sh` - Mock ticket sources, verify spawning/budget
  - `test-dashboard.sh` - Verify state derivation from events.jsonl
- Add CI workflow (GitHub Actions) to run tests on PR

**Implementation Notes:**
```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run integration tests
        run: |
          ./tests/integration/test-bootstrap.sh
          ./tests/integration/test-adopt.sh
```

---

## 1. Orchestrator (Autonomous Ticket Processing)

### Issue 1: Budget enforcement uses event-count proxy

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: a43694a)

**Problem:** Not actual token costs; must manually calibrate `cost_per_event_usd`

**Location:** `orchestrator/budget.mjs:55`

**Solution:**
- Modify spawn.mjs to use `claude -p --output-format stream-json`
- Parse final result event to extract `total_cost_usd`
- Update budget.mjs to track real costs: `addRealCost(ticketId, costUsd)`
- Keep event-based proxy as fallback for non-JSON modes
- Document calibration in README if fallback used

**Related:** Cross-Cutting Issue #1

---

### Issue 2: No force-kill on halt

**Priority:** MEDIUM

**Problem:** Kill switch marks tickets halted but doesn't terminate processes

**Location:** `orchestrator/server.mjs`

**Solution:**
- Store spawned PIDs in registry.json
- When KILLSWITCH triggered, send SIGTERM to all PIDs
- After 30s grace period, send SIGKILL to stragglers
- Log terminations to orchestrator.log
- Add `--force-kill` flag to stop-orchestrator.sh

**Implementation Notes:**
```javascript
// registry.mjs - Add PID tracking
claim(ticketId, meta) {
  this.data.tickets[ticketId] = {
    ...meta,
    pid: null, // Will be set by spawn
    status: 'claimed'
  };
}

// spawn.mjs - Store PID
const result = spawnTicketAgent(ticket, spec, logDir);
registry.setPid(ticket.id, result.pid);

// Kill switch handler
function killAllAgents() {
  for (const ticket of registry.getActive()) {
    if (ticket.pid) {
      process.kill(ticket.pid, 'SIGTERM');
      setTimeout(() => {
        try { process.kill(ticket.pid, 'SIGKILL'); } catch {}
      }, 30000);
    }
  }
}
```

---

### Issue 3: No retry logic

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: eba1167)

**Problem:** If spawn crashes early, ticket stuck in `in_progress` forever

**Solution:**
- Add retry config to orchestrator.json:
  ```json
  "retry": {
    "max_attempts": 3,
    "backoff_ms": [5000, 30000, 300000]
  }
  ```
- Track attempt count in registry
- Exponential backoff between retries
- Notify Slack after final failure
- Mark ticket as `failed` after max attempts

---

### Issue 4: GitHub-only source support

**Priority:** MEDIUM

**Problem:** ClickUp/Linear/Jira mentioned in docs but not implemented

**Location:** `orchestrator/sources/`

**Solution:**
- Implement `sources/clickup.mjs` following github.mjs pattern
- Implement `sources/linear.mjs`
- Implement `sources/jira.mjs`
- Document API token setup for each in orchestrator/README.md
- Add example configs to orchestrator.example.json

**Implementation Pattern:**
```javascript
// sources/clickup.mjs
export async function fetchClickUp(config) {
  const response = await fetch(
    `https://api.clickup.com/api/v2/team/${config.team_id}/task`,
    {
      headers: { 'Authorization': config.api_token },
      params: { 'statuses[]': config.status_filter }
    }
  );

  return response.tasks.map(t => ({
    id: t.id,
    title: t.name,
    url: t.url,
    labels: t.tags.map(tag => tag.name),
    source: 'clickup',
    source_name: config.name
  }));
}
```

---

### Issue 5: Session→ticket correlation approximate

**Priority:** LOW

**Problem:** Relies on branch slug if `CLAUDE_SESSION_ID` not set early enough

**Solution:**
- Modify spawn.mjs to set `CLAUDE_SESSION_ID` env var before spawn
- Use ticket_id as session ID for predictable correlation
- Update event tailer to match on session_id first, branch as fallback
- Log correlation method used for debugging

---

### Issue 6: Stuck detection may false-positive

**Priority:** MEDIUM

**Problem:** 10min idle timeout aggressive for complex tasks

**Location:** `orchestrator/stuck-detector.mjs`

**Solution:**
- Make all thresholds configurable in orchestrator.json
- Increase default idle_timeout_ms to 20min (1200000)
- Add `stuck_whitelist` config to exclude specific tickets from stuck detection
- Log near-stuck warnings at 50%, 80% of threshold
- Allow operator to mark ticket as "working normally" to reset timer

**Configuration Example:**
```json
"stuck": {
  "idle_timeout_ms": 1200000,
  "tool_loop_threshold": 5,
  "thrashing_window": 50,
  "whitelist": ["INFRA-123", "RESEARCH-*"]
}
```

---

### Additional Enhancements

- **Cost optimization alerts:** Notify at 80%/90% of per-ticket cap
- **Ticket prioritization:** Process tickets with `priority:high` label first
- **Spawn queue:** Queue tickets when budget hit instead of skipping, process when cap resets
- **Graceful shutdown:** SIGTERM handler to cleanly stop all agents before exit

---

## 2. Dashboard (Agent Visibility & Control)

### Issue 1: Not real-time

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: 793dc5e)

**Problem:** Polls every 2s, rebuilds entire state from events.jsonl

**Location:** `dashboard/server.mjs:49` (buildState function)

**Solution:**
- Implement WebSocket server in dashboard/server.mjs
- Watch events.jsonl with fs.watch(), push new events to connected clients
- Clients update state incrementally instead of replacing
- Fallback to polling if WebSocket connection lost

**Implementation Notes:**
```javascript
// Add WebSocket support
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server: httpServer });

fs.watch(EVENTS, (eventType) => {
  if (eventType === 'change') {
    const newEvents = readNewEvents(); // Read only new lines
    wss.clients.forEach(client => {
      client.send(JSON.stringify({ type: 'events', data: newEvents }));
    });
  }
});
```

---

### Issue 2: No authentication

**Priority:** LOW

**Problem:** Binds 127.0.0.1 only, assumes single operator on localhost

**Solution:**
- Add optional basic auth: username/password from env vars
- Add `AGENCY_DASHBOARD_AUTH=user:pass` to config
- Add middleware to check Authorization header
- Document: "Leave unset for localhost-only, set for team use"
- Consider SSO integration (OAuth2) in v2

---

### Issue 3: File-based inbox/outbox race conditions

**Priority:** MEDIUM

**Problem:** Potential race conditions with concurrent access

**Solution:**
- Add file locking using `lockfile` or flock
- Atomic writes: write to temp file, rename to final path
- Add retry logic for locked files (3 attempts with 100ms delay)
- Consider Redis-based inbox/outbox in v2 for true multi-operator support

---

### Issue 4: O(n) performance degradation

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: 9c71c31)

**Problem:** Re-reads entire events.jsonl per request (slow if >50MB)

**Location:** `dashboard/server.mjs:50`

**Solution:**
- Track last-read offset in memory: `Map<clientId, offset>`
- Use fs.createReadStream with `start` option to read only new bytes
- Parse only new lines, update state incrementally
- Add rotation: when events.jsonl > 100MB, archive old events to events-YYYY-MM.jsonl

**Implementation:**
```javascript
let lastReadOffset = 0;

function readNewEvents() {
  const stats = statSync(EVENTS);
  if (stats.size <= lastReadOffset) return [];

  const stream = createReadStream(EVENTS, {
    start: lastReadOffset,
    encoding: 'utf8'
  });

  const newLines = [];
  // Parse new lines...

  lastReadOffset = stats.size;
  return newLines;
}
```

---

### Issue 5: No agent output preview

**Priority:** MEDIUM

**Problem:** Can't see what agent is doing without tailing logs manually

**Solution:**
- Add `/api/agent-log/:session_id` endpoint
- Stream last 100 lines from `agent-logs/<ticket>.log`
- Add "View Logs" button in dashboard UI next to each agent
- Support live streaming: WebSocket sends new log lines as they arrive

---

### Issue 6: No search/filter capability

**Priority:** LOW

**Problem:** Can't filter by ticket, agent type, or time range

**Solution:**
- Add filter UI controls: dropdowns for agent role, status; date range picker
- Filter state in buildState() before returning
- Add search box: filter events by keyword in tool/file/prompt
- Save filter preferences in localStorage

---

### Additional Enhancements

- **Event export:** Add "Download CSV" button, format events for analysis
- **Metrics dashboard:** Add charts using Chart.js: tickets over time, success rate, cost trends
- **Mobile-responsive:** Use CSS media queries, test on phone
- **Multi-user support:** Track operator assignments per ticket, show who replied

---

## 3. Agent System (Role Specialists)

### Issue 1: Profile switching is destructive

**Priority:** MEDIUM

**Problem:** Moves agents out of `.claude/agents/`, hard to undo; creates untracked `agents.backup/`

**Location:** `scripts/switch-agents.sh:85-95`

**Solution:**
- Change switch-agents.sh to use symlinks instead of moving files:
  ```bash
  # Instead of moving, create profile-specific directories:
  .claude/agents-all/        # Contains all agents
  .claude/agents/            # Symlinks to active agents only
  ```
- Update switch-agents.sh to:
  - Remove symlinks in `.claude/agents/`
  - Create new symlinks to profile-specific agents from `agents-all/`
  - No files moved, fully reversible
- Update adoption to populate `agents-all/` directory

**Implementation:**
```bash
# switch-agents.sh (new approach)
PROFILE=$1
AGENTS_ALL="$PROJECT_ROOT/.claude/agents-all"
AGENTS_ACTIVE="$PROJECT_ROOT/.claude/agents"

# Remove existing symlinks
rm "$AGENTS_ACTIVE"/*.md 2>/dev/null || true

# Create symlinks for profile agents
for agent in $(jq -r ".profiles.$PROFILE[]" .claude/agents.profiles.json); do
    ln -sf "$AGENTS_ALL/$agent.md" "$AGENTS_ACTIVE/$agent.md"
done
```

---

### Issue 2: No agent version tracking

**Priority:** LOW

**Problem:** Can't tell which version of custom agent is active

**Solution:**
- Add version metadata to agent files:
  ```markdown
  <!-- agent-version: 2.1.0 -->
  <!-- last-updated: 2026-06-15 -->
  ```
- Create `./scripts/agent-version.sh` to:
  - Show current version of all agents
  - List available versions from git history
  - Rollback to previous version: `./scripts/agent-version.sh backend-dev 2.0.0`
- Track agent versions in registry when ticket completes

---

### Issue 3: Agent profiles hardcoded in JSON

**Priority:** LOW

**Problem:** Can't customize which agents available per profile without editing code

**Solution:**
- Make `.claude/agents.profiles.json` user-editable
- Add validation in switch-agents.sh: verify all referenced agents exist
- Add profile customization command:
  ```bash
  ./scripts/customize-profile.sh frontend --add security-specialist
  ```
- Document profile customization in docs/AGENT-PROFILES.md

---

### Issue 4: No agent performance metrics

**Priority:** MEDIUM

**Problem:** Don't know which agents succeed/fail most

**Solution:**
- Track in registry.json per ticket:
  ```json
  "agents_used": ["architect", "backend-dev"],
  "agent_results": {
    "architect": {"status": "success", "tokens": 15000, "duration_ms": 45000},
    "backend-dev": {"status": "success", "tokens": 22000, "duration_ms": 120000}
  }
  ```
- Add analytics command: `./scripts/agent-stats.sh`
- Show in dashboard: success rate, avg tokens, avg time per agent
- Identify underperforming agents for improvement

---

### Issue 5: Code-reviewer is superpowers symlink

**Priority:** LOW

**Problem:** If upstream updates break compatibility, workflow breaks

**Solution:**
- Pin superpowers version in bootstrap.sh
- Test superpowers updates in staging before production
- Add version check: warn if superpowers > tested version
- Consider vendoring code-reviewer.md if stability critical
- Document tested superpowers version in README

---

### Additional Enhancements

- **Agent marketplace:** Share custom agents via GitHub gists or dedicated repo
- **Conditional agent loading:** Parse implementation plan, load only mentioned agents
- **Framework-specific agents:** `backend-dev-python.md`, `backend-dev-node.md`
- **Custom agent scaffolding:** `./scripts/new-agent.sh <name>` generates template
- **Agent composition:** Allow architect to spawn tech-lead sub-agent

---

## 4. Adoption & Bootstrap (Setup Experience)

### Issue 1: Bootstrap doesn't verify success

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: 02f6319)

**Problem:** Uses `|| warn` fallbacks but continues; could result in broken setup

**Location:** `scripts/bootstrap.sh:19-48`

**Solution:**
- Add `--strict` mode: exit on any failure instead of warning
- Add `--verify` mode: after installation, test each tool:
  ```bash
  claude --version || die "Claude Code not working"
  ast-grep --version || die "ast-grep not working"
  pre-commit --version || die "pre-commit not working"
  graphify --version || die "graphify not working"
  ```
- Default to strict mode, add `--permissive` to continue on warnings
- Print summary at end: ✓ installed / ✗ failed / ⚠ skipped

---

### Issue 2: Monorepo auto-detection untested

**Priority:** MEDIUM

**Problem:** Heuristics may fail in deeply nested or unusual structures

**Location:** `scripts/adopt.sh:200-350`

**Solution:**
- Add test suite in `tests/monorepo-detection/`:
  - Sample repos with various structures
  - Test cases: nx monorepo, lerna, pnpm workspaces, nested Django apps
- Add `--debug-detection` flag to show detection logic
- Add override: `--frameworks "python,nextjs"` bypasses detection
- Document known limitations

---

### Issue 3: No adoption preview mode

**Priority:** MEDIUM

**Problem:** Can't see what would change before applying

**Solution:**
- Enhance `--dry-run` to show:
  ```
  Would create:
    .claude/settings.json
    .claude/agents/ (6 agents)
    CLAUDE.md (merged)
  Would modify:
    .gitignore (+3 lines)
  Would symlink:
    .claude/skills/ -> ~/.claude/plugins/cache/superpowers/skills
  ```
- Add `--diff` flag: show actual diff for modified files
- Add confirmation prompt: "Proceed? [y/N]"

---

### Issue 4: Adopt script is complex (482 lines)

**Priority:** LOW

**Problem:** Many edge cases, hard to debug

**Solution:**
- Refactor into smaller functions with single responsibilities
- Extract validation logic into separate script: `lib/validate-adoption.sh`
- Extract symlink logic into: `lib/create-symlinks.sh`
- Add debug logging: `--verbose` shows each step with timing
- Add unit tests for each function

---

### Issue 5: No uninstall validation

**Priority:** LOW

**Problem:** Doesn't verify all blueprint artifacts actually removed

**Solution:**
- After uninstall, verify:
  ```bash
  [[ ! -e .claude ]] || warn "/.claude still exists"
  [[ ! -L .git/hooks/pre-commit ]] || warn "pre-commit hook still linked"
  grep -q "claude-agency" .gitignore && warn ".gitignore still has blueprint entries"
  ```
- Show summary: "✓ Removed X files, ✗ Y files remain"
- Add `--force` to remove even user-modified files (with confirmation)

---

### Issue 6: Pre-commit config selection manual

**Priority:** MEDIUM

**Problem:** 6 different templates, user must choose correctly

**Solution:**
- Auto-detect from project files:
  ```bash
  if [[ -f pyproject.toml ]]; then
    template="python"
  elif [[ -f package.json ]]; then
    template="node"
  fi
  ```
- For monorepo, merge relevant sections from multiple templates
- Add `--precommit-template` override for manual selection
- Validate template matches detected frameworks

---

### Additional Enhancements

- **Interactive wizard:** CLI prompts guide through all choices with explanations
- **Stack-specific templates:** `--stack django-react` pre-configures both frameworks
- **Adoption snapshots:** Timestamped backup before changes, easy restore with `./scripts/restore-snapshot.sh <timestamp>`
- **Enhanced doctor:** Check for conflicting configs, orphaned symlinks, version mismatches

---

## 5. Token Optimization (Context Reduction)

### Issue 1: Savings projections unvalidated

**Priority:** MEDIUM

**Problem:** "70-90% reduction" is theoretical, not measured in practice

**Location:** `README.md:43`, `docs/TOKEN-OPTIMIZATION.md`

**Solution:**
- Add token tracking to measure actual savings:
  ```bash
  # Before optimization
  TOKENS_BEFORE=$(grep total_cost_usd session-before.json)
  # After optimization
  TOKENS_AFTER=$(grep total_cost_usd session-after.json)
  SAVINGS=$((100 * (TOKENS_BEFORE - TOKENS_AFTER) / TOKENS_BEFORE))
  echo "Saved: $SAVINGS%"
  ```
- Run benchmark suite on sample tasks
- Update docs with actual measured savings
- Add per-project savings tracking in registry

---

### Issue 2: No automatic profile detection

**Priority:** MEDIUM

**Problem:** User must manually choose profile; wrong choice wastes tokens or breaks workflow

**Solution:**
- Implement architect-driven detection (already documented in CHANGELOG):
  - Architect reads ticket description
  - Analyzes: frontend? backend? database? infra?
  - Recommends profile: `minimal` | `frontend` | `backend` | `fullstack`
  - User confirms or overrides
- Add to `/ticket` workflow before Phase 1 (planning)
- Log profile choice and rationale to events.jsonl

---

### Issue 3: Graphify not incremental by default

**Priority:** LOW

**Problem:** Must manually re-index after large changes

**Solution:**
- Add git post-commit hook:
  ```bash
  # .git/hooks/post-commit
  graphify update --incremental
  ```
- Install hook automatically in adopt.sh
- Add config: skip if commit < 5 files changed (avoid overhead)
- Log updates to graphify.log

---

### Issue 4: Template library (Phase 2) incomplete

**Priority:** LOW

**Problem:** Mentioned in docs but no templates exist

**Location:** `docs/TOKEN-OPTIMIZATION.md:52`

**Solution:**
- Create `templates/code-patterns/`:
  - `api-endpoint.py` - FastAPI endpoint template
  - `api-endpoint.ts` - Express/NestJS endpoint template
  - `react-component.tsx` - React component with props/types
  - `db-migration.py` - Alembic migration template
  - `dockerfile.template` - Multi-stage Docker build
- Add command: `claude "create API endpoint" --use-template api-endpoint.py`
- Document template variables and usage

---

### Issue 5: Module batching not implemented

**Priority:** LOW

**Problem:** Phase 2 feature incomplete

**Solution:**
- Implement in agent prompts:
  ```markdown
  When reading related files (e.g., model + serializer + view),
  use a single Read tool call with multiple file paths instead of
  separate calls. This reduces tool-use overhead.
  ```
- Add example to agent definitions
- Measure savings in token tracking

---

### Issue 6: No token usage analytics

**Priority:** MEDIUM

**Problem:** Can't measure which strategies actually work

**Solution:**
- Add analytics command: `./scripts/token-analytics.sh`
- Show breakdown:
  ```
  Total tokens: 45,000
    Files read: 15,000 (33%)
    MCP calls: 8,000 (18%)
    Agent prompts: 12,000 (27%)
    System instructions: 10,000 (22%)

  Top savings opportunities:
    - 5 files read multiple times (3,000 tokens wasted)
    - graphify not used for 8 queries (2,000 tokens wasted)
  ```
- Suggest optimizations based on analysis

---

### Additional Enhancements

- **Context usage visualization:** Generate HTML report with charts
- **Adaptive .claudeignore:** Learn which files never useful, auto-add patterns
- **Per-project optimization profiles:** Save winning strategies per repo
- **Cost/benefit reporting:** "Profile X saved $Y but added Z minutes"

---

## 6. Hooks & Integration (Workflow Automation)

### Issue 1: Pre-commit hook error handling fixed but undeployed

**Priority:** CRITICAL (Already Fixed)
**Status:** ✅ COMPLETED - PR #6 (Commit: 21b3c29)

**Problem:** We fixed in this session (`.claude/hooks/run-pre-commit.sh`), needs testing in production

**Solution:**
- Test the new hook with various scenarios:
  - Pre-commit passes with no output
  - Pre-commit fails with errors
  - Pre-commit auto-fixes files
  - Pre-commit not installed
- Deploy to blueprint repo
- Update adoption script to use new hook
- Document in CHANGELOG

**Files Changed:**
- `.claude/hooks/run-pre-commit.sh` (new)
- `.claude/settings.json:82` (updated to call new script)

---

### Issue 2: Ticket detection regex may miss formats

**Priority:** LOW

**Problem:** Only tested on ClickUp/Linear/GitHub/Jira URL patterns

**Location:** `.claude/hooks/detect-ticket.sh`

**Solution:**
- Make regex configurable in settings.json:
  ```json
  "hooks": {
    "ticket_patterns": [
      "https://app.clickup.com/t/[a-z0-9]+",
      "https://linear.app/[^/]+/issue/[^/]+",
      "custom_pattern_here"
    ]
  }
  ```
- Add team-specific patterns without code changes
- Log matched patterns for debugging
- Add validation: warn if pattern too broad

---

### Issue 3: Agency-emit.sh writes to events.jsonl always

**Priority:** LOW

**Problem:** Even for non-agency personal sessions

**Location:** `.claude/hooks/agency-emit.sh`

**Solution:**
- Add session tagging:
  ```bash
  # Set in environment or settings.json
  CLAUDE_SESSION_TYPE=agency  # or "personal"
  ```
- Update agency-emit.sh to check `CLAUDE_SESSION_TYPE`
- Only write to events.jsonl if `agency`
- Document how to set session type

---

### Issue 4: No hook failure recovery

**Priority:** MEDIUM

**Problem:** If hook crashes, agent continues unaware

**Solution:**
- Wrap all hooks in try-catch:
  ```bash
  if ! .claude/hooks/detect-ticket.sh 2>&1; then
    echo "[hook-error] detect-ticket.sh failed" >&2
  fi
  ```
- Log failures to `~/.claude-agency/hook-errors.log`
- Send error to agent via system reminder
- Add hook health check to doctor command

---

### Issue 5: Dynamic-context.sh purpose unclear

**Priority:** LOW

**Problem:** Exists but not documented

**Location:** `.claude/hooks/dynamic-context.sh`

**Solution:**
- Document in `.claude/hooks/README.md`:
  - What it does
  - When it runs
  - How to configure
- Add inline comments to script
- Add example usage to docs/

---

### Additional Enhancements

- **Configurable ticket detection:** Allow custom regex per team
- **Hook marketplace:** Share useful hooks via gists
- **Hook testing framework:** `./scripts/test-hook.sh <hook-name>`
- **Hook performance monitoring:** Track execution time, log slow hooks

---

## 7. Documentation & Developer Experience

### Issue 1: 50+ markdown files hard to navigate

**Priority:** MEDIUM
**Status:** ✅ COMPLETED - PR #6 (Commits: 90ccf4b, 4bc103a, a1d03c3)

**Problem:** Duplicated info across multiple docs

**Solution:**
- Consolidate related docs:
  - MONOREPO-* + TOKEN-OPTIMIZATION + phases/ → `ADVANCED.md` (consolidates 11 files)
  - Setup guides → `SETUP.md` with sections
  - Changelog history → `CHANGELOG.md`
- Archive old docs to `docs/archive/` (15 files archived)
- Update all cross-references

**Implementation:**
- Created docs/ADVANCED.md (36KB, 1,393 lines) - consolidates 11 source files
- Created docs/SETUP.md (8KB, 280 lines) - complete new user walkthrough
- Created docs/CHANGELOG.md (6KB, 162 lines) - version history
- Archived 15 files to docs/archive/ preserving git history
- Added deprecation notices to all archived files
- Updated cross-references in README.md, TROUBLESHOOTING.md, scripts/adopt.sh

---

### Issue 2: Multiple similar docs

**Priority:** MEDIUM
**Status:** ✅ COMPLETED - PR #6 (Commit: 890eac1)

**Problem:** MONOREPO-SUMMARY vs MONOREPO-SUPPORT-SOLUTION vs MONOREPO-QUICK-START

**Solution:**
- Merged into single section in `docs/ADVANCED.md`:
  - Section 1: Monorepo Support (includes Quick Start, How It Works, Troubleshooting, Design Decisions)
  - Consolidates MONOREPO-SUMMARY.md, MONOREPO-SUPPORT-SOLUTION.md, MONOREPO-QUICK-START.md
- Updated all references in other docs

---

### Issue 3: Setup guides fragmented

**Priority:** MEDIUM
**Status:** ✅ COMPLETED - PR #6 (Commits: e72853b, d6efb52)

**Problem:** README vs SETUP.md vs LOCAL-ADOPTION.md

**Solution:**
- Restructured as:
  - README.md - Overview + quick start (updated with consolidated references)
  - SETUP.md - Detailed walkthrough (new users) - consolidates LOCAL-ADOPTION.md
  - ADVANCED.md - Advanced topics (orchestrator, profiles, monorepo, token optimization)
- Cross-referenced clearly in README "Getting Help" section
- Added "Next steps" at end of each doc

---

### Issue 4: No changelog

**Priority:** LOW
**Status:** ✅ COMPLETED - PR #6 (Commit: 6ec10ff)

**Problem:** Can't see what changed between versions

**Solution:**
- Created `CHANGELOG.md` following keepachangelog.com format
- Documented 6 version entries from [Unreleased] through [2026-05]
- Includes: Profile system, monorepo support, token optimization, dynamic context, dashboard, orchestrator
- Referenced from README.md "Getting Help" section

---

### Issue 5: No troubleshooting guide

**Priority:** HIGH
**Status:** ✅ COMPLETED - PR #6 (Commit: e4c4f3b)

**Problem:** Common errors not documented with solutions

**Solution:**
- Create `docs/TROUBLESHOOTING.md`:
  - Bootstrap fails: Node version, Python version, permissions
  - Adoption fails: Git not initialized, BLUEPRINT_DIR not set
  - Orchestrator won't start: Config missing, ports in use
  - Dashboard blank: No events.jsonl, wrong path
  - Agent stuck: Increase timeout, check logs
- Add "Getting Help" section to README linking to this
- Include CLI commands to diagnose each issue

---

### Issue 6: ASCII diagrams brittle

**Priority:** LOW

**Problem:** Workflow diagrams in markdown break easily

**Solution:**
- Convert to Mermaid.js:
  ```mermaid
  graph TD
    A[Poll tickets] --> B{Budget OK?}
    B -->|Yes| C[Spawn agent]
    B -->|No| D[Skip]
  ```
- Renders in GitHub, VS Code, docs sites
- Much easier to maintain
- Keep ASCII in code comments where Mermaid not supported

---

### Additional Enhancements

- **Interactive docs server:** `./scripts/docs-server.sh` serves with search
- **Video walkthroughs:** 5min screen recording for key workflows
- **API reference:** Document orchestrator/dashboard REST endpoints
- **Architecture Decision Records:** Document why key choices were made

---

## Prioritization Framework

### ✅ Critical (COMPLETED - 4/4)

1. ✅ **CLAUDE.md merge** - Affects user trust
2. ✅ **Pre-commit hook deployment** - Already fixed, needs validation
3. ✅ **Leftover .claude-flow/** - Simple cleanup
4. ✅ **Config backups gitignore** - Quick fix

### ✅ High Priority (COMPLETED - 7/7)

1. ✅ **Real token tracking** - Foundation for accurate budgeting
2. ✅ **Bootstrap verification** - Prevents broken setups
3. ✅ **Orchestrator retry logic** - Prevents stuck tickets
4. ✅ **Dashboard real-time** - Core UX improvement
5. ✅ **Dashboard O(n) performance** - Incremental state updates
6. ✅ **Troubleshooting guide** - User support
7. ✅ **Documentation consolidation** - Setup guides consolidated

### ✅ Medium Priority Documentation (COMPLETED - 3/3)

1. ✅ **50+ markdown files hard to navigate** - Consolidated to 4 core guides
2. ✅ **Multiple similar docs** - Merged into ADVANCED.md
3. ✅ **Setup guides fragmented** - Created SETUP.md, ADVANCED.md structure

### 📋 Medium Priority (REMAINING - 15 issues)

**Orchestrator (3):**
- Force-kill on halt
- ClickUp/Linear/Jira sources
- Stuck detection tuning

**Dashboard (2):**
- File-based inbox/outbox race conditions
- Agent output preview

**Agent System (2):**
- Profile switching (non-destructive)
- Performance metrics

**Adoption & Bootstrap (3):**
- Monorepo auto-detection tests
- Adoption preview mode
- Pre-commit config auto-selection

**Token Optimization (3):**
- Savings projections validation
- Automatic profile detection
- Token usage analytics

**Hooks (1):**
- Hook failure recovery

**Cross-Cutting (1):**
- Integration test suite

### 📋 Low Priority (REMAINING - 15 issues)

**Nice to Have:**
- Agent version tracking
- Profile customization
- Session correlation improvements
- Dashboard authentication
- Dashboard search/filter capability
- Template library (Phase 2 optimization)
- Module batching
- Graphify auto-indexing
- Hook improvements (ticket detection regex, agency-emit config, dynamic-context docs)
- Adopt script refactoring
- Uninstall validation
- ASCII diagrams → Mermaid
- Agent marketplace (Community features)
- Video walkthroughs (Improved onboarding)

---

## Implementation Roadmap

### ✅ Phase 1: Critical Fixes (COMPLETED)
- ✅ Smart CLAUDE.md merge in adopt.sh
- ✅ Deploy pre-commit hook fix
- ✅ Clean up .claude-flow/ and update .gitignore
- ✅ Add config backups to .gitignore

### ✅ Phase 2: Core Infrastructure (COMPLETED)
- ✅ Real token tracking in orchestrator
- ✅ Bootstrap verification mode
- ✅ Orchestrator retry logic
- ✅ Dashboard WebSocket real-time updates
- ✅ Dashboard incremental state updates (O(n) fix)
- ✅ Troubleshooting guide
- ✅ Documentation consolidation (15 files → 4 core guides)
  - ✅ SETUP.md, ADVANCED.md, CHANGELOG.md created
  - ✅ 15 files archived with deprecation notices
  - ✅ All cross-references updated

### 📋 Phase 3: Enhanced Experience (REMAINING - 15 MEDIUM priority)
- Orchestrator: Force-kill on halt, ClickUp/Linear/Jira sources, stuck detection tuning
- Dashboard: File locking, agent output preview
- Agent System: Non-destructive profile switching, performance metrics
- Adoption: Monorepo detection tests, preview mode, pre-commit auto-selection
- Token Optimization: Validation, automatic profile detection, usage analytics
- Hooks: Failure recovery
- Cross-Cutting: Integration test suite

### 📋 Phase 4: Optimization & Polish (REMAINING - 15 LOW priority)
- Agent version tracking, profile customization
- Session correlation improvements
- Dashboard authentication
- Template library, module batching
- Graphify auto-indexing
- Hook improvements
- Video walkthroughs

---

## Success Metrics

- **Adoption rate:** % of users who successfully adopt without issues
- **Token tracking accuracy:** <5% variance from actual costs
- **Orchestrator uptime:** >99% (no stuck spawns)
- **Dashboard performance:** <500ms state updates even at 50MB events.jsonl
- **Documentation clarity:** <2 support requests per issue after consolidation
- **Test coverage:** >80% for critical paths (bootstrap, adoption, orchestrator)

---

## Conclusion

This analysis identified **45 distinct issues** across 8 component areas, each paired with actionable solutions.

**Progress Summary:**
- ✅ **15/45 issues completed** (33% done)
  - All 4 CRITICAL priority issues ✅
  - All 7 HIGH priority issues ✅
  - 3 MEDIUM priority issues ✅ (documentation consolidation)
  - 1 LOW priority issue ✅ (changelog)
- 📋 **30/45 issues remaining** (67%)
  - 15 MEDIUM priority issues
  - 15 LOW priority issues

**Key Accomplishments (Phases 1-2):**
- Smart CLAUDE.md merging prevents user config loss
- Real token tracking with Claude Code JSON output
- Real-time dashboard with WebSocket support
- Incremental state updates (O(n) → O(1) performance)
- Bootstrap verification ensures successful setup
- Orchestrator retry logic prevents stuck tickets
- Comprehensive troubleshooting guide
- Documentation consolidation (15+ files → 4 core guides)

**Remaining Work (Phases 3-4):**
- **Phase 3 (15 MEDIUM):** Enhanced ticket source support, agent profile improvements, token optimization validation, dashboard UX enhancements
- **Phase 4 (15 LOW):** Polish features, agent marketplace prep, video walkthroughs

The prioritization framework successfully addressed all critical user-facing issues first (CLAUDE.md merge, config clarity), followed by infrastructure improvements (token tracking, real-time dashboard). Remaining work focuses on enhancements and polish.

**Next Steps:**
1. ✅ ~~User reviews this design document~~
2. ✅ ~~Create implementation plan using writing-plans skill~~
3. ✅ ~~Break down into individual tickets~~
4. ✅ ~~Complete Phase 1 critical fixes~~
5. ✅ ~~Complete Phase 2 core infrastructure~~
6. 📋 Begin Phase 3 enhanced experience (15 MEDIUM priority issues)

---

**Document Status:** In Progress - 15/45 issues completed (33%)
**Author:** Claude (Sonnet 4.5)
**Last Review:** 2026-07-19
