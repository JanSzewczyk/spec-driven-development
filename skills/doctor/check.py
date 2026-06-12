#!/usr/bin/env python3
"""SDD Doctor — readiness check (plugin context).

Runs 11 checks against the target project plus the installed plugin and returns
a JSON report on stdout.

Usage:
    python3 skills/doctor/check.py [--json] [--root <project-path>]
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
from typing import Any

# CLAUDE.md is the lightweight session loader. It should at minimum reference the constitution
# and document the operational essentials.
REQUIRED_CLAUDE_SECTIONS = ["Tech stack", "Run/build"]
CONSTITUTION_POINTER = "specs/constitution.md"
# specs/constitution.md is the long-form source of truth. The detailed sections live here.
REQUIRED_CONSTITUTION_SECTIONS = ["Tech stack", "Run/build", "Conventions", "WHAT NOT TO DO"]
REQUIRED_TEMPLATE_FIELDS = [
    "Summary",
    "User stories",
    "Acceptance criteria",
    "Edge cases",
    "Open questions",
    "Testing guidelines",
]
PLUGIN_NAME = "sdd"
TOKEN_LIMIT_CLAUDE_MD = 2500


# ────────────────────────────────────────────────────────────────────────────
# Plugin root resolution
# ────────────────────────────────────────────────────────────────────────────


def resolve_plugin_root() -> pathlib.Path:
    """Return the absolute path of the installed SDD plugin."""
    env = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if env:
        return pathlib.Path(env).resolve()
    return pathlib.Path(__file__).resolve().parent.parent.parent


def estimate_tokens(text: str) -> int:
    """Rough estimate: ~4 characters per token for English/Polish prose."""
    return len(text) // 4


# ────────────────────────────────────────────────────────────────────────────
# Per-project checks
# ────────────────────────────────────────────────────────────────────────────


def check_claude_md(root: pathlib.Path) -> dict[str, Any]:
    path = root / "CLAUDE.md"
    if not path.exists():
        return {"status": "fail", "message": "CLAUDE.md does not exist at the project root"}
    text = path.read_text(encoding="utf-8")
    tokens = estimate_tokens(text)
    issues: list[str] = []
    missing = [s for s in REQUIRED_CLAUDE_SECTIONS if s.lower() not in text.lower()]
    if missing:
        issues.append(f"missing sections: {', '.join(missing)}")
    if CONSTITUTION_POINTER not in text:
        issues.append(f"no pointer to {CONSTITUTION_POINTER}")
    if tokens > TOKEN_LIMIT_CLAUDE_MD:
        issues.append(f"{tokens} tokens — exceeds limit {TOKEN_LIMIT_CLAUDE_MD} (consider sharding)")
    if issues:
        return {"status": "warn", "message": f"{tokens} tokens; " + "; ".join(issues)}
    return {"status": "pass", "message": f"{tokens} tokens; pointer to constitution present"}


def check_constitution(root: pathlib.Path) -> dict[str, Any]:
    path = root / "specs" / "constitution.md"
    if not path.exists():
        return {"status": "fail", "message": "specs/constitution.md does not exist"}
    text = path.read_text(encoding="utf-8")
    missing = [s for s in REQUIRED_CONSTITUTION_SECTIONS if s.lower() not in text.lower()]
    if missing:
        return {"status": "warn", "message": f"missing sections: {', '.join(missing)}"}
    return {"status": "pass", "message": f"{len(REQUIRED_CONSTITUTION_SECTIONS)}/{len(REQUIRED_CONSTITUTION_SECTIONS)} required sections present"}


def check_specs_template(root: pathlib.Path) -> dict[str, Any]:
    path = root / "specs" / "template.md"
    if not path.exists():
        return {"status": "fail", "message": "specs/template.md does not exist"}
    text = path.read_text(encoding="utf-8")
    missing = [f for f in REQUIRED_TEMPLATE_FIELDS if f not in text]
    if missing:
        return {"status": "warn", "message": f"missing fields: {', '.join(missing)}"}
    return {"status": "pass", "message": "all required fields present"}


def check_capabilities(root: pathlib.Path) -> dict[str, Any]:
    path = root / ".claude" / "capabilities.md"
    if not path.exists():
        return {"status": "fail", "message": ".claude/capabilities.md does not exist"}
    text = path.read_text(encoding="utf-8")
    required_sections = [
        "Specialist agents",
        "Skills",
        "Stack profile",
        "Task type",
    ]
    missing = [s for s in required_sections if s not in text]
    if missing:
        return {"status": "warn", "message": f"missing sections: {', '.join(missing)}"}
    return {"status": "pass", "message": "4/4 sections present"}


def check_settings_hooks(root: pathlib.Path) -> dict[str, Any]:
    path = root / ".claude" / "settings.json"
    if not path.exists():
        return {"status": "fail", "message": ".claude/settings.json does not exist"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return {"status": "fail", "message": f"settings.json invalid JSON: {e}"}
    hooks = data.get("hooks", {}).get("PostToolUse", [])
    if not hooks:
        return {"status": "warn", "message": "no PostToolUse hooks configured"}
    # Verify commands reference the plugin's hook scripts.
    flat_cmds = [
        h.get("command", "")
        for entry in hooks
        for h in entry.get("hooks", [])
    ]
    if not any("hooks/typecheck" in c or "hooks/lint" in c for c in flat_cmds):
        return {"status": "warn", "message": "hooks present but do not reference plugin hook scripts"}
    return {"status": "pass", "message": f"{len(hooks)} PostToolUse hook(s)"}


def check_git_gh(root: pathlib.Path) -> dict[str, Any]:
    if not (root / ".git").exists():
        return {"status": "fail", "message": "no git repository"}
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        dirty = bool(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return {"status": "warn", "message": "git CLI unavailable"}
    gh_ok = shutil.which("gh") is not None
    msg_parts = []
    if dirty:
        msg_parts.append("uncommitted changes")
    msg_parts.append("gh CLI: " + ("ok" if gh_ok else "missing"))
    status = "warn" if (dirty or not gh_ok) else "pass"
    return {"status": status, "message": "; ".join(msg_parts)}


# ────────────────────────────────────────────────────────────────────────────
# Plugin presence checks (replace per-project commands/agents checks)
# ────────────────────────────────────────────────────────────────────────────


def check_plugin_installed() -> dict[str, Any]:
    """Verify the SDD plugin is installed under ~/.claude/plugins/cache/."""
    plugin_root = resolve_plugin_root()
    manifest = plugin_root / "plugin.json"
    if not manifest.exists():
        return {
            "status": "fail",
            "message": f"plugin.json not found at {plugin_root} — is the plugin installed?",
        }
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return {"status": "fail", "message": f"plugin.json invalid JSON: {e}"}
    name = data.get("name", "")
    version = data.get("version", "?")
    if name != PLUGIN_NAME:
        return {"status": "warn", "message": f"plugin.json name='{name}' (expected '{PLUGIN_NAME}')"}
    return {"status": "pass", "message": f"{name}@{version} at {plugin_root}"}


def check_plugin_enabled() -> dict[str, Any]:
    """Verify the plugin is enabled in the user's Claude Code settings."""
    user_settings = pathlib.Path.home() / ".claude" / "settings.json"
    if not user_settings.exists():
        return {"status": "warn", "message": "~/.claude/settings.json not found"}
    try:
        data = json.loads(user_settings.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"status": "warn", "message": "user settings.json invalid JSON"}
    enabled = data.get("enabledPlugins") or data.get("plugins") or {}
    # Different Claude Code versions use different shapes; check broadly.
    enabled_names: set[str] = set()
    if isinstance(enabled, dict):
        enabled_names = {k.split("@")[0] for k in enabled.keys()}
    elif isinstance(enabled, list):
        enabled_names = {str(e).split("@")[0] for e in enabled}
    if PLUGIN_NAME in enabled_names or any(PLUGIN_NAME in n for n in enabled_names):
        return {"status": "pass", "message": "enabled in user settings"}
    return {"status": "warn", "message": "plugin not listed in enabledPlugins (may still work if auto-loaded)"}


# ────────────────────────────────────────────────────────────────────────────
# Stack + tooling
# ────────────────────────────────────────────────────────────────────────────


def detect_stack(root: pathlib.Path) -> dict[str, Any]:
    pkg = root / "package.json"
    pyproject = root / "pyproject.toml"
    cargo = root / "Cargo.toml"

    info: dict[str, Any] = {"framework": "unknown", "language": "unknown"}

    if pkg.exists():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        info["language"] = "typescript" if "typescript" in deps else "javascript"
        if "next" in deps:
            info["framework"] = "nextjs"
        elif "react" in deps:
            info["framework"] = "react"
        elif "express" in deps or "fastify" in deps:
            info["framework"] = "node-server"
        else:
            info["framework"] = "node"
        info["tests"] = [k for k in ("vitest", "jest", "playwright", "@storybook/test") if k in deps]
    elif pyproject.exists():
        info["language"] = "python"
        info["framework"] = "python"
    elif cargo.exists():
        info["language"] = "rust"
        info["framework"] = "rust"

    return info


def check_tooling(root: pathlib.Path, stack: dict[str, Any]) -> dict[str, Any]:
    if stack["language"] in ("typescript", "javascript"):
        if not (root / "node_modules").exists():
            return {"status": "warn", "message": "node_modules missing — run install"}
        return {"status": "pass", "message": "node_modules present"}
    if stack["language"] == "python":
        py_tools = [t for t in ("mypy", "ruff", "pytest") if shutil.which(t)]
        if len(py_tools) < 2:
            return {"status": "warn", "message": f"found only: {', '.join(py_tools) or 'none'}"}
        return {"status": "pass", "message": f"{', '.join(py_tools)} ok"}
    return {"status": "warn", "message": "unknown stack — skipping"}


def check_specialist_agents() -> dict[str, Any]:
    """Scan ~/.claude/plugins/cache/ for available specialist sub-agents (excluding our own)."""
    plugins_dir = pathlib.Path.home() / ".claude" / "plugins" / "cache"
    if not plugins_dir.exists():
        return {"status": "warn", "message": "no ~/.claude/plugins/cache/ directory"}
    agents: list[str] = []
    for plugin in plugins_dir.iterdir():
        if not plugin.is_dir():
            continue
        # Skip our own plugin's agents — they are the verification agents, not specialists.
        if plugin.name == PLUGIN_NAME:
            continue
        for agent_dir in plugin.rglob("agents"):
            if agent_dir.is_dir():
                agents.extend(p.stem for p in agent_dir.glob("*.md"))
    if not agents:
        return {"status": "warn", "message": "no specialist agents in installed plugins"}
    return {"status": "pass", "message": f"found: {', '.join(sorted(set(agents))[:5])}..."}


def check_project_type(stack: dict[str, Any]) -> dict[str, Any]:
    fw = stack.get("framework", "unknown")
    if fw == "unknown":
        return {"status": "warn", "message": "project type not detected"}
    return {"status": "pass", "message": f"detected: {fw}"}


# ────────────────────────────────────────────────────────────────────────────
# Aggregate
# ────────────────────────────────────────────────────────────────────────────


def run_all_checks(root: pathlib.Path) -> dict[str, Any]:
    stack = detect_stack(root)
    checks = [
        {"id": 1, "name": "CLAUDE.md (loader)", **check_claude_md(root)},
        {"id": 2, "name": "specs/template.md", **check_specs_template(root)},
        {"id": 3, "name": "Plugin installed", **check_plugin_installed()},
        {"id": 4, "name": "Plugin enabled", **check_plugin_enabled()},
        {"id": 5, "name": ".claude/capabilities.md", **check_capabilities(root)},
        {"id": 6, "name": ".claude/settings.json hooks", **check_settings_hooks(root)},
        {"id": 7, "name": "Git + gh", **check_git_gh(root)},
        {"id": 8, "name": "Tooling", **check_tooling(root, stack)},
        {"id": 9, "name": "Specialist agents", **check_specialist_agents()},
        {"id": 10, "name": "Project type", **check_project_type(stack)},
        {"id": 11, "name": "specs/constitution.md", **check_constitution(root)},
    ]

    fails = sum(1 for c in checks if c["status"] == "fail")
    warns = sum(1 for c in checks if c["status"] == "warn")

    if fails >= 3:
        status = "NOT_READY"
    elif fails > 0 or warns > 0:
        status = "PARTIAL"
    else:
        status = "READY"

    return {"status": status, "checks": checks, "stack": stack}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Project root (default: cwd)")
    parser.add_argument("--json", action="store_true", help="Output JSON only")
    args = parser.parse_args()

    root = pathlib.Path(args.root).resolve()
    report = run_all_checks(root)

    if args.json:
        json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
    else:
        print(f"Status: {report['status']}")
        for c in report["checks"]:
            icon = {"pass": "✅", "warn": "⚠️ ", "fail": "❌"}[c["status"]]
            print(f"  {icon} [{c['id']:>2}] {c['name']}: {c['message']}")
        print()
        print(f"Stack: {report['stack']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
