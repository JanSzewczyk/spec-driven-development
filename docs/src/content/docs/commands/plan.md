---
title: /sdd:plan
description: Generate plan.md in Plan Mode.
---

**Run in Plan Mode** (Shift+Tab). Claude reads and analyzes, drafts the plan in the session's plan file and calls ExitPlanMode. Approving that dialog is your review, and only then is the plan saved to `specs/<slug>/plan.md`. Without Plan Mode the plan is written directly and the command stops for you to read it.

`plan.md` holds the **decisions** and the **scope** of the change:

- high-level approach: key decisions, reasons, rejected alternatives
- contracts shared between projects or layers (when any)
- file-by-file change list per project, one line per file, with the code it reuses
- risks, mitigations and open questions
- only when they help: data model, component diagram, API surface, reference sources

Before the draft, [`codebase-surveyor`](/spec-driven-development/agents/overview/) maps the affected projects so the plan reuses what exists. Real forks are put to you as questions with a recommendation.

:::caution
Human review of `plan.md` is mandatory before `/sdd:tasks`. It is the cheapest moment to correct course.
:::
