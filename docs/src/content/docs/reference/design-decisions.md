---
title: Design decisions
description: Why the framework looks the way it does.
---

| Decision | Rationale |
|---|---|
| Per-project, not global | Projects differ in stack, commands and implementation flow. A global framework would force homogeneity. |
| Only 3 agents | Implementation is yours; the framework verifies and surveys. Duplicating implementers would be wasted effort and version drift. |
| Self-contained tasks | A task carries scope, acceptance criteria and dependencies, so any implementer or person can pick it up as a ticket. |
| Conventional Commits in `/sdd:spec` | Branch names and commits follow the industry standard; compatible with semantic-release, changesets. |
| Plan = decisions, tasks = tickets | The plan holds decisions and scope; tasks refer to it instead of copying it. |
| Plan Mode for `/sdd:plan` | Approving the plan is the human review; nothing is written before it. |
| Configuration in YAML | `capabilities.yml` is data, not prose: a schema validates it in the editor and the doctor. `init` rewrites only `projects`; re-running it is safe. |
| The branch is the key | Commands find the feature by `**Branch:**` in `spec.md`, so any branch-naming skill works. |
| Constitution under `specs/`, not `CLAUDE.md` | Two concerns. `specs/constitution.md` is the long-form source of truth with rationale and no token budget. The root `CLAUDE.md` is a session loader you own. |
| Framework in the plugin, specs in the project | Commands and agents ship with the plugin (installed once per machine). The project keeps only `specs/`. Updates roll out by reinstalling; project data is never overwritten. |
