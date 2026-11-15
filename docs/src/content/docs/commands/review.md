---
title: /sdd:review
description: "The verification gate: tests, spec-verifier, reviewer, then commit and PR."
---

The only verification gate. It judges the result against the acceptance criteria and the project's rules.

1. **In parallel:** the test suite once (`test` / `coverage` from constitution §2), `spec-verifier` over the whole feature diff (per-task commits, uncommitted and untracked changes, against the merge base), and every extra check you configured.
2. `reviewer` gets all results, checks the diff against each **WHAT NOT TO DO** rule, runs the domain audits and writes `specs/<slug>/review.md` with the verdict **READY** or **NOT READY**.
3. When every blocker is one you may accept (an out-of-scope change, a constitution rule, a non-critical audit finding), you are asked once: fix them, or accept them with a reason. Accepted items go under `## Accepted` in `review.md` and are not raised again. Failing tests, unmet acceptance criteria, non-goal violations and failed checks cannot be accepted.
4. Whatever the verdict, acceptance criteria are ticked `[x]` or unticked in `spec.md`, and tasks with unmet criteria go back to `in-progress`.
5. **READY:** shows the commit title, PR title and file list and asks (`publish: ask`). Then it commits what is left (statuses, `review.md`) and opens the PR with `actions.commit` / `actions.pr`, or with git and `gh` when none is set.
6. **NOT READY:** concrete blockers, each unmet criterion with the task to re-run (`/sdd:implement T3`).

## Configuration

```yaml
review:
  tests: run          # run | skip
  publish: ask        # ask | off
  default: auto       # audit flow: auto (skills by stack) | skill:<name> | agent:<name>
  projects:
    api: agent:python-reviewer
  checks: [agent:qa]  # on every review, e.g. QA that starts the app

actions:
  branch: skill:create-branch
  commit: skill:create-commit
  pr: skill:create-pull-request
```

A check returns `PASS`, `FAIL` or `SKIPPED`. `FAIL` blocks READY; `SKIPPED` never does. All keys: [capabilities reference](/spec-driven-development/configuration/capabilities/).
