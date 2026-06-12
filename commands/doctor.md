---
description: Audit project SDD readiness (or init). Wrapper over the doctor skill.
argument-hint: "check | init"
allowed-tools: Bash, Read, Write, Edit
---

Invoke the `doctor` skill with the user-supplied argument (`$ARGUMENTS`).

The doctor scripts live inside the installed plugin. Resolve them via `${CLAUDE_PLUGIN_ROOT}` when
Claude Code exposes it, otherwise fall back to `$HOME/.claude/plugins/cache/sdd`.

If `$ARGUMENTS` is empty or contains "check", run:
```bash
python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/cache/sdd}/skills/doctor/check.py" --json
```

If `$ARGUMENTS` contains "init" or "setup", run:
```bash
python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/cache/sdd}/skills/doctor/init.py"
```

After execution, format the report following the instructions in the doctor skill's
`SKILL.md` section "Output report — format".
