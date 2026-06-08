#!/usr/bin/env bash
# SDD lint hook — runs the linter on the modified file.
# Reads JSON from stdin: { tool_input: { file_path: "..." } }
# Exit 2 = blocks Claude, forces a fix.
set -euo pipefail

input="$(cat)"
file_path="$(echo "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

[[ -z "$file_path" ]] && exit 0
[[ ! -f "$file_path" ]] && exit 0

ext="${file_path##*.}"

case "$ext" in
  ts|tsx|js|jsx|mjs|cjs)
    if command -v npx >/dev/null 2>&1; then
      if npx --no-install eslint --max-warnings 0 "$file_path" 2>&1; then
        exit 0
      else
        echo "❌ ESLint failed for $file_path" >&2
        exit 2
      fi
    fi
    ;;
  py)
    if command -v ruff >/dev/null 2>&1; then
      if ruff check "$file_path" 2>&1; then
        exit 0
      else
        echo "❌ Ruff failed for $file_path" >&2
        exit 2
      fi
    fi
    ;;
esac

exit 0
