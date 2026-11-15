---
title: Cost and model tiering
description: Which model to run for which phase.
---

The biggest cost lever is **which model runs which phase**. A slash command cannot switch the session model, so this is operating guidance.

| Phase | Recommended model | Why |
|---|---|---|
| `/sdd:constitution`, `/sdd:clarify`, `/sdd:plan`, `/sdd:review` | **Opus** | Judgement-heavy: framing, architecture and the final gate. Cheap to get right here, expensive to get wrong downstream. |
| `/sdd:spec`, `/sdd:tasks` | **Sonnet** | Mechanical: a branch and a filled template; decomposition of an approved plan. |
| `/sdd:analyze` | any | Delegates to `spec-verifier` (Sonnet). |
| `/sdd:implement` | your flow's choice | The framework only hands over. |

The verification agents carry their own `model:` frontmatter: `reviewer` on Opus, `spec-verifier` on Sonnet, `codebase-surveyor` on Haiku. They run at their own tier regardless of the session model.

Keep large and generated output **out of the main loop**: verification agents exclude the `generated` globs from every diff, `/sdd:plan` extracts reference sources (mockups, API specs, ADRs) once inside a sub-agent and caches what matters in `plan.md`, and large codebase scans return only a summary.
