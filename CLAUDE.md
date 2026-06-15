# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is **not an application** — it is a **Claude Code plugin** named `sdd` that ships the Spec-Driven Development framework. It contains slash commands, sub-agents, and a setup skill, all consumed by Claude Code itself. Blocking hooks (typecheck / lint) are NOT shipped by the plugin — they're generated per-project by `/sdd:doctor init` into `<target>/.claude/hooks/`. There is no build step and **no runtime code**: every asset is a Markdown prompt that Claude executes. The doctor skill, once script-based, is now fully **LLM-driven** — Claude performs the checks and file operations itself (see Architecture).

The plugin is installed into a *target* project (`~/.claude/plugins/cache/sdd`) and operates on that project's `specs/` directory and git repo. When developing here, you are editing the plugin; to see behavior you exercise it against a separate target project.

## Commands

There is no `npm`/`make` and no script to run — the doctor skill is LLM-driven. To exercise
it you install the plugin and invoke the skill against a target project (see CONTRIBUTING.md
"Testing your changes locally"):

```
/sdd:doctor check     # report-only: 10 checks against the target project
/sdd:doctor init      # create/repair per-project artifacts
/sdd:doctor check     # confirm the checks flip to pass
```

Smoke-test loop: `check` against a fresh project → `init` → `check` again, then verify by hand
that the artifacts landed under the **project root** (not the plugin) and that a re-`init` is
idempotent. There is no automated test in this repo; manual exercise of the skill is the test.

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

- **`skills/doctor/`** — the `doctor` skill (audit + setup), **fully LLM-driven, no Python**. `SKILL.md` is the entire procedure: the `check` mode runs 10 read-only inspections; the `init` mode detects the target's stack and creates the per-project artifacts directly with file tools. It **generates project-local hook scripts** in `<target>/.claude/hooks/typecheck.sh` + `lint.sh` containing only the tools the project actually has (existing hook files are never overwritten), and **safe-merges `<target>/.claude/settings.json`** — strips only its own previously-installed hook entries (matched by `.claude/hooks/typecheck.sh`, `.claude/hooks/lint.sh`, or legacy v0.4 plugin-path substrings) and preserves every other key. Supporting files: `templates/` (seed `constitution.md.template`, `capabilities.md.template`, `specs/template.md`, and per-tool hook snippets in `templates/hooks/*.sh.template`) and `reference/settings-merge.md` (the mechanical settings.json merge procedure). **Critical invariant:** artifacts are written under the *project root* (Claude's cwd); templates are read from the *plugin root* (`${CLAUDE_PLUGIN_ROOT}`) — keeping the two distinct is what guarantees artifacts land in the project, not the plugin.

### Key concepts when editing

- **Per-task routing**: every task in a target's `tasks.md` carries `type`, `agent`, `skills` fields. `/sdd:implement` reads them to route work to the right specialist sub-agent (from the marketplace) and load the right skills. The framework *orchestrates existing agents* rather than duplicating them — when `agent: orchestrator`, work is done inline.
- **Two technology-neutral TDD shapes**: *test-first* is the default (failing test first, then implementation; trivially stub a missing symbol so the test fails on a real assertion); *contract-first* (contract → tests → implementation) is the narrow exception, used only when the unit's deliverable is itself a public interface/contract other code references by shape. UI components are one example of contract-first, not its definition — the framework names no frontend tools and imposes no file-layout rule for interfaces. Phase ordering is enforced within a Story by task order (`implement.md`), guaranteeing a meaningful red phase.
- **Constitution is the only file the framework writes outside of `specs/`**: `specs/constitution.md` is the long-form source of truth, edited via `/sdd:constitution`. The target's root `CLAUDE.md` (if any) is user-owned and never read or written by this framework.
- **Hooks are project-specific and open-ended**: there is no fixed list of supported stacks. `/sdd:doctor init` discovers how a project checks its code (declared scripts/tasks, CI + pre-commit config, tool config files) and generates hooks reproducing those commands — for *any* language/tool, including ones never enumerated. Supporting a new tool usually requires **editing nothing**; the LLM handles it by reasoning from the project. The `case` blocks in `templates/hooks/*.sh.template` are **worked examples of the hook shape**, not a closed catalog — add one only when a common tool deserves a higher-quality reference pattern than the LLM would improvise. Never add a shared hook script to the plugin.

## Conventions

- **Conventional Commits** for both git commits and branch names: `/sdd:spec feat user login` → branch `feat/user-login`. Type ∈ {feat, fix, chore, refactor, docs}.
- **Versioning is manual and multi-file**: a release bumps the version in `plugin.json`, `.claude-plugin/marketplace.json`, the README badge, and `CHANGELOG.md`. Keep them in sync.
- Command/agent references in docs use the `/sdd:<command>` form.
- Behavior lives in Markdown prompts, not code. To change what an asset does, edit its prose. Generated hook scripts (`.claude/hooks/*.sh`) must exit 0 when nothing applies and exit 2 to block.

## Where to make a change

| Want to change… | Edit |
|---|---|
| What a slash command does | `commands/<name>.md` (the prose body) |
| A verification agent's behavior | `agents/<name>.md` |
| Typecheck/lint blocking logic for a tool | add a `case` block to `skills/doctor/templates/hooks/{typecheck,lint}.sh.template` + teach tool-detection in `skills/doctor/SKILL.md` |
| A doctor readiness check | edit the `check` procedure in `skills/doctor/SKILL.md` |
| The settings.json merge behavior | `skills/doctor/reference/settings-merge.md` |
| Files seeded into target projects | `skills/doctor/templates/` |
