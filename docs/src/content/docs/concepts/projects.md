---
title: Projects and monorepos
description: SDD reasons about projects, not one stack.
---

SDD works on **projects**, units with their own stack and commands. `/sdd:doctor init` finds them: an Nx or Turborepo workspace, pnpm/yarn/uv/Cargo/Go workspaces, Gradle includes, or stray manifests such as `apps/api/pyproject.toml`. When the code is spread over several repositories it asks which siblings belong to the product.

- **`capabilities.yml` → `projects`** lists each one with its kind (web, backend, mobile, library, e2e …), path and stack. `implementation.projects` can name a different flow per project.
- **Constitution §2** has one command row per project (`test`, `coverage`, `typecheck`, `lint`, `dev`): a Python API runs `cd apps/api && uv run pytest`, the web app `pnpm nx run web:test`, a Flutter app `flutter test`.
- **No fixed list of stacks.** `init` reads declared scripts, CI and pre-commit config and tool config files, for any language or tool. Supporting a new tool usually requires editing nothing.

## Several repositories

- Everyone checks the sibling repos out next to the spec repo under the same names (the relative paths are committed).
- `specs/` lives in one spec repo.
- `/sdd:implement` makes sure the same feature branch exists in each sibling repo before the flow edits it.
- `/sdd:review` commits and opens a linked PR in every one of them.
- `init` adds the sibling repos to `permissions.additionalDirectories`.

A project in a sibling repository carries `repo: true` in `capabilities.yml`.

A Claude Code session loader (`CLAUDE.md`, root or per-module) stays yours: the framework never reads, writes or enforces it.
