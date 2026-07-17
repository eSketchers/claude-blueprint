# Changelog

All notable changes to the Claude Agency Blueprint will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Documentation consolidation with SETUP.md and ADVANCED.md guides
- Verification mode for bootstrap script to validate installation
- Comprehensive troubleshooting documentation

## [2026-07-17]

### Added
- Dashboard WebSocket support for real-time updates
- Incremental reading optimization for dashboard performance
- Retry logic for failed ticket spawns in orchestrator
- Real token tracking from Claude Code JSON output
- Documentation consolidation implementation plan

### Fixed
- Smart CLAUDE.md merge in adoption script to preserve custom content
- Pre-commit hook error handling for better reliability

## [2026-07-13] - Dynamic Profile System

### Added
- Profile-based MCP loading system (`.claude/settings.profiles.json`)
- Agent profile configuration system (`.claude/agents.profiles.json`)
- Profile switching scripts: `switch-profile.sh`, `switch-agents.sh`, `switch-profile-full.sh`
- Architect-driven profile detection in ticket workflow (Phase 0)
- Profile compatibility check prevents mismatched tool availability
- `/optimize-context` slash command for in-session profile switching
- Dynamic context optimization documentation suite

### Changed
- `/ticket` workflow now includes profile compatibility check in Phase 0
- Architect agent analyzes requirements and validates profile before planning
- Token optimization documentation updated with Phase 3 (Dynamic Context)

### Performance
- 30-70% token savings with minimal profile for exploration/planning
- 33% savings with frontend profile (5 MCPs vs 6)
- 53% savings with backend profile (4 MCPs vs 6)
- Profile system is fully opt-in and backward compatible

### Documentation
- `DYNAMIC-CONTEXT-OPTIMIZATION.md` - Complete profile system guide
- `PROFILE-QUICK-REFERENCE.md` - Quick reference cheat sheet
- `TICKET-PROFILE-OPTIMIZATION.md` - Advanced ticket optimization strategies
- `TICKET-WORKFLOW-PROFILES.md` - Profile usage for ticket workflows
- `AGENT-PROFILES.md` - Agent management and filtering guide

## [2026-07] - Monorepo Support

### Added
- Multi-framework monorepo detection and support
- Auto-detection for Next.js, React, Node.js, Python, Go projects
- Framework-specific git tracking in monorepo environments
- Monorepo-aware adoption script
- Per-framework graphify indexing support

### Fixed
- Compatibility issues in monorepo detection logic
- Framework detection for nested project structures

### Documentation
- Monorepo design and implementation documentation

## [2026-06] - Token Optimization (Phase 1 & 2)

### Added
- Smart `.claudeignore` patterns for context reduction
- Template library system for common code patterns
- AST-based code navigation for precise file exploration
- Module batching for efficient multi-file operations
- Incremental graphify updates (enabled by default)
- Haiku 4.5 model integration for cost-effective operations
- Context optimization documentation

### Changed
- Graphify re-indexing strategy clarified for large changes
- Default behavior enables incremental graphify updates

### Performance
- Significant token reduction through smart context filtering
- Improved response times with AST navigation
- Better caching with incremental graphify

### Documentation
- `TOKEN-OPTIMIZATION.md` - Comprehensive optimization strategies
- README updated with token optimization phases

## [2026-05] - Initial Blueprint Release

### Added
- Multi-agent orchestration system with 6 specialized agents
  - Architect: Planning and design
  - Frontend Developer: UI/UX implementation
  - Backend Developer: API and services
  - QA Lead: Testing and quality
  - DevOps Engineer: Infrastructure
  - Data Engineer: Data pipelines
- `/ticket` workflow for automated ticket processing (9 phases)
- Dashboard for real-time agent monitoring
- MCP server integrations:
  - Sequential Thinking: Structured problem-solving
  - Memory: Persistent context across sessions
  - Serena: Codebase search and indexing
  - Context7: Fetch external documentation
  - Playwright: E2E testing
  - GitHub: Issue/PR management
- Superpowers skills integration via symlink
- Pre-commit hook system for code quality
- Bootstrap script for easy project setup
- Adoption script for existing projects

### Documentation
- Complete README with setup instructions
- Architecture and workflow documentation
- Agent profiles and responsibilities
- MCP configuration guides

---

## Migration Notes

### Dynamic Profile System
- **Backward Compatible**: All existing workflows work unchanged
- **Opt-in**: Profile switching scripts are optional tools
- **Recommendation**: Use `ticket` profile for `/ticket` workflow
- **Rollback**: Restore from `.claude/settings.json.backup-*` files

### Token Optimization
- **Non-breaking**: All optimizations are additive
- **`.claudeignore`**: Review patterns to ensure no needed files excluded
- **Graphify**: Re-index after merging large features

### Monorepo Support
- **Auto-detection**: Automatically detects framework type
- **Manual override**: Can specify framework in adoption script
- **Per-framework**: Each framework gets isolated git and indexing

---

## Detailed Changelogs

For implementation details and comprehensive change records, see:
- `CHANGELOG-DYNAMIC-PROFILES.md` - Complete profile system implementation log
- `CHANGES-SUMMARY.md` - Quick reference for profile system changes

---

## Support

For issues, questions, or contributions:
1. Check relevant documentation in `docs/`
2. Review `docs/TROUBLESHOOTING.md` for common issues
3. Open an issue in the blueprint repository
4. Consult `SETUP.md` for installation guidance
