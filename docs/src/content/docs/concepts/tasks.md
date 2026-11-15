---
title: Tasks and the hand-off
description: Self-contained tasks, briefs and how implementation is delegated.
---

`/sdd:tasks` writes one Epic (the feature) with **self-contained tasks**: tickets you could give an implementer as they are. A task is a coherent slice of behaviour in one project (a whole screen, a set of endpoints with their logic and storage), not a layer or a micro-step.

```markdown
### T2: Reset password screen
project: web
status: draft
depends_on: [T1]
acceptance: AC1, AC4
plan: Contracts › reset API; File-by-file › web
scope:
- request form and new-password form with inline validation
- generated API client from T1
- states: loading, network error, expired token
files: apps/web/src/features/reset/*
```

The file keeps references (AC ids, plan sections) instead of copies.

## What `/sdd:implement T2` does

1. Dependencies must be `review` or `done`, otherwise it stops and names the blockers.
2. It reads `implementation` in `specs/capabilities.yml`. The task's project wins over `default`:
   ```yaml
   implementation:
     default: in-session
     projects:
       api: agent:python-developer
       web: skill:my-web-flow
   ```
   Values: `skill:<name>`, `agent:<name>`, `command:<shell>` (brief on stdin) or `in-session`.
3. It builds the **brief**: the task, the text of its acceptance criteria, the plan sections, the project's commands, the constitution rules that apply, and a definition of done.
4. It hands the brief to the flow. The implementer writes tests and code and runs the project's checks. `in-session` means the session does that itself.
5. Status goes `draft` → `in-progress` → `review`. The task's files are committed with the trailer `Task: <EPIC>-T<n>`; `/sdd:review` commits what is left (statuses, `review.md`) and opens the PR. The documentation (spec, plan, tasks) was already committed by `/sdd:tasks`.

Verification is a separate step: [`/sdd:review`](/spec-driven-development/commands/review/) judges the outcome against the spec.

## Ids

- Every command finds the feature by the `**Branch:**` line of its `spec.md`, so any branch skill may name the branch.
- Acceptance criteria ids (`AC1`, `AC2` …) never change once written. Tasks, `spec-verifier` and the board refer to them.
- `tasks.md` carries `**Epic:** ULOG-7f3a` (slug letters plus 4 hex, assigned once, unique across specs). A task's full id is `<EPIC>-T<n>` (`ULOG-7f3a-T3`); it goes into the `Task:` trailer of every commit and the task branch name. `git log --grep 'Task: ULOG-7f3a-T3'` finds the work.
- Re-running `/sdd:tasks` after the plan changes updates `tasks.md` and keeps each task's id and status.
