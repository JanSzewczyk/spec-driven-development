---
title: End-to-end example
description: "A password-reset feature, from init to PR."
---

## Initialize

```text
/sdd:doctor init       # detects the projects (api, web, mobile) and their commands
/sdd:doctor check      # ✅ READY (7/7)
/sdd:constitution      # fill Tech stack, Run/build, WHAT NOT TO DO with rationale
```

## Spec

```text
/sdd:spec feat user can reset password via email
```

Creates branch `feat/user-can-reset-password-via-email` and `specs/user-can-reset-password-via-email/spec.md`. You fill in user stories, acceptance criteria (AC1: token valid for 30 min, AC2: rate-limited to 3 attempts …) and edge cases (unknown email: silent success).

## Clarify

```text
/sdd:clarify
```

Claude asks: should expired tokens return 410 or 401? Is the rate limit per IP, per email, or both? What if SMTP delivery fails, retry or fail loud? You answer in chat; the spec is updated.

## Plan

Enable Plan Mode (Shift+Tab):

```text
/sdd:plan
```

`plan.md` gets a data model (`User`, `PasswordResetToken`), a component diagram, the API surface (`POST /actions/resetPassword`), an 8-file change list and the code to reuse. **Read it and correct anything wrong.**

## Tasks

```text
/sdd:tasks
```

One Epic across three projects: the shared contract first, then API, web and mobile.

```markdown
## Epic: Password reset

### T1: Reset API (contract + endpoints)
project: api
status: draft
depends_on: []
acceptance: AC1, AC2, AC3
plan: Contracts › reset API; File-by-file › api
scope:
- request/confirm schemas exposed in OpenAPI
- endpoints, token storage, expiry (30 min), same response for unknown e-mails
files: apps/api/app/auth/*

### T2: Reset password screen (web)
project: web
status: draft
depends_on: [T1]
acceptance: AC1, AC4
…

Order: T1 → T2 ∥ T3 → T4
```

## Implement

```text
/sdd:implement all
```

- `T1` goes to the flow configured for `api` (here `agent:python-developer`).
- `T2` and `T3` start once `T1` is done: `web` uses `skill:my-web-flow`, `mobile` falls back to `in-session`.
- `T4` follows when `T1` and `T2` are done.

Each task flips to `review` when its implementer reports done; each task's files are committed with its `Task:` trailer. Nothing is verified yet.

## Review

```text
/sdd:review
```

1. In parallel: tests 23/23; `spec-verifier`: all 4 AC met, no drift; your `qa` check: `PASS`.
2. `reviewer`: constitution rules respected, stack audits pass.
3. The 4 AC are ticked in `spec.md`; verdict **READY**; you confirm the commit and PR.
4. Commit `feat(user-can-reset-password-via-email): <Summary of spec.md>`, PR opened referencing the spec.

## Typical timeline

| Step | Time |
|---|---|
| `/sdd:doctor init` | 30 s |
| `/sdd:spec` | 1 min plus your edits |
| `/sdd:clarify` | 5 min |
| `/sdd:plan` | 3 min |
| Human review of `plan.md` | 5–10 min |
| `/sdd:tasks` | 1 min |
| `/sdd:implement` | depends on your flow |
| `/sdd:review` | 5 min |
| **Total** | **~2–4 h** for a medium feature |
