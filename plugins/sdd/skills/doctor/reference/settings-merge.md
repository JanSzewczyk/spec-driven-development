# Safe-merge procedure for `.claude/settings.json`

This is the **one** sensitive operation in `/sdd:doctor init`. A careless edit can corrupt
the user's `permissions`, MCP config, model setting, or their own hooks. Follow this as a
**mechanical, numbered procedure** — never "edit by judgment".

The goal: ensure the project's `.claude/settings.json` has PostToolUse hook entries pointing
at the project-local SDD hook scripts, while **preserving every other key untouched** and
**never duplicating** SDD entries on re-run.

## SDD hook markers

An entry is "SDD-managed" (and therefore ours to strip/replace) iff any of its inner
`hooks[].command` strings contains one of these substrings:

- `.claude/hooks/typecheck.sh`   ← current
- `.claude/hooks/lint.sh`         ← current
- `hooks/typecheck.py`            ← legacy (v0.4 plugin-path install)
- `hooks/lint.sh`                 ← legacy (v0.4 plugin-path install)

Matching the legacy markers means a re-init on an upgraded project cleans up stale entries.

## The fresh entry to install

Build the inner `hooks` list from what `init` detected — include the typecheck command only if
a typecheck tool was detected, the lint command only if a lint tool was detected:

```json
{
  "matcher": "Edit|Write|MultiEdit",
  "hooks": [
    { "type": "command", "command": "bash .claude/hooks/typecheck.sh" },
    { "type": "command", "command": "bash .claude/hooks/lint.sh" }
  ]
}
```

Paths are **relative to the project root** — Claude Code runs hooks with the project root as cwd.

## Procedure

1. **Resolve the path** to `<project>/.claude/settings.json` (project root = current working
   directory, NOT the plugin root).
2. **If the file does not exist or is empty:** start from `{ "$schema": "https://json.schemastore.org/claude-code-settings" }`.
3. **If the file exists:** read it and parse as JSON.
   - **If parsing fails (malformed JSON): STOP. Do not write anything.** Report to the user:
     "`.claude/settings.json` is malformed JSON — refusing to touch it. Fix it manually and
     re-run `/sdd:doctor init`." This is non-negotiable; a corrupt file must never be clobbered.
4. **Work on the parsed object.** Ensure `hooks` (object) and `hooks.PostToolUse` (array) exist.
5. **Strip stale SDD entries:** remove from `PostToolUse` every entry that is SDD-managed
   (per the markers above). Count how many you removed. **Leave every non-SDD entry in place**
   (the user's own hooks, other matchers, etc.).
6. **Append the fresh entry** built above — but only if at least one hookable tool was detected.
   If no hookable tools were detected, append nothing (you've still stripped stale entries).
7. **Preserve all other top-level keys verbatim** — `permissions`, `model`, `env`, `mcpServers`,
   `enabledPlugins`, and anything else. Only the `hooks.PostToolUse` array is edited.
8. **Write** the result with 2-space indentation and a trailing newline.

## Edge cases

- **No hookable tools + no existing file:** write a minimal `{ "$schema": ... }` so the file
  exists (check then warns instead of fails — honest, not a failure).
- **No hookable tools + existing file with no SDD entries:** nothing to do; leave the file unchanged.
- **No hookable tools + existing file WITH stale SDD entries:** strip them, write the result.
- **Re-run with the same stack:** strip the one SDD entry, re-append an identical one → net no
  duplication. This is what makes init idempotent.
