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
      `grep -rnE '(?<!sdd-)\b(spec-guard|drift-detector|reviewer|ui-critic)\b' --perl-regexp template/ README.md` → empty
- [ ] Framework integrity:
      `python3 template/.claude/skills/doctor/check.py --root template` → checks 3, 4, 6 pass
- [ ] If a new agent / command / hook was added, it is registered in `check.py` constants and documented in `README.md` File Structure.
- [ ] `CHANGELOG.md` updated under `[Unreleased]`.

## Notes for reviewers

<!-- Anything that needs a second pair of eyes? Trade-offs, follow-ups, etc. -->
