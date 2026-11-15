---
title: Best practices
description: Thirteen rules for getting the most out of SDD.
---

1. **Make the work verifiable.** Every task's `acceptance` field points to measurable criteria; the implementer runs the project's checks and `/sdd:review` verifies against them. Default to test-first in your implementation flow.
2. **The constitution is the WHY.** Every WHAT NOT TO DO rule carries a `**Why:**` line (and an incident reference when applicable). After every Claude mistake, append the lesson with its rationale. Without rationale, rules become folklore and get re-broken.
3. **Shard large specs.** Never hand a giant PRD to an implementer. Epic → Task; each implementer receives only its task's brief.
4. **A `CLAUDE.md` per module.** Root for cross-cutting rules, one per app or package for the rest, each lean and pointing at `specs/constitution.md`. The framework never reads or writes them.
5. **Run `/sdd:plan` in Plan Mode.** Claude cannot modify files while exploring; approving the plan saves it. Not for `/sdd:clarify`, which writes into `spec.md`.
6. **Human in the loop on `plan.md`.** Always read it before `/sdd:tasks`.
7. **One branch per feature.** `/sdd:spec` enforces it, with Conventional Commits naming.
8. **Sub-agents for large reads.** Don't grep 50 files in the main session; receive a summary.
9. **Keep spec and code in sync.** When you change code by hand, update the spec. Run `/sdd:analyze` periodically.
10. **Fresh chat per task, `/clear` between phases.** Every phase re-reads its inputs from disk; `tasks.md` status is the handover.
11. **Embrace Clarify.** Questions before planning surface gaps that would burn implementation cycles.
12. **Tier your models.** See [Cost & model tiering](/spec-driven-development/guides/cost/).
13. **Batch human feedback.** Collect visual/QA tweaks and NOT READY fixes into one message per round; each turn reprocesses the full context.
