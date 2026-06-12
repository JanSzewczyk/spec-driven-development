---
description: Audit project SDD readiness (or init). Wrapper over the doctor skill.
argument-hint: "check | init"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

Invoke the `doctor` skill with the user-supplied argument (`$ARGUMENTS`).

The doctor skill is **LLM-driven** — there are no Python helpers to call. You perform the
checks and file operations yourself, following the procedure in the skill's `SKILL.md`.

- If `$ARGUMENTS` is empty or contains "check" / "audit" → run the skill in **check** mode
  (report only; create nothing).
- If `$ARGUMENTS` contains "init" / "setup" / "fix" → run the skill in **init** mode (create or
  repair the per-project artifacts).

Critical reminders (full detail in `SKILL.md`):
- Write every artifact under the **project root** (your current working directory), never the
  plugin root. Read seed templates from `${CLAUDE_PLUGIN_ROOT}/skills/doctor/templates/`.
- Never overwrite an existing `specs/constitution.md`, `specs/template.md`, or hook script.
- Safe-merge `.claude/settings.json` per `reference/settings-merge.md` — bail on malformed JSON.

Format the readiness report following the "Report format" section in `SKILL.md`.
