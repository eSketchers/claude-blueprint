---
description: Index the codebase with graphify to build a knowledge graph for faster queries. Run after merging large features or weekly for active projects.
argument-hint: [--force]
allowed-tools: Bash
---

# Graphify Index

Builds a knowledge graph of the codebase that can be queried for faster context gathering.

**Benefits:**
- Reduces file reads by 60-80% in subsequent sessions
- Faster agent exploration
- Better understanding of cross-file relationships
- **Incremental updates:** Only changed files are re-processed (SHA256 caching)

**When to run:**

Re-index when the codebase structure changes significantly:

- **Structural:** Adding/removing 10+ files, moving directories, renaming modules
- **Major features:** New services, API endpoints, database entities
- **Refactoring:** Changes affecting 20+ files or architectural boundaries
- **Time-based:** Weekly for active projects, or every 2-3 days for daily development
- **Onboarding:** When a new developer joins (gives them an up-to-date graph)

The script auto-skips if the index is < 24 hours old.

## Usage

```
/graphify-index           # Index if > 24h old
/graphify-index --force   # Force re-index
```

## Implementation

Use the graphify indexing script:

```bash
./scripts/graphify-index.sh $ARGUMENTS
```

If the script doesn't exist or graphify isn't installed, provide helpful instructions:

1. Check if graphify is installed: `which graphify`
2. If not: `pip install --user graphify` or follow vendor/graphify/README.md
3. Run the script: `./scripts/graphify-index.sh`

Report the output (nodes, edges, duration) to the user.

## Querying the graph

After indexing, agents can query with:

```bash
graphify query "What modules handle authentication?"
graphify query "Show all dependencies of the user service"
```

This is significantly cheaper than repeated file reads.

## Troubleshooting

- **"graphify not found"** → Install via `pip install --user graphifyy` (note: double-y in package name, CLI is still `graphify`)
- **"Not in a git repository"** → Run from project root
- **Index fails** → Check `.graphify/` permissions, try `rm -rf .graphify && /graphify-index --force`
