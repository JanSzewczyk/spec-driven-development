---
description: Generate architectural plan from spec (SDD step 3) — run in Plan Mode!
argument-hint: "(optional path to spec.md)"
allowed-tools: Read, Write, Edit, Glob, Grep, Task, ExitPlanMode
---

The **Plan** phase of SDD. Generate an architecture document `plan.md`. **DO NOT write code.**

> ⚠️ Recommended to run this command in **Plan Mode** (Shift+Tab in Claude Code). Plan Mode blocks
> every write except the session's own plan file, so the plan is drafted there and the
> **ExitPlanMode approval is the human review** — `specs/<slug>/plan.md` is written only after you
> approve it (Step 4). Without Plan Mode the command writes `plan.md` directly and stops for review.
>
> 💰 **Recommended session model: Opus** — architecture is judgement-heavy and this is the cheapest
> moment to get it right (a bad plan multiplies cost downstream).

## Steps

### 1. Load context

- `specs/constitution.md` (project constitution — stack, commands, conventions, WHAT NOT TO DO)
- `specs/capabilities.md` (projects + specialist agents + skills + routing rules)
- `specs/<current>/spec.md` (from the current branch OR from `$ARGUMENTS`)

### 2. Survey the existing codebase

Use the **Task tool** (sub-agent of type `Explore`) to scan the current codebase for:
- Architectural patterns (folder structure, naming conventions)
- Existing utilities / services that can be reused
- TypeScript/Python/etc. conventions

The sub-agent returns **only a summary** — saving main-session tokens.

### 2a. Design source — extract once, cache the style spec

If `spec.md` references a design source (a Figma link in its "Links" section, or another design
tool exposed via an MCP server), extract it **once, inside a Task sub-agent** — pull only the
metadata and targeted screenshots you need, parse them in the sub-agent, and have it return a
**distilled style spec** (tokens, spacing, typography, component-to-code mapping). Write that
distilled spec into `plan.md` (see the "Design reference" section below) so downstream phases
(`/sdd:tasks`, `/sdd:implement`, `ui-critic`) read the cache instead of re-pulling the large MCP
output into the main context. Never pull raw design-tool output into the main session.

If there is no design source, skip this step.

### 3. Generate `plan.md`

The target is `specs/<current>/plan.md` (in Plan Mode it is drafted in the plan file first — see
Step 4). Structure:

```markdown
# Plan: <feature_title>

**Spec:** `specs/<slug>/spec.md`
**Status:** draft

## High-level approach
<1-2 paragraphs — what we are building, from a bird's-eye view>

## Data model

```mermaid
erDiagram
    User ||--o{ Session : has
    User { ... }
```

## Component diagram

```mermaid
flowchart LR
    W[web app] --> API[api: /auth/reset]
    M[mobile app] --> API
    API --> S[Reset service]
    S --> D[(DB)]
```

## API surface
| Endpoint | Method | Input | Output | Auth |
|----------|--------|-------|--------|------|
| ... | ... | ... | ... | ... |

## File-by-file change list
<!-- Grouped by project (names from specs/capabilities.md `## Projects`; one group, `root`, in a
     single-app repo). Mark what one project provides and another consumes — a schema, a
     generated client, shared types, a migration — so /sdd:tasks can order those first and run
     the rest in parallel. -->
### api (backend · apps/api)
- `apps/api/app/auth/schemas.py` — reset request/confirm schemas (**contract**, consumed by web + mobile)
- `apps/api/app/auth/reset.py` — reset endpoints
- `apps/api/tests/test_reset.py` — new tests

### web (web · apps/web)
- `apps/web/src/features/reset/reset-form.tsx` — reset form (uses the generated API client)
- `apps/web/src/features/reset/reset-form.test.tsx` — new tests

### mobile (mobile · ../mobile-app)
- `../mobile-app/lib/features/reset/reset_screen.dart` — reset screen
- ...

## Reused utilities
- `packages/shared/errors` (from `packages/shared/src/errors.ts`)
- `app.core.mailer` (from `apps/api/app/core/mailer.py`)

## Design reference
<!-- Only when a design source exists — the distilled style spec cached from Step 2a.
     Omit this section entirely if there is no Figma/design source. -->
- Tokens / spacing / typography: ...
- Component-to-code mapping: <Figma component> → `<code component>`
- Source: <Figma link> (extracted once; do not re-pull)

## Risks & mitigations
- **Risk**: rate limit on external API
  **Mitigation**: exponential backoff in `packages/http/retry.ts`

## Open questions for human review
- ?
```

### 4. Human review, save, advance status

**If Plan Mode is active** (the system tells you so and names a plan file):
1. Write the complete `plan.md` content from Step 3 into **the plan file Plan Mode names** — it is
   the only file you may write while planning.
2. Call `ExitPlanMode`. Its approval dialog is the human review of the plan. If the user rejects
   it with feedback, revise the plan file and call `ExitPlanMode` again.
3. Once approved, Plan Mode is off: write the approved content **verbatim** to
   `specs/<current>/plan.md`. Do not re-plan or start implementing — approval of this plan means
   "save the plan", not "build it"; implementation goes through `/sdd:tasks` + `/sdd:implement`.

**Otherwise** (no Plan Mode): write `specs/<current>/plan.md` directly, then STOP and ask the user
to READ the plan and edit it before continuing.

In both cases: set `specs/<current>/spec.md` header `**Status:**` → `planned` (unless already at a
later state); `plan.md` carries `**Status:** draft`.

Show the user:
- ✅ Plan saved to: `specs/<slug>/plan.md` (approved in Plan Mode, or 👉 READ it and edit before continuing)
- Next step: `/clear`, then `/sdd:tasks` (it re-reads `plan.md` + `capabilities.md` from disk, so
  clearing the transcript first starts the next phase from a small context and loses nothing)

## Constraints

- ⛔ DO NOT create files other than `plan.md` (just this one — plus the Plan Mode plan file while drafting)
- ⛔ DO NOT start implementing after `ExitPlanMode` is approved — save `plan.md` and stop
- ⛔ DO NOT write actual implementation code
- ⛔ DO NOT invoke specialist agents — that is done by `/sdd:implement`
- ✅ ALWAYS produce at least 2 Mermaid diagrams (data + component)
