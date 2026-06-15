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

The two shapes are **technology-neutral**; ordering is what matters. Within a Story it is enforced
**by the listed task order** (the preceding task in the Story is the prerequisite), not by parsing
`type` strings. Test-first is the default; contract-first is the narrow exception (see `/sdd:tasks`).

**Test-first units** (the default — the deliverable is behavior):
- The test task runs first. Generate ONLY the test(s). If a missing symbol stops them compiling, add a trivial stub so they compile and then fail on a **meaningful assertion** (not on an unresolved reference / "not found"). Confirm the failure reasons are correct.
- The implementation task runs after, until those tests pass. In single-task mode, the prerequisite is the preceding task in the Story; if it is not yet `review|done`, STOP and require it first.

**Contract-first units** (the exception — the deliverable is itself a public interface/contract other code references by shape) — three phases, run in this order:

| Phase | Runs after | Red/green expectation |
|---|---|---|
| **contract** | first in the chain | declare the unit's public interface/signature so consumers and tests can reference it; add a minimal stub only if the language needs one to compile/resolve |
| **tests** | the contract | tests reference the contract and fail with **meaningful assertion** errors (not unresolved-reference / not-found) |
| **implementation** | the tests | flesh out the unit until those tests pass |

In single-task mode, if a phase's prerequisite is not yet `review|done` → STOP and instruct the user to run `/sdd:implement <prerequisite-id>` first. In whole-Story mode you satisfy each prerequisite by running the phases in order in this session (see the note above).

When building the contract, follow the **project's own conventions** for where interfaces/types live (inline, a dedicated file, a header, an `.proto`, etc.) — the framework imposes no file-layout rule. The stub must carry no real behavior (return a default/empty value or raise "not implemented").

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

- ✅ Test-first by default; contract-first only when the unit's deliverable is itself a public interface/contract other code references by shape
- ✅ Default unit is a **whole Story** — batch its tasks in one session, preserving red→green order
- ✅ Load the union of `skills` for the Story before writing code
- ✅ The specialist agent receives ONLY the Story's scope (spec + the plan section for this Story)
- ✅ Follow the project's own conventions for where interfaces/types live — the framework imposes no file-layout rule
- ✅ Run `spec-guard` and the filtered tests ONCE per Story, at its boundary — not per task
- ⛔ DO NOT skip the phase validation (Step 3) — it guarantees a meaningful red phase
- ⛔ DO NOT skip `spec-guard`
- ⛔ DO NOT commit — that is done by `/sdd:review`
