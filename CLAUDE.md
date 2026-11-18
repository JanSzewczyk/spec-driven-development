# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## What this repo is

A **plugin marketplace**, not an application. Two plugins under `plugins/`:

| Plugin | What it is |
| --- | --- |
| **sdd** | The Spec-Driven Development framework: 11 skills (`/sdd:<name>`), 3 sub-agents (spec-verifier, reviewer, codebase-surveyor) and a mod that registers the `doctor_check` tool. Behavior is Markdown prompts; the only code is TypeScript. |
| **sdd-board** | Claude Code Desktop side panel (a mod, no agents or skills; requires `sdd`): current spec with phase, next command and tasks, all specs, a read-only configuration pane. Hooks module `hooks/register.ts`; pure parsers, model and views in sibling files. |

`sdd` is installed into a *target* project (`/plugin install sdd@spec-driven-development`) and works on that project's `specs/` and git repo. Here you edit the plugin; to see behavior, exercise it against a separate target project. Paths below are relative to `plugins/sdd/` unless stated.

## Commands

No `npm`/`make` and no build step. Tests:

- `cd plugins/sdd && claude plugin test` (doctor check rules)
- `cd plugins/sdd-board && claude plugin test`
- Shared code lives in `shared/sdd-core/`; run `scripts/sync-core.sh` after editing it (CI runs it with `--check`). `node scripts/check-capabilities.ts` checks the `capabilities.yml` contract.

Skills are exercised by running them against a target project. Smoke test: `/sdd:doctor check` on a fresh project → `/sdd:doctor init` → `check` again; verify by hand that artifacts landed under the **repo root** (not the plugin) and that a re-`init` is idempotent. Try the panel with `claude --plugin-dir plugins/sdd-board` in a project that has `specs/`, then `/sdd-dashboard`.

## Architecture

A fixed pipeline of slash commands, each writing artifacts under `specs/<feature-slug>/`:

```
/sdd:constitution → /sdd:spec → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:review
```

Plugin assets, wired by `.claude-plugin/plugin.json`:

- **`skills/<name>/SKILL.md`**: the 11 commands. YAML frontmatter (`name`, `description`, `argument-hint`, `allowed-tools`), no `disable-model-invocation`: each description says the skill runs only on an explicit user request, so Claude starts a phase when asked ("run plan") and never on its own. The *body is the instruction set Claude executes*; editing behavior means editing prose. `spec` creates the branch + skeleton; `tasks` writes self-contained tasks; `implement` hands a task to the flow in `capabilities.yml`; `review` orchestrates the verification agents; `retro` turns review lessons into WHAT NOT TO DO entries; `capabilities` scans installed skills/agents and, after confirmation, fills `implementation`, `actions` and `review`. No skill runs `context: fork`: `plan` needs `ExitPlanMode` and several need `AskUserQuestion`, which sub-agents lack.
- **`references/*.md`**: text shared by skills, linked as `${CLAUDE_PLUGIN_ROOT}/references/<file>.md`: `feature-diff`, `capabilities` (every key, value and default), `status-lifecycle`, `sibling-repos`, `formats` (artifact sections, the 7 doctor checks). A block goes here when ≥2 skills repeat it and it exceeds ~5 lines.
- **`hooks/`**: the `sdd` mod. `register.ts` registers `doctor_check` (`mcp__sdd__doctor_check`); `core/` is a generated copy of `shared/sdd-core/`. Mods need Claude Code 2.1.287+, not WSL, not `--safe-mode`; `doctor` falls back to a manual check there.
- **`agents/*.md`**: invoked via the Agent tool, never by the user. `spec-verifier` reads the diff once against the docs and returns JSON (per-AC status, non-goal violations, out-of-scope, drift, per-task completeness). `reviewer` gives the final READY/NOT READY verdict from the test and agent results `/sdd:review` hands over, checks the constitution, runs domain audits and writes `review.md`. `codebase-surveyor` maps the affected projects (at most 30 lines) for `/sdd:plan`.
- **`skills/doctor/`**: `SKILL.md` holds `check` (calls `doctor_check`, 7 read-only checks listed in `references/formats.md`, manual fallback). `references/init.md` (loaded only for `init`) is LLM-driven: detects projects and quality commands and writes the per-project artifacts. Its only `.claude/settings.json` edit adds sibling-repo paths to `permissions.additionalDirectories` (malformed JSON is never touched); no settings hooks are generated. `templates/` seeds `constitution.md.template`, `capabilities.yml.template`, `specs/template.md`, `sdd-check.yml.template`.
- **`shared/sdd-core/`** (repo root): pure TypeScript, no mods API, used by both plugins: `yaml.ts` (strict YAML subset), `capabilities.ts` (reads `capabilities.yml`, or the format-2 `capabilities.md`), `parse.ts` (spec/plan/tasks/review parsers), `formats.ts`, `gather.ts` (reads a project through an `Io` interface), `check.ts` (doctor rules and `effectiveConfig`, shared with the board's Config pane). A mod may import only files inside its own plugin and `claude plugin validate` refuses symlinks, so `scripts/sync-core.sh` copies it into `plugins/*/hooks/core/`. Never edit the copies; forgetting the sync fails CI.
- **`shared/sdd-core/capabilities.schema.json`**: the **single source** of `capabilities.yml` keys, allowed values, defaults and patterns. `formats.ts` reads a generated TS copy (`capabilities.schema.ts`; a mod loads only code files), and the script copies the JSON to `plugins/sdd/schemas/` (the URL the file's `# yaml-language-server` line points at, pinned to the release tag).
- **`actions/sdd-check/`**: GitHub Action running `runChecks` in `ci` mode in other repos. `/sdd:doctor init` installs its workflow (`# sdd-workflow: <n>` is `WORKFLOW_VERSION`, `uses:` pinned to `v<version>`) and repairs every finding tagged `fix: 'init'`.

**Critical invariant:** artifacts are written under the *repo root* (Claude's cwd); templates are read from the *plugin root* (`${CLAUDE_PLUGIN_ROOT}`).

### Key concepts

- **Projects**: a unit with its own stack and commands, listed under `projects` in the target's `specs/capabilities.yml` (single app: `root`; monorepo: one per app/package; multi-repo feature: projects in sibling checkouts, `specs/` only in the spec repo). Constitution §2 has one command row per project; nothing assumes a frontend.
- **Feature lookup and ids**: commands find the feature by the `**Branch:**` line of `spec.md` (naming is configurable). AC ids never change once written; a `/sdd:tasks` re-run keeps task ids and statuses.
- **Tasks**: `/sdd:tasks` writes one Epic of Jira-like tasks (`project`, `status`, `depends_on`, `acceptance` ids, `plan` refs, `scope`, `files`). Tasks refer to spec and plan instead of copying them; `/sdd:implement` inlines the references into a brief. No agents, models or TDD tags in tasks.
- **Epic and task ids**: `tasks.md` has `**Epic:** <LETTERS>` (`ULOG`, assigned once); a task's id is `<EPIC>-T<n>`. `/sdd:tasks` commits `specs/<slug>/` (`Epic:` trailer); `/sdd:implement` commits each finished task (`Task: <EPIC>-T<n>` trailer, always); `/sdd:review` commits the rest and opens the PR. Only the orchestrating session writes `tasks.md`.
- **Isolation**: `none` (default) implements and commits in the session. `isolation: { worktree: { merge, parallel } }` (opt-in, `skills/implement/references/isolation.md`) runs each task in a sub-session, worktree and branch `<spec-branch>--<EPIC>-T<n>`; `merge: pr` waits for a human to merge each task PR, `merge: auto` rebases and fast-forwards. `merge` and `parallel` exist only under `worktree`.
- **Configuration**: `specs/capabilities.yml` holds `implementation` (who implements, per project or `default`: `skill:` / `agent:` / `command:` / `in-session`; `isolation`), `actions` (`branch` / `commit` / `pr`; `null` → the session uses git and gh) and `review` (tests, publish, audit flow, extra `checks`). Keys and defaults: `references/capabilities.md`. `format: N` is `SDD_FORMAT` in `formats.ts` (now 3); raising it needs a migration in `skills/doctor/references/init.md`. The format-2 `capabilities.md` is still read with a migrate warning until the next major version.
- **The framework does not implement**: with nothing configured the session implements the task itself; the implementer runs the project's checks and `/sdd:review` verifies against the ACs.
- **Constitution** (`specs/constitution.md`) is the only file written outside `specs/`'s feature folders, edited via `/sdd:constitution`. The target's root `CLAUDE.md` is user-owned and never read or written.
- **No fixed list of supported stacks**: `init` discovers how each project checks its code (scripts/tasks, CI + pre-commit, tool configs) and records the commands in constitution §2, for any language.

## Conventions

- **Conventional Commits** for commits and branches: `/sdd:spec feat user login` → `feat/user-login`. Type ∈ {feat, fix, chore, refactor, docs}.
- Command/agent references in docs use `/sdd:<command>`.
- **Versioning** (only when the user asks; see Plugin development): a bump touches `plugins/<name>/.claude-plugin/plugin.json` (the only place a version is set; marketplace entries carry none), `CHANGELOG.md` and, for `sdd`, the README badge.
- **Tags and Releases exist only for `sdd` and come from CI, never by hand**: `.github/workflows/release.yml` runs `scripts/release.sh` on a push to `main` touching `plugins/sdd/.claude-plugin/plugin.json`: `git tag -a v<version>` + push when that version has no tag (`claude plugin tag` only makes `<name>--v<version>`), then a Release for every `sdd` tag without one, notes from the version's `CHANGELOG.md` section (`## [<ver>]`). `sdd-board` is versioned in its manifest and `CHANGELOG.md` (`## [<ver> sdd-board]`) only. Use `/plugin-release` for the bump and skip its tag step: a tag made on the feature branch points at a commit that is not on `main` after a squash merge, and CI then sees the tag and does not fix it. `scripts/release.sh --dry-run` shows what CI would do; re-run the workflow by hand (`workflow_dispatch`) to retry.

## Where to make a change

| Want to change… | Edit |
|---|---|
| What a slash command does | `skills/<name>/SKILL.md` |
| Text shared by several skills | `references/<file>.md` |
| A verification agent's behavior | `agents/<name>.md` |
| A doctor readiness check | `shared/sdd-core/check.ts` (+ `formats.ts`, a test in `plugins/sdd/tests/`, the row in `references/formats.md`), then `scripts/sync-core.sh`; tag a finding `fix: 'init'` only when `init.md` repairs it |
| The GitHub Action other repos use | `actions/sdd-check/` (`action.yml`, `run.ts`), fixtures in `tests/fixtures/`, `skills/doctor/templates/sdd-check.yml.template` |
| Per-task commits, isolation, merge modes | `skills/implement/SKILL.md`, `skills/implement/references/isolation.md`, `skills/review/SKILL.md` |
| The `init` procedure | `skills/doctor/references/init.md` |
| Files seeded into target projects | `skills/doctor/templates/` |
| A `capabilities.yml` key or value | `shared/sdd-core/capabilities.schema.json` (+ `capabilities.ts` / `check.ts` for rules a schema cannot express), then `scripts/sync-core.sh`; `skills/doctor/templates/capabilities.yml.template`, the key table in `references/capabilities.md`; a migration in `init.md` when an old value changes |
| What the Desktop panel shows or how it derives the next step | `plugins/sdd-board/hooks/{model,view,svg}.ts`; `register.ts` holds only hooks and `$` calls |
| How `specs/` files are parsed | `shared/sdd-core/parse.ts`, a test in `plugins/sdd-board/tests/`, then `scripts/sync-core.sh` |
| The documentation site | `docs/` (Astro Starlight, pages in `docs/src/content/docs/`, sidebar in `docs/astro.config.mjs`); `cd docs && npm run build`; deployed by `.github/workflows/docs.yml`. English is the root locale, Polish mirrors it in `docs/src/content/docs/pl/` (same file names; update both). `src/content/docs/` is the latest version; archived releases are snapshot folders (`2.0/`, `pl/2.0/`) made by `starlight-versions` when the slug is added to `versions` in `astro.config.mjs`; never edit a snapshot. `/changelog/` (sdd) and `/board/changelog/` (sdd-board) are generated from the root `CHANGELOG.md` by `starlight-changelogs` (`docs/src/content.config.ts`, English only; `docs/.npmrc` sets `legacy-peer-deps` because the plugin's peer range excludes Astro 7) |

<!-- BEGIN:plugin-dev -->
## Plugin development

Managed by `/plugin-setup`; re-run it to refresh this section instead of editing it here.

### Where things live

- Two plugins under `plugins/`, listed in one marketplace `.claude-plugin/marketplace.json` (`sdd` → `./plugins/sdd`, `sdd-board` → `./plugins/sdd-board`). `sdd` keeps `skills/`, `agents/`, `references/`, `hooks/` and `tests/` at its root; `sdd-board` keeps `hooks/` and `tests/`. Both mods carry a generated copy of `shared/sdd-core/` in `hooks/core/`.
- Each manifest is `<plugin>/.claude-plugin/plugin.json`. Components sit at the plugin root, never inside `.claude-plugin/`.
- A new **plugin** is registered in `.claude-plugin/marketplace.json`; a new skill or agent inside an existing plugin is not.
- `plugins/sdd/.claude-plugin/plugin.json` sets an explicit `agents` array, which replaces the default `agents/` scan: a new agent file must be added to it or it never loads.
- Every manifest opens with `$schema`: `https://www.schemastore.org/claude-code-plugin-manifest.json` for a plugin, `https://www.schemastore.org/claude-code-marketplace.json` for the marketplace.

### After a change to a plugin

1. **Update the docs that list capabilities by hand:** `README.md` (plugins table, command/agent reference, File Structure), `plugins/sdd/README.md`, `plugins/sdd-board/README.md`, and the "What this repo is" and "Architecture" sections of this file.
2. **Run `/marketplace-creator audit`** and fix what it reports before committing.

### Versions

Plugins pin `version` in `plugin.json` (the marketplace entries carry none), so users stay on the cached copy until it changes; semver sizes are in `/plugin-release`.

**Never bump a version on your own.** Editing a skill or an agent is not a request to bump: change a `version` only when the user asks for it in this conversation, and then through `/plugin-release`, which proposes the size from the diff and writes nothing until the user agrees. A pull request that changed a plugin and left its version alone is caught by CI, not by a standing instruction.

### Releasing

Merging an `sdd` bump PR is the release (see Conventions). An `sdd-board` bump is not tagged or released. Never tag by hand.

Every version bump adds a `CHANGELOG.md` section, `## [<version> <plugin>] — <date>` (`## [<version>]` for the main plugin); `/plugin-release` drafts it from git history.

Changelog main plugin: sdd

### What runs on its own

Only `.github/workflows/release.yml` (tags and releases `sdd` on merge to `main`). The steps above happen because this file asks for them; `.github/workflows/plugin-checks.yml` fails a pull request with drift or a missing bump.
<!-- END:plugin-dev -->
