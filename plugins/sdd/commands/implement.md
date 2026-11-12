---
description: Implement a whole Story wave by wave — unblocked tasks run in parallel on their specialist agents, each with its own TDD loop (SDD step 5)
argument-hint: "<story-id or task-id>  # e.g. S1 (whole Story — recommended) or T1.2 (one task)"
allowed-tools: "*"
---

The **Implement** phase of SDD. The default and recommended unit of work is a **whole Story** —
`/sdd:implement S1` runs every task in that Story **wave by wave**: the tasks of a wave do not
block each other, so they run **in parallel**, each on its own specialist agent and each with its
own red→green cycle; the next wave starts when the previous one is green. One spec-guard runs at
the Story boundary. A single task ID (e.g. `T1.2`) is still accepted for surgical re-runs.

> 💰 **Recommended session model: Sonnet** (Haiku for a trivial Story). Implementation is
> mechanical TDD + edits — reserve Opus for the judgement-heavy phases (`/sdd:spec`, `/sdd:clarify`,
> `/sdd:plan`, `/sdd:review`). Each task carries its own `model:` tier from `tasks.md`, which
> becomes the `model` of the subagent that runs it.

## Steps

### 1. Parse `tasks.md` and resolve scope

Locate `specs/<current>/tasks.md`. From `$ARGUMENTS`:

- **Story ID** (e.g. `S1`) → the scope is **all tasks in that Story**. This is the default mode.
- **Task ID** (e.g. `T1.2`) → the scope is that single task only.

For every task in scope, extract from YAML: `title`, `project`, `type`, `tdd`, `agent`, `skills`,
`model`, `depends_on`, `acceptance`, `tests`, `files`.

From `specs/capabilities.md` `## Projects` (legacy: `## Stack profile`) read each task's project:
its path, stack and — for a project in a sibling repository — its repo path. From
`specs/constitution.md` §2 read that project's `test` command (a single-project table has one
row, `root`).

**Legacy `tasks.md`** (written before tasks had `depends_on`/`tdd`, with separate test and
implementation tasks): run the tasks one after another **in the listed order** — `/sdd:tasks`
wrote each chain in TDD order — skipping the wave logic below. Treat a missing `project` as `root`.

### 2. Waves and readiness

Build the waves of the Story from `depends_on` (wave 1 = tasks whose dependencies are empty or
already `review|done`; wave N+1 = tasks whose dependencies are all in waves ≤ N). Use the waves
written under the Story in `tasks.md` when they match; if they disagree with `depends_on`, the
dependencies win — say so in the output.

- A dependency in an earlier Story that is not `review|done` → STOP: run that Story first.
- **Single-task mode:** every task in `depends_on` must be `review|done`, otherwise STOP and name
  the blocking tasks (`/sdd:implement <id>` for each).
- Two tasks of one wave whose `files`/`tests` overlap → run them one after another, not in
  parallel, and mention it (fix `tasks.md` with `/sdd:tasks` later).

### 3. Lifecycle, branches in other repositories

Task statuses follow the waves, so `tasks.md` (and the sdd-board panel) shows what is running and
what still waits: a task goes `draft` → `in-progress` **when its wave starts** and → `review` when
its wave is green (Step 4). Later waves stay `draft` until then. If this is the first Story/task of
the feature, set `spec.md` and `plan.md` `**Status:**` → `in-progress` now.

**Polyrepo** — for every task whose project lives in a sibling repository: before its first edit
there, make sure that repo is on the feature branch `<type>/<slug>` (the same name as the spec
repo's branch). If the branch is missing, check the repo's tree is clean (`git -C <repo> status
--porcelain`; dirty → STOP and ask the user to commit/stash there) and create it from that repo's
default branch (`git -C <repo> checkout -b <type>/<slug>`).

### 4. Run the waves

**Before the first wave**, load the union of `skills` that tasks you will run **inline** need
(`Use skill: <name>`); subagents load their own.

**For each wave, in order** — first set its tasks `status: in-progress` in `tasks.md`:

- **A wave with one task:** route it as below — inline when `agent: orchestrator`, otherwise one
  Task-tool call to the specialist.
- **A wave with several tasks — run them in parallel:** send **one message with one Task-tool call
  per task**, so they run at the same time.
  - `subagent_type`: the task's `agent`; for `agent: orchestrator` use `general-purpose`.
  - `model`: the task's `model` tier (`haiku` / `sonnet` / `opus`).
  - Prompt (see the template below): the task itself, the spec sections it serves, the plan
    section for its project, its project's path, repo and `test` command, and the ownership rule.

**Prompt for a task's subagent:**

```
Task <id> — <title>   (project: <project>, path: <path>, repo: <repo or "this repo">)
Acceptance: <acceptance>          Spec: <Summary + the ACs and edge cases this task covers>
Plan: <the plan.md section for this project / unit>
Load skills: <skills>
TDD (<tdd>):
  test-first      → write the failing tests in <tests> first; stub a missing symbol so they fail on
                    a real assertion; run them and confirm the red; then implement <files> to green.
  contract-first  → declare the public contract in <files> (minimal stub, no behaviour), write the
                    failing tests in <tests>, confirm the red, then implement to green.
Run: <project test command> <tests>   — all must pass before you finish.
Ownership: edit ONLY <files> and <tests>. Other tasks run in parallel in this working tree. A
typecheck/lint hook error in a file you do not own belongs to another task — do not touch it;
mention it in your report.
Return: the files you changed, the red you observed, the final test result.
```

**Inline (orchestrator, one-task wave):** do the same yourself — tests first, observe a meaningful
red (a failing assertion, not an unresolved reference), then implement to green. After every
Edit/Write the PostToolUse hook runs typecheck + lint for that file's project; exit 2 → fix and
continue.

**After each wave:**
1. Check every subagent's report: the red was observed, its tests pass, it stayed within its files.
2. Run each task's tests once more with its project's `test` command (`<command> <tests>`), all
   projects of the wave — this catches one task breaking another.
3. Failure → STOP the Story here: do not start the next wave. Fix inline or re-run that task
   (`/sdd:implement <id>`), then continue.
4. Mark the wave's tasks `status: review` in `tasks.md` and start the next wave.

**TDD rules (whichever agent runs the task):**
- `test-first` (default): tests first, meaningful red, then the implementation to green.
- `contract-first` (exception — the deliverable is itself a public interface other code references
  by shape): contract (minimal stub, no behaviour) → failing tests → implementation. Follow the
  **project's own conventions** for where interfaces/types live — the framework imposes no file
  layout.

### 5. Spec-guard (once, at the Story boundary)

Invoke the `spec-guard` sub-agent **once** (Task tool, `subagent_type: spec-guard`) over the
Story's combined diff — NOT once per task or wave. Nothing is committed yet, so pass it the scope
as `git diff HEAD` plus untracked files, **limited to the union of the Story's `files` and
`tests`** (plus any file you had to touch beyond them, named explicitly), **per repository** when
the Story touched sibling repos (`git -C <repo> diff HEAD`) — earlier Stories' uncommitted work is
not this Story's scope. If it returns `satisfied: false` or `out_of_scope: [...]`, DO NOT finish
the Story — address the findings.

(`/sdd:review` runs spec-guard again feature-wide as the final gate.)

### 6. Output

```markdown
✅ Story S1 implemented — 3 waves, 5 tasks
- Wave 1: T1.1 (api) ✅
- Wave 2: T1.2 (api) ∥ T1.3 (web) ∥ T1.4 (mobile) ✅ — ran in parallel
- Wave 3: T1.5 (e2e) ✅
- Tests: <X> passed per project (filtered to the Story)
- Spec-guard: satisfied=true (one check for the whole Story)
- Repos touched: <this repo, ../mobile-app> — each on branch <type>/<slug>
- Next: /clear, then /sdd:implement S2  OR  /sdd:review (if this was the last Story)
```

> 💬 Collect visual/QA tweaks into a **single message per round** instead of many small turns —
> each turn reprocesses the full context and multiplies cost.

## Constraints

- ✅ Default unit is a **whole Story**, run wave by wave; the tasks of a wave run **in parallel** (one message, one Task-tool call per task)
- ✅ Each task keeps its own red→green cycle (`tdd`); test-first by default, contract-first only when the deliverable is itself a public interface
- ✅ A subagent edits only its task's `files` and `tests`; tasks of one wave never share files
- ✅ The next wave starts only when the previous wave's tests pass
- ✅ Each task is verified with its **own project's** `test` command from `specs/constitution.md` §2
- ✅ Pass each task's `model` tier as the subagent's `model`
- ✅ Run `spec-guard` ONCE per Story, at its boundary
- ⛔ DO NOT start a task whose `depends_on` are not all `review|done` (or finished earlier in this run)
- ⛔ DO NOT spawn a subagent solely to run typecheck/lint/tests — run them inline (the PostToolUse
  hook handles typecheck+lint after each Edit/Write); summarize only large or failing output
- ⛔ DO NOT skip the red phase — a task whose tests never failed has not been test-driven
- ⛔ DO NOT skip `spec-guard`
- ⛔ DO NOT commit — that is done by `/sdd:review`
