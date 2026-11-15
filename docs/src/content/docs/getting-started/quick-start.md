---
title: Quick start
description: Initialize a project and ship a first feature.
---

## 1. Initialize a project

Open the target project in Claude Code:

```text
/sdd:doctor init      # bootstraps specs/constitution.md, specs/template.md, specs/capabilities.yml
/sdd:doctor check     # confirms 7/7
/sdd:capabilities     # optional: pick implementer, git actions and review checks
/sdd:constitution     # edit specs/constitution.md
```

`init`:

- creates `specs/constitution.md` from the bundled template (never overwrites),
- copies `specs/template.md`, the base for new feature specs,
- generates `specs/capabilities.yml` with the detected projects (everything else at defaults),
- with projects in sibling repositories, adds their paths to `permissions.additionalDirectories` in `.claude/settings.json` (other keys preserved; malformed JSON is left untouched).

:::note
The project-root `CLAUDE.md` is never read or written by SDD. The source of truth is `specs/constitution.md`.
:::

## 2. Build a feature

```text
/sdd:spec feat user can reset password via email
/sdd:clarify
/sdd:plan                 # run in Plan Mode (Shift+Tab)
/sdd:tasks
/sdd:implement T1         # one task, or `all`
/sdd:review
/sdd:retro                # optional: review lessons become constitution rules
```

Each phase re-reads its inputs from disk, so `/clear` between phases loses nothing.

A full walk-through: [End-to-end example](/spec-driven-development/guides/example/).
