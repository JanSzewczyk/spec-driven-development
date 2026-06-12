#!/usr/bin/env python3
"""SDD typecheck hook — blocks Claude (exit 2) when typecheck fails.

Invoked by the PostToolUse hook after Edit/Write/MultiEdit. Reads JSON from stdin
(`tool_input.file_path`), picks the typechecker matching the file's extension *and*
actually available on `$PATH`, runs it, and blocks Claude only on a genuine failure.

Design notes:

- **Tool absence is never a failure.** If the expected tool isn't on PATH, exit 0 and
  let Claude continue. We want to be safe-by-default in projects where the plugin is
  installed but the relevant toolchain isn't.
- **Detection per extension** — supports `.ts/.tsx` (tsc via npx), `.py` (mypy, then
  pyright as fallback), `.rs` (cargo check), `.go` (go vet). Unsupported extensions
  silently exit 0.
- **Exit semantics** — 0: no-op or success; 2: tool ran and reported errors (blocks Claude).
"""
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys

TIMEOUT_SECONDS = 60


def _tool_available(binary: str) -> bool:
    """True iff `binary` resolves on $PATH."""
    return shutil.which(binary) is not None


def _resolve_command(path: pathlib.Path) -> list[str] | None:
    """Return the command to run for this file, or None if no supported tool is available."""
    ext = path.suffix.lower()

    if ext in {".ts", ".tsx"}:
        # tsc through npx — only useful if npx itself is on PATH.
        if _tool_available("npx"):
            return ["npx", "--no-install", "tsc", "--noEmit"]
        return None

    if ext == ".py":
        # Prefer mypy; fall back to pyright.
        if _tool_available("mypy"):
            return ["python3", "-m", "mypy", "--strict", str(path)]
        if _tool_available("pyright"):
            return ["pyright", str(path)]
        return None

    if ext == ".rs":
        if _tool_available("cargo"):
            # `cargo check` works on the whole workspace; faster than full build.
            return ["cargo", "check", "--quiet"]
        return None

    if ext == ".go":
        if _tool_available("go"):
            return ["go", "vet", "./..."]
        return None

    return None  # unsupported extension


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # nothing to do — malformed hook input, fail open

    file_path = data.get("tool_input", {}).get("file_path", "")
    if not file_path:
        return 0

    path = pathlib.Path(file_path)
    if not path.exists():
        return 0

    cmd = _resolve_command(path)
    if cmd is None:
        return 0  # unsupported extension OR required tool not on PATH — no-op

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT_SECONDS)
    except FileNotFoundError:
        # Race: tool disappeared between which() and run(). Fail open.
        return 0
    except subprocess.TimeoutExpired:
        print(f"typecheck: {' '.join(cmd)} — timeout ({TIMEOUT_SECONDS}s)", file=sys.stderr)
        return 0

    if result.returncode != 0:
        print(
            f"❌ Typecheck failed for {path.name} via `{cmd[0]}`:\n{result.stdout}{result.stderr}",
            file=sys.stderr,
        )
        return 2  # block Claude until the diagnostic is fixed

    return 0


if __name__ == "__main__":
    sys.exit(main())
