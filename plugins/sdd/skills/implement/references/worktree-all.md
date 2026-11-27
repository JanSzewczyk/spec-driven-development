# Isolated tasks with `all`: keep going until every task is `review|done`

Read this with [worktree.md](worktree.md) when `/sdd:implement` runs more than one task. It does not
end with "re-run after the merge": it waits and continues by itself.

After every launch, report or wake-up:

1. `reconcile` from `sdd task next` is not empty → run
   [Reconcile isolated tasks](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md#reconcile-isolated-tasks).
2. `sdd task next`; launch the `ready` tasks, up to `parallel` running at once.
3. Decide:
   - `done` → stop and name `/sdd:review`.
   - something is running or awaited (a PR, or a session card not started yet) → arm the waits below
     and end the turn; the next event resumes at step 1.
   - nothing running, ready or awaited (the rest is blocked by a closed PR, a conflict or a failed
     report) → stop and list the blocked tasks and why.

## Waits

Never a tight loop; arm only what is outstanding, and at most one merge waiter at a time.

- **Sub-sessions running** → nothing to arm: Desktop resumes this session with a
  `<side-sessions-event>` once no sub-session it started is still working (with `parallel` > 1, when
  the whole wave has ended its turn); background agents resume it with their completion notification.
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

  The waiter's wake is an event turn: the tasks it unblocks go out as session cards
  ([worktree.md](worktree.md) step 2).

  A PR closed without merging → Reconcile reports it; drop it from the awaited set, leave the task
  `in-progress` with its `pr:` and its dependants blocked, keep waiting for the rest.

## When the loop cannot go on

A `user_asked` launch refused on a resumed turn → session cards ([worktree.md](worktree.md) step 2),
never the Agent tool on Desktop; a card refused too → report the ready tasks and name
`/sdd:implement`, which the user types to start them as sub-sessions directly. The session ends or stops being resumed → nothing is lost: the tasks keep
`branch:` / `pr:`, and the next `/sdd:implement` (or `/sdd:review`, when nothing else waits)
reconciles them and continues.
