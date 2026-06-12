---
description: Generate architectural plan from spec (SDD step 3) — run in Plan Mode!
argument-hint: "(optional path to spec.md)"
allowed-tools: Read, Write, Glob, Grep, Task
---

The **Plan** phase of SDD. Generate an architecture document `plan.md`. **DO NOT write code.**

> ⚠️ Recommended to run this command in **Plan Mode** (Shift+Tab in Claude Code) — that way
> Claude has file edits disabled and can only read + plan.

## Steps

### 1. Load context

- `CLAUDE.md` (project constitution)
- `.claude/capabilities.md` (specialist agents + skills + routing rules)
- `specs/<current>/spec.md` (from the current branch OR from `$ARGUMENTS`)

### 2. Survey the existing codebase

Use the **Task tool** (sub-agent of type `Explore`) to scan the current codebase for:
- Architectural patterns (folder structure, naming conventions)
- Existing utilities / services that can be reused
- TypeScript/Python/etc. conventions

The sub-agent returns **only a summary** — saving main-session tokens.

### 3. Generate `plan.md`

Save to `specs/<current>/plan.md`. Structure:

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
    A[Client] --> B[Server Action]
    B --> C[Service]
    C --> D[(DB)]
```

## API surface
| Endpoint | Method | Input | Output | Auth |
|----------|--------|-------|--------|------|
| ... | ... | ... | ... | ... |

## File-by-file change list
- `apps/web/src/components/LoginForm.tsx` — new component
- `apps/api/src/auth/signIn.ts` — new server action
- `apps/api/src/auth/__tests__/signIn.test.ts` — new test
- ...

## Reused utilities
- `packages/errors/AuthError` (from `packages/errors/src/auth.ts`)
- `packages/db/prismaClient` (from `packages/db/src/client.ts`)

## Risks & mitigations
- **Risk**: rate limit on external API
  **Mitigation**: exponential backoff in `packages/http/retry.ts`

## Open questions for human review
- ?
```

### 4. STOP — human review

Show the user:
- ✅ Plan saved to: `specs/<slug>/plan.md`
- 👉 READ the plan and edit manually before continuing
- Next step: `/sdd:tasks`

## Constraints

- ⛔ DO NOT create files other than `plan.md` (just this one)
- ⛔ DO NOT write actual implementation code
- ⛔ DO NOT invoke specialist agents — that is done by `/sdd:implement`
- ✅ ALWAYS produce at least 2 Mermaid diagrams (data + component)
