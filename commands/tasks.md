---
description: Decompose plan into tagged, auto-routed tasks (SDD step 4)
argument-hint: "(optional path to plan.md)"
allowed-tools: Read, Write, Glob
---

The **Tasks** phase of SDD. Decompose `plan.md` into small, testable tasks WITH TAGS auto-routing
to specialist agents.

## Steps

### 1. Load context

- `specs/<current>/plan.md` (from the current branch)
- `specs/capabilities.md` — **critical**: the "Task type → routing rules" section (both
  the defaults and any `<!-- user-override -->` customizations)

### 2. Decomposition

From `plan.md` (the "File-by-file change list" section) generate the task list:
- Hierarchy: **Epic** → **Story** → **Task**
- Maximum size of a single task: ~1-2 hours of work
- **TDD discipline depends on the task family** (see below):
  - **Logic** (server actions, route handlers, hooks, utilities) → classic strict TDD: the first task in every Story is a failing test, then implementation.
  - **UI components** (React/Next.js) → contract-first TDD in **3 tasks per component**: contract+skeleton, then tests+story, then full implementation. Strict TDD fails for components because a test importing a not-yet-existing component breaks with "Module not found" — not a meaningful red phase.

### 2a. Contract-first TDD for UI components

When a plan.md item is a React component (file ending in `.tsx` that exports a JSX component), emit **3 tasks** instead of one:

```yaml
- id: T<n>.1
  title: <Component> contract + skeleton
  type: ui-contract
  agent: orchestrator
  skills: [design-system]
  status: draft
  acceptance: |
    Inline TypeScript props interface defined in <Component>.tsx.
    Component exports a skeleton returning <div data-testid="<kebab-name>" />.
    TypeScript compiles.
  files: [<path>/<Component>.tsx]

- id: T<n>.2
  title: <Component> tests + story
  type: ui-component-test
  agent: <from capabilities routing — usually storybook-tester>
  skills: [storybook-testing, design-system]
  status: draft
  acceptance: |
    Tests import the component (no module-not-found).
    Assertions fail with MEANINGFUL errors (e.g. "expected submit button, got empty div").
    Storybook story renders the skeleton without errors.
  files: [<path>/<Component>.stories.tsx, <path>/__tests__/<Component>.test.tsx]

- id: T<n>.3
  title: <Component> implementation
  type: ui-component
  agent: orchestrator
  skills: [design-system]
  status: draft
  acceptance: |
    All tests from T<n>.2 pass.
    Storybook play function assertions green.
    AC from spec.md satisfied.
  files: [<path>/<Component>.tsx]
```

**Important**: Props interface lives **inline** in the `.tsx` file. DO NOT emit separate `.types.ts` files.

### 3. Auto-tagging — for every task, assign

```yaml
- id: T<story>.<n>
  title: <one-line description>
  type: <task type from capabilities.md>
  agent: <specialist agent from routing rules OR "orchestrator">
  skills: [<skills to load>]
  status: draft
  acceptance: <concrete AC from spec.md, measurable>
  files: [<files to create or modify>]
```

**Auto-routing logic:**

1. Choose a `type` from the task description:
   - "Component contract" / "skeleton" → `ui-contract`
   - "Storybook story" / "interaction test" → `ui-component-test`
   - "React component" / "JSX" / full impl → `ui-component`
   - "Server action" / "use server" → `server-action`
   - "API route" / "route handler" → `route-handler`
   - "Unit test" (non-component) → `unit-test`
   - "E2E test" / "Playwright" → `e2e-test`
   - "A11y" / "ARIA" → `a11y-audit`
   - "Test plan" / "coverage strategy" → `test-strategy`
   - Otherwise → `generic`

2. From `capabilities.md` find the row matching `type` and pull `agent` + `skills`.

3. If no routing rule matches → `agent: orchestrator`, `skills: []`.

### 4. Write `tasks.md`

`specs/<current>/tasks.md`:

```markdown
# Tasks: <feature_title>

**Spec:** `specs/<slug>/spec.md`
**Plan:** `specs/<slug>/plan.md`

## Epic: <name>

### Story S1: <name>

```yaml
- id: T1.1
  title: Write tests for LoginForm
  type: unit-test
  agent: orchestrator
  skills: [unit-testing]
  status: draft
  acceptance: render + validation + submit with mocked onSubmit
  files: [apps/web/src/components/__tests__/LoginForm.test.tsx]

- id: T1.2
  title: Implement LoginForm component
  type: ui-component
  agent: orchestrator
  skills: [design-system]
  status: draft
  acceptance: spec.md AC1, AC2
  files: [apps/web/src/components/LoginForm.tsx]

- id: T1.3
  title: Storybook story + play test
  type: ui-component-test
  agent: storybook-tester
  skills: [storybook-testing, design-system]
  status: draft
  acceptance: play function asserts the full form validation flow
  files: [apps/web/src/components/LoginForm.stories.tsx]
```
```

### 5. Output

Show the user a summary table:

```markdown
| ID | Title | Type | Agent | Status |
|----|-------|------|-------|--------|
| T1.1 | Write tests... | unit-test | orchestrator | draft |
| T1.2 | Implement... | ui-component | orchestrator | draft |
| T1.3 | Storybook... | ui-component-test | storybook-tester | draft |
```

Plus the suggestion: `/sdd:implement T1.1` to start with the tests.

## Constraints

- ⛔ DO NOT write actual code
- ✅ Logic tasks: first in a Story is a failing test (classic TDD)
- ✅ UI components: 3-task decomposition (`ui-contract` → `ui-component-test` → `ui-component`)
- ✅ Props interface inline in `.tsx`, NEVER in a separate `.types.ts` file
- ✅ Every task has `agent` and `skills` assigned (even if empty)
- ✅ `acceptance` must be measurable (NOT "works correctly")
