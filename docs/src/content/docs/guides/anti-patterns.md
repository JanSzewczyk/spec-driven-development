---
title: Anti-patterns
description: Common failure modes when adopting SDD.
---

- ❌ **Skipping `/sdd:clarify`** "because I know what I want". Open questions almost always surface real gaps.
- ❌ **Skipping review of `plan.md`.** Claude can hallucinate architecture, especially on unusual stacks.
- ❌ **Unrelated tasks in one chat.** Context bloats and hallucinations rise. One task per session is the ideal.
- ❌ **Manual `git commit` instead of `/sdd:review`.** You bypass `spec-verifier`, `reviewer` and AC ticking.
- ❌ **Code or tech details in `spec.md`.** The spec is a business document.
- ❌ **Bloated `CLAUDE.md`.** Above ~2,500 tokens Claude starts ignoring the bottom. Shard per module.
- ❌ **`--dangerously-skip-permissions` in production.** A hallucinated bash command can destroy your system.
- ❌ **Implementing without a spec.** SDD works only if every feature has `specs/<slug>/spec.md` first.
- ❌ **Opus for mechanical phases.** Decomposition and drift checks don't need the top tier.
- ❌ **Drip-feeding feedback.** Ten small "move this 2px" turns each reprocess the whole context.
- ❌ **Generated diffs in the loop.** Regenerated clients, mocks and schemas balloon context and cause false out-of-scope findings. Declare them under `generated` in `capabilities.yml`.
