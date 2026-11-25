# Isolated tasks: one worktree and branch per task

Read this when `implementation.isolation` in `specs/capabilities.yml` is `worktree:`.
`/sdd:implement` then **orchestrates**: every task runs in its own sub-session (or agent) on its own
branch cut from the SDD branch; this session stays on the SDD branch and writes no code.
Options under `isolation.worktree` (defaults in [capabilities.md](${CLAUDE_PLUGIN_ROOT}/references/capabilities.md)):
`merge: pr | auto`, `parallel: <n>`. Each sub-session commits its task on its own branch.

One checkout holds one branch, so tasks that run at once need a worktree each; sequential tasks get
one too, so this session never changes branch. Worktrees do not protect two tasks that edit the same
files: `/sdd:tasks` already forces `depends_on` between them, so the second starts only after the
first is merged.

## Before the first task

- The tree must be clean and on the SDD branch (the spec's `**Branch:**`); commit `specs/<slug>/`
  first (the documentation commit, step 3 of `/sdd:implement`). A new worktree sees only committed work.
- Ask once with `AskUserQuestion`:
  - `merge: auto` — "Task branches will be rebased and fast-forwarded into `<branch>` without
    asking." Options: "Go" / "Stop".
  - `merge: pr` — "`<branch>` will be pushed and every task opens a PR into it; you merge them.
    This session waits for the merges and starts the next tasks itself." Options: "Go" / "Stop".
    Push `<branch>` with `git push -u origin <branch>` after the answer.
- `repo: true` projects (sibling repositories) are not isolated: run their tasks in place on the feature
  branch, one at a time, as in [sibling-repos.md](${CLAUDE_PLUGIN_ROOT}/references/sibling-repos.md).

## Run the ready tasks

A task is ready when all its `depends_on` are `review|done` **and merged** into the SDD branch.
Start at most `parallel` at once. For each:

1. Branch name: `<spec-branch>--<EPIC>-T<n>` (`--`, because `feat/x/…` would collide with `feat/x`).
2. Write `status: in-progress` and `branch: <name>` into its block in `tasks.md`.
3. Launch, in this order of preference:
   - **Desktop**: `mcp__ccd_session__start_session` — `initiation: user_asked`, `use_worktree: true`,
     `source_branch` = the SDD branch, `branch_name` = the task branch, a short title
     `<EPIC>-T<n>: <task title>`, and the brief as the prompt.
   - **Agent tool** with `isolation: "worktree"` (the brief as the prompt; for a `skill:` flow the
     agent calls the Skill tool). Name the branch in the brief and have the agent create it.
   - **`command:` flows**: `git worktree add ../<repo>-<EPIC>-T<n> -b <name> <spec-branch>`, then run
     the command there with the brief on stdin.
4. The brief is the usual self-contained brief plus: work only on this branch; commit with the
   `Task: <EPIC>-T<n>` trailer; never edit anything under `specs/`; return the changed files, the
   test result and any unmet AC. `merge: auto` → do not push. `merge: pr` → push the branch and open
   a PR into the SDD branch titled `<EPIC>-T<n>: <task title>` (`actions.pr`,
   else `gh pr create --base <spec-branch>`), and return its URL.

Never stack: every task branch is cut from the SDD branch, never from another task branch, and every
task PR targets the SDD branch, never `main` or a task branch. Pass the base explicitly to
`actions.branch` / `actions.pr` and write it into the brief. A task that needs another task's code
waits (`depends_on`) until that task is merged into the SDD branch.

Only this session writes `tasks.md`; sub-sessions never touch `specs/`, so merges never conflict
on task statuses.

## When a task reports back

Do not trust the report: inspect the branch. Every commit has the `Task:` trailer, the diff
(`git diff <spec-branch>...<branch>`) stays inside the task's `files`, nothing under `specs/`
changed, the reported tests passed. Anything off → leave the task `in-progress`, say what.

### `merge: auto`

1. `git -C <worktree> rebase <spec-branch>`, then in the main checkout
   `git merge --ff-only <branch>`. A conflict → leave the task `in-progress` with its `branch:`,
   report it and go on with the other tasks; its dependants stay blocked.
2. Set `status: review`, remove the `branch:` line, `git worktree remove <path>`,
   `git branch -d <branch>`. Desktop sessions: offer to archive the session.
3. Tasks this unblocks become ready: launch them (Keep going, below).

### `merge: pr` (a human merges)

1. Write `pr: <url>` into the task. Do not merge anything yourself.
2. The merge is picked up by [Reconcile isolated tasks](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md#reconcile-isolated-tasks),
   which this loop runs after every wake-up; the dependants of a merged task become ready.
   Change requests on a PR go to that task's own session, which has its context.

## Keep going until every task is `review|done`

`/sdd:implement all` does not end with "re-run after the merge": it waits and continues by itself.
A single task id (`/sdd:implement T3`) launches that task, handles its report and stops.

After every launch, report or wake-up:

1. Run [Reconcile isolated tasks](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md#reconcile-isolated-tasks).
2. Launch the tasks that became ready, up to `parallel` running at once.
3. Decide:
   - every task `review|done` → stop and name `/sdd:review`.
   - something is running or awaited → arm the waits below and end the turn; the next event
     resumes this loop at step 1.
   - nothing running, ready or awaited (the rest is blocked by a closed PR, a conflict or a failed
     report) → stop, list the blocked tasks and why.

**Waits.** Never a tight loop; arm only what is outstanding, and at most one merge waiter at a time.

- **Sub-sessions running** → nothing to arm: Desktop resumes this session with a
  `<side-sessions-event>` once no sub-session it started is still working (with `parallel` > 1 that
  is when the whole wave has ended its turn); background agents resume it with their completion
  notification.
- **PRs open (`merge: pr`)** → one background waiter for all of them: `Monitor` with an until-loop
  where available, else a background `Bash` command (`run_in_background`), which resumes the session
  when it exits. It exits as soon as any awaited PR is no longer open; check every 2 minutes:

  ```bash
  while :; do
    open=$(gh pr list --base '<spec-branch>' --state open --json number --jq '.[].number') \
      || { sleep 300; continue; }
    for p in <awaited PR numbers>; do grep -qx "$p" <<<"$open" || exit 0; done
    sleep 120
  done
  ```

  A PR closed without merging → Reconcile reports it; drop it from the awaited set, leave the task
  `in-progress` with its `pr:` and its dependants blocked, keep waiting for the rest.

**When the loop cannot go on.** A launch refused on a resumed turn (Desktop may refuse
`start_session` on a turn started by an event) → fall back to the Agent tool with
`isolation: "worktree"`; that unavailable too → report the ready tasks and name `/sdd:implement all`.
The session ends or stops being resumed → nothing is lost: the tasks keep `branch:` / `pr:` and the
next `/sdd:implement all` (or `/sdd:review`, when nothing else waits) reconciles them and continues.

The merge method (merge commit, squash, rebase) belongs to the user and the repository settings;
"Rebase and merge" keeps the `Task:` trailers and a linear history.
