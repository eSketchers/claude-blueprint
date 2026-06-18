#!/usr/bin/env bash
# Read all files in a module with section markers

set -euo pipefail

MODULE_PATH="${1:-}"

if [[ -z "$MODULE_PATH" ]]; then
  echo "Usage: read-module.sh <module-path>" >&2
  echo "" >&2
  echo "Example: read-module.sh src/auth" >&2
  exit 1
fi

if [[ ! -d "$MODULE_PATH" ]]; then
  echo "Module path not found: $MODULE_PATH" >&2
  exit 1
fi

echo "=== Module: $MODULE_PATH ==="
echo ""

# Find all source files in the module
find "$MODULE_PATH" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" \) | sort | while read -r file; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "File: $file"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat "$file"
  echo ""
  echo ""
done

echo "=== End of module: $MODULE_PATH ==="
