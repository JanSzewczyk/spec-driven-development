# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is **not an application** — it is a plugin marketplace with two plugins under `plugins/`: **`sdd`** (below) and **`sdd-board`**, a Claude Code mod that docks an SDD status panel in Claude Code Desktop (hooks module `plugins/sdd-board/hooks/register.ts`, pure parsers/model/views in the sibling files, tests in `plugins/sdd-board/tests/`; run `cd plugins/sdd-board && claude plugin test`). The rest of this file describes `sdd`, whose paths are relative to `plugins/sdd/`.

`sdd` is a **Claude Code plugin** that ships the Spec-Driven Development framework. It contains slash commands, sub-agents, and a setup skill, all consumed by Claude Code itself. There is no build step and **no runtime code**: every asset is a Markdown prompt that Claude executes. The doctor skill, once script-based, is now fully **LLM-driven** — Claude performs the checks and file operations itself (see Architecture).

The plugin is installed into a *target* project (`/plugin install sdd@spec-driven-development`) and operates on that project's `specs/` directory and git repo. When developing here, you are editing the plugin; to see behavior you exercise it against a separate target project.

## Plugins

| Plugin  | Description                                                     | Commands                                                                         | Agents                                          | Skills |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- | ------ |
| **sdd** | Spec-Driven Development flow: self-contained tasks handed to the user's implementation flow, verified against the spec | constitution, spec, clarify, plan, tasks, implement, review, analyze | spec-verifier, reviewer, ui-critic | doctor |
| **sdd-board** | Claude Code Desktop side panel: current spec with phase, next command and tasks, plus all specs (a mod: hooks module, no commands/agents/skills) | | | |

## Commands

There is no `npm`/`make` and no script to run — the doctor skill is LLM-driven. To exercise
it you install the plugin and invoke the skill against a target project (see CONTRIBUTING.md
"Testing your changes locally"):

```
/sdd:doctor check     # report-only: 6 checks against the target project
/sdd:doctor init      # create/repair per-project artifacts
/sdd:doctor check     # confirm the checks flip to pass
```

Smoke-test loop: `check` against a fresh project → `init` → `check` again, then verify by hand
that the artifacts landed under the **project root** (not the plugin) and that a re-`init` is
idempotent. `sdd` has no automated test; manual exercise of the skill is the test.

`sdd-board` has tests (`cd plugins/sdd-board && claude plugin test`). Try the panel locally with
`claude --plugin-dir plugins/sdd-board` in a project that has `specs/`, then `/sdd-board`.

## Architecture

The SDD flow is a fixed pipeline of slash commands, each writing artifacts under `specs/<feature-slug>/`:

```
/sdd:constitution → /sdd:spec → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:review
```

Three kinds of plugin asset, each in its own top-level dir, wired together by `.claude-plugin/plugin.json`:

- **`commands/*.md`** — the 8 user-facing slash commands (`/sdd:<name>`; `/sdd:doctor` is the `doctor` skill). Each is a markdown prompt with YAML frontmatter (`description`, `argument-hint`, `allowed-tools`). The *body is the instruction set Claude executes* — editing behavior means editing prose, not code. `spec.md` creates the branch + skeleton; `tasks.md` writes self-contained tasks; `implement.md` is a dispatcher that hands a task to the flow configured in `capabilities.md`; `review.md` orchestrates the verification agents.

- **`agents/*.md`** — 3 verification sub-agents invoked via the Task tool, never directly by the user:
  - `spec-verifier` — one read of the diff against the docs: per-AC status, non-goal violations, out-of-scope, drift between spec/plan/tasks/code and per-task completeness; returns JSON. Called by `/sdd:review`.
  - `reviewer` — final READY/NOT READY audit; gets the test results and the other agents' results from `/sdd:review` (sub-agents cannot start sub-agents, so `/sdd:review` runs the suite, `ui-critic` and the configured checks itself), checks the constitution's rules, runs the domain audits and writes `review.md`.
  - `ui-critic` — screenshots changed UI via a browser MCP; skips gracefully if none is available (never blocks).

- **`skills/doctor/`** — the `doctor` skill (audit + setup), **fully LLM-driven, no Python**. `SKILL.md` holds the `check` mode (5 read-only inspections); `references/init.md` (loaded only for `init`) holds the `init` procedure, which detects the target's projects and quality commands and creates the per-project artifacts directly with file tools. The only `.claude/settings.json` edit is adding sibling-repository paths to `permissions.additionalDirectories` (malformed JSON is never touched). The plugin generates no hooks. Supporting files: `templates/` (seed `constitution.md.template`, `capabilities.md.template`, `specs/template.md`). **Critical invariant:** artifacts are written under the *project root* (Claude's cwd); templates are read from the *plugin root* (`${CLAUDE_PLUGIN_ROOT}`) — keeping the two distinct is what guarantees artifacts land in the project, not the plugin.

### Key concepts when editing

- **Projects**: the framework works on *projects* — a unit with its own stack and commands, listed in the target's `specs/capabilities.md` `## Projects` (a single-app repo has one, `root`; a monorepo one per app/package; a feature spread over several repositories adds projects in sibling checkouts, with `specs/` only in the spec repo). Constitution §2 holds one command row per project, and nothing assumes a frontend — web, backend and mobile projects are peers.
- **Self-contained tasks**: `/sdd:tasks` writes one Epic with Jira-like tasks (`project`, `status`, `depends_on`, `acceptance` ids, `plan` refs, `scope`, `files`). Tasks refer to the spec and plan instead of copying them; `/sdd:implement` inlines the references into a brief. No agents, models or TDD tags in tasks.
- **Configuration in `capabilities.md`**: `## Implementation` (who implements a task), `## Actions` (`branch` / `commit` / `pr` — a skill, agent or command per git action; unset → the session does it with git and gh) and `## Review` (tests, ui, publish, audit flow per project, extra `checks:` such as a QA agent that runs the app).
- **The framework does not implement**: `/sdd:implement` reads `## Implementation` in `capabilities.md` (`skill:` / `agent:` / `command:` / `in-session`, per project or `default`), hands the brief to that flow and tracks status; with nothing configured the session implements the task itself. The implementer runs the project's checks; `/sdd:review` verifies against the acceptance criteria.
- **Constitution is the only file the framework writes outside of `specs/`**: `specs/constitution.md` is the long-form source of truth, edited via `/sdd:constitution`. The target's root `CLAUDE.md` (if any) is user-owned and never read or written by this framework.
- **No fixed list of supported stacks**: `/sdd:doctor init` discovers how each project checks its code (declared scripts/tasks, CI + pre-commit config, tool config files) and records the commands in constitution §2, for *any* language/tool. Supporting a new tool usually requires **editing nothing**.

## Conventions

- **Conventional Commits** for both git commits and branch names: `/sdd:spec feat user login` → branch `feat/user-login`. Type ∈ {feat, fix, chore, refactor, docs}.
- **Versioning is manual and multi-file**: a bump (only when the user asks, see Versions below) touches `plugins/<name>/.claude-plugin/plugin.json`, its entry in `.claude-plugin/marketplace.json`, and `CHANGELOG.md`; for `sdd` also the README badge. Keep them in sync.
- Command/agent references in docs use the `/sdd:<command>` form.
- Behavior lives in Markdown prompts, not code. To change what an asset does, edit its prose.

## Where to make a change

| Want to change… | Edit |
|---|---|
| What a slash command does | `commands/<name>.md` (the prose body) |
| A verification agent's behavior | `agents/<name>.md` |
| A doctor readiness check | edit the `check` procedure in `skills/doctor/SKILL.md` |
| The `init` procedure (incl. the sibling-repo `settings.json` edit) | `skills/doctor/references/init.md` |
| Files seeded into target projects | `skills/doctor/templates/` |
| What the Desktop panel shows or how it derives the next step | `plugins/sdd-board/hooks/{model,view,svg}.ts` (logic, drawing); `register.ts` holds only hooks and `$` calls |
| How `specs/` files are parsed by the panel | `plugins/sdd-board/hooks/parse.ts`, with a test in `plugins/sdd-board/tests/` |

<!-- BEGIN:plugin-dev -->
## Plugin development

Managed by `/plugin-setup`; re-run it to refresh this section instead of editing it here.

### Where things live

- Two plugins under `plugins/`, listed in one marketplace `.claude-plugin/marketplace.json`
  (`sdd` → `./plugins/sdd`, `sdd-board` → `./plugins/sdd-board`). `sdd` keeps `commands/`,
  `agents/` and `skills/` at its root; `sdd-board` (a mod) keeps `hooks/` and `tests/`.

- Each manifest is `<plugin>/.claude-plugin/plugin.json`. `skills/`, `agents/`, `hooks/` and every
  other component sit at the plugin root, never inside `.claude-plugin/`.
- A new **plugin** is registered in `.claude-plugin/marketplace.json`. A new skill or agent inside
  an existing plugin is not.
- `plugins/sdd/.claude-plugin/plugin.json` sets an explicit `agents` array, which replaces the default `agents/` scan: a new agent file must be added to that array or it never loads.
- Every manifest opens with `$schema`: `https://www.schemastore.org/claude-code-plugin-manifest.json`
  for a plugin, `https://www.schemastore.org/claude-code-marketplace.json` for the marketplace.

### After a change to a plugin

1. **Update the docs that list capabilities by hand:** `README.md` (plugins table, command/agent reference, File Structure),
   `plugins/sdd-board/README.md`, the Plugins table and Architecture sections of this file, and
   `CONTRIBUTING.md` when the repo layout changes.
2. **Run `/marketplace-creator audit`** and fix what it reports before committing. It checks manifests,
   docs and frontmatter against what is on disk.

### Versions

Plugins pin `version`, so users stay on the cached copy until it changes; semver sizes are in
`/plugin-release`. A bump touches the changed plugin's `plugin.json`, its entry in
`.claude-plugin/marketplace.json`, `CHANGELOG.md` and, for `sdd`, the README badge.

**Never bump a version on your own.** Editing a skill or an agent is not a request to bump: change
a `version` only when the user asks for it in this conversation, and then through `/plugin-release`,
which proposes the size from the diff and writes nothing until the user agrees. A pull request that
changed a plugin and left its version alone is caught by CI, not by a standing instruction.

### Releasing

The repo does not tag releases yet; tagging publishes, so it stays a deliberate decision.

### What runs on its own

Nothing in the background. The steps above happen because this file asks for them; CI, if
`.github/workflows/plugin-checks.yml` exists, fails a pull request with drift or a missing bump.
<!-- END:plugin-dev -->
