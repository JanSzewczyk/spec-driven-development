## Summary

<!-- 1-2 sentences. What does this PR change and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature (new agent / command / hook / check)
- [ ] Refactor
- [ ] Documentation only
- [ ] Chore (CI, deps, repo meta)

## Files touched

<!-- Bullet list with one-line rationale per file. -->

-

## Verification

- [ ] Stale-reference grep is clean:
      `grep -rnE '(?<!sdd-)\b(spec-guard|drift-detector|reviewer|ui-critic)\b' --perl-regexp commands/ agents/ skills/ README.md` → empty
- [ ] Doctor exercised against a fresh project: `/sdd:doctor check` → `init` → `check`; artifacts verified to land under the project root and a re-`init` is idempotent.
- [ ] If a new agent / command / hook / check was added, it is documented in `README.md` File Structure and the relevant `SKILL.md` / template was updated.
- [ ] `CHANGELOG.md` updated under `[Unreleased]`.

## Notes for reviewers

<!-- Anything that needs a second pair of eyes? Trade-offs, follow-ups, etc. -->
