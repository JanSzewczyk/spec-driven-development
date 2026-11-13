#!/usr/bin/env bash
# Copies shared/sdd-core into every plugin that uses it. A mod may import only files inside its own
# plugin directory (symlinks are refused by `claude plugin validate`), so each plugin carries a copy.
# Usage: scripts/sync-core.sh          copy
#        scripts/sync-core.sh --check  exit 1 when a copy differs from the source (CI)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/shared/sdd-core"
targets=("$root/plugins/sdd/hooks/core" "$root/plugins/sdd-board/hooks/core")
note='These files are copies of shared/sdd-core, written by scripts/sync-core.sh. Edit the source, then run the script.'
status=0
for dst in "${targets[@]}"; do
  if [[ "${1:-}" == "--check" ]]; then
    if ! diff -rq --exclude=GENERATED.md "$src" "$dst" >/dev/null 2>&1; then
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
