#!/usr/bin/env python3
"""SDD Doctor — init / fix mode (plugin context).

This script runs from inside the installed SDD plugin and:

1. Resolves the plugin root (via `$CLAUDE_PLUGIN_ROOT` or `__file__`).
2. Sets up the project constitution + CLAUDE.md loader (handles the v0.2.0 → v0.3.0
   migration from a single-file CLAUDE.md into a dedicated `specs/constitution.md`
   plus a condensed `CLAUDE.md` loader).
3. Copies bundled templates from `<plugin>/skills/doctor/templates/` into the
   target project — `specs/template.md`, `.claude/capabilities.md`, `.claude/settings.json`.
4. Auto-detects installed plugins and the project stack to populate `capabilities.md`
   (preserves every `<!-- user-override -->` section on re-init).
5. Renders `settings.json.template` with the resolved plugin path so PostToolUse
   hooks point at the plugin's own `hooks/typecheck.py` and `hooks/lint.sh`.

Usage:
    python3 skills/doctor/init.py [--root <project-path>] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import shutil
import sys

# Reuse stack-detection logic from check.py (next to this file).
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from check import detect_stack, run_all_checks  # noqa: E402

USER_OVERRIDE_MARKER = "<!-- user-override -->"
MIGRATED_MARKER_RE = re.compile(r"<!--\s*MIGRATED:(.+?)\s*-->")


# ────────────────────────────────────────────────────────────────────────────
# Plugin root resolution
# ────────────────────────────────────────────────────────────────────────────


def resolve_plugin_root() -> pathlib.Path:
    """Return the absolute path of the installed SDD plugin.

    Priority order:
    1. `$CLAUDE_PLUGIN_ROOT` env var (set by Claude Code at skill invocation time).
    2. Walk up from this file: skills/doctor/init.py → skills/doctor/ → skills/ → plugin root.
    """
    env = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if env:
        return pathlib.Path(env).resolve()
    return pathlib.Path(__file__).resolve().parent.parent.parent


# ────────────────────────────────────────────────────────────────────────────
# Constitution + CLAUDE.md setup (handles migration from v0.2.0 single-file layout)
# ────────────────────────────────────────────────────────────────────────────


def _extract_h2_sections(markdown: str) -> dict[str, str]:
    """Parse `## Heading` sections from a markdown document.

    Returns a dict mapping the heading text (without the `## ` prefix) to the section body
    (everything between this heading and the next `## ` or end of file, trimmed).
    """
    sections: dict[str, str] = {}
    # Heading line plus body up to next H2 or EOF
    pattern = re.compile(r"^## (.+?)\n(.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL)
    for match in pattern.finditer(markdown):
        heading = match.group(1).strip()
        body = match.group(2).strip()
        sections[heading] = body
    return sections


def _match_marker_heading(heading: str, marker_heading: str) -> bool:
    """Loose match between a CLAUDE.md heading and a constitution MIGRATED:* marker name.

    The legacy CLAUDE.md template used these headings:
        Tech stack
        Run/build commands
        Architecture (one-liner)
        Code conventions
        WHAT NOT TO DO ⛔
        SDD flow

    The constitution template carries markers with the same names plus a few variants.
    Compare case-insensitively and ignore trailing emoji / parenthetical content.
    """
    def normalize(s: str) -> str:
        s = re.sub(r"\([^)]*\)", "", s)        # drop "(one-liner)" etc.
        s = re.sub(r"[^\w\s/-]", "", s)         # drop emoji + non-word punctuation
        return " ".join(s.lower().split())
    return normalize(heading) == normalize(marker_heading)


def migrate_claude_md_to_constitution(
    claude_md: pathlib.Path,
    constitution: pathlib.Path,
    templates_dir: pathlib.Path,
) -> list[str]:
    """Seed `specs/constitution.md` from an existing CLAUDE.md.

    Reads the constitution template, finds each `<!-- MIGRATED:<heading> -->` marker,
    and replaces it with the matching section from CLAUDE.md (loose heading match).
    Returns the list of headings that were migrated, for reporting.
    """
    template = (templates_dir / "constitution.md.template").read_text(encoding="utf-8")
    old_sections = _extract_h2_sections(claude_md.read_text(encoding="utf-8"))

    migrated: list[str] = []

    def replace(match: re.Match[str]) -> str:
        marker_heading = match.group(1).strip()
        for heading, body in old_sections.items():
            if _match_marker_heading(heading, marker_heading):
                migrated.append(heading)
                return body + "\n\n<!-- TODO: add rationale / WHY -->"
        # No match found — leave the marker placeholder copy from the template (next to the marker).
        # Returning empty string would delete the placeholder body too aggressively;
        # we just remove the marker comment so the user sees the bare placeholders.
        return ""

    rendered = MIGRATED_MARKER_RE.sub(replace, template)

    constitution.parent.mkdir(parents=True, exist_ok=True)
    constitution.write_text(rendered, encoding="utf-8")
    return migrated


def _rename_legacy_underscored_files(project_root: pathlib.Path, *, dry_run: bool) -> list[str]:
    """v0.3.0 → v0.4.0 path migration: drop the `_` prefix from `specs/_constitution.md`
    and `specs/_template.md`. Idempotent — if the new name already exists, the legacy file
    is left untouched (won't clobber). After renaming, also patch any pointer reference in
    CLAUDE.md from `specs/_constitution.md` → `specs/constitution.md` (path-only fix; never
    touches user-authored content). Returns status lines.
    """
    moves: list[str] = []
    for legacy_name, new_name in [("_constitution.md", "constitution.md"), ("_template.md", "template.md")]:
        legacy = project_root / "specs" / legacy_name
        target = project_root / "specs" / new_name
        if legacy.exists() and not target.exists():
            if dry_run:
                moves.append(f"  legacy rename        — would-rename: specs/{legacy_name} → specs/{new_name}")
            else:
                legacy.rename(target)
                moves.append(f"  legacy rename        — renamed: specs/{legacy_name} → specs/{new_name}")

    # Pointer-string fix in CLAUDE.md (path only — never modifies user-authored content).
    claude_md = project_root / "CLAUDE.md"
    if claude_md.exists():
        text = claude_md.read_text(encoding="utf-8")
        if "specs/_constitution.md" in text:
            new_text = text.replace("specs/_constitution.md", "specs/constitution.md")
            if dry_run:
                moves.append(f"  CLAUDE.md pointer    — would-patch: specs/_constitution.md → specs/constitution.md")
            else:
                claude_md.write_text(new_text, encoding="utf-8")
                moves.append(f"  CLAUDE.md pointer    — patched: specs/_constitution.md → specs/constitution.md")
    return moves


def setup_constitution(
    project_root: pathlib.Path,
    templates_dir: pathlib.Path,
    *,
    dry_run: bool,
) -> list[str]:
    """Bootstrap `specs/constitution.md` and `CLAUDE.md` according to the four-case matrix.

    Returns a list of human-readable status lines for the caller to print.
    """
    # Migrate v0.3.0 underscored filenames (`_constitution.md`, `_template.md`) BEFORE
    # the case-matrix check so the new paths are visible to the existence tests below.
    lines: list[str] = _rename_legacy_underscored_files(project_root, dry_run=dry_run)

    constitution_path = project_root / "specs" / "constitution.md"
    claude_md_path = project_root / "CLAUDE.md"

    has_constitution = constitution_path.exists()
    has_claude_md = claude_md_path.exists()

    if has_constitution and has_claude_md:
        lines.append(f"  constitution         — skipped: both files already present")
        lines.append(f"  CLAUDE.md (loader)   — skipped: present")
        return lines

    if not has_constitution and has_claude_md:
        # Migration v0.2.0 → v0.3.0
        if dry_run:
            lines.append(f"  constitution         — would-migrate from existing CLAUDE.md → {constitution_path}")
            lines.append(f"  CLAUDE.md (loader)   — would-regenerate as condensed loader: {claude_md_path}")
            return lines
        migrated = migrate_claude_md_to_constitution(claude_md_path, constitution_path, templates_dir)
        # Overwrite CLAUDE.md with the new condensed loader template.
        shutil.copyfile(templates_dir / "CLAUDE.md.template", claude_md_path)
        if migrated:
            lines.append(f"  constitution         — migrated from CLAUDE.md ({len(migrated)} sections: {', '.join(migrated)}): {constitution_path}")
        else:
            lines.append(f"  constitution         — bootstrapped (no migratable sections found in CLAUDE.md): {constitution_path}")
        lines.append(f"  CLAUDE.md (loader)   — regenerated as condensed loader: {claude_md_path}")
        return lines

    if not has_constitution and not has_claude_md:
        # Fresh install
        if dry_run:
            lines.append(f"  constitution         — would-copy fresh: {constitution_path}")
            lines.append(f"  CLAUDE.md (loader)   — would-copy fresh: {claude_md_path}")
            return lines
        constitution_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(templates_dir / "constitution.md.template", constitution_path)
        shutil.copyfile(templates_dir / "CLAUDE.md.template", claude_md_path)
        lines.append(f"  constitution         — created: {constitution_path}")
        lines.append(f"  CLAUDE.md (loader)   — created: {claude_md_path}")
        return lines

    # constitution exists, CLAUDE.md missing (rare)
    if dry_run:
        lines.append(f"  CLAUDE.md (loader)   — would-copy fresh: {claude_md_path}")
        return lines
    shutil.copyfile(templates_dir / "CLAUDE.md.template", claude_md_path)
    lines.append(f"  constitution         — skipped: already present")
    lines.append(f"  CLAUDE.md (loader)   — created: {claude_md_path}")
    return lines


# ────────────────────────────────────────────────────────────────────────────
# Capability registry generation
# ────────────────────────────────────────────────────────────────────────────


def scan_plugin_capabilities() -> dict[str, list[dict[str, str]]]:
    """Scan ~/.claude/plugins/cache/ for installed skills and agents."""
    plugins_dir = pathlib.Path.home() / ".claude" / "plugins" / "cache"
    result: dict[str, list[dict[str, str]]] = {"agents": [], "skills": []}
    if not plugins_dir.exists():
        return result

    for plugin in plugins_dir.iterdir():
        if not plugin.is_dir():
            continue
        plugin_name = plugin.name
        for agent_dir in plugin.rglob("agents"):
            if not agent_dir.is_dir():
                continue
            for agent_file in agent_dir.glob("*.md"):
                frontmatter = _parse_frontmatter(agent_file.read_text(encoding="utf-8"))
                result["agents"].append(
                    {
                        "name": frontmatter.get("name", agent_file.stem),
                        "description": frontmatter.get("description", "")[:200],
                        "plugin": plugin_name,
                    }
                )
        for skill_md in plugin.rglob("SKILL.md"):
            frontmatter = _parse_frontmatter(skill_md.read_text(encoding="utf-8"))
            result["skills"].append(
                {
                    "name": frontmatter.get("name", skill_md.parent.name),
                    "description": frontmatter.get("description", "")[:200],
                    "plugin": plugin_name,
                }
            )
    return result


def _parse_frontmatter(text: str) -> dict[str, str]:
    """Minimal YAML frontmatter parser (name + description, no nested structures)."""
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    fm_text = text[3:end]
    out: dict[str, str] = {}
    current_key: str | None = None
    for line in fm_text.splitlines():
        if not line.strip():
            continue
        if ":" in line and not line.startswith(" "):
            key, _, val = line.partition(":")
            out[key.strip()] = val.strip().strip('"').strip("'")
            current_key = key.strip()
        elif current_key and line.startswith(" "):
            out[current_key] = (out[current_key] + " " + line.strip()).strip()
    return out


def _extract_user_override_sections(text: str) -> dict[str, str]:
    """Extract sections marked <!-- user-override --> from capabilities.md."""
    sections: dict[str, str] = {}
    pattern = re.compile(
        r"^(## (.+?))\s*\n\n<!-- user-override -->\n(.*?)(?=^## |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    for match in pattern.finditer(text):
        title = match.group(2).strip()
        body = match.group(0)
        sections[title] = body.rstrip() + "\n"
    return sections


def generate_capabilities_md(project_root: pathlib.Path, plugin_root: pathlib.Path) -> str:
    """Render `.claude/capabilities.md` for the target project.

    Auto-generated sections are always overwritten. Sections marked
    <!-- user-override --> in the existing file are preserved verbatim.
    """
    stack = detect_stack(project_root)
    caps = scan_plugin_capabilities()

    lines: list[str] = []
    lines.append("# Project Capabilities\n")
    lines.append("> Auto-generated by `/sdd:doctor init`. Sections marked")
    lines.append("> `<!-- user-override -->` are preserved on re-init.\n")

    # Specialist agents
    lines.append("## Specialist agents (delegate implementation work)\n")
    lines.append("<!-- auto-generated -->")
    if caps["agents"]:
        for a in sorted(caps["agents"], key=lambda x: x["name"]):
            lines.append(f"- **{a['name']}** ({a['plugin']}) — {a['description']}")
    else:
        lines.append("- _(no specialist agents — install a plugin marketplace)_")
    lines.append("")

    # Skills
    lines.append("## Skills (load into context on demand)\n")
    lines.append("<!-- auto-generated -->")
    if caps["skills"]:
        for s in sorted(caps["skills"], key=lambda x: x["name"]):
            lines.append(f"- `{s['name']}` ({s['plugin']}) — {s['description']}")
    else:
        lines.append("- _(no skills — install a plugin marketplace)_")
    lines.append("")

    # Stack profile
    lines.append("## Stack profile\n")
    lines.append("<!-- auto-generated -->")
    for k, v in stack.items():
        lines.append(f"- **{k}**: {v}")
    lines.append("")

    auto_text = "\n".join(lines)

    # Read the canonical user-override sections from the bundled template.
    template_path = plugin_root / "skills" / "doctor" / "templates" / "capabilities.md.template"
    overrides_default = ""
    if template_path.exists():
        full = template_path.read_text(encoding="utf-8")
        # Strip everything up to the first user-override section, keep the rest.
        match = re.search(r"^## .+?\n\n<!-- user-override -->", full, re.MULTILINE)
        if match:
            overrides_default = full[match.start():]
        else:
            overrides_default = ""

    # Preserve user-overrides from any existing file in the target project.
    existing_path = project_root / ".claude" / "capabilities.md"
    if existing_path.exists():
        existing = existing_path.read_text(encoding="utf-8")
        preserved = _extract_user_override_sections(existing)
        for title, body in preserved.items():
            pattern = re.compile(
                rf"^## {re.escape(title)}\s*\n\n<!-- user-override -->.*?(?=^## |\Z)",
                re.MULTILINE | re.DOTALL,
            )
            if pattern.search(overrides_default):
                overrides_default = pattern.sub(body, overrides_default)
            else:
                overrides_default = overrides_default.rstrip() + "\n\n" + body

    return auto_text + "\n" + overrides_default


# ────────────────────────────────────────────────────────────────────────────
# Settings.json rendering
# ────────────────────────────────────────────────────────────────────────────


def render_settings_json(plugin_root: pathlib.Path) -> str:
    """Render `.claude/settings.json` from the bundled template with the plugin root substituted in."""
    template_path = plugin_root / "skills" / "doctor" / "templates" / "settings.json.template"
    text = template_path.read_text(encoding="utf-8")
    return text.replace("${PLUGIN_ROOT}", str(plugin_root))


# ────────────────────────────────────────────────────────────────────────────
# Copy helpers
# ────────────────────────────────────────────────────────────────────────────


def copy_if_absent(src: pathlib.Path, dst: pathlib.Path, *, dry_run: bool) -> tuple[str, str]:
    """Copy file only if destination does not exist. Returns (status, message)."""
    if dst.exists():
        return ("skipped", f"already exists: {dst}")
    if dry_run:
        return ("would-copy", f"{dst}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    return ("copied", f"{dst}")


# ────────────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Target project root (default: cwd)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without writing")
    args = parser.parse_args()

    project_root = pathlib.Path(args.root).resolve()
    plugin_root = resolve_plugin_root()

    print(f"🔌 Plugin root:  {plugin_root}")
    print(f"📁 Project root: {project_root}")
    print()

    templates_dir = plugin_root / "skills" / "doctor" / "templates"
    if not templates_dir.exists():
        print(f"❌ Template bundle missing at {templates_dir}", file=sys.stderr)
        print("   Is the plugin correctly installed?", file=sys.stderr)
        return 1

    # 1. Constitution + CLAUDE.md (handles four cases including v0.2.0 → v0.3.0 migration).
    for line in setup_constitution(project_root, templates_dir, dry_run=args.dry_run):
        print(line)

    # 2. specs/template.md
    status, msg = copy_if_absent(
        templates_dir / "specs" / "template.md",
        project_root / "specs" / "template.md",
        dry_run=args.dry_run,
    )
    print(f"  specs/template.md   — {status}: {msg}")

    # 3. .claude/capabilities.md — always regenerate (preserves user-overrides internally)
    caps_path = project_root / ".claude" / "capabilities.md"
    caps_content = generate_capabilities_md(project_root, plugin_root)
    if args.dry_run:
        print(f"  capabilities.md      — would-regenerate: {caps_path}")
    else:
        caps_path.parent.mkdir(parents=True, exist_ok=True)
        caps_path.write_text(caps_content, encoding="utf-8")
        print(f"  capabilities.md      — regenerated: {caps_path}")

    # 4. .claude/settings.json — render with plugin root substituted in
    settings_path = project_root / ".claude" / "settings.json"
    settings_content = render_settings_json(plugin_root)
    if args.dry_run:
        print(f"  settings.json        — would-write: {settings_path}")
    else:
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        settings_path.write_text(settings_content, encoding="utf-8")
        print(f"  settings.json        — written: {settings_path}")

    # Final report
    print()
    report = run_all_checks(project_root)
    print(f"Final status: {report['status']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
