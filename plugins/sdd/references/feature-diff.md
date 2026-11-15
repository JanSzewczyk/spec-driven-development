# The feature diff

Read this when a step needs "the changes of the feature": `/sdd:review`, `/sdd:analyze` and the
briefs for `spec-verifier` and `reviewer`.

`/sdd:implement` commits each finished task, but the latest work and the spec
files can still be **uncommitted** and new files **untracked**. Every step and every agent uses
this definition:

```bash
base=$(git merge-base HEAD <default-branch>)
git diff "$base" -- . ':(exclude)<glob>' …    # committed + uncommitted changes to tracked files
git ls-files --others --exclude-standard      # new files — part of the feature too
```

- `<glob>` = the `generated` globs of `specs/capabilities.yml` (only the old `specs/capabilities.md`
  exists → its `Generated / out-of-band paths` list). Apply them to the
  untracked list too. Agents never flag a path that matches one.
- Projects in sibling repositories (`repo: true` under `projects`): compute the same diff in each repo
  that is on the feature branch (`git -C <repo> …`) and pass every agent the repos with their bases.
