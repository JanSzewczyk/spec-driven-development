---
description: Find conflicts between spec ↔ plan ↔ tasks ↔ code (SDD diagnostic tool)
argument-hint: "(none — works on the current branch)"
allowed-tools: Read, Glob, Grep, Bash
---

A diagnostic tool for SDD. Scans all documentation layers and the current code state
and detects **inconsistencies**.

Use it when:
- You feel something is off
- The spec was changed after implementation
- You have many tasks and aren't sure what is up to date
- Before `/review` to avoid a NO-GO verdict

## Steps

### 1. Load everything

- `specs/<current>/spec.md`
- `specs/<current>/plan.md` (if it exists)
- `specs/<current>/tasks.md` (if it exists)
- `git diff main..HEAD` — the full diff
- `git log main..HEAD --oneline`

### 2. Cross-check matrix

Generate the conflict matrix:

#### Spec ↔ Plan

- Does every **Acceptance criterion** from spec.md have a counterpart in plan.md (file change list / API surface)?
- Does plan.md introduce anything **beyond** the spec.md scope?

#### Plan ↔ Tasks

- Does every file from the plan.md "File-by-file change list" have a corresponding task?
- Is every task in tasks.md justified by something in plan.md?

#### Tasks ↔ Code

- Do tasks with status `done`/`review` actually have commits modifying their declared `files`?
- Are there changes in the diff in files NOT covered by any task? (out-of-scope drift)

#### Spec ↔ Code

- Are the AC covered by tests (check the test files)?
- Are there feature flags / TODO / FIXME in code that aren't reflected in the spec's open questions?

### 3. Generate the report

```markdown
# Analyze report: <feature>

**Branch:** <type>/<slug>
**Date:** <today>

## ✅ Consistent
- Spec AC1 → plan.md L42 → task T1.2 → 3 commits
- ...

## ⚠️ Drift detected

### Spec → Plan mismatch
- AC3 ("user can reset via SMS") has no counterpart in plan.md API surface.
  → Fix: add a POST /auth/reset-sms endpoint to plan.md OR remove AC3 from spec.md.

### Plan → Tasks mismatch
- plan.md L67 mentions `packages/sms/twilio.ts` but no task creates this file.

### Tasks → Code mismatch
- Task T1.4 (status: done) declared `files: [LoginForm.tsx]` but the diff also shows
  changes in `Header.tsx` — out-of-scope.

### Spec → Code mismatch
- The code contains `// TODO: rate limiting` but the spec's Open Questions don't mention it.

## 🔴 Critical conflicts
- (if any — e.g. spec says X, code does Y without explanation)

## Suggested actions
1. Update plan.md (API surface section)
2. Add task T1.5: create twilio.ts
3. Refactor T1.4: move Header.tsx changes to a new task OR roll back
4. Add to spec Open Questions: rate limiting decision
```

### 4. Suggestions

After the report, propose:
- Concrete file edits (which to edit manually / which through `/implement`)
- `/clarify` if the spec is ambiguous
- `/review` if everything is consistent

## Constraints

- ⛔ DO NOT edit files — this is diagnostics only
- ✅ Be concrete — quote line numbers, task IDs, file paths
- ✅ Classify severity: ✅ Consistent / ⚠️ Drift / 🔴 Critical
