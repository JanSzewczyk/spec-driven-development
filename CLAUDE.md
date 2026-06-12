# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is **not an application** — it is a **Claude Code plugin** named `sdd` that ships the Spec-Driven Development framework. It contains slash commands, sub-agents, and a setup skill, all consumed by Claude Code itself. Blocking hooks (typecheck / lint) are NOT shipped by the plugin — they're generated per-project by `/sdd:doctor init` into `<target>/.claude/hooks/`. There is no build step and almost no runtime code; the only executable code is the Python in `skills/doctor/`.

The plugin is installed into a *target* project (`~/.claude/plugins/cache/sdd`) and operates on that project's `specs/` directory and git repo. When developing here, you are editing the plugin; to see behavior you exercise it against a separate target project.

## Commands

There is no `npm`/`make`. The "tests" are the doctor scripts, run against a target project (see CONTRIBUTING.md "Testing your changes locally"):

```bash
# Audit a target project's SDD readiness (10 checks, JSON on stdout)
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

Three kinds of plugin asset, each in its own top-level dir, wired together by `plugin.json`:

- **`commands/*.md`** — the 9 user-facing slash commands (`/sdd:<name>`). Each is a markdown prompt with YAML frontmatter (`description`, `argument-hint`, `allowed-tools`). The *body is the instruction set Claude executes* — editing behavior means editing prose, not code. `spec.md` creates the branch + skeleton; `implement.md` is the heart (TDD loop + per-task routing); `review.md` orchestrates the verification agents.

- **`agents/*.md`** — 4 verification sub-agents invoked via the Task tool, never directly by the user:
  - `spec-guard` — checks a diff satisfies all Acceptance Criteria and adds nothing out-of-scope; returns `{satisfied, missing, out_of_scope}`. Called per-task by `/sdd:implement` and per-feature by `/sdd:review`.
  - `drift-detector` — finds mismatches between spec/plan/tasks docs and actual code.
  - `reviewer` — final GO/NO-GO audit; runs the test suite + domain audits.
  - `ui-critic` — screenshots changed UI via a browser MCP; skips gracefully if none is available (never blocks).

- **`skills/doctor/`** — the `doctor` skill (audit + setup). `SKILL.md` is the instruction layer; `check.py` (10 read-only checks → JSON) and `init.py` (bootstrap) are the helpers. `init.py` detects the target's stack, **generates project-local hook scripts** in `<target>/.claude/hooks/typecheck.sh` + `lint.sh` containing only the tools the project actually has (existing hook files are never overwritten), and **safe-merges `<target>/.claude/settings.json`** — strips only its own previously-installed hook entries (matched by `.claude/hooks/typecheck.sh`, `.claude/hooks/lint.sh`, or legacy v0.4 plugin-path substrings) and preserves every other key. Per-tool shell snippets live in the `TYPECHECK_BLOCKS` / `LINT_BLOCKS` tables inside `init.py`. Templates seeded into target projects live in `skills/doctor/templates/`.

### Key concepts when editing

- **Per-task routing**: every task in a target's `tasks.md` carries `type`, `agent`, `skills` fields. `/sdd:implement` reads them to route work to the right specialist sub-agent (from the marketplace) and load the right skills. The framework *orchestrates existing agents* rather than duplicating them — when `agent: orchestrator`, work is done inline.
- **Contract-first TDD for UI**: `ui-contract` → `ui-component-test` → `ui-component`. Props interfaces live **inline in the `.tsx`**, never in a separate `.types.ts`. Phase validation in `implement.md` enforces a meaningful red phase (tests must fail with real assertions, not module-not-found).
- **Constitution is the only file the framework writes outside of `specs/`**: `specs/constitution.md` is the long-form source of truth, edited via `/sdd:constitution`. The target's root `CLAUDE.md` (if any) is user-owned and never read or written by this framework.
- **Hooks are project-specific, not plugin-shipped**: when adding support for a new typecheck/lint tool, edit `TYPECHECK_BLOCKS` or `LINT_BLOCKS` in `skills/doctor/init.py` (add an entry keyed by tool name) and extend `detect_hookable_tools()` to recognise it. Do NOT add a shared hook script to the plugin.

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
| Typecheck/lint blocking logic for a tool | edit the matching entry in `TYPECHECK_BLOCKS` / `LINT_BLOCKS` (and `detect_hookable_tools`) in `skills/doctor/init.py` |
| A doctor readiness check | add a `check_*` fn in `skills/doctor/check.py`, register in `run_all_checks` |
| Files seeded into target projects | `skills/doctor/templates/` |
