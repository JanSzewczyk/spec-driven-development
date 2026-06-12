# Project Constitution

> **The source of truth for this project's rules of engagement.**
> The SDD framework reads this file for operational context and edits it via `/sdd:constitution`.
>
> Edit this file with `/sdd:constitution`. No token limit — be detailed.
> Every "WHAT NOT TO DO" entry should carry a *reason* (the incident, the trade-off, the
> upstream constraint). Without rationale, rules become folklore that future contributors
> mechanically break.

**Last reviewed:** <!-- YYYY-MM-DD -->
**Owners:** <!-- team / individuals responsible for keeping this current -->

---

## 1. Tech stack

- **Runtime:**
- **Framework:**
- **Database:**
- **Tests:**
- **Lint / format:**
- **Other notable libs:**

**Why this stack:** <!-- one paragraph: what trade-offs led here, what alternatives were rejected -->

**Links:**
- Architecture decision records: <!-- e.g. docs/adr/ -->
- Onboarding docs: <!-- e.g. internal wiki -->

---

## 2. Run/build commands

| Command | Purpose |
|---------|---------|
| `dev` | local development server |
| `build` | production build |
| `test` | full test suite |
| `typecheck` | type-checker only |
| `lint` | lint + format check |

Add notes for non-obvious flags or env vars required.

---

## 3. Architecture

<!-- One paragraph + (optionally) a Mermaid diagram showing the top-level shape of the repo. -->
<!-- Example: monorepo with `apps/web` (Next.js), `apps/api` (FastAPI), `packages/shared`. -->

```mermaid
flowchart LR
    Client[Web client] --> API
    API --> DB[(Postgres)]
```

**Boundaries we maintain:**
- ...
- ...

---

## 4. Code conventions

- TypeScript strict, no `any`.
- File names: kebab-case.
- Conventional Commits (`feat`, `fix`, `chore`, `refactor`, `docs`, `test`).
- Errors: typed errors, no silent `catch`.

**Examples** (good vs. bad — keep these honest with real code from the repo):

```ts
// ✅ Good
async function loadUser(id: UserId): Promise<Result<User, NotFoundError>> { ... }

// ❌ Bad
async function loadUser(id: any) { try { ... } catch {} }
```

---

## 5. WHAT NOT TO DO ⛔

<!-- THE most important section. Every entry MUST have a "Why" line. -->
<!-- After every meaningful Claude mistake, append the lesson here with its rationale. -->

### Example template for new entries

> ### DO NOT use `npm install` — only `pnpm`
>
> **Why:** the monorepo uses pnpm workspaces; `npm` creates `package-lock.json` that conflicts with `pnpm-lock.yaml` and breaks CI deterministically.
>
> **Incident:** 2026-03-14 — broken deploy traced to drifted lockfiles after a contributor ran `npm i`.

> ### DO NOT mock the database in tests — use testcontainers
>
> **Why:** mocks let migrations drift from runtime; we got bitten by a migration that passed mocked tests but failed in prod.
>
> **Incident:** 2025-11-02 — production rollback after a NOT NULL constraint that mocks ignored.

---

## 6. Testing philosophy

- **Logic** (server actions, hooks, utilities) — classic strict TDD: write failing tests first, then implementation.
- **UI components** (React/Next.js) — contract-first TDD: contract + skeleton, then tests + Storybook story, then full implementation. Props interface lives inline in the `.tsx`.
- **Coverage targets:** unit > 70%, integration > 50%, E2E covers happy paths only.
- **What we DO NOT test:** generated code, trivial getters, third-party library internals.

---

## 7. Error handling philosophy

- Throw typed errors with sufficient context (correlation ID, actor, what was attempted).
- Never swallow errors silently.
- User-facing messages are localised; logs carry the raw error.
- Distinguish *expected* failures (validation, auth) from *unexpected* (system bugs) — the former return Results, the latter bubble.

---

## 8. Out of scope (what we explicitly DO NOT do)

- ...
- ...

This list protects future contributors from inheriting goals that were never agreed to.

---

## 9. SDD flow reminder

- Start any feature with `/sdd:doctor check`.
- Per feature: `/sdd:spec` → `/sdd:clarify` → `/sdd:plan` → `/sdd:tasks` → `/sdd:implement <id>` → `/sdd:review`.
- Specs live in `specs/<feature-slug>/`; the constitution lives at `specs/constitution.md`.
- Routing rules + installed capabilities: `specs/capabilities.md`.
