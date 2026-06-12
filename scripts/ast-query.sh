#!/usr/bin/env bash
# AST-based structural search patterns

set -euo pipefail

PATTERN_TYPE="${1:-}"
PATTERN_ARG="${2:-}"

if [[ -z "$PATTERN_TYPE" ]]; then
  echo "Usage: ast-query.sh <pattern-type> [args]" >&2
  echo "" >&2
  echo "Available patterns:" >&2
  echo "  auth-guards         - Find @UseGuards decorators" >&2
  echo "  db-queries          - Find database queries" >&2
  echo "  react-state         - Find useState hooks" >&2
  echo "  class-implements    - Find classes implementing interface" >&2
  echo "  function-name       - Find function by name" >&2
  echo "  python-class        - Find Python class by name" >&2
  exit 1
fi

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
