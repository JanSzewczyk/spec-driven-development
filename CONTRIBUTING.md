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
- **`plugins/sdd/skills/`, `agents/`, `commands/`** — framework payload, auto-discovered by Claude Code once the plugin is installed.
- **`plugins/sdd/skills/doctor/`** — the LLM-driven doctor skill. `SKILL.md` holds `check`; `reference/init.md` holds `init` (no Python helpers). `templates/` holds the per-project seed files copied/adapted into target projects; `reference/settings-merge.md` is the sibling-repo permissions edit for `.claude/settings.json`.
- **Root docs** (`README.md`, `LICENSE`, `CHANGELOG.md`, `.github/`) — repo-level documentation.

## Testing your changes locally

This is a documentation-and-config framework, not runtime code, and the doctor skill is now
**LLM-driven** (no Python helpers to invoke). The test loop is therefore hands-on: install the
plugin and exercise the real skill against a target project, then verify the artifacts by hand.

1. Make changes inside the plugin (`plugins/sdd/commands/`, `agents/`, `skills/`, `skills/doctor/templates/`, `skills/doctor/reference/`).
2. Install the plugin into Claude Code from the local checkout and exercise the real flow against
   a fresh project:

   ```bash
   mkdir /tmp/sdd-smoke && cd /tmp/sdd-smoke && git init
   # add a minimal package.json with typescript + eslint to exercise stack detection
   claude --plugin-dir /path/to/spec-driven-development/plugins/sdd
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

5. Sanity-check stale references after any rename:

   ```bash
   grep -rnE '(?<!sdd-)\b(spec-verifier|reviewer|ui-critic)\b' \
     --perl-regexp plugins/sdd/commands/ plugins/sdd/agents/ plugins/sdd/skills/ README.md
   # Expected: empty output.
   ```

## Style guidelines

- **All framework files are English-only.** The audit grep used during review catches Polish diacritics.
- **No new generic agents without strong justification.** The framework intentionally only adds 3 (`spec-verifier`, `reviewer`, `ui-critic`). Implementation is the user's own flow, configured under `## Implementation` in `capabilities.md`.
- **Slash commands** should declare `allowed-tools` explicitly. Avoid `"*"` unless the command genuinely needs every tool.
- **Skills (`SKILL.md`)** must have a clear `description` frontmatter — that is what Claude uses to decide whether to auto-trigger. Include `version`, `lastUpdated`, `tags`, `author` for marketplace consistency.
- Conventional Commits for commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

## What goes where

| Change type | Location |
|------|------|
| Default implementation flow for new projects | Edit `## Implementation` in `skills/doctor/templates/capabilities.md.template` |
| New SDD-doctor check | Add a numbered check to the `check` procedure in `skills/doctor/SKILL.md` |
| New slash command | New file in `commands/<name>.md`. Document in README. |
| New verification agent | New file in `agents/<name>.md` + integrate via `/sdd:review` (`commands/review.md` and `agents/reviewer.md`) |
| Support for a new typecheck/lint tool | Usually **nothing** — the LLM-driven skill detects whatever a project uses and records it in constitution §2. |
| Bundled per-project template | Place under `skills/doctor/templates/` — `SKILL.md` tells doctor to copy/adapt it |
| Documentation | `README.md` is the single source of truth. Do not split docs into `docs/`. |

## Pull request checklist

- [ ] All affected `.md` / `.sh` files reviewed for stale references via the grep above.
- [ ] Doctor exercised against a fresh project: `/sdd:doctor check` → `init` → `check`, artifacts verified by hand and idempotency confirmed.
- [ ] If a new command / agent / hook was added, the README's File Structure and reference sections reflect it.
- [ ] `CHANGELOG.md` section added for the new version.
- [ ] `.claude-plugin/plugin.json` `version` bumped (same value in `marketplace.json` and the README badge).

## Reporting issues

Please open a GitHub issue with:

- Plugin version (`.claude-plugin/plugin.json` `version` or the commit SHA you installed).
- Target project stack (Next.js / Python / etc.).
- The output of `/sdd:doctor check` from the failing project.
- Steps to reproduce.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
