---
name: implement
description: Hand a task to the implementation flow (SDD step 5). Run only when the user explicitly asks for it (types the command or asks to run this step); never start it on your own.
allowed-tools: "*"
argument-hint: "[task-id | all]  # empty = all"
---

# SDD Implement

Hands each task to the project's implementation flow and commits it with the task's id. The
implementer runs the project's checks; `/sdd:review` judges the result against the acceptance criteria.

`sdd` is the SDD CLI (`sdd help`). It exits `2` with an `error` to act on; exit `127` (no Node.js
22.18+) → do that step by hand as written next to it.

## 1. Scope

Run `sdd task next $ARGUMENTS` (no argument = every task not yet `review|done`). Exit `2` → STOP with
its `error`; when it lists `features` (no spec for this branch), show them and ask which one. It
returns `feature` (`slug`, `branch`, `epic`), `isolation`, `reconcile` and `tasks` in dependency
order, each with `fullId`, `project`, `repo`, `flow`, `ready` and `blockedBy`.

By hand: the feature is the `specs/*/spec.md` whose `**Branch:**` is `git branch --show-current`;
only the old `specs/capabilities.md` → STOP "Run `/sdd:doctor init` to migrate it."; no `**Epic:**`
in `tasks.md` → STOP "Run `/sdd:tasks` (or `/sdd:doctor init`) to assign an epic id."; the flow is
`implementation.projects.<project>`, else `implementation.default`, else `in-session`; one task whose
`depends_on` are not all `review|done` → STOP and name them. A task named explicitly runs even when it
is `review`: a re-run for a must-fix blocker of a NOT READY review.

`isolation.mode` is `worktree` → first run [Reconcile isolated tasks](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md#reconcile-isolated-tasks)
when `reconcile` is not empty (then `sdd task next` again), and follow
[worktree.md](references/worktree.md) for steps 3–6; with more than one task also
[worktree-all.md](references/worktree-all.md).

## 2. Hand-over

`skill:<name>` → Skill tool, the brief as the argument. `agent:<name>` → Agent tool with that
`subagent_type`, the brief as the prompt. `command:<shell>` → Bash, the brief on stdin.
`in-session` → step 4. Ready tasks with no dependency between them may be handed over together when
the flow runs in the background; otherwise one after another.

## 3. Documentation commit, brief, status

**Documentation commit.** `specs/<slug>/` has uncommitted changes → commit them before any status is
set: `docs(<slug>): add spec, plan and tasks`, trailer `Epic: <EPIC>`, via `actions.commit` or
`git add -- specs/<slug>/`. A worktree or sub-session sees only committed work.

**Brief.** Inline what the task points to (`sdd task show <id>` gives its fields):

- the task (scope, files, notes) and its `project` with its path; for `repo: true`, the repo path
- the text of the spec ACs it lists, the spec's Summary and the edge cases it touches
- the plan sections it names, plus the plan's *Testing* section when present
- the project's `test`, `coverage`, `typecheck` and `lint` commands (`specs/constitution.md` §2) and
  the §5 rules that apply
- done means: every listed AC is met and has a test, the checks pass, only the task's files changed;
  **return** the changed files, the test result and any unmet AC
- never edit anything under `specs/`

**Status.** `sdd task status <id> in-progress` before the hand-over (the first task also moves
`spec.md` and `plan.md`); `sdd task status <id> review` when the implementer reports done; otherwise
leave it and show what is missing. By hand: the `status:` line in `tasks.md`, and `**Status:**
in-progress` in `spec.md` and `plan.md` on the first task; only forward
([status-lifecycle.md](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md)).

**Sibling repositories.** A `repo: true` task: follow
[sibling-repos.md](${CLAUDE_PLUGIN_ROOT}/references/sibling-repos.md) before the first edit there.

## 4. In-session implementation

You are the implementer: load the skills and docs your session has for the project's stack and the
frameworks the task uses, write the tests for the listed ACs with the code, and run the project's
checks from §2 until they pass.

## 5. Commit

After each finished task (status `review`), commit only that task's files, never `specs/`, never
`git add -A`: `actions.commit` when set, else `git add -- <files>` and
`<type>(<slug>): <task title>` (Conventional Commits). Every commit of the task carries the trailer
`Task: <EPIC>-T<n>`; check with `git log -1 --format='%(trailers:key=Task,valueonly)'` and, when
empty, `git commit --amend --trailer 'Task: <EPIC>-T<n>'`.

Status changes in `tasks.md`, `spec.md` and `plan.md` stay uncommitted; `/sdd:review` commits them.

## 6. Next task and output

Several tasks (`all` or no argument): after each committed task run `sdd task next` and go on with
the next ready task without being asked. Stop when a task is not done (show what is missing) or only
blocked tasks remain (name the blockers).

Report per task: id, flow, status, commit, files changed, any unmet AC. Next: `/sdd:review` when
`done` is true, else the task left. Name it; do not start it.
