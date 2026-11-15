#!/usr/bin/env bash
# Tags the main plugin's (sdd) version when it has no tag yet and creates a GitHub Release for every
# `sdd--v<version>` tag that has none. Other plugins (sdd-board) are versioned in their manifests
# only: no tag, no Release. Run by .github/workflows/release.yml on merge to main.
# Usage: scripts/release.sh                         tag (claude plugin tag --push) and release
#        scripts/release.sh --dry-run               print what would happen, change nothing
#        scripts/release.sh --notes <name> <ver>    print that version's CHANGELOG.md section
# CHANGELOG heading: `## [<ver>]` for the main plugin (sdd).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
main_plugin=sdd

notes() {
  local name="$1" version="$2" heading
  if [[ "$name" == "$main_plugin" ]]; then heading="## [$version]"; else heading="## [$version $name]"; fi
  # The lines between the heading and the next `## [`, without leading and trailing blank lines.
  awk -v h="$heading" '
    found && /^## \[/ { exit }
    found && NF { if (started) printf "%s", pending; pending = ""; print; started = 1; next }
    found && started { pending = pending "\n" }
    $0 == h || index($0, h " ") == 1 { found = 1 }
  ' CHANGELOG.md
}

if [[ "${1:-}" == "--notes" ]]; then
  notes "$2" "$3"
  exit 0
fi
dry_run=false
[[ "${1:-}" == "--dry-run" ]] && dry_run=true

# 1. Tag the main plugin when its current version has no tag. `claude plugin tag` checks that
#    plugin.json and the marketplace entry agree and fails otherwise.
dir="plugins/$main_plugin"
manifest="$dir/.claude-plugin/plugin.json"
name="$(jq -r .name "$manifest")"
version="$(jq -r .version "$manifest")"
tag="$name--v$version"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "tag exists: $tag"
elif $dry_run; then
  claude plugin tag "$dir" --dry-run -m "$name v%s"
else
  claude plugin tag "$dir" --push -m "$name v%s"
  echo "tagged: $tag"
fi

# 2. Create a Release for every sdd tag without one, oldest version first so the newest ends up
#    as Latest.
while read -r tag; do
  [[ -z "$tag" ]] && continue
  name="${tag%--v*}"
  version="${tag##*--v}"
  [[ -f "plugins/$name/.claude-plugin/plugin.json" ]] || { echo "skip $tag: no plugin '$name'"; continue; }
  if ! $dry_run && gh release view "$tag" >/dev/null 2>&1; then
    echo "release exists: $tag"
    continue
  fi
  body="$(notes "$name" "$version")"
  if [[ -z "$body" ]]; then
    echo "::warning::No CHANGELOG.md section for $name $version"
    body="See [CHANGELOG.md](https://github.com/${GITHUB_REPOSITORY:-JanSzewczyk/spec-driven-development}/blob/main/CHANGELOG.md)."
  fi
  if $dry_run; then
    echo "would release: $tag (\"$name v$version\", ${#body} chars of notes)"
  else
    gh release create "$tag" --verify-tag --title "$name v$version" --notes "$body"
    echo "released: $tag"
  fi
done < <(git tag -l "$main_plugin--v*" --sort=version:refname)
