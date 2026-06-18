# Phase 2: Practical Context Optimization

## Strategy Overview

**Goal:** Additional context reduction through templates, AST queries, and batching.

**Impact:** 10-20% additional reduction on top of Phase 1's 70-85%
**Effort:** 5-8 hours
**Risk:** Low (all strategies preserve quality)

---

## Why Not Diff-Based Editing?

Initially considered showing git diffs instead of full files, but **rejected** because:

- Only helps on recently-edited files (< 7 days old)
- Doesn't work on stable/mature code (70-80% of a typical codebase)
- Realistic savings: 14-27% (not the theoretical 70-90%)
- Adds complexity with recency checks and fallbacks

**Better to focus on strategies that work regardless of file age.**

---

## Strategy 5: Template/Snippet Library

**Goal:** Pre-written code patterns that agents reference by name instead of generating from scratch.

**Impact:** 100% reduction in boilerplate generation (2K-5K tokens per use)
**Effort:** 2-3 hours
**Risk:** Very low
**Applicability:** 20-30% of implementation tasks (new file creation)

### How It Works

#### Current Approach:
```
Agent: "I need to create a new NestJS controller"
→ Reads 3-5 existing controllers (~15K tokens)
→ Generates new controller from patterns
```

#### Template Approach:
```
Agent: "I need to create a new NestJS controller"
→ References `.claude/templates/nestjs-controller.ts` (~500 tokens)
→ Adapts template to specific needs
```

### Implementation

#### 1. Create Template Directory Structure

```
.claude/templates/
├── nestjs/
│   ├── controller.ts
│   ├── service.ts
│   ├── module.ts
│   ├── guard.ts
│   └── interceptor.ts
├── react/
│   ├── component.tsx
│   ├── form.tsx
│   ├── hook.ts
│   └── context.tsx
├── fastapi/
│   ├── router.py
│   ├── service.py
│   ├── schema.py
│   └── dependencies.py
└── testing/
    ├── pytest-fixture.py
    ├── jest-mock.ts
    └── e2e-pattern.ts
```

#### 2. Update Agent Guidance

Add to backend-dev.md, frontend-dev.md, data-engineer.md:

```markdown
## Templates available

**Before reading existing code for patterns, check `.claude/templates/`:**

- **NestJS:** controller, service, module, guard, interceptor
- **React:** component, form, hook, context
- **FastAPI:** router, service, schema, dependencies
- **Testing:** pytest fixtures, jest mocks, e2e patterns

**When to use templates:**
- Creating a new file from scratch
- Pattern matches a standard template (CRUD, form, etc.)
- Template saves reading 3+ example files

**When to read existing code instead:**
- Template doesn't exist for your pattern
- Need to understand project-specific customizations
- Modifying existing code (not creating new)
- Pattern has significant domain logic
```

### Expected Savings

- **Per new file creation:** 2K-5K tokens saved
- **Frequency:** 20-30% of implementation tasks
- **Annual savings (active project):** ~40K-100K tokens

---

## Strategy 6: AST-Based Navigation

**Goal:** Use ast-grep for structural queries instead of reading files.

**Impact:** 60-80% reduction for "find all X" queries
**Effort:** 3-4 hours
**Risk:** Low
**Applicability:** Exploration and discovery phases

### How It Works

#### Current Approach:
```
Task: "Find all API endpoints that use authentication"
→ Grep finds 20 files (~5K tokens in results)
→ Read all 20 files to understand patterns (~100K tokens)
→ Total: ~105K tokens
```

#### AST Approach:
```
Task: "Find all API endpoints that use authentication"
→ ast-grep pattern query (~500 tokens)
→ Returns structured results with exact locations
→ Read only the 3 files that need modification (~15K tokens)
→ Total: ~15.5K tokens (85% savings)
```

### Implementation

#### 1. Create AST Query Helper

File: `scripts/ast-query.sh`

```bash
#!/usr/bin/env bash
# AST-based structural search patterns

set -euo pipefail

PATTERN_TYPE="$1"
PATTERN_ARG="${2:-}"

if ! command -v ast-grep &>/dev/null; then
  echo "ast-grep not installed. Install: cargo install ast-grep" >&2
  exit 1
fi

case "$PATTERN_TYPE" in
  auth-guards)
    # Find all endpoints with authentication guards
    ast-grep --pattern '@UseGuards($$$)' 'src/**/*.ts'
    ;;

  db-queries)
    # Find all database queries
    ast-grep --pattern 'await $REPO.$METHOD($$$)' 'src/**/*.ts'
    ;;

  react-state)
    # Find all React components with state
    ast-grep --pattern 'useState($$$)' 'src/**/*.tsx'
    ;;

  class-implements)
    # Find all classes implementing a specific interface
    if [[ -z "$PATTERN_ARG" ]]; then
      echo "Usage: ast-query.sh class-implements <InterfaceName>" >&2
      exit 1
    fi
    ast-grep --pattern "class \$CLASS implements $PATTERN_ARG" 'src/**/*.ts'
    ;;

  function-name)
    # Find specific function definition
    if [[ -z "$PATTERN_ARG" ]]; then
      echo "Usage: ast-query.sh function-name <functionName>" >&2
      exit 1
    fi
    ast-grep --pattern "function $PATTERN_ARG(\$\$\$)" '**/*.{ts,js,tsx,jsx}'
    ast-grep --pattern "const $PATTERN_ARG = (\$\$\$) =>" '**/*.{ts,js,tsx,jsx}'
    ;;

  python-class)
    # Find Python class
    if [[ -z "$PATTERN_ARG" ]]; then
      echo "Usage: ast-query.sh python-class <ClassName>" >&2
      exit 1
    fi
    ast-grep --pattern "class $PATTERN_ARG:" '**/*.py'
    ;;

  *)
    echo "Unknown pattern type: $PATTERN_TYPE" >&2
    echo "" >&2
    echo "Available patterns:" >&2
    echo "  auth-guards         - Find @UseGuards decorators" >&2
    echo "  db-queries          - Find database queries" >&2
    echo "  react-state         - Find useState hooks" >&2
    echo "  class-implements    - Find classes implementing interface" >&2
    echo "  function-name       - Find function by name" >&2
    echo "  python-class        - Find Python class by name" >&2
    exit 1
    ;;
esac
```

#### 2. Update Explore Agent

File: `.claude/agents/explore.md` (create if doesn't exist)

```markdown
## AST-first structural search

**For "find all X" queries, use ast-grep instead of Grep+Read:**

Use `scripts/ast-query.sh`:
- Find all functions with a decorator: `ast-query.sh auth-guards`
- Find all classes implementing an interface: `ast-query.sh class-implements IService`
- Find all React components using a hook: `ast-query.sh react-state`
- Find specific function: `ast-query.sh function-name login`

**When to use AST:**
- Finding structural patterns (classes, functions, decorators)
- "Find all files that use X"
- Understanding code organization before reading details

**When to use Grep instead:**
- Searching for string literals or comments
- Complex semantic patterns AST can't express
- Need to search across all file types (not just code)

**Only read files after:**
- AST query narrows down to specific files
- You know exactly what you need to understand
```

### Expected Savings

- **Per discovery query:** 60-80% reduction
- **Especially valuable during:** Planning phase, exploration, understanding dependencies
- **Works best for:** Structural queries, pattern finding, codebase mapping

---

## Strategy 7: Batching File Operations

**Goal:** Read multiple small related files in one operation instead of separate reads.

**Impact:** 20-30% reduction in multi-file reads
**Effort:** 1-2 hours
**Risk:** Very low
**Applicability:** Understanding modules/features that span multiple files

### How It Works

#### Current Approach:
```
Task: "Understand authentication flow"
→ Read auth.controller.ts (2K tokens)
→ Read auth.service.ts (3K tokens)
→ Read auth.guard.ts (2K tokens)
→ Read jwt.strategy.ts (2K tokens)
Total: 9K tokens across 4 separate reads (with duplication in headers)
```

#### Batched Approach:
```
Task: "Understand authentication flow"
→ Read auth/** module together (7K tokens in one read)
Total: 7K tokens (22% savings from reduced duplication)
```

### Implementation

#### 1. Create Module Reader Script

File: `scripts/read-module.sh`

```bash
#!/usr/bin/env bash
# Read all files in a module with section markers

set -euo pipefail

MODULE_PATH="$1"

if [[ ! -d "$MODULE_PATH" ]]; then
  echo "Module path not found: $MODULE_PATH" >&2
  exit 1
fi

echo "=== Module: $MODULE_PATH ==="
echo ""

# Find all source files in the module
find "$MODULE_PATH" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" \) | while read -r file; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "File: $file"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat "$file"
  echo ""
  echo ""
done

echo "=== End of module: $MODULE_PATH ==="
```

#### 2. Update Agent Guidance

Add to backend-dev.md, frontend-dev.md, data-engineer.md:

```markdown
## Reading related files

**When multiple files are part of the same feature/module:**

Use `scripts/read-module.sh src/auth` to read the entire module:
- More efficient than separate Read calls
- Provides better context for understanding relationships
- Eliminates duplication in file headers/metadata

**When to batch:**
- Understanding a feature that spans 3-5 files in same directory
- All files are related (same module/domain)
- Need to understand interactions between files

**When to read separately:**
- Files are in different modules/domains
- Only need to edit one specific file
- Module has > 10 files (too much context)
- Files are large (> 500 lines each)
```

### Expected Savings

- **Per module read:** 20-30% savings from reduced duplication
- **Best for:** Small to medium modules (3-5 files)
- **Frequency:** Common during implementation phase

---

## Combined Phase 2 Impact

| Strategy | Token Savings | Effort | Risk | Applicability |
|----------|---------------|--------|------|---------------|
| #5: Templates | 2K-5K per use | 2-3h | Very low | 20-30% of tasks |
| #6: AST navigation | 60-80% on queries | 3-4h | Low | Discovery/exploration |
| #7: Batching | 20-30% on modules | 1-2h | Very low | Module understanding |

**Total Phase 2 effort:** 5-8 hours
**Expected additional reduction:** 10-20% on top of Phase 1's 70-85%
**Combined Phase 1+2:** 80-90% total waste elimination
**Risk level:** Low (all strategies preserve quality)

---

## Rollout Steps

1. ✅ Create template directory structure
2. ✅ Write template files for common patterns
3. ✅ Create ast-query.sh helper script
4. ✅ Create read-module.sh helper script
5. ✅ Make scripts executable
6. ✅ Update Explore agent with AST-first guidance
7. ✅ Update backend-dev, frontend-dev, data-engineer with template + batching guidance
8. ✅ Document in TOKEN-OPTIMIZATION.md
9. ⚠️ Monitor for 2 weeks - check if agents use templates effectively
10. ✅ Expand template library based on common patterns observed

---

## Success Metrics

- Template usage: 50%+ of new file creation uses templates
- AST queries: Reduce discovery phase file reads by 60%+
- Batching: Module reads consolidated (fewer separate Read calls)
- **Code quality unchanged** ← Most important
- **Pattern consistency improved** (templates enforce standards)

---

## Why This Works Better Than Diff-Based

**These strategies work on ALL files, regardless of age:**
- Templates help for ALL new files (stable or active codebase)
- AST helps for ALL structural queries (regardless of git history)
- Batching helps for ALL module exploration (any file age)

**Simpler, more predictable, more honest savings.**
