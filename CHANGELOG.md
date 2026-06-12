# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed (breaking)

- **Skill renamed `sdd-doctor` → `doctor`.** The skill directory is now `skills/doctor/` and its `name:` is `doctor`; the wrapper command file is `commands/doctor.md`. The redundant `sdd-` prefix is dropped because the plugin namespace already disambiguates.
- **Verification agents renamed (drop the `sdd-` prefix).** `sdd-spec-guard` → `spec-guard`, `sdd-drift-detector` → `drift-detector`, `sdd-reviewer` → `reviewer`, `sdd-ui-critic` → `ui-critic`. Same reasoning as the doctor rename: the `sdd` plugin namespace already disambiguates these against specialist agents from the marketplace; the prefix added noise without value. `Task` tool invocations updated to use the bare names (`subagent_type: spec-guard`, etc.). `plugin.json` `agents` array updated to the new paths.
- **Documentation now uses the plugin-namespaced invocation form `/sdd:<command>`** — `/sdd:doctor`, `/sdd:constitution`, `/sdd:spec`, `/sdd:clarify`, `/sdd:plan`, `/sdd:tasks`, `/sdd:implement`, `/sdd:review`, `/sdd:analyze`. This is how commands are actually invoked when the plugin is installed in another project (`/<plugin>:<command>`). Command files under `commands/` keep their plain names (`spec.md`, `plan.md`, …); the `sdd` namespace comes from `plugin.json`.
- **Underscore prefix dropped from project artifacts under `specs/`.** Both `specs/_constitution.md` → `specs/constitution.md` and `specs/_template.md` → `specs/template.md`. The underscore was an alphabetical-sort affordance from the template-repo era; in the plugin model it adds noise without value.
- **Auto-migration in `/sdd:doctor init`.** When a project has the legacy underscored names, init renames them to the new paths and patches `CLAUDE.md`'s pointer string (`specs/_constitution.md` → `specs/constitution.md`). Path-only fix — never touches user-authored content. Idempotent (no-op when already migrated).
- **Dedicated `specs/constitution.md` as the source of truth.** The Constitution is no longer collapsed into `CLAUDE.md`. It now lives as a long-form artifact under `specs/constitution.md` with no token limit. `/sdd:constitution` edits this file exclusively. `CLAUDE.md` becomes a separate, independent session loader (<2,500 tokens) that points at the constitution. The two files are intentionally decoupled — `/sdd:constitution` never modifies `CLAUDE.md`.
- **Doctor expanded to 11 checks.** New check 11 verifies `specs/constitution.md` exists with the canonical sections (Tech stack, Run/build, Conventions, WHAT NOT TO DO). Existing check 1 now additionally verifies that `CLAUDE.md` contains a pointer reference to `specs/constitution.md` and warns if missing.
- **One-time v0.2.0 → v0.3.0 migration in `/sdd:doctor init`.** When the target project has a populated `CLAUDE.md` but no `specs/constitution.md`, init parses `##` sections from CLAUDE.md, seeds them into the new constitution with `<!-- TODO: add rationale / WHY -->` placeholders, then overwrites CLAUDE.md with the new condensed loader template. The original CLAUDE.md content is preserved inside the constitution. Subsequent inits are idempotent (skip both files when present).

### Added

- `skills/doctor/templates/constitution.md.template` — long-form constitution scaffold with `<!-- MIGRATED:* -->` markers used by the migration routine. Includes canonical sections plus optional ones (Testing philosophy, Error handling philosophy, Out of scope).
- `setup_constitution()` four-case handler in `init.py` (both present / migrate / both missing / loader-only).
- `_rename_legacy_underscored_files()` in `init.py` — handles the v0.3.0-style → v0.4.0-style path rename and CLAUDE.md pointer patch.
- `check_constitution()` in `check.py`, plus pointer-reference verification in `check_claude_md()`.

### Changed (non-breaking)

- `skills/doctor/templates/CLAUDE.md.template` refactored from a self-contained constitution into a condensed session loader that points at `specs/constitution.md`.
- `commands/constitution.md` rewritten to target `specs/constitution.md` and to explicitly avoid touching `CLAUDE.md`.

## [0.2.0] — 2026-06-08

### Changed (breaking)

- **Distribution model: template repo → Claude Code plugin.** SDD is now installed once per machine with `claude plugin install https://github.com/JanSzewczyk/spec-driven-development`. Slash commands, verification agents, hooks, and the `doctor` skill are auto-discovered in every project — no per-project copy required.
- **Repo layout flattened.** `commands/`, `agents/`, `hooks/`, `skills/` are now at the plugin root (previously under `template/.claude/`). Per-project templates moved into `skills/doctor/templates/`.
- **`/sdd:doctor init` semantics.** Now copies bundled templates from `<plugin>/skills/doctor/templates/` into the target project and renders `.claude/settings.json` with absolute paths to the plugin's hook scripts (`${PLUGIN_ROOT}` placeholder substituted at install time).
- **Doctor checks.** Old checks 3 ("commands present") and 4 ("agents present") are replaced with "Plugin installed" and "Plugin enabled" — the per-project `.claude/commands` and `.claude/agents` directories are no longer expected.

### Added

- `plugin.json` manifest at repo root.
- `skills/doctor/templates/settings.json.template` with `${PLUGIN_ROOT}` placeholder, rendered by `init.py` at run time.
- `resolve_plugin_root()` helper in both `check.py` and `init.py` (uses `$CLAUDE_PLUGIN_ROOT` env var, falls back to `__file__` walk).
- Plugin-canonical fields in `SKILL.md` frontmatter (`version`, `lastUpdated`, `tags`, `author`, `allowed-tools`).

### Removed

- `bootstrap.sh` — superseded by `claude plugin install`. Old projects already bootstrapped are unaffected; the plugin works on top of existing `.claude/` files without conflict.
- `template/` directory — contents promoted to plugin root or relocated under `skills/doctor/templates/`.

### Migration notes

If you already bootstrapped a project with v0.1.0:

1. Install the plugin: `claude plugin install https://github.com/JanSzewczyk/spec-driven-development`.
2. (Optional) Delete the now-redundant `.claude/commands/`, `.claude/agents/`, `.claude/hooks/`, `.claude/skills/` from your project — the plugin provides them globally.
3. Re-run `/sdd:doctor init` to regenerate `.claude/settings.json` with hook paths pointing at the plugin instead of the (now-deleted) project-local hooks.
4. Your `CLAUDE.md`, `specs/`, and `capabilities.md` `<!-- user-override -->` sections are preserved untouched.

## [0.1.0] — 2026-06-04

### Added

- Initial release of the SDD Framework as a template repository with `bootstrap.sh`.
- 9 slash commands: `doctor`, `constitution`, `spec`, `clarify`, `plan`, `tasks`, `implement`, `review`, `analyze`.
- 4 verification sub-agents: `spec-guard`, `drift-detector`, `reviewer`, `ui-critic`.
- `doctor` skill with 10-point readiness check and `init`/`fix` modes (auto-detect installed plugins + stack).
- Hooks: `typecheck.py` and `lint.sh` (PostToolUse, exit 2 blocks Claude).
- Project templates: `CLAUDE.md.template`, `specs/template.md`, `capabilities.md.template`, `settings.json`.
- Contract-first TDD for UI components — `/sdd:tasks` emits a 3-task chain (`ui-contract` → `ui-component-test` → `ui-component`) so React/Next.js components get a meaningful red phase. Props interface lives inline in `.tsx` (no separate `.types.ts`).
- Three-tier agent hierarchy: Orchestrator → Specialist agents (plugin-based) → Verification agents (SDD-owned), with Skills loaded on demand.
- Per-task routing via YAML tags (`type`, `agent`, `skills`) in `tasks.md` — automatically auto-generated by `/sdd:tasks` from `capabilities.md` rules.
- Conventional Commits-style branches (`feat/...`, `fix/...`) enforced by `/sdd:spec`.
- Comprehensive README with quick start, end-to-end example, slash command reference, sub-agent reference, best practices, anti-patterns, design decisions, and troubleshooting.
