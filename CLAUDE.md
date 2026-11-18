# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is **not an application** — it is a plugin marketplace with two plugins under `plugins/`: **`sdd`** (below) and **`sdd-board`**, a Claude Code mod that docks an SDD status panel in Claude Code Desktop (hooks module `plugins/sdd-board/hooks/register.ts`, pure parsers/model/views in the sibling files, tests in `plugins/sdd-board/tests/`; run `cd plugins/sdd-board && claude plugin test`). The rest of this file describes `sdd`, whose paths are relative to `plugins/sdd/`.

`sdd` is a **Claude Code plugin** that ships the Spec-Driven Development framework. It contains 11 skills (each a `/sdd:<name>` slash command), 3 sub-agents and a small mod, all consumed by Claude Code itself. There is no build step. Behavior is Markdown prompts that Claude executes; the only code is TypeScript: the mod that registers the `doctor_check` tool, and the pure rules/parsers in `shared/sdd-core/` that `sdd` and `sdd-board` both use (see Architecture).

The plugin is installed into a *target* project (`/plugin install sdd@spec-driven-development`) and operates on that project's `specs/` directory and git repo. When developing here, you are editing the plugin; to see behavior you exercise it against a separate target project.

## Plugins

| Plugin  | Description | Agents | Skills |
| ------- | ----------- | ------ | ------ |
| **sdd** | Spec-Driven Development flow: self-contained tasks handed to the user's implementation flow, verified against the spec; a mod provides the `doctor_check` tool | spec-verifier, reviewer, codebase-surveyor | constitution, spec, clarify, plan, tasks, implement, review, retro, analyze, capabilities, doctor |
| **sdd-board** | Claude Code Desktop side panel: current spec with phase, next command and tasks, plus all specs and a read-only configuration pane (a mod: hooks module, no agents/skills; requires `sdd`) | | |

## Commands

There is no `npm`/`make`. Rules and parsers have tests; the skills are exercised by installing the
plugin and running them against a target project:

```
/sdd:doctor check     # report-only: 7 checks against the target project (the doctor_check tool)
/sdd:doctor init      # create/repair per-project artifacts
/sdd:doctor check     # confirm the checks flip to pass
```

Smoke-test loop: `check` against a fresh project → `init` → `check` again, then verify by hand
that the artifacts landed under the **repo root** (not the plugin) and that a re-`init` is
idempotent.

Tests: `cd plugins/sdd && claude plugin test` (the doctor check rules) and `cd plugins/sdd-board && claude plugin test`. Shared code is edited in `shared/sdd-core/`; run `scripts/sync-core.sh` afterwards (CI runs it with `--check`).

`sdd-board` has tests (`cd plugins/sdd-board && claude plugin test`). Try the panel locally with
`claude --plugin-dir plugins/sdd-board` in a project that has `specs/`, then `/sdd-dashboard`.

## Architecture

The SDD flow is a fixed pipeline of slash commands, each writing artifacts under `specs/<feature-slug>/`:

```
/sdd:constitution → /sdd:spec → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:review
```

Three kinds of plugin asset, each in its own top-level dir, wired together by `.claude-plugin/plugin.json`:

- **`skills/<name>/SKILL.md`** — the 11 user-facing slash commands (`/sdd:<name>`). Each is a markdown prompt with YAML frontmatter (`name`, `description`, `argument-hint`, `allowed-tools`, no `disable-model-invocation`: each description says the skill runs only on an explicit user request, so Claude starts a phase when the user asks for it, e.g. "run plan", and never on its own). The *body is the instruction set Claude executes* — editing behavior means editing prose. `spec` creates the branch + skeleton; `tasks` writes self-contained tasks; `implement` is a dispatcher that hands a task to the flow configured in `capabilities.yml`; `review` orchestrates the verification agents; `retro` turns review lessons into WHAT NOT TO DO entries; `capabilities` scans installed skills/agents and, after the user confirms, fills `implementation`, `actions` and `review` in `capabilities.yml`. No skill runs `context: fork`: `plan` needs `ExitPlanMode` and several need `AskUserQuestion`, which sub-agents do not have.
- **`references/*.md`** (plugin root) — text shared by several skills, linked as `${CLAUDE_PLUGIN_ROOT}/references/<file>.md`: `feature-diff`, `capabilities` (every `capabilities.yml` key, value and default), `status-lifecycle`, `sibling-repos`, `formats` (artifact sections and the 7 doctor checks). A block goes here when ≥2 skills repeat it and it is longer than ~5 lines; shorter rules stay inline.
- **`hooks/`** — the `sdd` mod: `register.ts` registers the `doctor_check` tool (`mcp__sdd__doctor_check`), `core/` is a generated copy of `shared/sdd-core/`. Mods run on Claude Code 2.1.287+, not in WSL and not under `--safe-mode`; `doctor` falls back to a manual check there.
- **`shared/sdd-core/`** (repo root) — pure TypeScript, no mods API: `yaml.ts` (strict YAML subset, no dependency), `capabilities.ts` (reads `capabilities.yml`, or the format-2 `capabilities.md`, into one shape), `parse.ts` (spec/plan/tasks/review parsers), `formats.ts` (required sections, statuses, allowed values), `gather.ts` (reads a project through an `Io` interface: the mod and `actions/sdd-check/run.ts` each supply one), `check.ts` (the doctor rules and `effectiveConfig`, the capabilities values with defaults filled in, which the doctor and the board's Config pane share). A mod may import only files inside its own plugin and `claude plugin validate` refuses symlinks, so `scripts/sync-core.sh` copies it into `plugins/sdd/hooks/core/` and `plugins/sdd-board/hooks/core/`. Forgetting to run it fails the CI `tests` job; never edit the copies.
- **`agents/*.md`** — 3 sub-agents invoked via the Agent tool, never directly by the user:
  - `spec-verifier` — one read of the diff against the docs: per-AC status, non-goal violations, out-of-scope, drift between spec/plan/tasks/code and per-task completeness; returns JSON. Called by `/sdd:review`.
  - `reviewer` — final READY/NOT READY audit; gets the test results and the other agents' results from `/sdd:review` (`/sdd:review` runs the suite and the configured checks itself and hands over their results), checks the constitution's rules, runs the domain audits and writes `review.md`.
  - `codebase-surveyor` — read-only map of the affected projects (structure, conventions, code to reuse), at most 30 lines; called by `/sdd:plan`.

- **`skills/doctor/`** — the `doctor` skill (audit + setup):
  - `SKILL.md` holds `check`: it calls the `doctor_check` tool (7 read-only checks, rules in `shared/sdd-core/check.ts`, listed in `references/formats.md`) and does the checks itself when the tool is missing.
  - `references/init.md` (loaded only for `init`) is LLM-driven, since detection needs judgement: it detects projects and quality commands and writes the per-project artifacts with file tools. The only `.claude/settings.json` edit is adding sibling-repository paths to `permissions.additionalDirectories` (malformed JSON is never touched). No settings hooks are generated.
  - `templates/` seeds `constitution.md.template`, `capabilities.yml.template`, `specs/template.md`, `sdd-check.yml.template`.
- **`shared/sdd-core/capabilities.schema.json`** — JSON Schema of `capabilities.yml` and the **single source** of its keys, allowed values, defaults and patterns: `formats.ts` reads them from `capabilities.schema.ts`, a TS copy that `scripts/sync-core.sh` generates (a mod loads only code files). The script also copies the JSON to `plugins/sdd/schemas/` (the URL the file's `# yaml-language-server` line points at, pinned to the release tag). `scripts/check-capabilities.ts` (CI) checks that the template and the key table in `references/capabilities.md` agree with it.
  - **Critical invariant:** artifacts are written under the *repo root* (Claude's cwd); templates are read from the *plugin root* (`${CLAUDE_PLUGIN_ROOT}`), so artifacts land in the project, not the plugin.

### Key concepts when editing

- **Projects**: the framework works on *projects* — a unit with its own stack and commands, listed under `projects` in the target's `specs/capabilities.yml` (a single-app repo has one, `root`; a monorepo one per app/package; a feature spread over several repositories adds projects in sibling checkouts, with `specs/` only in the spec repo). Constitution §2 holds one command row per project, and nothing assumes a frontend — web, backend and mobile projects are peers.
- **Feature lookup and stable ids**: every command finds the feature by the `**Branch:**` line of `spec.md` (branch naming is configurable). AC ids never change once written; a `/sdd:tasks` re-run keeps task ids and statuses.
- **Self-contained tasks**: `/sdd:tasks` writes one Epic with Jira-like tasks (`project`, `status`, `depends_on`, `acceptance` ids, `plan` refs, `scope`, `files`). Tasks refer to the spec and plan instead of copying them; `/sdd:implement` inlines the references into a brief. No agents, models or TDD tags in tasks.
- **Configuration in `specs/capabilities.yml`**: `implementation` (who implements a task, `isolation`), `actions` (`branch` / `commit` / `pr` — a skill, agent or command per git action; `null` → the session does it with git and gh) and `review` (tests, publish, audit flow per project, extra `checks` such as a QA agent that runs the app). Keys and defaults: `references/capabilities.md`.
- **The framework does not implement**: `/sdd:implement` reads `implementation` in `capabilities.yml` (`skill:` / `agent:` / `command:` / `in-session`, per project or `default`), hands the brief to that flow and tracks status; with nothing configured the session implements the task itself. The implementer runs the project's checks; `/sdd:review` verifies against the acceptance criteria.
- **Epic and task ids**: `tasks.md` has `**Epic:** <LETTERS>-<4 hex>` (assigned once by `/sdd:tasks`); a task's full id is `<EPIC>-T<n>`. `/sdd:tasks` commits `specs/<slug>/` (spec, plan, tasks, `Epic:` trailer), `/sdd:implement` commits each finished task with a `Task: <EPIC>-T<n>` trailer (always; there is no switch), and `/sdd:review` commits what is left and opens the PR. `isolation: none` (default) implements and commits in the session; `isolation: { worktree: { merge, parallel } }` (opt-in, `skills/implement/references/isolation.md`) runs each task in a sub-session, worktree and branch `<spec-branch>--<EPIC>-T<n>`, committed there; `merge: pr` waits for a human to merge each task PR, `merge: auto` rebases and fast-forwards. `merge` and `parallel` exist only under `worktree`. Only the orchestrating session writes `tasks.md`.
- **Format versions and the action**: `capabilities.yml` carries `format: N` (`SDD_FORMAT` in `formats.ts`, now 3); raising it needs a migration in `skills/doctor/references/init.md`. The format-2 `capabilities.md` is still read (`parseLegacyCapabilities`) with a migrate warning until the next major version. `actions/sdd-check/` is a GitHub Action running `runChecks` in `ci` mode in other repositories; `/sdd:doctor init` installs its workflow (`templates/sdd-check.yml.template`, `# sdd-workflow: <n>` is `WORKFLOW_VERSION`, `uses:` pinned to `v<version>`) and repairs every finding tagged `fix: 'init'`.
- **Constitution is the only file the framework writes outside of `specs/`**: `specs/constitution.md` is the long-form source of truth, edited via `/sdd:constitution`. The target's root `CLAUDE.md` (if any) is user-owned and never read or written by this framework.
- **No fixed list of supported stacks**: `/sdd:doctor init` discovers how each project checks its code (declared scripts/tasks, CI + pre-commit config, tool config files) and records the commands in constitution §2, for *any* language/tool. Supporting a new tool usually requires **editing nothing**.

## Conventions

- **Conventional Commits** for both git commits and branch names: `/sdd:spec feat user login` → branch `feat/user-login`. Type ∈ {feat, fix, chore, refactor, docs}.
- **Versioning is manual and multi-file**: a bump (only when the user asks, see Versions below) touches `plugins/<name>/.claude-plugin/plugin.json` (the only place a version is set; the marketplace entries carry none), `CHANGELOG.md` and, for `sdd`, the README badge. Keep them in sync.
- **Tags and GitHub Releases exist only for `sdd` and are created by CI on merge, never by hand**: `.github/workflows/release.yml` runs `scripts/release.sh` on a push to `main` that touches `plugins/sdd/.claude-plugin/plugin.json`: `git tag -a` + push (`v<version>`, because `claude plugin tag` only makes `<name>--v<version>`) when that version has no `v<version>` tag, then a Release for every `sdd` tag without one, notes taken from the version's `CHANGELOG.md` section (`## [<ver>]`). `sdd-board` is versioned in its manifest and `CHANGELOG.md` (`## [<ver> sdd-board]`) only: no tag, no Release. Use `/plugin-release` for the bump only and skip its tag step (step 6): a tag made on the feature branch points at a commit that is not on `main` after a squash merge, and CI then sees the tag and does not fix it. `scripts/release.sh --dry-run` shows what CI would do; re-run the workflow by hand (`workflow_dispatch`) to retry.
- Command/agent references in docs use the `/sdd:<command>` form.
- Behavior lives in Markdown prompts; the doctor check lives in `shared/sdd-core/` TypeScript with tests. To change what a skill or agent does, edit its prose.

## Where to make a change

| Want to change… | Edit |
|---|---|
| What a slash command does | `skills/<name>/SKILL.md` (the prose body) |
| Text shared by several skills | `references/<file>.md` |
| A verification agent's behavior | `agents/<name>.md` |
| A doctor readiness check | `shared/sdd-core/check.ts` (+ `formats.ts`, a test in `plugins/sdd/tests/`, the row in `references/formats.md`), then `scripts/sync-core.sh`; tag a finding `fix: 'init'` only when `init.md` repairs it |
| The GitHub Action other repos use | `actions/sdd-check/` (`action.yml`, `run.ts`), fixtures in `tests/fixtures/`, the workflow template `skills/doctor/templates/sdd-check.yml.template` |
| Per-task commits, isolation and merge modes | `skills/implement/SKILL.md`, `skills/implement/references/isolation.md`, `skills/review/SKILL.md` |
| The `init` procedure (incl. the sibling-repo `settings.json` edit) | `skills/doctor/references/init.md` |
| Files seeded into target projects | `skills/doctor/templates/` |
| A `capabilities.yml` key or value | `shared/sdd-core/capabilities.schema.json` (+ `capabilities.ts` / `check.ts` for rules a schema cannot express), then `scripts/sync-core.sh`; `skills/doctor/templates/capabilities.yml.template`, the key table in `references/capabilities.md`; `node scripts/check-capabilities.ts` checks they agree; a migration in `init.md` when an old value changes |
| What the Desktop panel shows or how it derives the next step | `plugins/sdd-board/hooks/{model,view,svg}.ts` (logic, drawing); `register.ts` holds only hooks and `$` calls |
| How `specs/` files are parsed (panel and doctor) | `shared/sdd-core/parse.ts`, with a test in `plugins/sdd-board/tests/`, then `scripts/sync-core.sh` |
| The documentation site | `docs/` (Astro Starlight, pages in `docs/src/content/docs/`, sidebar in `docs/astro.config.mjs`); `cd docs && npm run build`. Deployed to GitHub Pages by `.github/workflows/docs.yml`. English is the root locale, Polish mirrors it in `docs/src/content/docs/pl/` (same file names; update both). Versions: `src/content/docs/` is the latest, each archived release is a snapshot folder (`2.0/`, `pl/2.0/`) made by `starlight-versions` when its slug is added to `versions` in `astro.config.mjs`; never edit a snapshot by hand. `/changelog/` (sdd) and `/board/changelog/` (sdd-board) are generated from the root `CHANGELOG.md` by `starlight-changelogs` (`docs/src/content.config.ts`, English only; `docs/.npmrc` sets `legacy-peer-deps` because the plugin's peer range excludes Astro 7 and npm would nest Astro 5) |

<!-- BEGIN:plugin-dev -->
## Plugin development

Managed by `/plugin-setup`; re-run it to refresh this section instead of editing it here.

### Where things live

- Two plugins under `plugins/`, listed in one marketplace `.claude-plugin/marketplace.json`
  (`sdd` → `./plugins/sdd`, `sdd-board` → `./plugins/sdd-board`). `sdd` keeps `skills/`,
  `agents/`, `references/`, `hooks/` and `tests/` at its root; `sdd-board` (a mod) keeps `hooks/` and `tests/`.
  Both mods carry a generated copy of `shared/sdd-core/` in `hooks/core/`.

- Each manifest is `<plugin>/.claude-plugin/plugin.json`. `skills/`, `agents/`, `hooks/` and every
  other component sit at the plugin root, never inside `.claude-plugin/`.
- A new **plugin** is registered in `.claude-plugin/marketplace.json`. A new skill or agent inside
  an existing plugin is not.
- `plugins/sdd/.claude-plugin/plugin.json` sets an explicit `agents` array, which replaces the default `agents/` scan: a new agent file must be added to that array or it never loads.
- Every manifest opens with `$schema`: `https://www.schemastore.org/claude-code-plugin-manifest.json`
  for a plugin, `https://www.schemastore.org/claude-code-marketplace.json` for the marketplace.

### After a change to a plugin

1. **Update the docs that list capabilities by hand:** `README.md` (plugins table, command/agent reference, File Structure),
   `plugins/sdd/README.md`, `plugins/sdd-board/README.md`, and the Plugins table and Architecture sections of this file.
2. **Run `/marketplace-creator audit`** and fix what it reports before committing. It checks manifests,
   docs and frontmatter against what is on disk.

### Versions

Plugins pin `version`, so users stay on the cached copy until it changes; semver sizes are in
`/plugin-release`. A bump touches the changed plugin's `plugin.json` (the marketplace
entries carry no version), `CHANGELOG.md` and, for `sdd`, the README badge.

**Never bump a version on your own.** Editing a skill or an agent is not a request to bump: change
a `version` only when the user asks for it in this conversation, and then through `/plugin-release`,
which proposes the size from the diff and writes nothing until the user agrees. A pull request that
changed a plugin and left its version alone is caught by CI, not by a standing instruction.

### Releasing

Merging an `sdd` bump PR is the release: `.github/workflows/release.yml` tags it and creates the
GitHub Release (see Conventions). An `sdd-board` bump is not tagged or released. Never tag by hand.

### What runs on its own

Only `.github/workflows/release.yml`, which tags and releases `sdd` on merge to `main`. The steps above happen because this file asks for them; CI, if
`.github/workflows/plugin-checks.yml` exists, fails a pull request with drift or a missing bump.
<!-- END:plugin-dev -->
