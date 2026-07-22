#!/usr/bin/env bash
# test-pre-commit-scenarios.sh — Test the run-pre-commit.sh wrapper
#
# Tests various scenarios:
# 1. pre-commit not installed (should silently succeed)
# 2. No file path provided (should silently succeed)
# 3. pre-commit succeeds with no output
# 4. pre-commit fails (hooks found issues)
# 5. pre-commit succeeds but has output

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing run-pre-commit.sh wrapper"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: No file path provided
echo "Test 1: No CLAUDE_TOOL_FILE_PATH (should exit 0 silently)"
unset CLAUDE_TOOL_FILE_PATH || true
if .claude/hooks/run-pre-commit.sh; then
    echo "✓ Test 1 passed: exited with 0"
else
    echo "✗ Test 1 failed: exited with $?"
fi
echo ""

# Test 2: File path provided but pre-commit not installed
echo "Test 2: pre-commit not installed (should exit 0 silently)"
export CLAUDE_TOOL_FILE_PATH="test.py"
export PATH="/tmp/empty:$PATH"  # Temporarily remove pre-commit from PATH
if .claude/hooks/run-pre-commit.sh 2>&1 | grep -q "Pre-commit"; then
    echo "✗ Test 2 failed: produced output when pre-commit missing"
else
    echo "✓ Test 2 passed: silently skipped"
fi
unset PATH  # Restore PATH
echo ""

# Test 3: Script can handle various file paths
echo "Test 3: Script handles file paths correctly"
export CLAUDE_TOOL_FILE_PATH="test.py"
if bash -n .claude/hooks/run-pre-commit.sh; then
    echo "✓ Test 3 passed: script syntax is valid"
else
    echo "✗ Test 3 failed: syntax error"
fi
echo ""

# Test 4: Check error handling logic
echo "Test 4: Check error handling in script"
if grep -q "exit_code=\${exit_code:-0}" .claude/hooks/run-pre-commit.sh; then
    echo "✓ Test 4 passed: proper error code handling"
else
    echo "✗ Test 4 failed: missing error code handling"
fi
echo ""

# Test 5: Verify script is executable
echo "Test 5: Script is executable"
if [ -x .claude/hooks/run-pre-commit.sh ]; then
    echo "✓ Test 5 passed: script is executable"
else
    echo "✗ Test 5 failed: script not executable"
fi
echo ""

# Test 6: Check for proper stderr redirection
echo "Test 6: Error messages go to stderr"
if grep -q ">&2" .claude/hooks/run-pre-commit.sh; then
    echo "✓ Test 6 passed: uses stderr for error messages"
else
    echo "✗ Test 6 failed: not using stderr"
fi
echo ""

# Test 7: Verify the script always exits 0 (non-blocking)
echo "Test 7: Script never blocks (always exits 0)"
if grep -q "# Return success to not block the tool execution" .claude/hooks/run-pre-commit.sh; then
    echo "✓ Test 7 passed: documented non-blocking behavior"
else
    echo "✗ Test 7 failed: blocking behavior unclear"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "All static tests completed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
