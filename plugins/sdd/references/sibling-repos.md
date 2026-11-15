# Projects in sibling repositories

Read this when `projects` in `specs/capabilities.yml` has a project with `repo: true`.

`specs/` lives only in the **spec repo** (this repository). Sibling repositories are checked out
next to it under the same names; their paths (`../mobile-app`) are committed in `capabilities.yml`
and constitution §2.

- **Branch.** Before the first edit in a sibling repo, make sure it is on the feature branch with
  exactly the spec's `**Branch:**` name. Create it from its default branch with
  `git -C <repo> checkout -b <branch>` (not the `branch` action: it may pick another name). Stop and
  ask when its tree is dirty (`git -C <repo> status --porcelain`).
- **Diff.** See [feature-diff.md](feature-diff.md): one base and one diff per repo.
- **Publish.** `/sdd:review` commits and opens a PR in every touched repo (the spec repo's PR also
  carries `specs/<slug>/`) and adds a "Related PRs" list to every PR body.
