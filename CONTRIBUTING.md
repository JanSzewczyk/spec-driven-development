# Contributing to the SDD Plugin

Thanks for your interest in improving the SDD plugin. This document explains how to contribute changes safely.

## Quick start

```bash
git clone https://github.com/JanSzewczyk/spec-driven-development.git
cd spec-driven-development
```

The repository is a Claude Code plugin. Its layout:

- **`.claude-plugin/marketplace.json`** — the marketplace; it lists the two plugins under `plugins/`.
- **`plugins/sdd/`** — the SDD plugin: manifest `.claude-plugin/plugin.json` and the payload below.
- **`plugins/sdd-board/`** — the Desktop side-panel mod (hooks module in `hooks/`, tests in `tests/`). Run its tests with `cd plugins/sdd-board && claude plugin test`, and try it with `claude --plugin-dir plugins/sdd-board`.
- **`plugins/sdd/skills/`, `agents/`** — framework payload, auto-discovered by Claude Code once the plugin is installed. Every slash command is a skill (`skills/<name>/SKILL.md`); text shared by several skills is in `plugins/sdd/references/`.
- **`plugins/sdd/skills/doctor/`** — `SKILL.md` holds `check` (calls the `doctor_check` tool); `references/init.md` holds `init`. `templates/` holds the per-project seed files copied/adapted into target projects.
- **`plugins/sdd/hooks/`** — the mod behind the `doctor_check` tool; **`shared/sdd-core/`** — the TypeScript both plugins use (`parse.ts`, `formats.ts`, `check.ts`). Edit it there and run `scripts/sync-core.sh`: a mod imports only files inside its own plugin and symlinks fail validation, so each plugin carries a copy (CI fails when a copy drifts).
- **Root docs** (`README.md`, `LICENSE`, `CHANGELOG.md`, `.github/`) — repo-level documentation.

## Testing your changes locally

The framework is mostly Markdown prompts, so besides the unit tests the loop is hands-on: install
the plugin and exercise the real skills against a target project, then verify the artifacts by hand.

0. `scripts/sync-core.sh`, then `claude plugin test` in `plugins/sdd` (doctor rules) and `plugins/sdd-board`; `claude plugin validate` on both.
1. Make changes inside the plugin (`plugins/sdd/skills/`, `agents/`, `references/`, `skills/doctor/templates/`, `skills/doctor/references/`) or in `shared/sdd-core/`.
2. Install the plugin into Claude Code from the local checkout and exercise the real flow against
   a fresh project:

   ```bash
   mkdir /tmp/sdd-smoke && cd /tmp/sdd-smoke && git init
   # add a minimal package.json with typescript + eslint to exercise stack detection
   claude --plugin-dir /path/to/spec-driven-development/plugins/sdd --plugin-dir /path/to/spec-driven-development/plugins/sdd-board
   # Open /tmp/sdd-smoke in Claude Code:
   #   /sdd:doctor check     # report-only; creates nothing
   #   /sdd:doctor init      # creates per-project artifacts
   #   /sdd:doctor check     # confirm the checks flip to pass
   #   /sdd:spec feat hello world
   ```

3. Verify by hand that `init` created files **under the project root** (not the plugin):
   `specs/constitution.md`, `specs/template.md`, `specs/capabilities.md`,
   and, with sibling repositories, `permissions.additionalDirectories` in `.claude/settings.json`.
4. Re-run `/sdd:doctor init` and confirm idempotency: existing constitution and template are
   not overwritten, `<!-- user-override -->` sections in `capabilities.md` survive, settings.json
   gains no duplicate paths, and any user keys are preserved. Point it at a malformed
   `settings.json` and confirm it refuses to touch the file.

5. Sanity-check stale references after any rename or removal (extend the list with the names you
   removed):

   ```bash
   grep -rnE 'spec-guard|drift-detector|settings-merge|templates/hooks|doctor/reference/|ui-critic|ui-preview|sdd-screenshots|sdd/commands/' \
     plugins/sdd/ plugins/sdd-board/ shared/ README.md CLAUDE.md
   # Expected: empty output.
   ```

## Style guidelines

- **All framework files are English-only.** The audit grep used during review catches Polish diacritics.
- **No new generic agents without strong justification.** The framework intentionally only adds 3 (`spec-verifier`, `reviewer`, `codebase-surveyor`). Implementation is the user's own flow, configured under `## Implementation` in `capabilities.md`.
- **Slash commands** should declare `allowed-tools` explicitly. Avoid `"*"` unless the command genuinely needs every tool (`/sdd:implement` and `/sdd:review` hand work to flows and agents the user picks).
- **Skills (`SKILL.md`)** must have a clear `description` frontmatter saying what it does and when to use it — that is what Claude uses to decide whether to trigger it. The version lives in `plugin.json`, not in the skill.
- Conventional Commits for commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

## What goes where

| Change type | Location |
|------|------|
| Default implementation flow for new projects | Edit `## Implementation` in `skills/doctor/templates/capabilities.md.template` |
| New SDD-doctor check | `shared/sdd-core/check.ts` + a test in `plugins/sdd/tests/` + the row in `plugins/sdd/references/formats.md`, then `scripts/sync-core.sh` |
| New slash command | New folder `skills/<name>/SKILL.md` (`name`, `description`, `allowed-tools`, `disable-model-invocation: true`). Document in README. |
| Text several skills repeat | `references/<file>.md`, linked as `${CLAUDE_PLUGIN_ROOT}/references/<file>.md` |
| New verification agent | New file in `agents/<name>.md` + list it in `agents` of `plugin.json` and integrate via the skill that calls it (`skills/review/SKILL.md`, `agents/reviewer.md`) |
| Support for a new typecheck/lint tool | Usually **nothing** — the doctor `init` detects whatever a project uses and records it in constitution §2. |
| Bundled per-project template | Place under `skills/doctor/templates/` — `SKILL.md` tells doctor to copy/adapt it |
| Documentation | `README.md` is the single source of truth. Do not split docs into `docs/`. |

## Pull request checklist

- [ ] Affected files checked for stale references with the grep above.
- [ ] `scripts/sync-core.sh --check` is clean and `claude plugin test` passes in both plugins.
- [ ] Doctor exercised against a fresh project: `/sdd:doctor check` → `init` → `check`, artifacts verified by hand and idempotency confirmed.
- [ ] If a command or agent was added or removed, the README's File Structure and reference sections reflect it.
- [ ] `CHANGELOG.md` section added for the new version.
- [ ] `plugins/<name>/.claude-plugin/plugin.json` `version` bumped (same value in `.claude-plugin/marketplace.json`; for `sdd` also the README badge).

## Reporting issues

Please open a GitHub issue with:

- Plugin version (`.claude-plugin/plugin.json` `version` or the commit SHA you installed).
- Target project stack (Next.js / Python / etc.).
- The output of `/sdd:doctor check` from the failing project.
- Steps to reproduce.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
