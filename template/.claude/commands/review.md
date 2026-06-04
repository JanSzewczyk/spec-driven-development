---
description: Final audit before PR — runs sdd-spec-guard + sdd-drift-detector + sdd-reviewer (SDD step 6)
argument-hint: "(none)"
allowed-tools: "*"
---

The **Review** phase of SDD. Final audit before commit + PR. Invokes the SDD verification agents
in sequence (sdd-spec-guard, sdd-drift-detector, sdd-reviewer — plus sdd-ui-critic when UI files
are in the diff) and any domain-specific skills.

## Steps

### 1. Pre-flight

Verify:
- All tasks in `specs/<current>/tasks.md` have status `review` or `done`.
- Branch ≠ `main`/`master`.
- The test suite passes: run the full suite.

If anything fails → STOP, list the blockers.

### 2. Spec-guard (audit vs spec)

```
Task tool: subagent_type=sdd-spec-guard
prompt: "Verify the full diff (git diff main..HEAD) against specs/<current>/spec.md.
         Are ALL Acceptance criteria satisfied? Any out-of-scope changes?"
```

Expected return: JSON `{satisfied: bool, missing: [...], out_of_scope: [...]}`.

### 3. Drift-detector

```
Task tool: subagent_type=sdd-drift-detector
prompt: "Detect drift between the documentation (specs/<current>/) and the current code.
         Return a list of mismatches with file paths and line numbers."
```

### 4. Domain-specific audits (if relevant)

From `.claude/capabilities.md` check which skills are available. Invoke:
- `react-doctor` — if the diff contains `.tsx`/`.jsx` files
- `accessibility-audit` — if the diff contains UI files (components)
- `sdd-ui-critic` sub-agent — if the diff contains UI files; captures Storybook screenshots and evaluates visual quality. Soft check — never blocks on infrastructure (no MCP / Storybook down → `SKIPPED` verdict, warning only).
- Other skills defined in capabilities.md section "Review hooks"

### 5. Generate `review.md`

`specs/<current>/review.md`:

```markdown
# Review: <feature_title>

**Branch:** <type>/<slug>
**Date:** <today>
**Verdict:** GO | NO-GO

## Spec compliance (sdd-spec-guard)
- Satisfied AC: X/Y
- Missing: ...
- Out of scope: ...

## Drift (sdd-drift-detector)
- ...

## React doctor
- Score: 87/100
- Issues: ...

## A11y
- Critical: 0
- Warnings: ...

## Visual review (sdd-ui-critic)
- Verdict: OK | WARNINGS | ISSUES | SKIPPED
- Components reviewed: ...
- Screenshots: ./.sdd-screenshots/
- Findings: ...

## Test coverage
- Unit: 85%
- Integration: 70%
- E2E: ...

## Verdict
- ✅ GO — all checks green
- ❌ NO-GO — needs: <list of actions>
```

### 6. If verdict = GO

Run:

```bash
git add -A
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
<from review.md Test coverage>

## Spec
\`specs/<slug>/spec.md\`
EOF
  )"
```

All tasks in `tasks.md`: status `review` → `done`.

### 7. If verdict = NO-GO

DO NOT commit. List the actions to fix. Suggest:
- `/implement <task-id>` — if implementation is missing
- Manual code edits
- `/analyze` — if drift is unclear

## Constraints

- ⛔ DO NOT commit if verdict = NO-GO
- ⛔ DO NOT skip the core SDD agents (sdd-spec-guard, sdd-drift-detector, sdd-reviewer). `sdd-ui-critic` is invoked by sdd-reviewer when UI files are in the diff and is allowed to SKIP on infrastructure issues.
- ✅ Commit message format: Conventional Commits (`<type>(<scope>): <description>`)
- ✅ PR body contains a link to spec.md
