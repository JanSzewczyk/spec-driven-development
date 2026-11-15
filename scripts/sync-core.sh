#!/usr/bin/env bash
# Copies shared/sdd-core into every plugin that uses it, and the schema to plugins/sdd/schemas/. A mod may import only files inside its own
# plugin directory (symlinks are refused by `claude plugin validate`), so each plugin carries a copy.
# Usage: scripts/sync-core.sh          copy
#        scripts/sync-core.sh --check  exit 1 when a copy differs from the source (CI)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/shared/sdd-core"
schema_pub="$root/plugins/sdd/schemas/capabilities.schema.json" # published at a stable URL (the `$schema` line of capabilities.yml)
targets=("$root/plugins/sdd/hooks/core" "$root/plugins/sdd-board/hooks/core")
note='These files are copies of shared/sdd-core, written by scripts/sync-core.sh. Edit the source, then run the script.'
# A mod loads only code files, so the schema is also written as a TS module the core imports.
gen="$src/capabilities.schema.ts"
gen_text="$(printf '// Generated from capabilities.schema.json by scripts/sync-core.sh. Edit the JSON, then run the script.\nexport default %s as const\n' "$(cat "$src/capabilities.schema.json")")"
status=0
if [[ "${1:-}" == "--check" ]]; then
  if [[ "$(cat "$gen" 2>/dev/null)" != "$gen_text" ]]; then
    echo "out of sync: ${gen#$root/} (run scripts/sync-core.sh)"
    status=1
  fi
else
  printf '%s\n' "$gen_text" > "$gen"
fi
if [[ "${1:-}" == "--check" ]]; then
  if ! diff -q "$src/capabilities.schema.json" "$schema_pub" >/dev/null 2>&1; then
    echo "out of sync: ${schema_pub#$root/} (run scripts/sync-core.sh)"
    status=1
  fi
else
  mkdir -p "$(dirname "$schema_pub")"
  cp "$src/capabilities.schema.json" "$schema_pub"
fi
for dst in "${targets[@]}"; do
  if [[ "${1:-}" == "--check" ]]; then
    if ! diff -rq --exclude=GENERATED.md --exclude=capabilities.schema.json "$src" "$dst" >/dev/null 2>&1; then
      echo "out of sync: ${dst#$root/} (run scripts/sync-core.sh)"
      status=1
    fi
  else
    rm -rf "$dst"
    mkdir -p "$dst"
    cp "$src"/*.ts "$dst"/
    printf '%s\n' "$note" > "$dst/GENERATED.md"
  fi
done
exit $status
