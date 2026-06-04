#!/usr/bin/env python3
"""SDD Doctor — readiness check.

Runs 10 checks and returns a JSON report on stdout.

Usage:
    python3 .claude/skills/sdd-doctor/check.py [--json] [--root <path>]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
from typing import Any

REQUIRED_CLAUDE_SECTIONS = ["Tech stack", "Run/build", "Conventions", "WHAT NOT TO DO"]
REQUIRED_TEMPLATE_FIELDS = [
    "Summary",
    "User stories",
    "Acceptance criteria",
    "Edge cases",
    "Open questions",
    "Testing guidelines",
]
REQUIRED_COMMANDS = [
    "sdd-doctor",
    "constitution",
    "spec",
    "clarify",
    "plan",
    "tasks",
    "implement",
    "review",
    "analyze",
]
REQUIRED_AGENTS = ["sdd-spec-guard", "sdd-drift-detector", "sdd-reviewer", "sdd-ui-critic"]
TOKEN_LIMIT_CLAUDE_MD = 2500


def estimate_tokens(text: str) -> int:
    """Rough estimate: ~4 characters per token for English/Polish prose."""
    return len(text) // 4


def check_claude_md(root: pathlib.Path) -> dict[str, Any]:
    path = root / "CLAUDE.md"
    if not path.exists():
        return {"status": "fail", "message": "CLAUDE.md does not exist at the project root"}
    text = path.read_text(encoding="utf-8")
    tokens = estimate_tokens(text)
    missing = [s for s in REQUIRED_CLAUDE_SECTIONS if s.lower() not in text.lower()]
    if missing:
        return {
            "status": "warn",
            "message": f"{tokens} tokens; missing sections: {', '.join(missing)}",
        }
    if tokens > TOKEN_LIMIT_CLAUDE_MD:
        return {
            "status": "warn",
            "message": f"{tokens} tokens — exceeds limit {TOKEN_LIMIT_CLAUDE_MD} (consider sharding)",
        }
    return {"status": "pass", "message": f"{tokens} tokens"}


def check_specs_template(root: pathlib.Path) -> dict[str, Any]:
    path = root / "specs" / "_template.md"
    if not path.exists():
        return {"status": "fail", "message": "specs/_template.md does not exist"}
    text = path.read_text(encoding="utf-8")
    missing = [f for f in REQUIRED_TEMPLATE_FIELDS if f not in text]
    if missing:
        return {"status": "warn", "message": f"missing fields: {', '.join(missing)}"}
    return {"status": "pass", "message": "all required fields present"}


def check_commands(root: pathlib.Path) -> dict[str, Any]:
    cmd_dir = root / ".claude" / "commands"
    if not cmd_dir.exists():
        return {"status": "fail", "message": ".claude/commands/ does not exist"}
    present = {p.stem for p in cmd_dir.glob("*.md")}
    missing = [c for c in REQUIRED_COMMANDS if c not in present]
    if missing:
        return {"status": "warn", "message": f"missing: {', '.join(missing)}"}
    return {"status": "pass", "message": f"{len(REQUIRED_COMMANDS)} commands present"}


def check_agents(root: pathlib.Path) -> dict[str, Any]:
    agent_dir = root / ".claude" / "agents"
    if not agent_dir.exists():
        return {"status": "fail", "message": ".claude/agents/ does not exist"}
    present = {p.stem for p in agent_dir.glob("*.md")}
    missing = [a for a in REQUIRED_AGENTS if a not in present]
    if missing:
        return {"status": "warn", "message": f"missing: {', '.join(missing)}"}
    return {"status": "pass", "message": f"{len(REQUIRED_AGENTS)} generic SDD agents present"}


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
    """Scans ~/.claude/plugins/cache/ for available sub-agents."""
    plugins_dir = pathlib.Path.home() / ".claude" / "plugins" / "cache"
    if not plugins_dir.exists():
        return {"status": "warn", "message": "no ~/.claude/plugins/cache/ directory"}
    agents: list[str] = []
    for plugin in plugins_dir.iterdir():
        if not plugin.is_dir():
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


def run_all_checks(root: pathlib.Path) -> dict[str, Any]:
    stack = detect_stack(root)
    checks = [
        {"id": 1, "name": "CLAUDE.md", **check_claude_md(root)},
        {"id": 2, "name": "specs/_template.md", **check_specs_template(root)},
        {"id": 3, "name": ".claude/commands/", **check_commands(root)},
        {"id": 4, "name": ".claude/agents/", **check_agents(root)},
        {"id": 5, "name": ".claude/capabilities.md", **check_capabilities(root)},
        {"id": 6, "name": ".claude/settings.json hooks", **check_settings_hooks(root)},
        {"id": 7, "name": "Git + gh", **check_git_gh(root)},
        {"id": 8, "name": "Tooling", **check_tooling(root, stack)},
        {"id": 9, "name": "Specialist agents", **check_specialist_agents()},
        {"id": 10, "name": "Project type", **check_project_type(stack)},
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
        # Human-readable output for quick CLI usage
        print(f"Status: {report['status']}")
        for c in report["checks"]:
            icon = {"pass": "✅", "warn": "⚠️ ", "fail": "❌"}[c["status"]]
            print(f"  {icon} [{c['id']:>2}] {c['name']}: {c['message']}")
        print()
        print(f"Stack: {report['stack']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
