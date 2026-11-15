# Status lifecycle

Read this when a step sets a `**Status:**` or a task `status:`.

| File | Status | Set by |
|---|---|---|
| `spec.md` | `draft` → `clarified` → `planned` → `in-progress` → `done` | `/sdd:spec` → `/sdd:clarify` → `/sdd:plan` → `/sdd:implement` (first task) → `/sdd:review` (READY) |
| `plan.md` | `draft` → `tasks-ready` → `in-progress` → `done` | `/sdd:plan` → `/sdd:tasks` → `/sdd:implement` (first task) → `/sdd:review` (READY) |
| task in `tasks.md` | `draft` → `in-progress` → `review` → `done` | `/sdd:tasks` → `/sdd:implement` (hand-over, then the implementer reports done) → `/sdd:review` (READY) |

While a task runs in its own worktree (`isolation: worktree:`, see `/sdd:implement`), its block in
`tasks.md` also holds `branch: <spec-branch>--<EPIC>-T<n>` and, with `merge: pr`, `pr: <number or URL>`;
both are removed when the task is merged and set to `review`. Only the orchestrating session edits
`tasks.md`; the documentation (spec, plan, tasks) is committed by `/sdd:tasks`, the statuses by `/sdd:review`, never per task.

Set a status only forward, never over a later one. Two moves go backwards: `/sdd:review` sets a task
with unmet acceptance criteria back to `in-progress`, and a `/sdd:tasks` re-run sets a started task
back to `draft` when the change touches its scope.
