---
description: Final audit before PR — runs spec-guard + drift-detector + ui-critic + reviewer (SDD step 6)
argument-hint: "(none)"
allowed-tools: "*"
---

The **Review** phase of SDD. Final audit before commit + PR. This command runs the full test suite
once, invokes the SDD verification agents (spec-guard, drift-detector, plus ui-critic when UI files
are in the diff), then hands all their results to the `reviewer` agent, which runs the domain audits,
writes `review.md` and returns the GO/NO-GO verdict.

> 💰 **Recommended session model: Opus.** This is the judgement-heavy final gate. (The verification
> sub-agents carry their own `model:` frontmatter — spec-guard/drift-detector/ui-critic on Sonnet,
> reviewer on Opus — so they run at their own tier regardless of the session model.)

## The feature diff

`/sdd:implement` never commits, so the feature's work is mostly **uncommitted**, and new files are
**untracked**. `git diff main..HEAD` would miss all of it. Every step below — and every agent you
invoke — uses this definition of the feature diff instead:

```bash
base=$(git merge-base HEAD main)   # use the repo's default branch if it is not `main`
git diff "$base" -- . ':(exclude)<glob>' …   # committed + uncommitted changes to tracked files
git ls-files --others --exclude-standard     # new, untracked files — part of the feature too
```

The `<glob>` list is the `Generated / out-of-band paths` section of `specs/capabilities.md`; apply
the same exclusions to the untracked list. Pass this definition (base commit + "include untracked
files") in every agent prompt below.

**Several repositories:** when the feature has projects in sibling repositories
(`specs/capabilities.md` `## Projects`, marked `(repo)`), compute the same diff **in each repo that
is on the feature branch** (`git -C <repo> …`, its own default branch for the merge base) and pass
every agent the list of repos with their bases.

## Steps

### 1. Pre-flight (runs the test suite — the only full run in this command)

Verify:
- All tasks in `specs/<current>/tasks.md` have status `review` or `done`.
- Branch ≠ `main`/`master`.
- The full test suite of **every project the feature diff touches** passes: for each such project
  run its `test` command from `specs/constitution.md` §2 (its `coverage` command instead, when it
  has one — it runs the suite and reports coverage in one go). Which projects are touched follows
  from the diff paths and the project paths in `specs/capabilities.md` `## Projects`; a
  single-project repo has only `root`. Run independent projects' suites in parallel when their
  commands allow it.

Keep the result **per project** (passed/failed counts per layer, coverage numbers, the failing
test names) — the
`reviewer` agent receives it in Step 5 and does **not** re-run the suite.

If anything fails → STOP, list the blockers.

### 2. Spec-guard (audit vs spec)

```
Task tool: subagent_type=spec-guard
prompt: "Verify the feature diff (base <base>, include untracked files) against
         specs/<current>/spec.md. Are ALL Acceptance criteria satisfied? Any out-of-scope changes?
         Exclude the globs in specs/capabilities.md 'Generated / out-of-band paths' from the diff."
```

Expected return: JSON `{satisfied: bool, missing: [...], out_of_scope: [...]}`.

### 3. Drift-detector

```
Task tool: subagent_type=drift-detector
prompt: "Detect drift between the documentation (specs/<current>/) and the current code
         (feature diff: base <base>, include untracked files).
         Return a list of mismatches with file paths and line numbers.
         Exclude the globs in specs/capabilities.md 'Generated / out-of-band paths' from the diff."
```

### 4. Visual review — `ui-critic` (only when UI files are in the diff)

This command is the only place that invokes `ui-critic` (a sub-agent cannot start another
sub-agent, so `reviewer` cannot). Invoke it when the feature diff contains UI component files of a
**web** project (kind `web` in `## Projects`). A mobile or desktop project's UI is skipped with
`SKIPPED — no screenshot tool for <kind>`, unless capabilities lists a skill or MCP server that
captures that platform's screens — then pass it to `ui-critic` instead:

```
Task tool: subagent_type=ui-critic
prompt: "Review these changed UI files: <list>. Storybook URL and start command: the
         `dev / ui-preview` cell of that project's row in specs/constitution.md §2."
```

Soft check — never blocks on infrastructure (no browser MCP / Storybook down → `SKIPPED`, warning
only). If no UI files changed, skip this step and record `SKIPPED — no UI changes`.

### 5. Reviewer — audits, `review.md`, verdict

```
Task tool: subagent_type=reviewer
prompt: "Feature folder: specs/<current>/. Write specs/<current>/review.md.
         Feature diff: base <base>, include untracked files.
         Test results from pre-flight, per project (do NOT re-run the suites): <counts, coverage, failures>.
         Projects touched: <name — kind · path · stack> for each.
         spec-guard result: <JSON>. drift-detector result: <list>. ui-critic result: <JSON or SKIPPED>."
```

The reviewer picks the domain audit skills relevant to the diff from the `Skills` section of
`specs/capabilities.md`, checks conventions, writes `review.md` (one file — its template includes
the spec-guard, drift and visual-review sections), and returns
`{verdict: GO | NO_GO, blockers: [...], warnings: [...]}`.

Soft check — never blocks on infrastructure (no browser MCP / Storybook down → `SKIPPED`, warning
only). If no UI files changed, skip this step and record `SKIPPED — no UI changes`.

**a. Advance the lifecycle first**, so the commit carries it: all tasks in `tasks.md`
`review` → `done`; `spec.md` and `plan.md` header `**Status:**` → `done`.

**b. Ask before committing.** Committing and opening a PR publish the work, so confirm first. Show
the commit title, the PR title and the exact list of files you will stage — the feature diff's files
(tracked + untracked, minus the generated globs only if the project does not commit them) plus
`specs/<slug>/`. Use the `AskUserQuestion` tool when it is available (options: "Commit and open PR"
(Recommended), "Commit only", "Stop here"); otherwise ask in the conversation and wait for a yes.
Never stage files that are not on that list — in particular never `git add -A` (it sweeps in
screenshots, `.env*` files and other local leftovers).

**Several repositories:** confirm once for all of them, listing the files per repo; then do step c
in **each** touched repo (`git -C <repo> …`, `gh pr create` from inside it). The spec repo's PR
also carries `specs/<slug>/`. After all PRs exist, add to each PR body a "Related PRs" list with
the others' URLs (`gh pr edit <url> --body …`) so reviewers see the whole feature.

**c. Commit and open the PR** (or only commit, per the answer):

```bash
git add -- <each file from the confirmed list>
git commit -m "<type>(<slug>): <description from spec.md Summary>

<bullet list of 2-3 highlights>

Refs: specs/<slug>/"

gh pr create \
  --title "<type>: <description>" \
  --body "$(cat <<EOF
## Summary
<from spec.md>

## Changes
<list from plan.md File-by-file>

## Testing
<from review.md Test results>

## Spec
\`specs/<slug>/spec.md\`
EOF
  )"
```

### 7. If verdict = NO-GO

DO NOT commit. List the actions to fix. Suggest:
- `/sdd:implement <task-id>` — if implementation is missing
- Manual code edits
- `/sdd:analyze` — if drift is unclear

## Constraints

- ⛔ DO NOT commit if verdict = NO-GO
- ⛔ DO NOT commit or open a PR without the user's confirmation (Step 6b)
- ⛔ DO NOT use `git add -A` / `git add .` — stage the confirmed file list only
- ⛔ DO NOT skip the core SDD agents (spec-guard, drift-detector, reviewer). `ui-critic` runs only when UI files are in the diff and is allowed to SKIP on infrastructure issues.
- ⛔ Run the test suite, spec-guard, drift-detector, ui-critic and reviewer ONCE each — do not loop them.
- ✅ The verification agents exclude the `Generated / out-of-band paths` globs from `specs/capabilities.md` — generated files are never flagged out-of-scope or as drift.
- ✅ Commit message format: Conventional Commits (`<type>(<scope>): <description>`)
- ✅ PR body contains a link to spec.md
- 💬 Ask the user to batch NOT READY fixes / QA tweaks into one message per round — each turn reprocesses the full context.
