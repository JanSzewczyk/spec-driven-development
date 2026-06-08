#!/usr/bin/env python3
"""SDD typecheck hook — blocks Claude (exit 2) when typecheck fails.

Invoked by the PostToolUse hook after Edit/Write/MultiEdit.
Reads JSON from stdin (tool_input.file_path), selects a typechecker by file extension,
runs it, and on failure prints to stderr and exits with code 2.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # nothing to do

    file_path = data.get("tool_input", {}).get("file_path", "")
    if not file_path:
        return 0

    path = pathlib.Path(file_path)
    if not path.exists():
        return 0

    ext = path.suffix.lower()
    cmd: list[str] | None = None

    if ext in {".ts", ".tsx"}:
        # Checks the WHOLE project — slower but catches cross-file errors.
        # If you prefer single-file: ["npx", "tsc", "--noEmit", str(path)]
        cmd = ["npx", "--no-install", "tsc", "--noEmit"]
    elif ext == ".py":
        cmd = ["python3", "-m", "mypy", "--strict", str(path)]

    if cmd is None:
        return 0  # unsupported extension

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        # typechecker not installed — do not block
        return 0
    except subprocess.TimeoutExpired:
        print("typecheck: timeout (60s)", file=sys.stderr)
        return 0

    if result.returncode != 0:
        print(
            f"❌ Typecheck failed for {path.name}:\n{result.stdout}{result.stderr}",
            file=sys.stderr,
        )
        return 2  # exit 2 = blocks Claude, forces a fix

    return 0


if __name__ == "__main__":
    sys.exit(main())
