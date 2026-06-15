---
description: Implement a whole Story (or a single task) with TDD loop + auto-routing to specialist agent (SDD step 5)
argument-hint: "<story-id or task-id>  # e.g. S1 (whole Story — recommended) or T1.2 (one task)"
allowed-tools: "*"
---

The **Implement** phase of SDD. The default and recommended unit of work is a **whole Story** —
`/sdd:implement S1` runs every task in that Story in ONE session (one red→green cycle, one
specialist invocation with the Story's full scope, one spec-guard at the Story boundary). This
keeps the TDD discipline while cutting the per-micro-task ceremony (and cost) that batching avoids.
A single task ID (e.g. `T1.2`) is still accepted for surgical re-runs.

## Steps

### 1. Parse `tasks.md` and resolve scope

Locate `specs/<current>/tasks.md`. From `$ARGUMENTS`:

- **Story ID** (e.g. `S1`) → the scope is **all tasks in that Story**, in listed order. This is the default mode.
- **Task ID** (e.g. `T1.2`) → the scope is that single task only.

For every task in scope, extract from YAML: `title`, `type`, `agent`, `skills`, `acceptance`, `files`.

When the scope is a Story, group the tasks into their natural TDD sub-chains so the red→green
ordering is preserved in a single session:
- Logic: the `*-test` task(s) first (red), then their implementation siblings (green).
- UI components: each `ui-contract` → `ui-component-test` → `ui-component` triplet runs in that order.

### 2. Status → in-progress

Edit `tasks.md`: change `status: draft` → `status: in-progress` for **every task in scope**.

If this is the first Story/task being implemented for the feature, also bump
`specs/<current>/spec.md` header `**Status:**` → `in-progress` (and `plan.md` likewise).

### 3. Phase validation (depends on `type`)

Different TDD strategies apply to different task families. Validate the prerequisite phase is complete before proceeding.

> **When the scope is a whole Story**, the prerequisites of each sub-chain are satisfied
> *within this same session* by running the tasks in order (test → impl, or contract → test → impl).
> You do NOT need the prerequisite task to already be `review|done` on disk — just run it first
> in the session and observe the red phase before writing the implementation. The rules below
> still govern the ordering and the meaningful-red requirement.

**Logic tasks** (`server-action`, `route-handler`, `unit-test`, `generic`, hooks, utilities):
- If `type` ends in `-test`: this IS the test task. Generate ONLY test files. Tests MUST fail (meaningful red phase, not "Module not found"). Confirm failure reasons are correct.
- If `type` does NOT end in `-test`: locate the sibling test task `T<X>.0` (or the first `-test` task in the same Story). If `status ≠ done|review`, STOP — require it first.

**UI component tasks** (`ui-contract`, `ui-component-test`, `ui-component`) — contract-first TDD:

| Current task `type` | Prerequisite | Failure mode |
|---|---|---|
| `ui-contract` | none (first in chain) | — |
| `ui-component-test` | sibling `ui-contract` with `status: review|done` | tests fail with meaningful assertion errors (not module-not-found) |
| `ui-component` (full impl) | sibling `ui-component-test` with `status: review|done` | full implementation makes the tests pass |

If the prerequisite is not satisfied → STOP, instruct the user to run `/sdd:implement <prerequisite-id>` first.

For `ui-contract` tasks:
1. Define the inline TypeScript props interface (e.g. `type LoginFormProps = {...}`) in the `.tsx` file.
2. Export a skeleton component returning `<div data-testid="<kebab-name>" />`.
3. NEVER write `.types.ts` — types live inline with the component.

For `ui-component-test` tasks:
1. Import the contract from the existing `.tsx`.
2. Write tests and Storybook stories that assert on props, render output, and interactions.
3. Tests MUST fail with meaningful assertions (not module-not-found, since the skeleton already exists).

For `ui-component` (full impl):
1. Flesh out the skeleton body until all tests from the sibling `ui-component-test` pass.

### 4. Implementation step

**Before writing code**: load the union of `skills` across the tasks in scope (deduplicated):
```
Use skill: <skill-name>
```
(e.g. `Use skill: storybook-testing`, `Use skill: @szum-tech/server-actions`)

Route by the agent assigned to the Story's tasks. Tasks in a Story normally share one `agent`;
if they differ, group by `agent` and make one invocation per group (still far fewer than one per task).

If the `agent` ≠ `orchestrator`:
- Invoke the **Task tool** ONCE with `subagent_type: <agent>` for the whole group.
- Pass to it as a prompt:
  - The relevant spec.md section (Summary + AC + Edge cases)
  - Only the plan.md section that concerns this Story
  - The combined list of `files` across the group's tasks
  - The acceptance criteria of every task in the group
  - Instruction: "Implement these tasks in TDD order (tests/contract first, observe red, then
    implement to green). Run the affected tests. Return with a diff + per-task status."

If the `agent` = `orchestrator`:
- Implement inline in the main session, one task at a time in TDD order.
- After every Edit/Write the PostToolUse hook automatically runs typecheck + lint.
- If the hook returns exit 2 → fix the errors and continue.

### 5. Verification

After implementation, run the tests covering the Story's files (filtered, not the whole suite —
the full suite is `/sdd:review`'s job):

```bash
# Run the tests for the files touched by this Story
<test-command from CLAUDE.md> <story test paths>
```

ALL of the Story's tests MUST pass.

### 6. Spec-guard (once, at the Story boundary)

Invoke the `spec-guard` sub-agent **once** (Task tool, `subagent_type: spec-guard`) over the
Story's combined diff — NOT once per task. If it returns `satisfied: false` or
`out_of_scope: [...]`, DO NOT mark the Story done — address the findings.

(`/sdd:review` runs spec-guard again feature-wide as the final gate. Within `implement` it runs
at most once per Story, so a feature with N stories pays N story-checks here, not one per task.)

### 7. Status → review

In `tasks.md`: set `status: in-progress` → `status: review` for **every task in scope**.

### 8. Output

```markdown
✅ Story S1 implemented (tasks T1.1–T1.3)
- Files changed: <list>
- Tests: <X> passed (filtered to the Story)
- Spec-guard: satisfied=true (one check for the whole Story)
- Next: /sdd:implement S2  OR  /sdd:review (if this was the last Story)
```

## Constraints

- ✅ TDD-first for logic tasks; contract-first TDD for UI components
- ✅ Default unit is a **whole Story** — batch its tasks in one session, preserving red→green order
- ✅ Load the union of `skills` for the Story before writing code
- ✅ The specialist agent receives ONLY the Story's scope (spec + the plan section for this Story)
- ✅ UI props interface lives inline in `.tsx`, NEVER in a separate `.types.ts` file
- ✅ Run `spec-guard` and the filtered tests ONCE per Story, at its boundary — not per task
- ⛔ DO NOT skip the phase validation (Step 3) — it guarantees a meaningful red phase
- ⛔ DO NOT skip `spec-guard`
- ⛔ DO NOT commit — that is done by `/sdd:review`
