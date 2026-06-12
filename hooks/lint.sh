#!/usr/bin/env bash
# SDD lint hook — runs the linter matching the file's language AND available on PATH.
#
# Reads JSON from stdin: { tool_input: { file_path: "..." } }
# Exit 0 = no-op or success (tool not installed → safe no-op).
# Exit 2 = the linter ran and reported issues → Claude is blocked until the fix.
#
# JS/TS preference order: Biome → ESLint → oxlint (first one available wins).
# Python: Ruff.
# Rust:   cargo clippy (treats warnings as errors via -D warnings).
# Go:     golangci-lint.
set -euo pipefail

input="$(cat)"
file_path="$(echo "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

[[ -z "$file_path" ]] && exit 0
[[ ! -f "$file_path" ]] && exit 0

ext="${file_path##*.}"

run_or_pass() {
  # run_or_pass "tool" "human-name" cmd...
  # If the binary is not on PATH → exit 0 (safe no-op).
  # If the command exits non-zero → exit 2 with a clear diagnostic.
  local bin="$1" name="$2"
  shift 2
  command -v "$bin" >/dev/null 2>&1 || exit 0
  if "$@" 2>&1; then
    exit 0
  else
    echo "❌ $name failed for $file_path" >&2
    exit 2
  fi
}

run_or_pass_npx() {
  # JS/TS tools are usually invoked via npx; npx itself must be present.
  # Args: "human-name" <npx-package> <args...>
  local name="$1" package="$2"
  shift 2
  command -v npx >/dev/null 2>&1 || exit 0
  # Probe whether the package resolves locally without installing.
  if ! npx --no-install --quiet "$package" --help >/dev/null 2>&1; then
    exit 0  # tool isn't installed in this project → no-op
  fi
  if npx --no-install "$package" "$@" "$file_path" 2>&1; then
    exit 0
  else
    echo "❌ $name failed for $file_path" >&2
    exit 2
  fi
}

case "$ext" in
  ts|tsx|js|jsx|mjs|cjs)
    # Preference: Biome → ESLint → oxlint.
    if command -v npx >/dev/null 2>&1; then
      if npx --no-install --quiet @biomejs/biome --version >/dev/null 2>&1; then
        if npx --no-install @biomejs/biome check "$file_path" 2>&1; then exit 0; else
          echo "❌ Biome failed for $file_path" >&2
          exit 2
        fi
      fi
      if npx --no-install --quiet eslint --version >/dev/null 2>&1; then
        if npx --no-install eslint --max-warnings 0 "$file_path" 2>&1; then exit 0; else
          echo "❌ ESLint failed for $file_path" >&2
          exit 2
        fi
      fi
      if npx --no-install --quiet oxlint --version >/dev/null 2>&1; then
        if npx --no-install oxlint "$file_path" 2>&1; then exit 0; else
          echo "❌ oxlint failed for $file_path" >&2
          exit 2
        fi
      fi
    fi
    ;;
  py)
    run_or_pass ruff "Ruff" ruff check "$file_path"
    ;;
  rs)
    # Clippy reads the whole package; treat warnings as failures.
    if command -v cargo >/dev/null 2>&1; then
      if cargo clippy --quiet -- -D warnings 2>&1; then exit 0; else
        echo "❌ cargo clippy failed for $file_path" >&2
        exit 2
      fi
    fi
    ;;
  go)
    run_or_pass golangci-lint "golangci-lint" golangci-lint run --new-from-rev=HEAD~ ./...
    ;;
esac

exit 0
