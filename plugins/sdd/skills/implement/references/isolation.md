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
  - `merge: pr` — "`<branch>` will be pushed and every task opens a PR into it; you merge them."
    Options: "Go" / "Stop". Push `<branch>` with `git push -u origin <branch>` after the answer.
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
   `git merge --ff-only <branch>`. A conflict → stop, leave the task `in-progress`, report it.
2. Set `status: review`, remove the `branch:` line, `git worktree remove <path>`,
   `git branch -d <branch>`. Desktop sessions: offer to archive the session.
3. Tasks this unblocks become ready; go on until all are `review|done`.

### `merge: pr` (a human merges)

1. Write `pr: <url>` into the task. Do not merge anything yourself.
2. When no task is ready any more, report "waiting for merge: <PR list>" and end the turn.
3. The next `/sdd:implement all` resumes (idempotent): for every task with `pr:` run
   `gh pr view <pr> --json state,mergedAt`.
   - merged → `git pull --ff-only` on the SDD branch, `status: review`, remove `branch:` and `pr:`,
     remove the worktree and the local branch; its dependants become ready.
   - open → still waiting. Closed without merge → report it, the task stays `in-progress`.
4. Never poll or schedule a wake-up for the merge; the user comes back when the PRs are merged.
   Change requests on a PR go to that task's own session, which has its context.

The merge method (merge commit, squash, rebase) belongs to the user and the repository settings;
"Rebase and merge" keeps the `Task:` trailers and a linear history.
