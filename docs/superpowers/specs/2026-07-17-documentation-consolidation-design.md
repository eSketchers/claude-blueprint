# Documentation Consolidation Design

**Date:** 2026-07-17
**Type:** Documentation Refactoring
**Priority:** MEDIUM
**Estimated Effort:** 3-4 hours

---

## Executive Summary

Consolidate 15+ overlapping documentation files into 3 core user-facing documents (SETUP.md, ADVANCED.md, CHANGELOG.md) plus the existing TROUBLESHOOTING.md. Archive all deprecated docs to `docs/archive/` with full git history preservation. This addresses fragmented setup guides, eliminates duplication, and creates a clear learning path for new users.

**Impact:**
- 15 docs → 4 docs in `docs/` (73% reduction)
- Single source of truth per topic
- Clear progression: README → SETUP → ADVANCED → TROUBLESHOOTING
- Zero information loss (all archived with git history)

---

## Goals & Principles

### Goals

1. **New user onboarding** - Clear path from zero to productive
2. **Reduce maintenance burden** - Fewer files to update when features change
3. **Eliminate confusion** - Single source of truth per topic
4. **Preserve history** - Archive everything, lose nothing

### Principles

- One authoritative document per topic
- Progressive disclosure: simple → intermediate → advanced
- All old docs move to `docs/archive/` (git preserves history)
- README.md stays minimal (overview + quick start)
- SETUP.md teaches commands, ADVANCED.md explains "why" and edge cases

---

## Current State Analysis

### Problems

**Issue 1: Setup guides fragmented**
- README.md references non-existent `docs/SETUP.md`
- LOCAL-ADOPTION.md (6.7K) has adoption details
- TEAM-ONBOARDING.md (2.5K) has team-specific setup
- No single place for "new user getting started"

**Issue 2: Monorepo docs duplicated (3 files, ~30KB)**
- MONOREPO-QUICK-START.md (11K)
- MONOREPO-SUMMARY.md (6.2K)
- MONOREPO-SUPPORT-SOLUTION.md (12K)
- Overlapping content, different perspectives, potential contradictions

**Issue 3: Profile/optimization docs scattered (7+ files, ~50KB)**
- AGENT-PROFILES.md (10K)
- PROFILE-QUICK-REFERENCE.md (6.1K)
- TICKET-PROFILE-OPTIMIZATION.md (8.6K)
- TICKET-WORKFLOW-PROFILES.md (7.4K)
- TOKEN-OPTIMIZATION.md (10K)
- DYNAMIC-CONTEXT-OPTIMIZATION.md (7.4K)
- SAFE-CONTEXT-REDUCTION.md (6.7K)
- Plus `optimization-phases/` subdirectory
- Heavy duplication, different angles on same concepts

**Issue 4: Changelog history unclear**
- CHANGELOG-DYNAMIC-PROFILES.md (20K) - detailed implementation log
- CHANGES-SUMMARY.md (13K) - high-level summary
- No standard CHANGELOG.md following keepachangelog.com

### Current File Structure

```
docs/
├── AGENT-PROFILES.md (10K)
├── CHANGELOG-DYNAMIC-PROFILES.md (20K)
├── CHANGES-SUMMARY.md (13K)
├── DYNAMIC-CONTEXT-OPTIMIZATION.md (7.4K)
├── LOCAL-ADOPTION.md (6.7K)
├── MONOREPO-QUICK-START.md (11K)
├── MONOREPO-SUMMARY.md (6.2K)
├── MONOREPO-SUPPORT-SOLUTION.md (12K)
├── PROFILE-QUICK-REFERENCE.md (6.1K)
├── SAFE-CONTEXT-REDUCTION.md (6.7K)
├── TEAM-ONBOARDING.md (2.5K)
├── TICKET-PROFILE-OPTIMIZATION.md (8.6K)
├── TICKET-WORKFLOW-PROFILES.md (7.4K)
├── TOKEN-OPTIMIZATION.md (10K)
├── TROUBLESHOOTING.md (11K) ✓ Keep as-is
├── optimization-phases/
│   └── PHASE-2-PRACTICAL.md
└── superpowers/ ✓ Keep as-is
    ├── plans/
    ├── specs/
    └── HANDOFF-*.md
```

**Total:** 15 main docs + subdirectories (~150KB active content)

---

## New Documentation Structure

### After Consolidation

```
docs/
├── SETUP.md              # NEW: Complete walkthrough for new users (~300-400 lines)
├── ADVANCED.md           # NEW: Deep topics (~600-800 lines)
├── TROUBLESHOOTING.md    # KEEP: Already exists, already good (11K)
├── CHANGELOG.md          # NEW: Standard keepachangelog.com format (~100-200 lines)
├── archive/              # NEW: All deprecated docs
│   ├── AGENT-PROFILES.md
│   ├── CHANGELOG-DYNAMIC-PROFILES.md
│   ├── CHANGES-SUMMARY.md
│   ├── DYNAMIC-CONTEXT-OPTIMIZATION.md
│   ├── LOCAL-ADOPTION.md
│   ├── MONOREPO-QUICK-START.md
│   ├── MONOREPO-SUMMARY.md
│   ├── MONOREPO-SUPPORT-SOLUTION.md
│   ├── PROFILE-QUICK-REFERENCE.md
│   ├── SAFE-CONTEXT-REDUCTION.md
│   ├── TEAM-ONBOARDING.md
│   ├── TICKET-PROFILE-OPTIMIZATION.md
│   ├── TICKET-WORKFLOW-PROFILES.md
│   ├── TOKEN-OPTIMIZATION.md
│   └── optimization-phases/
└── superpowers/          # KEEP: Implementation history
    ├── plans/
    ├── specs/
    └── HANDOFF-*.md
```

### README.md Updates

- Fix broken link: `docs/SETUP.md` → works correctly
- Keep reference to `TROUBLESHOOTING.md`
- Add reference to `ADVANCED.md` for deep topics
- Add reference to `CHANGELOG.md` for version history

---

## Content Mapping

### SETUP.md - New User Walkthrough

**Purpose:** Take a new user from zero to first productive work session.

**Target length:** 300-400 lines

**Sections:**
1. **Prerequisites**
   - Node 20+, Python 3.8+, Claude Code installed
   - Links to installation guides
2. **Bootstrap** - Global tool installation
   - `./scripts/bootstrap.sh` command
   - What it installs (plugins, MCPs, host tools)
   - Verification flags (`--dry-run`, `--verify`)
3. **Adoption** - Adding blueprint to projects
   - Single framework: `adopt.sh --framework python`
   - Multi-framework: `adopt.sh --frameworks "python,nextjs"`
   - Auto-detection: `adopt.sh --detect`
   - What gets created (`.claude/`, `CLAUDE.md`, hooks)
4. **First Work Session**
   - Starting Claude Code
   - Using profiles (basic intro: when to use minimal vs fullstack)
   - Running your first `/ticket` command
5. **Next Steps**
   - Link to ADVANCED.md for deep topics
   - Link to TROUBLESHOOTING.md for issues

**Source Content:**
- LOCAL-ADOPTION.md (6.7K) - adoption mechanics
- TEAM-ONBOARDING.md (2.5K) - onboarding flow
- README.md snippets - quick start commands
- Monorepo adoption commands (already in adopt.sh, just document them)

---

### ADVANCED.md - Deep Dive Topics

**Purpose:** Explain the "why" behind features, edge cases, architecture decisions.

**Target length:** 600-800 lines

**Sections:**

**1. Monorepo Support** (~150 lines)
- How multi-framework detection works
- Heuristics used by `--detect`
- When to use `--frameworks` vs `--detect`
- Framework combinations supported
- Profile selection for monorepos
- Troubleshooting monorepo adoption
- Architecture: why profiles work this way

**2. Profile System** (~150 lines)
- What profiles are (MCP + agent combinations)
- Available profiles: minimal, frontend, backend, fullstack, ticket
- When to use each profile
- How to switch profiles: `./scripts/switch-profile.sh`
- Profile internals: `agents.profiles.json` structure
- Creating custom profiles

**3. Token Optimization** (~200 lines)
- Overview of optimization phases (1-3)
- Phase 1: `.claudeignore`, smart reading, graphify
- Phase 2: Templates, AST navigation, module batching
- Phase 3: Profile-based MCP loading, conditional agents
- Measuring savings (theoretical vs actual)
- Safe vs unsafe optimization strategies
- YAGNI principle for context

**4. Orchestrator** (~100 lines)
- What the orchestrator does (autonomous ticket processing)
- Configuration: `orchestrator/orchestrator.json`
- Budget enforcement (real token tracking)
- Retry logic and exponential backoff
- Stuck detection
- Starting/stopping: `cd orchestrator && node server.mjs`

**5. Agent Profiles** (~100 lines)
- Connecting agents to MCP profiles
- Role-specialist agents (architect, frontend-dev, backend-dev, qa-lead, devops, data-engineer)
- Agent availability based on profile
- Custom agent creation

**6. Ticket Workflows** (~100 lines)
- Using `/ticket` command
- Choosing profiles for different ticket types
- Orchestrator integration
- Dashboard monitoring
- Troubleshooting stuck tickets

**Source Content:**
- MONOREPO-QUICK-START.md (11K)
- MONOREPO-SUMMARY.md (6.2K)
- MONOREPO-SUPPORT-SOLUTION.md (12K)
- AGENT-PROFILES.md (10K)
- PROFILE-QUICK-REFERENCE.md (6.1K)
- TICKET-PROFILE-OPTIMIZATION.md (8.6K)
- TICKET-WORKFLOW-PROFILES.md (7.4K)
- TOKEN-OPTIMIZATION.md (10K)
- DYNAMIC-CONTEXT-OPTIMIZATION.md (7.4K)
- SAFE-CONTEXT-REDUCTION.md (6.7K)
- optimization-phases/PHASE-2-PRACTICAL.md

---

### CHANGELOG.md - Version History

**Purpose:** Standard changelog following keepachangelog.com format.

**Target length:** 100-200 lines (grows over time)

**Format:**
```markdown
# Changelog

All notable changes to the Claude Agency Blueprint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [2026-07-17] - Documentation Consolidation
### Changed
- Consolidated 15+ docs into SETUP.md, ADVANCED.md, CHANGELOG.md
- Archived old docs to docs/archive/ with full git history

## [2026-07-17] - HIGH Priority Fixes
### Added
- Real token tracking from Claude Code JSON output
- Orchestrator retry logic with exponential backoff (5s, 30s, 5min)
- Dashboard WebSocket support for real-time updates
- Dashboard incremental reading with in-memory cache (O(cache) performance)
- Bootstrap verification mode (--strict, --permissive, --verify)
- Comprehensive troubleshooting guide with doctor.sh diagnostic script

### Fixed
- Configuration backup files now gitignored
- Pre-commit hook error handling
- Smart CLAUDE.md merge preserves user customizations

## [2026-07-15] - Dynamic Context Optimization
### Added
- Profile-based MCP loading system
- Agent profiles connected to MCP profiles
- Profile switching: minimal, frontend, backend, fullstack, ticket
- 30-60% context savings for focused tasks

### Changed
- `.claude/settings.json` now uses profile references
- `agents.profiles.json` defines agent-profile mappings
```

**Source Content:**
- CHANGELOG-DYNAMIC-PROFILES.md (20K) - extract key changes
- CHANGES-SUMMARY.md (13K) - extract key changes
- Recent git commits for latest changes
- Archive detailed implementation notes to docs/archive/

---

## Migration Strategy

### Step 1: Create New Consolidated Docs

**Create docs/SETUP.md:**
- Synthesize content from LOCAL-ADOPTION.md, TEAM-ONBOARDING.md, README snippets
- Write in clear, step-by-step format
- Focus on commands and immediate next actions
- Test all commands work as documented

**Create docs/ADVANCED.md:**
- Consolidate all monorepo docs into "Monorepo Support" section
- Consolidate all profile docs into "Profile System" and "Agent Profiles" sections
- Consolidate all optimization docs into "Token Optimization" section
- Add orchestrator and ticket workflow sections
- Organize by topic, not by source file

**Create docs/CHANGELOG.md:**
- Extract key changes from CHANGELOG-DYNAMIC-PROFILES.md and CHANGES-SUMMARY.md
- Use keepachangelog.com format
- Focus on user-visible changes
- Link to detailed implementation docs in archive for reference

### Step 2: Archive Old Docs

**Move all deprecated docs to archive:**
```bash
mkdir -p docs/archive
git mv docs/AGENT-PROFILES.md docs/archive/
git mv docs/CHANGELOG-DYNAMIC-PROFILES.md docs/archive/
git mv docs/CHANGES-SUMMARY.md docs/archive/
git mv docs/DYNAMIC-CONTEXT-OPTIMIZATION.md docs/archive/
git mv docs/LOCAL-ADOPTION.md docs/archive/
git mv docs/MONOREPO-QUICK-START.md docs/archive/
git mv docs/MONOREPO-SUMMARY.md docs/archive/
git mv docs/MONOREPO-SUPPORT-SOLUTION.md docs/archive/
git mv docs/PROFILE-QUICK-REFERENCE.md docs/archive/
git mv docs/SAFE-CONTEXT-REDUCTION.md docs/archive/
git mv docs/TEAM-ONBOARDING.md docs/archive/
git mv docs/TICKET-PROFILE-OPTIMIZATION.md docs/archive/
git mv docs/TICKET-WORKFLOW-PROFILES.md docs/archive/
git mv docs/TOKEN-OPTIMIZATION.md docs/archive/
git mv docs/optimization-phases docs/archive/
```

**Git history preservation:**
- Use `git mv` for all moves (preserves history)
- Archive directory maintains full commit history
- Can trace any line back to original author/date
- Nothing is lost

### Step 3: Update References

**Update README.md:**
- Fix SETUP.md link (currently broken): `[SETUP.md](./SETUP.md)` → `[SETUP.md](./docs/SETUP.md)`
- Add ADVANCED.md reference in appropriate sections
- Add CHANGELOG.md reference
- Keep TROUBLESHOOTING.md reference

**Search for cross-references:**
```bash
# Find all references to archived docs
grep -r "MONOREPO-" docs/ --exclude-dir=archive
grep -r "PROFILE-" docs/ --exclude-dir=archive
grep -r "TOKEN-OPTIMIZATION" docs/ --exclude-dir=archive
# Update to point to new locations
```

**Add deprecation notices:**
Add to top of each archived doc:
```markdown
> ⚠️ **ARCHIVED:** This document has been consolidated. See:
> - [docs/SETUP.md](../SETUP.md) for setup and adoption
> - [docs/ADVANCED.md](../ADVANCED.md) for advanced topics
> - [docs/CHANGELOG.md](../CHANGELOG.md) for change history
```

### Step 4: Add Compatibility Symlinks (Optional)

If external links are a concern, create symlinks:
```bash
# Example: Keep most-linked old files working
ln -s ADVANCED.md docs/MONOREPO-SUPPORT-SOLUTION.md
ln -s SETUP.md docs/LOCAL-ADOPTION.md
```

**Trade-offs:**
- **Pro:** External links keep working (mostly)
- **Con:** Adds clutter, defeats consolidation purpose
- **Decision:** Only add if specific external links are known to exist

### Step 5: Commit Strategy

**Single commit with all changes:**
```bash
git add docs/SETUP.md docs/ADVANCED.md docs/CHANGELOG.md
git add docs/archive/
git add README.md
git commit -m "docs: consolidate documentation into SETUP, ADVANCED, and CHANGELOG

- Create docs/SETUP.md - complete new user walkthrough
- Create docs/ADVANCED.md - deep dive on monorepo, profiles, optimization, orchestrator
- Create docs/CHANGELOG.md - standard keepachangelog.com format
- Archive 14 old docs to docs/archive/ (git history preserved)
- Update README.md links to new structure
- Add deprecation notices to archived docs

Reduces active docs from 15 to 4 (73% reduction)
Single source of truth per topic
Clear learning path: README → SETUP → ADVANCED → TROUBLESHOOTING

Addresses Issue 3 from 2026-07-15-blueprint-issues-and-enhancements-design.md
Implements design from docs/superpowers/specs/2026-07-17-documentation-consolidation-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**PR description includes:**
- Before/after file tree comparison
- Links to design doc
- Assurance that all content preserved in archive
- Testing checklist

---

## Success Criteria

### Quantitative Metrics

- ✅ 15 docs in `docs/` → 4 docs in `docs/` (73% reduction)
- ✅ ~150KB active content → ~50KB active content (67% reduction)
- ✅ All 14 old docs preserved in `docs/archive/` with git history intact
- ✅ Zero broken internal links in remaining docs
- ✅ README.md "Getting Started" link works (currently broken)

### Qualitative Metrics

- ✅ New user can follow SETUP.md start to finish without jumping to other docs
- ✅ Advanced topics have single authoritative source in ADVANCED.md
- ✅ No contradictory information between docs
- ✅ CHANGELOG.md follows standard format, easy to scan
- ✅ Clear progression: README → SETUP → ADVANCED → TROUBLESHOOTING

### Testing Checklist

**Documentation validation:**
- [ ] Walk through SETUP.md instructions in fresh environment
- [ ] Verify all commands work as documented
- [ ] Check all cross-references and links resolve correctly
- [ ] Confirm archived docs have deprecation notices
- [ ] Test README.md links work

**Content completeness:**
- [ ] All setup topics from old docs covered in SETUP.md
- [ ] All monorepo content from 3 docs consolidated in ADVANCED.md
- [ ] All profile content from 7+ docs consolidated in ADVANCED.md
- [ ] All optimization strategies covered in ADVANCED.md
- [ ] CHANGELOG.md includes all major changes

**Git history:**
- [ ] `git log -- docs/archive/MONOREPO-SUMMARY.md` shows full history
- [ ] Can trace any line back to original commit
- [ ] Archive directory preserves all commits

---

## Implementation Notes

### Writing Guidelines

**SETUP.md style:**
- Imperative mood: "Run this command", "Install these tools"
- Code blocks for every command
- Expected output samples where helpful
- "What you just did" explanations after commands
- Clear section headings
- Next steps at end of each section

**ADVANCED.md style:**
- Explanatory: "This works by...", "The reason for..."
- Architecture diagrams where helpful (ASCII or Mermaid)
- Trade-off discussions
- Edge case coverage
- Links to code for implementation details
- "See also" references between sections

**CHANGELOG.md style:**
- Follow keepachangelog.com exactly
- Categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Link to PR/commit for each change
- Dates in YYYY-MM-DD format
- Keep entries concise (1-2 lines each)

### Content Synthesis Strategy

**For overlapping topics (e.g., profiles):**
1. Read all source docs
2. Identify unique information in each
3. Choose best explanation/example from each
4. Write new consolidated section from scratch (don't copy-paste)
5. Verify all unique points covered

**For contradictory information:**
1. Check current code to see which is correct
2. Use correct version in new doc
3. Note in commit message what contradiction was resolved

**For outdated information:**
1. Verify current behavior with code/testing
2. Update to current state in new docs
3. Note in CHANGELOG.md what changed

---

## Risks & Mitigations

### Risk 1: External links break

**Impact:** Medium - External sites/docs linking to old URLs get 404s

**Mitigation:**
- Add compatibility symlinks for most-linked docs
- GitHub will show "this file has moved" for git mv operations
- Deprecation notices in archived docs redirect to new locations
- Most users come through README.md anyway

### Risk 2: Information lost in consolidation

**Impact:** High - Users can't find information they need

**Mitigation:**
- Archive preserves everything with full git history
- Systematic content review (checklist above)
- Each source doc gets explicit mapping to new location
- Review pass by original authors if possible

### Risk 3: New docs too long/intimidating

**Impact:** Medium - Users overwhelmed by wall of text

**Mitigation:**
- SETUP.md target is 300-400 lines (not huge)
- ADVANCED.md has clear section headings and TOC
- Progressive disclosure: basic → advanced
- Can split ADVANCED.md later if it grows too large

### Risk 4: Maintenance burden shifts to fewer files

**Impact:** Low - Large files harder to maintain

**Mitigation:**
- Clear section structure makes edits localized
- TOC at top of each file for navigation
- Can split sections to separate files later if needed
- Still better than 15 overlapping files

---

## Future Enhancements

### Phase 2 (Post-Consolidation)

**Documentation improvements:**
- Add Mermaid diagrams for architecture (orchestrator flow, profile system)
- Create video walkthroughs (5min each) for common tasks
- Interactive docs server: `./scripts/docs-server.sh` with search
- API reference for orchestrator/dashboard REST endpoints

**Structure refinements:**
- If ADVANCED.md grows > 1000 lines, consider splitting by topic
- Add docs/guides/ subdirectory for specific recipes
- Create docs/architecture/ for ADRs (Architecture Decision Records)

**Tooling:**
- Link checker CI job to catch broken references
- Doc linting (markdown style, link validation)
- Auto-generated API docs from code comments

---

## Related Documents

- [2026-07-15-blueprint-issues-and-enhancements-design.md](./2026-07-15-blueprint-issues-and-enhancements-design.md) - Issue 1 (50+ files), Issue 2 (multiple similar docs), Issue 3 (setup guides fragmented), Issue 5 (no changelog)
- [2026-07-17-high-priority-fixes-implementation.md](../plans/2026-07-17-high-priority-fixes-implementation.md) - Recent changes to include in CHANGELOG.md
- [keepachangelog.com](https://keepachangelog.com/) - CHANGELOG.md format specification

---

## Appendix: File Mapping Reference

### Sources → SETUP.md

| Source File | Key Content | Section in SETUP.md |
|------------|-------------|---------------------|
| LOCAL-ADOPTION.md | Adoption mechanics | Section 3: Adoption |
| TEAM-ONBOARDING.md | Onboarding flow | Overall structure |
| README.md (Quick Start) | Command examples | All sections |

### Sources → ADVANCED.md

| Source File | Key Content | Section in ADVANCED.md |
|------------|-------------|----------------------|
| MONOREPO-QUICK-START.md | Quick commands | Monorepo Support |
| MONOREPO-SUMMARY.md | Overview | Monorepo Support |
| MONOREPO-SUPPORT-SOLUTION.md | Design decisions | Monorepo Support |
| AGENT-PROFILES.md | Agent-profile mapping | Agent Profiles |
| PROFILE-QUICK-REFERENCE.md | When to use profiles | Profile System |
| TICKET-PROFILE-OPTIMIZATION.md | Ticket workflows | Ticket Workflows |
| TICKET-WORKFLOW-PROFILES.md | Profile selection | Ticket Workflows |
| TOKEN-OPTIMIZATION.md | Optimization phases | Token Optimization |
| DYNAMIC-CONTEXT-OPTIMIZATION.md | Profile-based loading | Token Optimization |
| SAFE-CONTEXT-REDUCTION.md | Safe strategies | Token Optimization |
| optimization-phases/PHASE-2-PRACTICAL.md | Phase 2 details | Token Optimization |

### Sources → CHANGELOG.md

| Source File | Key Content | Extraction |
|------------|-------------|-----------|
| CHANGELOG-DYNAMIC-PROFILES.md | Profile system implementation | Extract user-visible changes |
| CHANGES-SUMMARY.md | Recent changes | Extract all changes |
| Git commits | Recent PRs | Generate from commits |

### Kept As-Is

| File | Reason |
|------|--------|
| TROUBLESHOOTING.md | Recently created (PR #6), comprehensive, no duplication |
| docs/superpowers/* | Implementation history, different purpose than user docs |
