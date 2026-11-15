---
title: /sdd:implement
description: Hand tasks to your implementation flow.
---

```text
/sdd:implement <task-id | all>
```

A **dispatcher**, not an implementer. It checks `depends_on`, builds the brief, hands the task to the flow configured in [`capabilities.yml`](/spec-driven-development/configuration/capabilities/) (`skill:`, `agent:`, `command:` or `in-session`) and tracks the status.

- Independent tasks may go to a background flow together; otherwise one after another.
- In a sibling repository it makes sure the feature branch exists first.
- It runs no tests itself: the implementer does, and [`/sdd:review`](/spec-driven-development/commands/review/) verifies.
- Before the first task it commits any documentation `/sdd:tasks` left uncommitted; each finished task's files get a `Task: <EPIC>-T<n>` trailer.
- With `isolation: worktree:` it orchestrates sub-sessions instead. See [Isolated tasks](/spec-driven-development/concepts/isolation/).
