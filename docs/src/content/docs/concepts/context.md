---
title: Context management
description: How SDD keeps sessions small.
---

1. **Per-task briefs.** The implementer receives only its task, the acceptance criteria and plan sections it names, never the whole feature.
2. **Sub-agents for large reads.** The codebase survey, reference sources and verification run in sub-agents and return summaries.
3. **Fresh chat per task.** Open a new session between tasks; `tasks.md` status is the handover document.

Every phase command re-reads its inputs from disk (`spec.md`, `plan.md`, `tasks.md`, `capabilities.yml`), so `/clear` between `plan → tasks → implement → review` loses nothing.

Generated files (clients, mocks, schemas) balloon context and trigger false out-of-scope findings. Declare them under `generated` in [`capabilities.yml`](/spec-driven-development/configuration/capabilities/) and they are left out of every diff.
