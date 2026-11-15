---
title: /sdd:doctor
description: Preflight audit and project setup.
---

```text
/sdd:doctor [check|init]
```

## check (default)

Report only, statuses ✅ / ⚠️ / ❌. Seven checks, run by the `doctor_check` tool (without mods the skill does them itself):

1. `specs/constitution.md`
2. `specs/template.md`
3. `specs/capabilities.yml` valid: YAML and values well-formed, `skill:` / `agent:` names installed, not left at the defaults
4. git and `gh`
5. tooling per project, including `command:` values
6. sibling repositories
7. every feature under `specs/`: statuses, unique branch and AC ids, task fields, dependencies without cycles, acceptance ids that exist

## init

Bootstraps missing files and detects the projects with their `test`, `coverage`, `typecheck` and `lint` commands. Idempotent: a re-run rewrites only `projects` in `capabilities.yml`.

`init` is also the **update path**. It first reads the `check` findings and repairs every one tagged `fix: init`: a format-2 `capabilities.md` migrated to YAML, misplaced keys, `format`, epic ids in old `tasks.md`, an outdated workflow. Then it re-checks. It asks whether to add the [`sdd-check` workflow](/spec-driven-development/guides/ci-action/). It never touches the project-root `CLAUDE.md`.
