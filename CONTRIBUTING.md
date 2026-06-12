# Contributing to the SDD Plugin

Thanks for your interest in improving the SDD plugin. This document explains how to contribute changes safely.

## Quick start

```bash
git clone https://github.com/JanSzewczyk/spec-driven-development.git
cd spec-driven-development
```

The repository is a Claude Code plugin. Its layout:

- **`plugin.json`** — manifest at repo root.
- **`skills/`, `agents/`, `commands/`, `hooks/`** — framework payload, auto-discovered by Claude Code once the plugin is installed.
- **`skills/doctor/templates/`** — per-project templates copied into target projects by `/sdd:doctor init`.
- **Root docs** (`README.md`, `LICENSE`, `CHANGELOG.md`, `.github/`) — repo-level documentation.

## Testing your changes locally

This is a documentation-and-config framework, not runtime code, so the test loop is hands-on. The recommended cycle:

1. Make changes inside the plugin (`commands/`, `agents/`, `skills/`, `hooks/`, `skills/doctor/templates/`).
2. Run the smoke test against the plugin from an empty target project:

   ```bash
   mkdir /tmp/sdd-smoke && cd /tmp/sdd-smoke && git init
   python3 /path/to/spec-driven-development/skills/doctor/check.py --root .
   ```

   Expected for an empty project: checks 1, 2, 5, 6 fail (per-project files absent); 3, 4 pass if the plugin path resolves; 7, 8, 10 warn or pass depending on environment; 9 depends on your plugin marketplace.

3. Run init to populate per-project files:

   ```bash
   python3 /path/to/spec-driven-development/skills/doctor/init.py --root .
   python3 /path/to/spec-driven-development/skills/doctor/check.py --root .
   ```

   Expected after `init`: at most 7 + 8 + 10 still warn, the rest pass.

4. Install the plugin into Claude Code from the local checkout and exercise the real flow:

   ```bash
   claude plugin install /path/to/spec-driven-development
   # Open /tmp/sdd-smoke in Claude Code:
   #   /sdd:doctor check
   #   /sdd:doctor init
   #   /sdd:spec feat hello world
   ```

5. Sanity-check stale references after any rename:

   ```bash
   grep -rnE '(?<!sdd-)\b(spec-guard|drift-detector|reviewer|ui-critic)\b' \
     --perl-regexp commands/ agents/ skills/ README.md
   # Expected: empty output.
   ```

## Style guidelines

- **All framework files are English-only.** The audit grep used during review catches Polish diacritics.
- **No new generic agents without strong justification.** The framework intentionally only adds 4 (`sdd-spec-guard`, `sdd-drift-detector`, `sdd-reviewer`, `sdd-ui-critic`). Anything else should be a plugin specialist invoked through `capabilities.md` routing.
- **Hooks must exit 0 when nothing applies** (e.g. unknown file extension), exit 2 to block Claude.
- **Slash commands** should declare `allowed-tools` explicitly. Avoid `"*"` unless the command genuinely needs every tool.
- **Skills (`SKILL.md`)** must have a clear `description` frontmatter — that is what Claude uses to decide whether to auto-trigger. Include `version`, `lastUpdated`, `tags`, `author` for marketplace consistency.
- Conventional Commits for commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

## What goes where

| Change type | Location |
|------|------|
| New routing rule (task type → agent) | Edit `skills/doctor/templates/capabilities.md.template` |
| New SDD-doctor check | Add function to `skills/doctor/check.py`, append to `run_all_checks` |
| New slash command | New file in `commands/<name>.md`. Document in README. |
| New verification agent | New file in `agents/sdd-<name>.md` + integrate via `/sdd:review` (`commands/review.md` and `agents/sdd-reviewer.md`) |
| New hook | New script in `hooks/<name>.<ext>` + wire into `skills/doctor/templates/settings.json.template` |
| Bundled per-project template | Place under `skills/doctor/templates/` — `init.py` will copy it |
| Documentation | `README.md` is the single source of truth. Do not split docs into `docs/`. |

## Pull request checklist

- [ ] All affected `.md` / `.py` / `.sh` files reviewed for stale references via the grep above.
- [ ] Local smoke test passes: `check.py` then `init.py` against a fresh empty directory.
- [ ] If a new command / agent / hook was added, the README's File Structure and reference sections reflect it.
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`.
- [ ] `plugin.json` `version` bumped if there is a user-visible change.

## Reporting issues

Please open a GitHub issue with:

- Plugin version (`plugin.json` `version` or the commit SHA you installed).
- Target project stack (Next.js / Python / etc.).
- The output of `/sdd:doctor check` from the failing project.
- Steps to reproduce.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
