# Contributing to SDD Framework

Thanks for your interest in improving the SDD Framework. This document explains how to contribute changes safely.

## Quick start

```bash
git clone https://github.com/<your-org>/sdd-template.git
cd sdd-template
```

The repository has two parts:

- **`template/`** — files that get copied into target projects. This is the framework's payload.
- **Root files** (`README.md`, `bootstrap.sh`, `LICENSE`, …) — repo-level documentation and the installer.

When you modify the framework, you almost always edit something inside `template/`.

## Testing your changes locally

This is a documentation-and-config framework, not runtime code, so the test loop is hands-on. The recommended cycle:

1. Make changes inside `template/`.
2. Run the smoke test against the template itself:

   ```bash
   python3 template/.claude/skills/sdd-doctor/check.py --root template
   ```

   Expected (since `template/` is not a real project): checks 1, 5, 7 fail; 2, 3, 4, 6 pass; 8 and 10 warn; 9 depends on your plugin marketplace. **Checks 3, 4, 6 are the framework-integrity ones** — they MUST pass.

3. Bootstrap a throwaway target and exercise the full flow:

   ```bash
   mkdir /tmp/sdd-test && cd /tmp/sdd-test && git init
   bash /path/to/sdd-template/bootstrap.sh
   # Open in Claude Code, run: /sdd-doctor check
   ```

   Expected: 8-10 checks pass after `/sdd-doctor init`.

4. Sanity-check stale references after any rename:

   ```bash
   grep -rnE '(?<!sdd-)\b(spec-guard|drift-detector|reviewer|ui-critic)\b' --perl-regexp template/ README.md
   # Expected: empty output.
   ```

## Style guidelines

- **All framework files are English-only.** The audit grep used during review will catch Polish diacritics.
- **No new generic agents without strong justification.** The framework intentionally only adds 4 (`sdd-spec-guard`, `sdd-drift-detector`, `sdd-reviewer`, `sdd-ui-critic`). Anything else should be a plugin specialist invoked through `capabilities.md`.
- **Hooks must exit 0 when nothing applies** (e.g. unknown file extension), exit 2 to block Claude.
- **Slash commands** should declare `allowed-tools` explicitly. Avoid `"*"` unless the command genuinely needs every tool.
- **Skills (`SKILL.md`)** must have a clear `description` frontmatter — that is what Claude uses to decide whether to auto-trigger.
- Conventional Commits for commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

## What goes where

| Change type | Location |
|------|------|
| New routing rule (task type → agent) | Edit `template/.claude/capabilities.md.template` AND `template/.claude/skills/sdd-doctor/init.py` (`routing_default` string) |
| New SDD-doctor check | Add function to `template/.claude/skills/sdd-doctor/check.py`, append to `run_all_checks` |
| New slash command | New file in `template/.claude/commands/<name>.md` + add to `REQUIRED_COMMANDS` in `check.py` |
| New verification agent | New file in `template/.claude/agents/<name>.md` + add to `REQUIRED_AGENTS` in `check.py` + integrate via `/review` |
| New hook | New script in `template/.claude/hooks/<name>.<ext>` + wire into `template/.claude/settings.json` |
| Documentation | `README.md` is the single source of truth. Do not split docs into `docs/`. |

## Pull request checklist

- [ ] All affected `.md` / `.py` / `.sh` files reviewed for stale references via the grep above.
- [ ] `python3 template/.claude/skills/sdd-doctor/check.py --root template` passes the framework-integrity checks.
- [ ] If a new agent / command / hook was added, it is registered in `check.py` constants.
- [ ] README's File Structure section reflects the change.
- [ ] CHANGELOG.md entry added under `[Unreleased]`.

## Reporting issues

Please open a GitHub issue with:

- SDD framework version (the latest commit SHA / tag you bootstrapped from).
- Target project stack (Next.js / Python / etc.).
- The output of `/sdd-doctor check` from the failing project.
- Steps to reproduce.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
