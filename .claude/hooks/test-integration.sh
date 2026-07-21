#!/usr/bin/env bash
# Integration test for run-pre-commit.sh by mocking pre-commit behavior

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Integration Testing: run-pre-commit.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create a mock pre-commit that we can control
MOCK_DIR=$(mktemp -d)
trap "rm -rf $MOCK_DIR" EXIT

# Test 1: pre-commit succeeds with no output
echo "Test 1: pre-commit succeeds with no output (should be silent)"
cat > "$MOCK_DIR/pre-commit" << 'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "$MOCK_DIR/pre-commit"
export PATH="$MOCK_DIR:$PATH"
export CLAUDE_TOOL_FILE_PATH="test.py"
output=$(.claude/hooks/run-pre-commit.sh 2>&1)
if [ -z "$output" ]; then
    echo "✓ Test 1 passed: no output when hooks pass"
else
    echo "✗ Test 1 failed: unexpected output: $output"
fi
echo ""

# Test 2: pre-commit fails (hooks found issues)
echo "Test 2: pre-commit fails (should show warning)"
cat > "$MOCK_DIR/pre-commit" << 'EOF'
#!/bin/bash
echo "Flake8...Failed"
echo "- test.py:10:80: E501 line too long"
exit 1
EOF
chmod +x "$MOCK_DIR/pre-commit"
output=$(.claude/hooks/run-pre-commit.sh 2>&1) || test_exit=$?
test_exit=${test_exit:-0}
if [ $test_exit -eq 0 ] && echo "$output" | grep -q "⚠️"; then
    echo "✓ Test 2 passed: shows warning but exits 0"
    echo "   Output preview: $(echo "$output" | head -1)"
else
    echo "✗ Test 2 failed: exit=$test_exit, has warning=$(echo "$output" | grep -q "⚠️" && echo yes || echo no)"
fi
echo ""

# Test 3: pre-commit succeeds but has informational output
echo "Test 3: pre-commit passes with output (should show it)"
cat > "$MOCK_DIR/pre-commit" << 'EOF'
#!/bin/bash
echo "Trim Trailing Whitespace.....Passed"
echo "Check Yaml..................Passed"
exit 0
EOF
chmod +x "$MOCK_DIR/pre-commit"
output=$(.claude/hooks/run-pre-commit.sh 2>&1)
if echo "$output" | grep -q "Passed"; then
    echo "✓ Test 3 passed: shows pre-commit output"
else
    echo "✗ Test 3 failed: did not show output"
fi
echo ""

# Test 4: Check that file path is included in error messages
echo "Test 4: Error messages include file path"
cat > "$MOCK_DIR/pre-commit" << 'EOF'
#!/bin/bash
exit 1
EOF
chmod +x "$MOCK_DIR/pre-commit"
export CLAUDE_TOOL_FILE_PATH="/path/to/myfile.py"
output=$(.claude/hooks/run-pre-commit.sh 2>&1)
if echo "$output" | grep -q "/path/to/myfile.py"; then
    echo "✓ Test 4 passed: file path included in output"
else
    echo "✗ Test 4 failed: file path not found in output"
fi
echo ""

# Test 5: Verify stderr is used for warnings
echo "Test 5: Warnings go to stderr (not stdout)"
cat > "$MOCK_DIR/pre-commit" << 'EOF'
#!/bin/bash
exit 1
EOF
chmod +x "$MOCK_DIR/pre-commit"
export CLAUDE_TOOL_FILE_PATH="test.py"
stdout=$(.claude/hooks/run-pre-commit.sh 2>/dev/null)
stderr=$(.claude/hooks/run-pre-commit.sh 2>&1 >/dev/null)
if [ -z "$stdout" ] && [ -n "$stderr" ]; then
    echo "✓ Test 5 passed: warnings on stderr, stdout clean"
else
    echo "✗ Test 5 failed: stdout=${#stdout} chars, stderr=${#stderr} chars"
fi
echo ""

# Test 6: Script always exits 0 (non-blocking)
echo "Test 6: Script never blocks (always exits 0)"
for exit_code in 0 1 2; do
    cat > "$MOCK_DIR/pre-commit" << EOF
#!/bin/bash
exit $exit_code
EOF
    chmod +x "$MOCK_DIR/pre-commit"
    if .claude/hooks/run-pre-commit.sh >/dev/null 2>&1; then
        echo "✓ pre-commit exit $exit_code → wrapper exit 0"
    else
        echo "✗ pre-commit exit $exit_code → wrapper exit $?"
    fi
done
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Integration tests completed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
