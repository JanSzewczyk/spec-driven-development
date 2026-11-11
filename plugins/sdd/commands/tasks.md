---
description: Decompose plan into tagged, auto-routed tasks (SDD step 4)
argument-hint: "(optional path to plan.md)"
allowed-tools: Read, Write, Glob
---

The **Tasks** phase of SDD. Decompose `plan.md` into small, testable tasks WITH TAGS auto-routing
to specialist agents.

> 💰 **Recommended session model: Sonnet.** Decomposition is mechanical — reserve Opus for the
> judgement-heavy phases (`/sdd:spec`, `/sdd:clarify`, `/sdd:plan`, `/sdd:review`).

## Steps

### 1. Load context

- `specs/<current>/plan.md` (from the current branch)
- `specs/capabilities.md` — **critical**: the "Task type → routing rules" section (both
  the defaults and any `<!-- user-override -->` customizations)

### 2. Decomposition

From `plan.md` (the "File-by-file change list" section) generate the task list:
- Hierarchy: **Epic** → **Story** → **Task**
- **Exactly ONE Epic per feature** — a single `/sdd:spec` run produces one feature, which maps to one Epic. NEVER emit multiple Epics. If the work feels like several Epics, that is a sign the feature is too large and should have been split into separate `/sdd:spec` runs — flag this to the user rather than inventing extra Epics.
- Stories group cohesive tasks that ship together; `/sdd:implement` executes a **whole Story per session**, so keep each Story self-contained (its own red→green cycle).
- Maximum size of a single task: ~1-2 hours of work
- **Pick the TDD shape per unit. Test-first is the DEFAULT; contract-first is a narrow exception** (technology-neutral, biased toward fewer tasks):
  - **Test-first (default, 1 test task + implementation)** — the normal case. Write the failing test first, then the implementation. A missing export/symbol does NOT make a unit contract-first: just stub it trivially (e.g. an empty function) so the test compiles and fails on a real assertion. *Use for: functions, service methods, HTTP handlers, CLI commands, scripts — anything whose deliverable is behavior.*
  - **Contract-first (exception, 3 tasks)** — use **only** when the unit's deliverable *is itself a public interface/contract that other code must reference by shape* before any behavior exists, so a trivial stub isn't enough to write meaningful tests. Define the contract, then the tests, then the implementation. *Use for: a UI component's props, a typed service interface other modules implement/consume, an API/RPC schema. When in doubt, choose test-first.*

### 2a. Contract-first decomposition (3 tasks)

For the **exception** units above — where the deliverable is a public interface/contract other code references by shape — emit **3 tasks** instead of one. Pick the `type` for each phase from `capabilities.md` (the per-project routing table names them):

```yaml
- id: T<n>.1
  title: <Unit> contract
  type: <contract-phase type from capabilities.md>
  agent: <from capabilities routing OR orchestrator>
  skills: [<from routing>]
  model: <from capabilities routing OR sonnet>
  status: draft
  acceptance: |
    The unit's public interface/signature is declared so consumers and tests can reference it.
    If the language needs a definition to compile/resolve, add a MINIMAL stub with no real
    behavior (returns a default/empty value or raises "not implemented").
    The project's typecheck/build passes.
  files: [<path to the unit>]

- id: T<n>.2
  title: <Unit> tests
  type: <test-phase type from capabilities.md>
  agent: <from capabilities routing OR orchestrator>
  skills: [<from routing>]
  model: <from capabilities routing OR sonnet>
  status: draft
  acceptance: |
    Tests reference the contract (no unresolved-reference / not-found errors).
    Assertions fail with MEANINGFUL errors describing missing behavior (a real red phase).
  files: [<test file(s) for the unit>]

- id: T<n>.3
  title: <Unit> implementation
  type: <implementation-phase type from capabilities.md>
  agent: <from capabilities routing OR orchestrator>
  skills: [<from routing>]
  model: <from capabilities routing OR sonnet>
  status: draft
  acceptance: |
    All tests from T<n>.2 pass.
    AC from spec.md satisfied.
  files: [<path to the unit>]
```

**Keep the contract where the project keeps interfaces.** Follow the project's existing conventions
(discovered in `plan.md` / the codebase) for where a type or interface lives — do not impose a
separate-file or inline rule from the framework.

### 3. Auto-tagging — for every task, assign

```yaml
- id: T<story>.<n>
  title: <one-line description>
  type: <task type from capabilities.md>
  agent: <specialist agent from routing rules OR "orchestrator">
  skills: [<skills to load>]
  model: <cost tier from routing rules OR "sonnet">
  status: draft
  acceptance: <concrete AC from spec.md, measurable>
  files: [<files to create or modify>]
```

**Auto-routing logic:**

1. Choose a `type` for the task. **The set of available types comes from the project's
   `capabilities.md` routing table** — that file is where stack-specific work types live. Match the
   task to the closest type by the nature of the work, e.g.:
   - a contract / interface phase → the project's contract-phase type
   - a test phase (unit, integration, e2e, contract test) → the matching test type
   - an implementation phase → the matching implementation type
   - anything with no dedicated row → `generic`
2. From `capabilities.md` find the row matching `type` and pull `agent` + `skills` + `model` (the
   advisory cost tier from the `Model` column).
3. If no routing rule matches → `agent: orchestrator`, `skills: []`, `model: sonnet`. If the
   routing table has no `Model` column (legacy `capabilities.md`) → default every task to `sonnet`.

### 4. Write `tasks.md`

`specs/<current>/tasks.md`:

```markdown
# Tasks: <feature_title>

**Spec:** `specs/<slug>/spec.md`
**Plan:** `specs/<slug>/plan.md`

## Epic: <name>

### Story S1: <name>

<!-- Illustrative example — a React feature. The `type` values come from this project's
     capabilities.md; another stack would use its own types and tools. -->

```yaml
- id: T1.1
  title: Write tests for LoginForm
  type: unit-test
  agent: orchestrator
  skills: [unit-testing]
  model: sonnet
  status: draft
  acceptance: render + validation + submit with mocked onSubmit
  files: [apps/web/src/components/__tests__/LoginForm.test.tsx]

- id: T1.2
  title: Implement LoginForm component
  type: ui-component
  agent: orchestrator
  skills: [design-system]
  model: sonnet
  status: draft
  acceptance: spec.md AC1, AC2
  files: [apps/web/src/components/LoginForm.tsx]

- id: T1.3
  title: Storybook story + play test
  type: ui-component-test
  agent: storybook-tester
  skills: [storybook-testing, design-system]
  model: sonnet
  status: draft
  acceptance: play function asserts the full form validation flow
  files: [apps/web/src/components/LoginForm.stories.tsx]
```
```

### 5. Advance status + output

Set `specs/<current>/plan.md` header `**Status:**` → `tasks-ready` (unless already at a later state).

Show the user a summary table:

```markdown
| ID | Title | Type | Agent | Model | Status |
|----|-------|------|-------|-------|--------|
| T1.1 | Write tests... | unit-test | orchestrator | sonnet | draft |
| T1.2 | Implement... | ui-component | orchestrator | sonnet | draft |
| T1.3 | Storybook... | ui-component-test | storybook-tester | sonnet | draft |
```

Plus the suggestion: `/clear`, then `/sdd:implement S1` to implement the whole first Story in one
session (recommended — one red→green cycle, one spec-guard). `/sdd:implement` re-reads `tasks.md`
from disk, so clearing the transcript first keeps the implement session small. A single task ID
(`/sdd:implement T1.1`) still works for surgical re-runs.

## Constraints

- ⛔ DO NOT write actual code
- ✅ Test-first by default: the first task in the Story is a failing test, then implementation
- ✅ Contract-first only when the unit's deliverable is itself a public interface/contract other code references by shape: 3-task decomposition (contract → tests → implementation)
- ✅ Follow the project's own conventions for where interfaces/types live — the framework imposes no file-layout rule
- ✅ `type` values are drawn from the project's `capabilities.md` routing table
- ✅ Every task has `agent`, `skills`, and `model` assigned (`model` defaults to `sonnet`)
- ✅ `acceptance` must be measurable (NOT "works correctly")
