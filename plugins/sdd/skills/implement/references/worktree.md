# Isolated tasks: one worktree and branch per task

Read this when `sdd task next` reports `isolation.mode: worktree`. This session orchestrates: it stays
on the SDD branch, writes no code and is the only one that edits `tasks.md`. Every task runs in its
own sub-session (or agent), worktree and branch, and commits there. `merge` (`pr` | `auto`) and
`parallel` come from `isolation`.

## Before the first task

- The tree is clean and on the SDD branch (the spec's `**Branch:**`), after the documentation commit
  (step 3 of `/sdd:implement`).
- Ask once with `AskUserQuestion`, options "Go" / "Stop"; the question says every task runs in its own
  session, worktree and branch, and:
  - `merge: auto`: "Task branches will be rebased and fast-forwarded into `<branch>` without asking."
  - `merge: pr`: "`<branch>` will be pushed and every task opens a PR into it; you merge them. This
    session waits for the merges; after each merge the next tasks come as session cards, start
    each one with a click." After "Go":
    `git push -u origin <branch>`.
- `repo: true` tasks are not isolated: run them in place on the feature branch, one at a time, as in
  `/sdd:implement` and [sibling-repos.md](${CLAUDE_PLUGIN_ROOT}/references/sibling-repos.md).

## Launch a ready task

`ready` means every dependency is `review|done`, which here means merged into the SDD branch. Keep at
most `parallel` tasks `running`. For each task:

1. The branch is `<spec-branch>--<EPIC>-T<n>`, cut from the SDD branch, never from main or another
   task branch. Do not create it here: the launcher below creates it with its worktree.
2. Launch. **Desktop** (`mcp__ccd_session__start_session` exists; listed as deferred → load it with
   `ToolSearch` `select:mcp__ccd_session__start_session` first): every task runs in a sub-session the
   user can see, never in the Agent tool. Common fields: `context: fresh`, `use_worktree: true`,
   `source_branch` = the SDD branch, `branch_name` = the task branch, title
   `<EPIC>-T<n>: <task title>`, the brief as the prompt.
   - **This turn was started by the user or by a `<side-sessions-event>`** (the "Go" turn, a wake
     after sub-sessions ended their turn) → `initiation: user_asked` (the "Go" is the user's request).
   - **Any other turn** (the merge waiter, a task notification, another session's message), or
     `user_asked` refused → `initiation: own_initiative`: a "New task" card per ready task, which the
     user starts with one click. Desktop does not let a session start sessions on a turn an event
     started. Where `PushNotification` exists, send one: "<ids> ready: start them from their cards."
     A card refused too → report the ready tasks and name `/sdd:implement`.

   **Not Desktop:**
   - **Agent tool** with `isolation: "worktree"`, the brief as the prompt (a `skill:` flow: the agent
     calls the Skill tool). Only when `start_session` does not exist, never as a fallback for a
     refusal. Its worktree starts from the default branch; the brief's first line fixes that.
   - **`command:` flow**: `git worktree add ../<repo>-<EPIC>-T<n> -b <branch> <spec-branch>`, then
     the command there with the brief on stdin.
3. The brief is the one from step 3 of `/sdd:implement`, plus, first: `HEAD` is not `<branch>` →
   `git switch -C <branch> <spec-branch>` (a card or an agent worktree does not keep the base), and
   `specs/<slug>/` exists. Then: work only on `<branch>`, which contains the SDD branch
   (`git merge-base --is-ancestor <spec-branch> HEAD`; otherwise stop and report the wrong base);
   commit only the task's files, each commit with the trailer
   `Task: <EPIC>-T<n>`. `merge: auto` → do not push.
   `merge: pr` → push and open a PR into the SDD branch titled `<EPIC>-T<n>: <task title>`
   (`actions.pr`, else `gh pr create --base <spec-branch>`) and return its URL. Pass the SDD branch
   as the base to `actions.branch` / `actions.pr` too.
4. Once the tool result says the session or agent started: `sdd task status <id> in-progress
   --branch <branch>` (by hand: `status: in-progress` and `branch: <branch>` in its block). A launch
   that did not start leaves the task as it was; report it, so no `branch:` names work nobody does.
   A card is not a start: write `branch:` when the note "The user started your proposal … as
   session …" arrives. Name each open card's `task_id` in the turn's report and never propose a task
   twice; an expired or dismissed card is proposed again on the next wake. A `<side-sessions-event>`
   turn that finds a card still unstarted → `mcp__ccd_session__dismiss_task`, then start the task
   with `user_asked`.

## When a task reports back

Check the branch, not the report: it contains the SDD branch, every commit has the `Task:` trailer,
`git diff <spec-branch>...<branch>` stays inside the task's `files`, nothing under `specs/` changed,
the reported tests passed. Anything off → leave the task `in-progress` and say what.

**`merge: auto`**

1. `git -C <worktree> rebase <spec-branch>`, then in this checkout `git merge --ff-only <branch>`.
   A conflict → leave the task `in-progress` with its `branch:`, report it and go on with the other
   tasks; its dependants stay blocked.
2. `sdd task status <id> review` (removes `branch:`), `git worktree remove <path>`,
   `git branch -d <branch>`. Desktop: offer to archive the task's session.

**`merge: pr`** (a human merges)

`sdd task status <id> in-progress --pr <url>`. Never merge it yourself: Reconcile picks up the merge.
Change requests on the PR go to that task's own session. The merge method is the user's and the
repository's; "Rebase and merge" keeps the `Task:` trailers.

One task id (`/sdd:implement T3`) launches that task, handles its report and stops.
