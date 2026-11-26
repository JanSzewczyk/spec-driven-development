# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## What this repo is

A **plugin marketplace**, not an application. One plugin, `plugins/sdd`: the Spec-Driven Development framework with 11 skills (`/sdd:<name>`), 3 sub-agents (spec-verifier, reviewer, codebase-surveyor), a mod that registers the `doctor_check` tool and the board side panel (`/sdd-dashboard`), and the SDD CLI (`bin/sdd`). Behavior is Markdown prompts; the only code is TypeScript. The board was the separate `sdd-board` plugin up to 0.9.7; `renames` in `marketplace.json` moves its installs to `sdd`.

`sdd` is installed into a *target* project (`/plugin install sdd@spec-driven-development`) and works on that project's `specs/` and git repo. Here you edit the plugin; to see behavior, exercise it against a separate target project. Paths below are relative to `plugins/sdd/` unless stated.

## Commands

No `npm`/`make` and no build step. Tests:

- `cd plugins/sdd && claude plugin test` (doctor check rules, SDD CLI, board)
- `scripts/gen-schema.sh` after editing `schemas/capabilities.schema.json` (CI runs it with `--check`). `node scripts/check-capabilities.ts` checks the `capabilities.yml` contract.

Skills are exercised by running them against a target project. Smoke test: `/sdd:doctor check` on a fresh project → `/sdd:doctor init` → `check` again; verify by hand that artifacts landed under the **repo root** (not the plugin) and that a re-`init` is idempotent. Try the panel with `claude --plugin-dir plugins/sdd` in a project that has `specs/`, then `/sdd-dashboard`.

## Architecture

A fixed pipeline of slash commands, each writing artifacts under `specs/<feature-slug>/`:

```
/sdd:constitution → /sdd:spec → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:review
```

Plugin assets, wired by `.claude-plugin/plugin.json`:

- **`skills/<name>/SKILL.md`**: the 11 commands. YAML frontmatter (`name`, `description`, `argument-hint`, `allowed-tools`), no `disable-model-invocation`: each description says the skill runs only on an explicit user request, so Claude starts a phase when asked ("run plan") and never on its own. The *body is the instruction set Claude executes*; editing behavior means editing prose. `spec` creates the branch + skeleton; `tasks` writes self-contained tasks; `implement` hands a task to the flow in `capabilities.yml`; `review` orchestrates the verification agents; `retro` turns review lessons into WHAT NOT TO DO entries; `capabilities` scans installed skills/agents and, after confirmation, fills `implementation`, `actions` and `review`. No skill runs `context: fork`: `plan` needs `ExitPlanMode` and several need `AskUserQuestion`, which sub-agents lack.
- **`references/*.md`**: text shared by skills, linked as `${CLAUDE_PLUGIN_ROOT}/references/<file>.md`: `feature-diff`, `capabilities` (every key, value and default), `status-lifecycle`, `sibling-repos`, `formats` (artifact sections, the 7 doctor checks). A block goes here when ≥2 skills repeat it and it exceeds ~5 lines.
- **`bin/sdd` + `cli/`**: the SDD CLI, on the Bash `PATH` while the plugin is enabled (Node.js 22.18+; exit 127 without it and the skill does the step by hand). `cli/main.ts` loads every `cli/commands/<group>-<action>.ts` (contract in `cli/command.ts`, which has no `node:` imports so tests can load it; `cli/context.ts` is the real file access); the logic is pure in `core/` (`next.ts`, `tasks-edit.ts`, `yaml-edit.ts`, `config-edit.ts`). `/sdd:implement` uses `sdd task next` / `sdd task status`; `sdd config get|set` edits `capabilities.yml`, refusing what the doctor rules would flag. How to add a command: `cli/README.md`.
- **`hooks/`**: the `sdd` mod. A plugin has one hooks module and a module registers an event once without a matcher, so `register.ts` only composes two parts, each a `start*($)` called from the one `session.start` hook plus a `register*(on)` for its other hooks: `doctor.ts` (the `doctor_check` tool, `mcp__sdd__doctor_check`) and `board/register.ts`. `io.ts` puts the mods API behind core's `Io` (`strict` throws instead of returning null, so the board keeps its last good data). The board is the side panel: current spec with phase, next command and tasks, all specs, a read-only configuration pane; `board/{model,view,svg}.ts` are pure, `board/register.ts` holds hooks and `$` calls. It opens at session start when `specs/` exists unless the `show_board` userConfig option is off, and polls `specs/` only once drawn. Mods need Claude Code 2.1.287+, not WSL, not `--safe-mode`; `doctor` falls back to a manual check there.
- **`agents/*.md`**: invoked via the Agent tool, never by the user. `spec-verifier` reads the diff once against the docs and returns JSON (per-AC status, non-goal violations, out-of-scope, drift, per-task completeness). `reviewer` gives the final READY/NOT READY verdict from the test and agent results `/sdd:review` hands over, checks the constitution, runs domain audits and writes `review.md`. `codebase-surveyor` maps the affected projects (at most 30 lines) for `/sdd:plan`.
- **`skills/doctor/`**: `SKILL.md` holds `check` (calls `doctor_check`, 7 read-only checks listed in `references/formats.md`, manual fallback). `references/init.md` (loaded only for `init`) is LLM-driven: detects projects and quality commands and writes the per-project artifacts. Its only `.claude/settings.json` edit adds sibling-repo paths to `permissions.additionalDirectories` (malformed JSON is never touched); no settings hooks are generated. `templates/` seeds `constitution.md.template`, `capabilities.yml.template`, `specs/template.md`, `sdd-check.yml.template`.
- **`core/`**: pure TypeScript, no mods API and no `node:` imports, used by the mod, the CLI, the tests, `actions/sdd-check/` and `scripts/check-capabilities.ts`. Each host reads files its own way: the mod and the action through the `Io` interface (`io.ts`), the CLI through its synchronous `Ctx`. `yaml.ts` (strict YAML subset), `capabilities.ts` (reads `capabilities.yml`, or the format-2 `capabilities.md`), `parse.ts` (spec/plan/tasks/review parsers), `features.ts` (what counts as a feature under `specs/`, `readFeatures`, `featureOfBranch`; one definition for doctor, board and CLI), `constitution.ts` (§2 command table), `config.ts` (`effectiveConfig`: set vs default values, for the board's Config pane and `sdd config`), `formats.ts` (constants, many read from the schema), `gather.ts` (reads a project into a `Snapshot` through `Io`), `check.ts` (the doctor rules on a `Snapshot`), plus the editors behind the CLI (`next.ts`, `tasks-edit.ts`, `yaml-edit.ts`, `config-edit.ts`). Import each name from the module that defines it; there are no re-exports.
- **`schemas/capabilities.schema.json`**: the **single source** of `capabilities.yml` keys, allowed values, defaults and patterns, published at the URL the file's `# yaml-language-server` line points at (pinned to the release tag). `formats.ts` reads a generated TS copy (`core/capabilities.schema.ts`, written by `scripts/gen-schema.sh`; a mod loads only code files).
- **`actions/sdd-check/`**: GitHub Action running `runChecks` in `ci` mode in other repos. `/sdd:doctor init` installs its workflow (`# sdd-workflow: <n>` is `WORKFLOW_VERSION`, `uses:` pinned to `v<version>`) and repairs every finding tagged `fix: 'init'`.

**Critical invariant:** artifacts are written under the *repo root* (Claude's cwd); templates are read from the *plugin root* (`${CLAUDE_PLUGIN_ROOT}`).

### Key concepts

- **Projects**: a unit with its own stack and commands, listed under `projects` in the target's `specs/capabilities.yml` (single app: `root`; monorepo: one per app/package; multi-repo feature: projects in sibling checkouts, `specs/` only in the spec repo). Constitution §2 has one command row per project; nothing assumes a frontend.
- **Feature lookup and ids**: commands find the feature by the `**Branch:**` line of `spec.md` (naming is configurable). AC ids never change once written; a `/sdd:tasks` re-run keeps task ids and statuses.
- **Tasks**: `/sdd:tasks` writes one Epic of Jira-like tasks (`project`, `status`, `depends_on`, `acceptance` ids, `plan` refs, `scope`, `files`). Tasks refer to spec and plan instead of copying them; `/sdd:implement` inlines the references into a brief. No agents, models or TDD tags in tasks.
- **Epic and task ids**: `tasks.md` has `**Epic:** <LETTERS>` (`ULOG`, assigned once); a task's id is `<EPIC>-T<n>`. `/sdd:tasks` commits `specs/<slug>/` (`Epic:` trailer); `/sdd:implement` commits each finished task (`Task: <EPIC>-T<n>` trailer, always); `/sdd:review` commits the rest and opens the PR. Only the orchestrating session writes `tasks.md`.
- **Isolation**: `none` (default) implements and commits in the session. `isolation: { worktree: { merge, parallel } }` (opt-in, `skills/implement/references/worktree.md`, plus `worktree-all.md` for several tasks; `/sdd:implement` reads them only with `worktree:`) runs each task in a sub-session, worktree and branch `<spec-branch>--<EPIC>-T<n>`; `merge: pr` waits for a human to merge each task PR, `merge: auto` rebases and fast-forwards; `/sdd:implement` (no argument = `all`) waits for the merges (session events, a background `gh` waiter) and keeps launching until every task is `review|done`. `merge` and `parallel` exist only under `worktree`.
- **Configuration**: `specs/capabilities.yml` holds `implementation` (who implements, per project or `default`: `skill:` / `agent:` / `command:` / `in-session`; `isolation`), `actions` (`branch` / `commit` / `pr`; `null` → the session uses git and gh) and `review` (tests, publish, audit flow, extra `checks`). Keys and defaults: `references/capabilities.md`. `format: N` is `SDD_FORMAT` in `formats.ts` (now 3); raising it needs a migration in `skills/doctor/references/init.md`. The format-2 `capabilities.md` is still read with a migrate warning until the next major version.
- **The framework does not implement**: with nothing configured the session implements the task itself; the implementer runs the project's checks and `/sdd:review` verifies against the ACs.
- **Constitution** (`specs/constitution.md`) is the only file written outside `specs/`'s feature folders, edited via `/sdd:constitution`. The target's root `CLAUDE.md` is user-owned and never read or written.
- **No fixed list of supported stacks**: `init` discovers how each project checks its code (scripts/tasks, CI + pre-commit, tool configs) and records the commands in constitution §2, for any language.

## Conventions

- **Conventional Commits** for commits and branches: `/sdd:spec feat user login` → `feat/user-login`. Type ∈ {feat, fix, chore, refactor, docs}.
- Command/agent references in docs use `/sdd:<command>`.
- **Deterministic steps go to the SDD CLI**: a skill that reads or edits SDD files in a fixed way (statuses, task order, config values) calls an `sdd` command and keeps a one-sentence manual fallback for exit 127, instead of describing the edit in prose.
- **Versioning** (only when the user asks; see Plugin development): a bump touches `plugins/<name>/.claude-plugin/plugin.json` (the only place a version is set; marketplace entries carry none), `CHANGELOG.md` and, for `sdd`, the README badge.
- **Tags and Releases exist only for `sdd` and come from CI, never by hand**: `.github/workflows/release.yml` runs `scripts/release.sh` on a push to `main` touching `plugins/sdd/.claude-plugin/plugin.json`: `git tag -a v<version>` + push when that version has no tag (`claude plugin tag` only makes `<name>--v<version>`), then a Release for every `sdd` tag without one, notes from the version's `CHANGELOG.md` section (`## [<ver>]`). The `## [<ver> sdd-board]` sections in `CHANGELOG.md` are history from the separate panel plugin. Use `/plugin-release` for the bump and skip its tag step: a tag made on the feature branch points at a commit that is not on `main` after a squash merge, and CI then sees the tag and does not fix it. `scripts/release.sh --dry-run` shows what CI would do; re-run the workflow by hand (`workflow_dispatch`) to retry.

## Where to make a change

| Want to change… | Edit |
|---|---|
| What a slash command does | `skills/<name>/SKILL.md` |
| Text shared by several skills | `references/<file>.md` |
| A verification agent's behavior | `agents/<name>.md` |
| A doctor readiness check | `core/check.ts` (+ `formats.ts`, a test in `plugins/sdd/tests/`, the row in `references/formats.md`); tag a finding `fix: 'init'` only when `init.md` repairs it |
| The GitHub Action other repos use | `actions/sdd-check/` (`action.yml`, `run.ts`), fixtures in `tests/fixtures/`, `skills/doctor/templates/sdd-check.yml.template` |
| Per-task commits, isolation, merge modes | `skills/implement/SKILL.md`, `skills/implement/references/worktree.md` (+ `worktree-all.md`), `skills/review/SKILL.md` |
| An SDD CLI command (a deterministic read or edit of SDD files) | the logic in `core/`, `plugins/sdd/cli/commands/<group>-<action>.ts`, a test in `plugins/sdd/tests/cli.test.ts`, the table in `plugins/sdd/cli/README.md` and `docs/src/content/docs/{,pl/}reference/cli.mdx` |
| The `init` procedure | `skills/doctor/references/init.md` |
| Files seeded into target projects | `skills/doctor/templates/` |
| A `capabilities.yml` key or value | `schemas/capabilities.schema.json` (+ `core/capabilities.ts` / `check.ts` for rules a schema cannot express), then `scripts/gen-schema.sh`; `skills/doctor/templates/capabilities.yml.template`, the key table in `references/capabilities.md`; a migration in `init.md` when an old value changes |
| What the board panel shows or how it derives the next step | `hooks/board/{model,view,svg}.ts`, a test in `tests/board.test.ts`; `board/register.ts` holds only hooks and `$` calls |
| Which `specs/` folders count as features | `core/features.ts`, a test in `tests/doctor-check.test.ts` |
| How `specs/` files are parsed | `core/parse.ts`, a test in `tests/board.test.ts` |
| The documentation site | `docs/` (Astro Starlight, pages in `docs/src/content/docs/`, sidebar in `docs/astro.config.mjs`); `cd docs && npm run build`; deployed by `.github/workflows/docs.yml`. English is the root locale, Polish mirrors it in `docs/src/content/docs/pl/` (same file names; update both). `src/content/docs/` is the latest version; archived releases are snapshot folders (`2.0/`, `pl/2.0/`) made by `starlight-versions` when the slug is added to `versions` in `astro.config.mjs`; never edit a snapshot. `/changelog/` (sdd) and `/board/changelog/` (the former sdd-board, history only) are generated from the root `CHANGELOG.md` by `starlight-changelogs` (`docs/src/content.config.ts`, English only; `docs/.npmrc` sets `legacy-peer-deps` because the plugin's peer range excludes Astro 7) |

<!-- BEGIN:plugin-dev -->
## Plugin development

Managed by `/plugin-setup`; re-run it to refresh this section instead of editing it here.

### Where things live

- One plugin, `plugins/sdd`, listed in the marketplace `.claude-plugin/marketplace.json` (`sdd` → `./plugins/sdd`). Its `renames` maps the former `sdd-board` to `sdd`; `renames` is append-only. `sdd` keeps `skills/`, `agents/`, `references/`, `hooks/`, `schemas/`, `bin/`, `cli/` and `tests/` at its root.
- Each manifest is `<plugin>/.claude-plugin/plugin.json`. Components sit at the plugin root, never inside `.claude-plugin/`.
- A new **plugin** is registered in `.claude-plugin/marketplace.json`; a new skill or agent inside an existing plugin is not.
- `plugins/sdd/.claude-plugin/plugin.json` sets an explicit `agents` array, which replaces the default `agents/` scan: a new agent file must be added to it or it never loads.
- Every manifest opens with `$schema`: `https://www.schemastore.org/claude-code-plugin-manifest.json` for a plugin, `https://www.schemastore.org/claude-code-marketplace.json` for the marketplace.

### After a change to a plugin

1. **Update the docs that list capabilities by hand:** `README.md` (plugins table, command/agent reference, File Structure), `plugins/sdd/README.md`, and the "What this repo is" and "Architecture" sections of this file.
2. **Run `/marketplace-creator audit`** and fix what it reports before committing.

### Versions

Plugins pin `version` in `plugin.json` (the marketplace entries carry none), so users stay on the cached copy until it changes; semver sizes are in `/plugin-release`.

**Never bump a version on your own.** Editing a skill or an agent is not a request to bump: change a `version` only when the user asks for it in this conversation, and then through `/plugin-release`, which proposes the size from the diff and writes nothing until the user agrees. A pull request that changed a plugin and left its version alone is caught by CI, not by a standing instruction.

### Releasing

Merging an `sdd` bump PR is the release (see Conventions). Never tag by hand.

Every version bump adds a `CHANGELOG.md` section, `## [<version> <plugin>] — <date>` (`## [<version>]` for the main plugin); `/plugin-release` drafts it from git history.

Changelog main plugin: sdd

### What runs on its own

Only `.github/workflows/release.yml` (tags and releases `sdd` on merge to `main`). The steps above happen because this file asks for them; `.github/workflows/plugin-checks.yml` fails a pull request with drift or a missing bump.
<!-- END:plugin-dev -->
