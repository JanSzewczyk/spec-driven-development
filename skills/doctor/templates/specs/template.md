# Feature: {{feature_title}}

**Branch:** {{type}}/{{feature_slug}}
**Status:** draft  <!-- lifecycle: draft → clarified → planned → in-progress → done; advanced automatically by each /sdd command -->
**Type:** {{type}}  <!-- feat | fix | chore | refactor | docs -->
**Owner:** {{author}}
**Created:** {{date}}

---

## Summary (business)

<!-- What problem are we solving and for whom. DO NOT write HOW. -->

## User stories

- As a **<role>**, I want **<what>**, so that **<why>**.

## Functional requirements

- [ ] FR1: ...
- [ ] FR2: ...

## Acceptance criteria

<!-- Concrete, measurable. Each AC maps to one test. -->

- [ ] AC1: given input X → produces output Y
- [ ] AC2: ...

## Edge cases

<!-- What if: no network, race condition, invalid input, concurrent users, ... -->

- ?

## Non-goals (out of scope)

<!-- What this feature does NOT do. Protects against scope creep. -->

- ...

## Open questions

<!-- The /sdd:clarify phase fills these in. The owner answers them BEFORE /plan. -->

- ?

## Testing guidelines

<!-- Test framework, test file locations, what to test at each layer -->

- **TDD strategy:**
  - **Logic** (server actions, route handlers, hooks, utilities) → classic strict TDD: write failing test first, then implementation.
  - **UI components** (React/Next.js) → contract-first TDD in 3 phases: contract + skeleton (props interface inline in `.tsx`), then tests + Storybook story, then full implementation. This is required because a test importing a non-existent component fails with "Module not found" instead of a meaningful red.
- Unit:
- Integration:
- E2E:
- A11y (if UI):

## Dependencies & prerequisites

<!-- What must be ready beforehand (other features, env vars, infra). -->

- ...

## Notes

<!-- Links to Figma, design docs, ADRs -->
