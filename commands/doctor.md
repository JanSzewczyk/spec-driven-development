---
description: Audit project SDD readiness (or init/fix). Wrapper over the doctor skill.
argument-hint: "check | init | fix <ids>"
allowed-tools: Bash, Read, Write, Edit
---

Invoke the `doctor` skill with the user-supplied argument (`$ARGUMENTS`).

If `$ARGUMENTS` is empty or contains "check", run:
```bash
python3 .claude/skills/doctor/check.py --json
```

If `$ARGUMENTS` contains "init" or "setup", run:
```bash
python3 .claude/skills/doctor/init.py
```

If `$ARGUMENTS` contains "fix N M ..." (where N, M are numbers), run:
```bash
python3 .claude/skills/doctor/init.py --fix N M ...
```

After execution, format the report following the instructions in
`.claude/skills/doctor/SKILL.md` section "Output report — format".
