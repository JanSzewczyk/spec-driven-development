---
description: Split the plan into self-contained, Jira-like tasks (SDD step 4)
argument-hint: "(optional path to plan.md)"
allowed-tools: Read, Write, Glob, Grep
---

The **Tasks** phase of SDD. Turn `plan.md` into a list of **tasks you could hand to an
implementer as they are**: each says what to build, where, and which acceptance criteria it must
satisfy. You plan and describe; you do not implement and you do not choose agents or models —
`/sdd:implement` hands each task to the project's implementation flow.

## Steps

### 1. Load context

- `specs/<current>/plan.md` (current branch, or `$ARGUMENTS`) and `spec.md` (the AC ids)
- `specs/capabilities.md`, only the `## Projects` section

### 2. Decompose

Hierarchy: **Epic → Task**. The Epic is the feature, exactly one per `/sdd:spec` run (work that
feels like several Epics should have been separate specs — say so instead of inventing Epics).

A **task is a ticket**: one project, one coherent slice of behaviour, typically a few hours to a
day — a whole screen with its state and data loading, a set of endpoints with their logic and
storage, a migration, a CLI command. Not a layer, not a micro-step: no task for "the form", for "the
tests" or for "the service" of one unit. Tests belong to the task that delivers the behaviour.

- Every spec AC is covered by at least one task; every task serves at least one AC.
- A contract shared between projects (schema, generated client, shared types, migration) is its
  own task in the project that owns it; consumers depend on it. Cross-project verification (e2e) is
  a task that depends on what it exercises.
- `depends_on` only where a task needs another's result or touches the same files. Never because
  of list order.
- **Do not copy the plan or the spec.** Refer to AC ids and plan sections; `/sdd:implement` inlines
  them into the brief when it hands the task over.

### 3. Write `specs/<current>/tasks.md`

````markdown
# Tasks: <feature_title>

**Spec:** `specs/<slug>/spec.md`  **Plan:** `specs/<slug>/plan.md`

## Epic: <feature_title>

### T1: <title>
project: <name from `## Projects`; `root` in a single-app repo>
status: draft
depends_on: []
acceptance: AC1, AC3
plan: <plan sections this task implements>
scope:
- <concrete action>
- <concrete action>
files: <expected paths or globs, relative to the spec repo>
notes: <optional — a constraint or constitution rule that applies here>
````

`scope` is the list of actions, specific enough to start from (behaviours, states, edge cases from
the AC). `acceptance` is measurable via the spec's AC ids. Omit `notes` and an empty
`depends_on` only when nothing applies.

Add one line at the end: `Order: T1 → T2 ∥ T3 → T4` (what can run once its dependencies are done).

### 4. Check, advance, report

Fail and fix on: an AC with no task, a task with no AC, a cycle, a dependency on a missing task, two
independent tasks with overlapping `files`.

Set `plan.md` `**Status:**` → `tasks-ready` (unless already later). Report the task count, projects
and the `Order:` line. Next: `/sdd:implement T1` (one task) or `/sdd:implement all`; best after
`/clear` — it re-reads `tasks.md` from disk.

Do not write code.
