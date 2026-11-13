---
name: implement
description: Hand a task to the implementation flow (SDD step 5)
allowed-tools: "*"
argument-hint: "<task-id | all>  # e.g. T2, or all"
disable-model-invocation: true
---

# SDD Implement

The **Implement** phase of SDD. This command **manages** the implementation: it builds the brief
for a task and hands it to the project's implementation flow. It does not verify the result on its
own — the implementer runs the project's tests and checks, and `/sdd:review` judges the outcome
against the acceptance criteria.

## Steps

### 1. Resolve scope

The feature is the `specs/*/spec.md` whose `**Branch:**` equals `git branch --show-current` (none →
list the specs and ask). Read its `tasks.md`. `$ARGUMENTS`: a task id → that task; `all` → every task not yet
`review|done`, in dependency order. A task whose `depends_on` are not all `review|done` → STOP and
name the blockers. Independent tasks may be handed over together when the flow runs in the
background; otherwise one after another.

### 2. Pick the flow

Read the `## Implementation` section of `specs/capabilities.md`. The line for the task's project
wins over `default`; the values and how each is handed over are in
[capabilities.md](${CLAUDE_PLUGIN_ROOT}/references/capabilities.md) (`in-session` → step 4).

No section, no matching line → `in-session`.

### 3. Build the brief

The task is self-contained only by reference, so inline what it points to:

- the task itself (scope, files, notes) and its `project` with path and, for a sibling repository,
  its repo path
- the text of the spec ACs it lists, plus the Summary and the edge cases it touches
- the plan sections it names, plus the plan's *Testing* section when present
- the project's `test`, `coverage`, `typecheck` and `lint` commands (`specs/constitution.md` §2)
  and the §5 rules that apply
- definition of done: every listed AC is met and has a test, the project's checks pass, only the
  task's files changed; **return** the changed files, the test result and any unmet AC

**Lifecycle** ([status-lifecycle.md](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md)). Set the task `status: in-progress` before the hand-over (first task of the feature:
`spec.md` and `plan.md` `**Status:**` → `in-progress`); `review` when the implementer reports done,
otherwise leave it and show what is missing.

**Sibling repositories.** For a project marked `(repo)` follow
[sibling-repos.md](${CLAUDE_PLUGIN_ROOT}/references/sibling-repos.md) before the first edit there.

### 4. In-session implementation

When no flow is configured you are the implementer: load the skills and docs your session has for
the project's stack and the frameworks the task uses, write the tests for the listed ACs together
with the code, and run the project's checks from §2 until they pass.

### 5. Output

Task id, flow used, status, files changed, any unmet AC. Next: the next task, or `/sdd:review` when
all are `review|done`. Do not commit — `/sdd:review` does.
