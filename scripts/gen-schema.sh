#!/usr/bin/env bash
# Writes plugins/sdd/hooks/core/capabilities.schema.ts from plugins/sdd/schemas/capabilities.schema.json, the single source of the
# capabilities.yml keys. A mod loads only code files, so formats.ts imports the schema as a TS module.
# Usage: scripts/gen-schema.sh          write
#        scripts/gen-schema.sh --check  exit 1 when the TS module differs from the JSON (CI)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
json="$root/plugins/sdd/schemas/capabilities.schema.json"
gen="$root/plugins/sdd/hooks/core/capabilities.schema.ts"
gen_text="$(printf '// Generated from plugins/sdd/schemas/capabilities.schema.json by scripts/gen-schema.sh. Edit the JSON, then run the script.\nexport default %s as const\n' "$(cat "$json")")"
if [[ "${1:-}" == "--check" ]]; then
  if [[ "$(cat "$gen" 2>/dev/null)" != "$gen_text" ]]; then
    echo "out of sync: ${gen#$root/} (run scripts/gen-schema.sh)"
    exit 1
  fi
else
  printf '%s\n' "$gen_text" > "$gen"
fi
