# The feature diff

Read this when a step needs "the changes of the feature": `/sdd:review`, `/sdd:analyze` and the
briefs for `spec-verifier` and `reviewer`.

`/sdd:implement` never commits, so the work is mostly **uncommitted** and new files are
**untracked**. Every step and every agent uses this definition:

```bash
base=$(git merge-base HEAD <default-branch>)
git diff "$base" -- . ':(exclude)<glob>' …    # committed + uncommitted changes to tracked files
git ls-files --others --exclude-standard      # new files — part of the feature too
```

- `<glob>` = the `Generated / out-of-band paths` of `specs/capabilities.md`. Apply them to the
  untracked list too. Agents never flag a path that matches one.
- Projects in sibling repositories (`(repo)` in `## Projects`): compute the same diff in each repo
  that is on the feature branch (`git -C <repo> …`) and pass every agent the repos with their bases.
