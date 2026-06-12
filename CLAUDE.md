# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is **not an application** — it is a **Claude Code plugin** named `sdd` that ships the Spec-Driven Development framework. It contains slash commands, sub-agents, blocking hooks, and a setup skill, all consumed by Claude Code itself. There is no build step and almost no runtime code; the only executable code is the Python/Bash glue in `hooks/` and `skills/doctor/`.

The plugin is installed into a *target* project (`~/.claude/plugins/cache/sdd`) and operates on that project's `specs/` directory and git repo. When developing here, you are editing the plugin; to see behavior you exercise it against a separate target project.

## Commands

There is no `npm`/`make`. The "tests" are the doctor scripts, run against a target project (see CONTRIBUTING.md "Testing your changes locally"):

```bash
# Audit a target project's SDD readiness (11 checks, JSON on stdout)
python3 skills/doctor/check.py --root /path/to/target-project

# Bootstrap/migrate per-project artifacts into a target project
python3 skills/doctor/init.py --root /path/to/target-project
```

Smoke-test loop: run `check.py` against a fresh empty dir → `init.py` → `check.py` again and confirm checks flip to pass. `check.py` is the closest thing to a unit test in this repo.

## Architecture

The SDD flow is a fixed pipeline of slash commands, each writing artifacts under `specs/<feature-slug>/`:

```
/sdd:constitution → /sdd:spec → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:review
```

Four kinds of plugin asset, each in its own top-level dir, wired together by `plugin.json`:

- **`commands/*.md`** — the 9 user-facing slash commands (`/sdd:<name>`). Each is a markdown prompt with YAML frontmatter (`description`, `argument-hint`, `allowed-tools`). The *body is the instruction set Claude executes* — editing behavior means editing prose, not code. `spec.md` creates the branch + skeleton; `implement.md` is the heart (TDD loop + per-task routing); `review.md` orchestrates the verification agents.

- **`agents/*.md`** — 4 verification sub-agents invoked via the Task tool, never directly by the user:
  - `spec-guard` — checks a diff satisfies all Acceptance Criteria and adds nothing out-of-scope; returns `{satisfied, missing, out_of_scope}`. Called per-task by `/sdd:implement` and per-feature by `/sdd:review`.
  - `drift-detector` — finds mismatches between spec/plan/tasks docs and actual code.
  - `reviewer` — final GO/NO-GO audit; runs the test suite + domain audits.
  - `ui-critic` — screenshots changed UI via a browser MCP; skips gracefully if none is available (never blocks).

- **`hooks/`** — `typecheck.py` + `lint.sh`, wired as PostToolUse hooks in the *target* project's `.claude/settings.json` (installed by `doctor init`). They run after every Edit/Write. **Exit-code contract: 0 = no-op or success, 2 = tool ran and found errors → blocks Claude.** Both are *safe-by-default*: if the relevant tool isn't on `$PATH` they exit 0. They auto-detect the language from the file extension and pick the first available tool (JS/TS lint: Biome → ESLint → oxlint).

- **`skills/doctor/`** — the `doctor` skill (audit + setup). `SKILL.md` is the instruction layer; `check.py` (11 read-only checks → JSON) and `init.py` (bootstrap/migrate) are the helpers. `init.py` **safe-merges** `.claude/settings.json` — it strips only its own previously-installed hook entries (identified by `hooks/typecheck.py`/`hooks/lint.sh` in the command) and preserves every other key. Templates seeded into target projects live in `skills/doctor/templates/`.

### Key concepts when editing

- **Per-task routing**: every task in a target's `tasks.md` carries `type`, `agent`, `skills` fields. `/sdd:implement` reads them to route work to the right specialist sub-agent (from the marketplace) and load the right skills. The framework *orchestrates existing agents* rather than duplicating them — when `agent: orchestrator`, work is done inline.
- **Contract-first TDD for UI**: `ui-contract` → `ui-component-test` → `ui-component`. Props interfaces live **inline in the `.tsx`**, never in a separate `.types.ts`. Phase validation in `implement.md` enforces a meaningful red phase (tests must fail with real assertions, not module-not-found).
- **Constitution vs CLAUDE.md (in target projects)**: `specs/constitution.md` is the long-form source of truth; the target's root `CLAUDE.md` is a lean condensed loader (<2,500 tokens) that points to it. After the one-time v0.2→v0.3 migration, `/sdd:constitution` edits only `specs/constitution.md`.

## Conventions

- **Conventional Commits** for both git commits and branch names: `/sdd:spec feat user login` → branch `feat/user-login`. Type ∈ {feat, fix, chore, refactor, docs}.
- **Versioning is manual and multi-file**: a release bumps the version in `plugin.json`, `.claude-plugin/marketplace.json`, the README badge, and `CHANGELOG.md`. Keep them in sync.
- Command/agent references in docs use the `/sdd:<command>` form.
- Python helpers are stdlib-only, fail-open, and `from __future__ import annotations`; match their docstring-heavy style and exit-code discipline when extending them.

## Where to make a change

| Want to change… | Edit |
|---|---|
| What a slash command does | `commands/<name>.md` (the prose body) |
| A verification agent's behavior | `agents/<name>.md` |
| Typecheck/lint blocking logic | `hooks/typecheck.py` / `hooks/lint.sh` |
| A doctor readiness check | add a `check_*` fn in `skills/doctor/check.py`, register in `run_all_checks` |
| Files seeded into target projects | `skills/doctor/templates/` |
