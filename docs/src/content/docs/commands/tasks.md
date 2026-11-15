---
title: /sdd:tasks
description: Split the plan into self-contained tasks.
---

Splits `plan.md` into **self-contained tasks** (format: [Tasks and the hand-off](/spec-driven-development/concepts/tasks/)).

- **One Epic per feature.** A task is a ticket: one project, a coherent slice of behaviour, typically a few hours to a day. Never a layer or a micro-step. Tests belong to the task that delivers the behaviour.
- **Full coverage.** Every acceptance criterion is covered by a task, and every task serves at least one criterion.
- **Shared contracts are their own task** (a schema clients are generated from, shared types, a migration). Consumers depend on it.
- **`depends_on`** only where a task needs another's result or touches the same files.
- **No copies** of the plan or the spec: tasks refer to AC ids and plan sections.
- **Epic id.** Writes `**Epic:** <LETTERS>-<4 hex>` once (kept on re-runs); tasks are `<EPIC>-T<n>`.
- **Commits the documentation.** Ends by committing `specs/<slug>/` as `docs(<slug>): add spec, plan and tasks` with an `Epic:` trailer, so it is in git before any task starts and visible to worktrees.

It chooses no agents or models and writes no code. It ends with an `Order:` line such as `T1 → T2 ∥ T3 → T4`.
