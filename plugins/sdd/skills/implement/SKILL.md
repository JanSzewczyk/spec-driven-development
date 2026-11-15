---
name: implement
description: Hand a task to the implementation flow (SDD step 5)
allowed-tools: "*"
argument-hint: "<task-id | all>  # e.g. T2, or all"
disable-model-invocation: true
---

# SDD Implement

The **Implement** phase of SDD. This command **manages** the implementation: it builds the brief
for a task, hands it to the project's implementation flow and commits the result with the task's id.
It does not verify the result on its own — the implementer runs the project's tests and checks, and
`/sdd:review` judges the outcome against the acceptance criteria.

## Steps

### 1. Resolve scope

The feature is the `specs/*/spec.md` whose `**Branch:**` equals `git branch --show-current` (none →
list the specs and ask). Read its `tasks.md`. `$ARGUMENTS`: a task id → that task; `all` → every task not yet
`review|done`, in dependency order. A task whose `depends_on` are not all `review|done` → STOP and
name the blockers. Independent tasks may be handed over together when the flow runs in the
background; otherwise one after another.

### 2. Pick the flow

Read `implementation` in `specs/capabilities.yml` (only the old `specs/capabilities.md` → STOP:
"Run `/sdd:doctor init` to migrate it."). `implementation.projects.<project>` wins over
`implementation.default`; the values and how each is handed over are in
[capabilities.md](${CLAUDE_PLUGIN_ROOT}/references/capabilities.md) (`in-session` → step 4). Nothing
set → `in-session`.

`implementation.isolation` is not a flow. `worktree:` → follow [isolation.md](references/isolation.md)
for steps 3–5 instead of handing tasks over in place (each task runs in its own sub-session, worktree
and branch, and commits there; the reference covers launching, merging and waiting for PRs).
`none` (default) → this session hands over and commits each task. Everything below applies to both.

**Ids.** `**Epic:**` in `tasks.md` + the task heading give the full id `<EPIC>-T<n>`. No `**Epic:**`
line → STOP: "Run `/sdd:tasks` (or `/sdd:doctor init`) to assign an epic id."

### 3. Commit the documentation, then build the brief

**Documentation commit.** `/sdd:tasks` already committed the spec, plan and tasks. When `specs/<slug>/`
still has uncommitted changes (edits made after it) → commit them now, before any status is set or
any task starts: `docs(<slug>): add spec, plan and tasks`, trailer `Epic: <EPIC>`, via
`actions.commit` or `git add -- specs/<slug>/`. A worktree or sub-session only sees what is committed.

The task is self-contained only by reference, so inline what it points to:

- the task itself (scope, files, notes) and its `project` with path and, for a sibling repository,
  its repo path
- the text of the spec ACs it lists, plus the Summary and the edge cases it touches
- the plan sections it names, plus the plan's *Testing* section when present
- the project's `test`, `coverage`, `typecheck` and `lint` commands (`specs/constitution.md` §2)
  and the §5 rules that apply
- definition of done: every listed AC is met and has a test, the project's checks pass, only the
  task's files changed; **return** the changed files, the test result and any unmet AC
- the rule that the implementer never edits anything under `specs/`

**Lifecycle** ([status-lifecycle.md](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md)). Set the task `status: in-progress` before the hand-over (first task of the feature:
`spec.md` and `plan.md` `**Status:**` → `in-progress`); `review` when the implementer reports done,
otherwise leave it and show what is missing.

**Sibling repositories.** For a project with `repo: true` follow
[sibling-repos.md](${CLAUDE_PLUGIN_ROOT}/references/sibling-repos.md) before the first edit there.

### 4. In-session implementation

When no flow is configured you are the implementer: load the skills and docs your session has for
the project's stack and the frameworks the task uses, write the tests for the listed ACs together
with the code, and run the project's checks from §2 until they pass.

### 5. Commit

With `isolation: none` this session commits every task; with `worktree:` the sub-session does (see
[isolation.md](references/isolation.md)).

- **After each finished task** (status `review`), commit only that task's files — never `specs/`,
  never `git add -A`. Use `actions.commit` (`skill:` / `agent:` / `command:`);
  unset → `git add -- <files>` and a Conventional Commits message `<type>(<slug>): <task title>`.
  Add the trailer `Task: <EPIC>-T<n>` (several commits per task are fine, each carries it).
- Check it landed: `git log -1 --format='%(trailers:key=Task,valueonly)'`; empty (a skill rewrote the
  message) → `git commit --amend --trailer 'Task: <EPIC>-T<n>'`.

Status changes in `tasks.md` (and `spec.md` / `plan.md`) stay uncommitted here; `/sdd:review` commits them with `review.md`.

### 6. Output

Task id, flow used, status, commit, files changed, any unmet AC. Next: the next task, or
`/sdd:review` when all are `review|done`.
