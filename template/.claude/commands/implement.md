---
description: Implement one task with TDD loop + auto-routing to specialist agent (SDD step 5)
argument-hint: "<task-id>  # e.g. T1.2"
allowed-tools: "*"
---

The **Implement** phase of SDD. Implement ONE task with auto-routing to the right specialist agent.

## Steps

### 1. Parse `tasks.md`

Locate `specs/<current>/tasks.md`. Find the task by the ID from `$ARGUMENTS` (e.g. `T1.2`).

Extract from YAML:
- `title`
- `type`
- `agent`
- `skills`
- `acceptance`
- `files`

### 2. Status → in-progress

Edit `tasks.md`: change `status: draft` → `status: in-progress` for this task.

### 3. Phase validation (depends on `type`)

Different TDD strategies apply to different task families. Validate the prerequisite phase is complete before proceeding.

**Logic tasks** (`server-action`, `route-handler`, `unit-test`, `generic`, hooks, utilities):
- If `type` ends in `-test`: this IS the test task. Generate ONLY test files. Tests MUST fail (meaningful red phase, not "Module not found"). Confirm failure reasons are correct.
- If `type` does NOT end in `-test`: locate the sibling test task `T<X>.0` (or the first `-test` task in the same Story). If `status ≠ done|review`, STOP — require it first.

**UI component tasks** (`ui-contract`, `ui-component-test`, `ui-component`) — contract-first TDD:

| Current task `type` | Prerequisite | Failure mode |
|---|---|---|
| `ui-contract` | none (first in chain) | — |
| `ui-component-test` | sibling `ui-contract` with `status: review|done` | tests fail with meaningful assertion errors (not module-not-found) |
| `ui-component` (full impl) | sibling `ui-component-test` with `status: review|done` | full implementation makes the tests pass |

If the prerequisite is not satisfied → STOP, instruct the user to run `/implement <prerequisite-id>` first.

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

**Before writing code**: load skills from `task.skills`:
```
Use skill: <skill-name>
```
(e.g. `Use skill: storybook-testing`, `Use skill: @szum-tech/server-actions`)

If `task.agent` ≠ `orchestrator`:
- Invoke the **Task tool** with `subagent_type: <task.agent>`.
- Pass to it as a prompt:
  - The full spec.md section (Summary + AC + Edge cases)
  - Only the plan.md section that concerns this task
  - The list of files from `files`
  - Acceptance criteria
  - Instruction: "Implement the task. Run tests. Return with a diff + status."

If `task.agent` = `orchestrator`:
- Implement inline in the main session.
- After every Edit/Write the PostToolUse hook automatically runs typecheck + lint.
- If the hook returns exit 2 → fix the errors and continue.

### 5. Verification

After implementation:

```bash
# Run the test suite (whole or filtered)
<test-command from CLAUDE.md>
```

ALL tests MUST pass.

### 6. Spec-guard

Invoke the `sdd-spec-guard` sub-agent (Task tool, `subagent_type: sdd-spec-guard`) to verify diff
compliance with `spec.md`. If it returns `satisfied: false` or `out_of_scope: [...]`,
DO NOT mark the task as done — address the findings.

### 7. Status → review

In `tasks.md`: `status: in-progress` → `status: review`.

### 8. Output

```markdown
✅ Task T1.2 implemented
- Files changed: <list>
- Tests: <X> passed
- Spec-guard: satisfied=true
- Next: /implement T1.3 OR /review (if this is the last task in the Story)
```

## Constraints

- ✅ TDD-first for logic tasks; contract-first TDD for UI components
- ✅ Load every `skill` from the task before writing code
- ✅ The specialist agent receives ONLY its scope (spec + plan section for this task)
- ✅ UI props interface lives inline in `.tsx`, NEVER in a separate `.types.ts` file
- ⛔ DO NOT skip the phase validation (Step 3) — it guarantees a meaningful red phase
- ⛔ DO NOT skip `sdd-spec-guard`
- ⛔ DO NOT batch multiple tasks in one session — one task = one Implement call
- ⛔ DO NOT commit — that is done by `/review`
