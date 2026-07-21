> **⚠️ ARCHIVED DOCUMENTATION**
>
> This document has been archived. For current documentation, see:
> - [Advanced Guide](../ADVANCED.md) - Token Optimization section
> - [Changelog](../CHANGELOG.md) - Recent changes
>
> This archived version is kept for historical reference and contains detailed technical information that may still be useful.

---

# Safe Context Reduction Strategies

This document outlines **safe** approaches to reducing context window usage without degrading code quality or introducing bugs.

## ⚠️ The Core Principle

**Quality and correctness > token savings**

Context reduction should eliminate **waste**, not **understanding**.

---

## ✅ Safe Strategy 1: Filter Noise Files

**What:** Block files that genuinely don't help agents understand code.

**Implementation:** `.claude/.claudeignore` file (similar to `.gitignore`)

**Blocks:**
- Dependencies (node_modules/, vendor/)
- Build outputs (dist/, build/, .next/)
- Generated files (*.min.js, *_pb2.py)
- Lock files (package-lock.json, yarn.lock)
- Test coverage reports (auto-generated)
- Version control internals (.git/)

**Impact:** 80-95% reduction in Glob/Grep noise

**Risk:** ✅ **None** - these files genuinely don't help

**Example `.claude/.claudeignore`:**
```
node_modules/
dist/
build/
*.min.js
*.map
package-lock.json
.git/
coverage/
```

---

## ✅ Safe Strategy 2: Smart File Reading Guidance

**What:** Educate agents on smart reading strategies, don't forbid reading.

**Implementation:** Add "Smart file reading" section to each agent

**Guidance (not rules):**

### For Large Files (> 1000 lines):
1. Use Grep to understand structure first
2. Decide if you need full context:
   - Editing isolated function? → Consider ast-grep extraction
   - Understanding flow? → Read whole file
   - Following patterns? → Read whole file
3. **When in doubt, read the whole file**

### General Approach:
- Read files you're about to edit (always)
- Read 3-5 related files for pattern consistency
- Use Glob/Grep to map before diving deep
- **Golden rule:** Correctness > token optimization

**Impact:** 50-70% reduction in large file reads (when extraction is safe)

**Risk:** ✅ **Low** - agents still have freedom to read what they need

---

## ✅ Safe Strategy 3: Smart Exploration Protocol

**What:** Purposeful exploration instead of speculative reading.

**Implementation:** Phase-based guidance in workflows

### Discovery Phase (Explore agent):
✅ **Do:** Glob/Grep to map structure
✅ **Do:** Identify patterns (count, locations)
❌ **Avoid:** Reading file contents (save for implementation)

### Planning Phase (Architect):
✅ **Do:** Read 5-10 representative files for patterns
✅ **Do:** Read files mentioned in requirements
✅ **Do:** Read related files when needed for context
❌ **Avoid:** Reading entire codebase "just in case"
**Aim:** 10-15 file reads max

### Implementation Phase:
✅ **Do:** Read files you're about to edit
✅ **Do:** Read related files for consistency
✅ **Do:** Re-read if you discover you need more context
❌ **Avoid:** Batch-reading unrelated files

**Impact:** 60% reduction in premature/speculative reads

**Risk:** ✅ **Low** - agents can still read what they need

---

## ❌ Unsafe Strategies (Avoid These)

### ❌ Hard File Size Limits
```markdown
# DON'T DO THIS:
Never read files > 1000 lines
```

**Why it's bad:**
- Large files often contain critical business logic
- Agents miss validation, error handling, patterns
- Breaks understanding of flow across methods
- Can introduce security vulnerabilities

**Example failure:**
```
Task: Add partial refund support

Without reading 1500-line payment_processor.py:
- Misses fraud detection checks
- Doesn't follow audit logging pattern
- Creates security hole

With reading:
- Follows established patterns
- Secure and consistent
```

### ❌ Forbidden Exploration
```markdown
# DON'T DO THIS:
Discovery phase: Read tool is FORBIDDEN
```

**Why it's bad:**
- Agents need to understand patterns
- Can't maintain consistency without examples
- Leads to reimplementing existing patterns
- Breaks architectural consistency

**Example failure:**
```
Task: Add OAuth2 login endpoint

Without reading existing auth:
- Doesn't know project uses JWT
- Misses rate limiting middleware
- Different error format (inconsistent)

With reading 3-5 examples:
- Follows JWT pattern
- Includes rate limiting
- Consistent error handling
```

### ❌ MCP Memory for Context Storage
**Why it's bad:**
- Every MCP query/response adds to context
- Can make you hit limits faster, not slower
- Storage is in-context, not external

---

## 📊 Expected Savings (Safe Approach)

| Strategy | Context Reduction | Risk Level |
|----------|------------------|------------|
| .claudeignore | 80-95% noise files | ✅ None |
| Smart file guidance | 50-70% large files | ✅ Low |
| Smart exploration | 60% premature reads | ✅ Low |
| **Combined** | **70-85% total waste** | ✅ **Safe** |

---

## 🎯 The Right Mindset

### ❌ Bad: "Minimize tokens at all costs"
- Results in buggy, inconsistent code
- Agents miss critical patterns
- Technical debt accumulates
- Security vulnerabilities

### ✅ Good: "Minimize wasted tokens"
- Block genuine noise (dependencies, builds)
- Encourage purposeful reading
- Allow exploration when needed
- Quality and security first

---

## 💡 Guidelines for Evaluation

Before adding any context reduction measure, ask:

1. **Does this eliminate noise or understanding?**
   - Noise = OK to block
   - Understanding = NOT OK to block

2. **What's the worst-case failure mode?**
   - If an agent can't read a file when needed, what breaks?
   - Is the risk acceptable?

3. **Does this guide or restrict?**
   - Guidance = good (agents learn)
   - Hard restrictions = risky (agents can't adapt)

4. **Can agents override when needed?**
   - "When in doubt, read more" = good
   - "Never read files > X lines" = bad

---

## 📝 Implementation Checklist

- [x] Create `.claude/.claudeignore` with noise patterns
- [x] Add "Smart file reading" to all 6 agents (guidance, not limits)
- [x] Update `/ticket` command with smart exploration phases
- [ ] Document in project README
- [ ] Add to onboarding docs
- [ ] Monitor for quality regressions

---

## 🔍 Measuring Success

**Good metrics:**
- Glob results reduced by 80%+
- File reads reduced by 50%+
- **Code quality unchanged** ← Most important
- **Test coverage stable**
- **Bug rate unchanged**

**Bad metrics to chase:**
- "Minimize file reads at all costs"
- "Never read files > X lines"
- "Reduce tokens by 90%"

If you see quality degradation, **roll back** the change. Context reduction is only valuable if quality stays high.

---

## 🚀 Next Steps

After implementing safe strategies, monitor for 2-4 weeks:

1. Track token usage (via orchestrator or manual logging)
2. Monitor code review feedback (quality issues?)
3. Check bug reports (new patterns of bugs?)
4. Review test coverage (dropping?)

If quality stays high, celebrate! If not, investigate which strategy caused issues and adjust.

**Remember:** A 600-line file read (15K tokens) is worth it if it prevents a bug.
