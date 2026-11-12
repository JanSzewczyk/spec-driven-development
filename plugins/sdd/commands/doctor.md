---
description: Audit SDD readiness (`check`) or set it up (`init`)
argument-hint: "check | init"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
---

Run the `doctor` skill (`${CLAUDE_PLUGIN_ROOT}/skills/doctor/SKILL.md`) with `$ARGUMENTS`:
empty / "check" / "audit" → `check`; "init" / "setup" / "fix" → `init`.
