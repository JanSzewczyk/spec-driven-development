---
name: review
description: Final audit against the spec, then commit and PR (SDD step 6)
allowed-tools: "*"
argument-hint: "(none)"
disable-model-invocation: true
---

# SDD Review

The **Review** phase of SDD: the only verification gate. It judges the implemented work against the
acceptance criteria and the project's rules, writes `review.md` with a READY / NOT READY verdict,
and — on READY — commits and opens the PR. It never implements anything.

## The feature diff

Compute it as in [feature-diff.md](${CLAUDE_PLUGIN_ROOT}/references/feature-diff.md): committed and
uncommitted changes plus untracked files against the merge base, generated globs excluded, one diff
per sibling repository on the feature branch. Every step and every agent uses that definition.

## Steps

### 1. Pre-flight and configuration

- Branch ≠ default branch. The feature is the `specs/*/spec.md` whose `**Branch:**` equals the
  current branch (`specs/<current>/`); every task in its `tasks.md` is `review` or `done`.
- Read from `specs/capabilities.md` the sections `## Projects`, `## Review` and `## Actions`
  (values and defaults: [capabilities.md](${CLAUDE_PLUGIN_ROOT}/references/capabilities.md); an unknown
  key such as the old `ui:` is ignored).

### 2. Verify — in parallel

Start everything that does not depend on another result **in one message** and wait for all of it:

- **Tests** (`tests: run`): for each project the diff touches, its `coverage` command from
  `specs/constitution.md` §2 (else `test`); independent projects together. Keep the result per
  project — counts, coverage, failing test names. `tests: skip` → "skipped".
- **`spec-verifier`** (Agent tool): the feature folder, the diff definition, the generated globs.
  Returns the JSON with AC status, non-goal violations, out-of-scope, drift and per-task status.
- **Extra checks and audit agents** from `## Review` that are `agent:<name>` — `checks:` entries
  (e.g. a QA agent that runs the app and tests the functionality against the acceptance criteria)
  and `agent:` audit lines for the touched projects. Brief each with the spec's AC, the touched
  projects, how to start the app (`dev` in constitution §2) and the diff definition. A check returns
  `PASS | FAIL | SKIPPED` with findings. `skill:` entries are not run here: pass them to the reviewer.

### 3. Reviewer

Invoke `reviewer` (Agent tool) once with: the feature folder and `review.md` path, the diff definition
and changed files per project (kind, stack), every result from step 2, and the skill audits to run
(`skill:` lines from `## Review`, or `auto`), and the `## Accepted` list of the previous `review.md`
if there is one. It checks the constitution's rules, runs the skill audits, writes `review.md` and
returns `{verdict, blockers, warnings}`; each blocker says whether the user may accept it.

**Accepting blockers.** NOT_READY and every blocker `acceptable` (an out-of-scope change, a
constitution rule, a non-critical audit finding) → ask once with
`AskUserQuestion`, listing them: "Fix them" (Recommended) / "Accept all and continue". Accepted →
add each with the user's reason under `## Accepted` in `review.md`, set its verdict to READY and go
on as READY. Failing tests, unmet AC, non-goal violations, failed checks and critical
security/accessibility findings are never acceptable.

### 4. Record the outcome

From the `spec-verifier` result, whatever the verdict:
- `spec.md`: tick `- [x]` the met acceptance criteria and untick the unmet ones.
- `tasks.md`: a task with unmet AC goes back to `in-progress`; complete tasks stay `review`.

### 5. READY → publish

Set the complete tasks to `done` and `**Status:**` in `spec.md` and `plan.md` to `done` (so the
commit carries it; see [status-lifecycle.md](${CLAUDE_PLUGIN_ROOT}/references/status-lifecycle.md)). Then, per `publish:`:

- `off` → stop; report the verdict and `review.md`.
- `ask` (default) → show the commit title, the PR title and the exact list of files you will
  stage (the feature diff, tracked and untracked, plus `specs/<slug>/`), via `AskUserQuestion`
  ("Commit and open PR" (Recommended), "Commit only", "Stop here"). Never stage anything else —
  never `git add -A` (it sweeps in untracked files such as `.env*`).

Commit with the `commit` action and open the PR with the `pr` action from `## Actions`
(`skill:` / `agent:` / `command:`). Unset → do it yourself: `git add -- <confirmed files>`, a
Conventional Commits message (`<type>(<slug>): <Summary of spec.md>`), `gh pr create` with a body
holding the summary, the changes from `plan.md`, the test results and a link to `spec.md`.

**Several repositories:** confirm once for all, then publish per touched repo as in
[sibling-repos.md](${CLAUDE_PLUGIN_ROOT}/references/sibling-repos.md).

### 6. NOT READY

Do not commit. List the blockers and, for each unmet acceptance criterion, the task to re-run
(`/sdd:implement T3`). Report briefly: verdict, blockers, `review.md` path.

## Constraints

- Never commit or open a PR on NOT READY, or without the user's confirmation when `publish: ask`.
- Never `git add -A` / `git add .`: stage the confirmed list only.
- Run each check once; do not loop them. Verification agents never flag the generated globs.
