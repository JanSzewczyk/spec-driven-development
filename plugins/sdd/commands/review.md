---
description: Final audit against the spec, then commit and PR (SDD step 6)
argument-hint: "(none)"
allowed-tools: "*"
---

The **Review** phase of SDD: the only verification gate. It judges the implemented work against the
acceptance criteria and the project's rules, writes `review.md` with a READY / NOT READY verdict,
and — on READY — commits and opens the PR. It never implements anything.

## The feature diff

`/sdd:implement` never commits, so the work is mostly **uncommitted** and new files are
**untracked**. Every step and every agent uses this definition:

```bash
base=$(git merge-base HEAD <default-branch>)
git diff "$base" -- . ':(exclude)<glob>' …    # committed + uncommitted changes to tracked files
git ls-files --others --exclude-standard      # new files — part of the feature too
```

`<glob>` = the `Generated / out-of-band paths` of `specs/capabilities.md` (apply to the untracked
list too). With projects in sibling repositories (`(repo)` in `## Projects`) compute the same diff
in each repo that is on the feature branch (`git -C <repo> …`) and pass every agent the repos with
their bases.

## Steps

### 1. Pre-flight and configuration

- Branch ≠ default branch; every task in `specs/<current>/tasks.md` is `review` or `done`.
- Read from `specs/capabilities.md` the sections `## Projects`, `## Review` and `## Actions`
  (missing section → defaults: `tests: run`, `ui: auto`, `publish: ask`, audits `auto`, no extra
  checks, no actions configured).

### 2. Verify — in parallel

Start everything that does not depend on another result **in one message** and wait for all of it:

- **Tests** (`tests: run`): for each project the diff touches, its `coverage` command from
  `specs/constitution.md` §2 (else `test`); independent projects together. Keep the result per
  project — counts, coverage, failing test names. `tests: skip` → "skipped".
- **`spec-verifier`** (Task tool): the feature folder, the diff definition, the generated globs.
  Returns the JSON with AC status, non-goal violations, out-of-scope, drift and per-task status.
- **`ui-critic`** (`ui: auto`, only when the diff has UI files of a **web** project): the changed UI
  files and that project's `dev / ui-preview` command from constitution §2. Mobile/desktop UI is
  `SKIPPED` unless a screenshot tool for that platform exists. Soft check: it never blocks on
  infrastructure.
- **Extra checks and audit agents** from `## Review` that are `agent:<name>` — `checks:` entries
  (e.g. a QA agent that runs the app and tests the functionality against the acceptance criteria)
  and `agent:` audit lines for the touched projects. Brief each with the spec's AC, the touched
  projects, how to start the app (constitution §2) and the diff definition. A check returns
  `PASS | FAIL | SKIPPED` with findings. `skill:` entries are not run here: pass them to the reviewer.

### 3. Reviewer

Invoke `reviewer` (Task tool) once with: the feature folder and `review.md` path, the diff definition
and changed files per project (kind, stack), every result from step 2, and the skill audits to run
(`skill:` lines from `## Review`, or `auto`). It checks the constitution's rules, runs the skill
audits, writes `review.md` and returns `{verdict, blockers, warnings}`.

### 4. Record the outcome

From the `spec-verifier` result, whatever the verdict:
- `spec.md`: tick `- [x]` the met acceptance criteria and untick the unmet ones.
- `tasks.md`: a task with unmet AC goes back to `in-progress`; complete tasks stay `review`.

### 5. READY → publish

Set the complete tasks to `done` and `**Status:**` in `spec.md` and `plan.md` to `done` (so the
commit carries it). Then, per `publish:`:

- `off` → stop; report the verdict and `review.md`.
- `ask` (default) → show the commit title, the PR title and the exact list of files you will
  stage (the feature diff, tracked and untracked, plus `specs/<slug>/`), via `AskUserQuestion`
  ("Commit and open PR" (Recommended), "Commit only", "Stop here"). Never stage anything else —
  never `git add -A` (it sweeps in screenshots and `.env*` files).

Commit with the `commit` action and open the PR with the `pr` action from `## Actions`
(`skill:` / `agent:` / `command:`). Unset → do it yourself: `git add -- <confirmed files>`, a
Conventional Commits message (`<type>(<slug>): <Summary of spec.md>`), `gh pr create` with a body
holding the summary, the changes from `plan.md`, the test results and a link to `spec.md`.

**Several repositories:** confirm once for all, then commit and open a PR in each touched repo (the
spec repo's PR also carries `specs/<slug>/`) and add a "Related PRs" list to every PR body.

### 6. NOT READY

Do not commit. List the blockers and, for each unmet acceptance criterion, the task to re-run
(`/sdd:implement T3`). Report briefly: verdict, blockers, `review.md` path.

## Constraints

- Never commit or open a PR on NOT READY, or without the user's confirmation when `publish: ask`.
- Never `git add -A` / `git add .`: stage the confirmed list only.
- Run each check once; do not loop them. Verification agents never flag the generated globs.
