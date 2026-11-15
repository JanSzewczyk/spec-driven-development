---
title: Commands overview
description: All 11 slash commands at a glance.
---

None of the commands is started by Claude on its own; you run them.

| Command | Phase | Writes |
|---|---|---|
| [`/sdd:doctor [check\|init]`](/spec-driven-development/commands/doctor/) | Setup | `specs/constitution.md`, `template.md`, `capabilities.yml` (init only) |
| [`/sdd:constitution`](/spec-driven-development/commands/constitution/) | Setup | `specs/constitution.md` |
| [`/sdd:spec <type> <description>`](/spec-driven-development/commands/spec/) | 1. Specify | branch, `spec.md` |
| [`/sdd:clarify`](/spec-driven-development/commands/clarify/) | 2. Clarify | `spec.md` |
| [`/sdd:plan`](/spec-driven-development/commands/plan/) | 3. Plan | `plan.md` |
| [`/sdd:tasks`](/spec-driven-development/commands/tasks/) | 4. Tasks | `tasks.md`, commit |
| [`/sdd:implement <task-id \| all>`](/spec-driven-development/commands/implement/) | 5. Implement | task commits, statuses |
| [`/sdd:review`](/spec-driven-development/commands/review/) | 6. Review | `review.md`, commit, PR |
| [`/sdd:retro`](/spec-driven-development/commands/retro/) | Optional | constitution §5 |
| [`/sdd:capabilities`](/spec-driven-development/commands/capabilities/) | Optional | `capabilities.yml` |
| [`/sdd:analyze`](/spec-driven-development/commands/analyze/) | Anytime | nothing (read-only) |
