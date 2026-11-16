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

## Reconcile isolated tasks

`/sdd:implement` (any argument) and `/sdd:review` run this first, before reading which tasks are
`review|done`. A task sub-session never sets its own status: `review` means merged into the SDD
branch, which happens after the sub-session ends. For every task that still has `branch:` or `pr:`:

- `pr:` → `gh pr view <pr> --json state`. `MERGED` → `git pull --ff-only` on the SDD branch, set
  `status: review`, remove `branch:` and `pr:`, remove the task's worktree and local branch.
  `CLOSED` → report it; the task stays `in-progress`. `OPEN` → still waiting.
- no `pr:` (`merge: auto`) → `git merge-base --is-ancestor <branch> <spec-branch>` succeeds → the
  merge happened but the status was not written: set `status: review`, remove `branch:`, clean up as
  above. Fails → the task is still running or was not merged; leave it.

Report the tasks this moved in one line. Never poll or wait for a merge.

Set a status only forward, never over a later one. Two moves go backwards: `/sdd:review` sets a task
with unmet acceptance criteria back to `in-progress`, and a `/sdd:tasks` re-run sets a started task
back to `draft` when the change touches its scope.
