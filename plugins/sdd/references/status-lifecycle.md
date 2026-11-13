# Status lifecycle

Read this when a step sets a `**Status:**` or a task `status:`.

| File | Status | Set by |
|---|---|---|
| `spec.md` | `draft` → `clarified` → `planned` → `in-progress` → `done` | `/sdd:spec` → `/sdd:clarify` → `/sdd:plan` → `/sdd:implement` (first task) → `/sdd:review` (READY) |
| `plan.md` | `draft` → `tasks-ready` → `in-progress` → `done` | `/sdd:plan` → `/sdd:tasks` → `/sdd:implement` (first task) → `/sdd:review` (READY) |
| task in `tasks.md` | `draft` → `in-progress` → `review` → `done` | `/sdd:tasks` → `/sdd:implement` (hand-over, then the implementer reports done) → `/sdd:review` (READY) |

Set a status only forward, never over a later one. Two moves go backwards: `/sdd:review` sets a task
with unmet acceptance criteria back to `in-progress`, and a `/sdd:tasks` re-run sets a started task
back to `draft` when the change touches its scope.
