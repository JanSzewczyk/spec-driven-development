---
description: Find conflicts between spec, plan, tasks and code at any point (SDD diagnostic)
argument-hint: "(none — works on the current branch)"
allowed-tools: Read, Glob, Bash, Task
---

A read-only diagnostic: where do the spec, plan, tasks and code disagree **right now**? Use it
mid-feature, after changing the spec, or before `/sdd:review`. It edits nothing and runs no tests.

## Steps

### 1. Verify

Resolve the feature: the `specs/*/spec.md` whose `**Branch:**` equals `git branch --show-current`
(none → list the specs and ask). Invoke `spec-verifier` once (Task
tool) with the feature folder and the **feature diff**: a base commit (`git merge-base HEAD
<default-branch>`), the changes `git diff <base>` plus the untracked files
(`git ls-files --others --exclude-standard`) — in each sibling repository on the feature branch too
(`## Projects` in `specs/capabilities.md`) — and the `Generated / out-of-band paths` globs to exclude.

### 2. Classify

Combine its result with the task statuses in `tasks.md`:

- an unmet AC whose task is `draft` or `in-progress` → **progress** (not done yet, not an error);
- an unmet AC whose task is `review` or `done`, or that no task serves → **gap**;
- out-of-scope changes, non-goal violations and every `drift` item → **findings**.

### 3. Report

Short, in chat: AC met / pending / gaps, then the findings, at most about 10, each with `file:line`.
For each, the next move:

- unmet AC of an implemented task → `/sdd:implement <task>`
- plan or tasks do not cover an AC → edit `plan.md`, then `/sdd:tasks`
- ambiguous or outdated spec → `/sdd:clarify`
- nothing wrong → `/sdd:review` when every task is `review|done`

Quote task ids, AC ids and file paths; never flag the generated globs.
