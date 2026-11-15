---
title: /sdd:spec
description: Create the feature branch and the spec skeleton.
---

```text
/sdd:spec <type> <description>
/sdd:spec feat user can reset password via email
```

`<type>` is one of `feat`, `fix`, `chore`, `refactor`, `docs` (Conventional Commits; `feat` when omitted).

1. Creates the branch with `actions.branch` (a skill, agent or command), else a branch skill the session has, else `git checkout -b <type>/<slug>`.
2. Reads the real branch name; `feature_slug` is the part after the first `/`.
3. Generates `specs/<feature_slug>/spec.md` from `specs/template.md` with the real name in `**Branch:**`. Only the Summary is filled.

:::caution
The spec is **business-only**: no code, no tech-stack details. Those belong in `plan.md`.
:::

Needs `specs/template.md`; otherwise it stops with "Run `/sdd:doctor init` first".
