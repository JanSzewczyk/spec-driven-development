#!/usr/bin/env bash
# SDD Framework Bootstrap
#
# Three usage modes:
#   1. Local (you cloned the repo):
#        bash /path/to/sdd-template/bootstrap.sh
#
#   2. Remote one-liner (after fork; replace <your-org>):
#        curl -fsSL https://raw.githubusercontent.com/<your-org>/sdd-template/main/bootstrap.sh | bash
#
#   3. Custom source via env vars:
#        SDD_REPO=https://github.com/myorg/my-fork SDD_BRANCH=stable bash bootstrap.sh
#
# Maintainers: replace <your-org> below before publishing your fork, OR rely on
# users to set SDD_REPO themselves. The placeholder must NOT remain in a published bootstrap.sh.
set -euo pipefail

SDD_REPO="${SDD_REPO:-https://github.com/<your-org>/sdd-template}"
SDD_BRANCH="${SDD_BRANCH:-main}"
TARGET_DIR="${TARGET_DIR:-$(pwd)}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "🚀 SDD Framework Bootstrap"
echo "   Target: $TARGET_DIR"
echo "   Source: $SDD_REPO@$SDD_BRANCH"
echo ""

# Detect local mode (bash bootstrap.sh from cloned repo)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$SCRIPT_DIR/template" ]]; then
  echo "📦 Local mode — copying from $SCRIPT_DIR/template/"
  TEMPLATE_DIR="$SCRIPT_DIR/template"
else
  echo "🌐 Remote mode — cloning template..."
  git clone --depth 1 --branch "$SDD_BRANCH" "$SDD_REPO" "$TMP_DIR/sdd"
  TEMPLATE_DIR="$TMP_DIR/sdd/template"
fi

# Safety: warn if .claude/ or specs/ already exist
if [[ -d "$TARGET_DIR/.claude" ]] || [[ -d "$TARGET_DIR/specs" ]]; then
  echo "⚠️  Detected existing .claude/ or specs/ in target."
  read -p "   Overwrite SDD files (y/N)? " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Copy template files, renaming .template → real names
echo "📝 Copying template files..."
mkdir -p "$TARGET_DIR/.claude/"{commands,agents,hooks,skills}
mkdir -p "$TARGET_DIR/specs"

# Copy .claude/ tree
cp -R "$TEMPLATE_DIR/.claude/." "$TARGET_DIR/.claude/"

# Copy specs template
cp "$TEMPLATE_DIR/specs/_template.md" "$TARGET_DIR/specs/_template.md"

# CLAUDE.md — only create if it doesn't exist (never overwrite user content)
if [[ ! -f "$TARGET_DIR/CLAUDE.md" ]]; then
  cp "$TEMPLATE_DIR/CLAUDE.md.template" "$TARGET_DIR/CLAUDE.md"
  echo "   ✓ CLAUDE.md created (edit it: keep under 2,500 tokens, fill WHAT NOT TO DO)"
else
  echo "   ⊘ CLAUDE.md already exists — skipped"
fi

# Rename .template files
[[ -f "$TARGET_DIR/.claude/capabilities.md.template" ]] && \
  mv "$TARGET_DIR/.claude/capabilities.md.template" "$TARGET_DIR/.claude/capabilities.md"

# Make hooks and scripts executable
chmod +x "$TARGET_DIR/.claude/hooks/"*.{sh,py} 2>/dev/null || true
chmod +x "$TARGET_DIR/.claude/skills/sdd-doctor/"*.py 2>/dev/null || true

echo ""
echo "✅ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "  1. Open the project in Claude Code"
echo "  2. Run: /sdd-doctor init    # auto-detect stack, fill capabilities.md"
echo "  3. Run: /sdd-doctor check   # confirm READY status"
echo "  4. Edit CLAUDE.md (root) — must be under 2,500 tokens"
echo "  5. Start your first feature: /spec feat <description>"
echo ""
