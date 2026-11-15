---
title: capabilities.yml
description: Every key, value and default of specs/capabilities.yml.
---

`specs/capabilities.yml` is YAML with a JSON Schema (editor validation through the `# yaml-language-server: $schema=…` line). A missing key means its default. `/sdd:doctor init` rewrites `projects` on every run; every other key is yours, and [`/sdd:capabilities`](/spec-driven-development/commands/capabilities/) fills them from what you have installed, after you confirm.

```yaml
format: 3
projects:
  - name: web
    kind: web
    path: apps/web
    stack: TypeScript, Next.js 15; pnpm + nx
implementation:
  default: in-session
  projects:
    api: agent:python-developer
  isolation: none
generated:
  - "**/*.generated.*"
```

A format-2 `specs/capabilities.md` is still read with a migrate warning; `/sdd:doctor init` migrates it.

## Who does a step

| Value | Hand-over |
|---|---|
| `skill:<name>` | Skill tool, the input as the argument |
| `agent:<name>` | Agent tool with that `subagent_type`, the input as the prompt |
| `command:<shell>` | Bash, the input on stdin |
| `in-session` | the session does it itself |

## Keys

| Key | Values | Default | Effect |
|---|---|---|---|
| `format` | integer | written by init | Format version; a lower one is migrated by `/sdd:doctor init`. |
| `projects` | list of `name`, `kind`, `path`, `stack`, `repo` | written by init | The projects; `repo: true` marks a sibling repository. |
| `implementation.default` | any value above | `in-session` | Who implements a task. |
| `implementation.projects.<project>` | any value above | `implementation.default` | Who implements that project's tasks. |
| `implementation.isolation` | `none` · `worktree:` | `none` | `none`: this session implements and commits every task. `worktree:`: each task in its own sub-session, worktree and branch `<spec-branch>--<EPIC>-T<n>`. |
| `implementation.isolation.worktree.merge` | `pr` · `auto` | `pr` | `pr`: a PR per task, a human merges. `auto`: rebase and fast-forward. |
| `implementation.isolation.worktree.parallel` | integer ≥ 1 | `3` | Tasks running at once. |
| `actions.branch` | `skill:` · `agent:` · `command:` | `null` | Who creates the branch; `null`: the session with git. |
| `actions.commit` | `skill:` · `agent:` · `command:` | `null` | Who commits; `null`: the session with git. |
| `actions.pr` | `skill:` · `agent:` · `command:` | `null` | Who opens the PR; `null`: the session with `gh`. |
| `review.tests` | `run` · `skip` | `run` | Run the test suite in `/sdd:review`. |
| `review.publish` | `ask` · `off` | `ask` | After READY: confirm, then commit and open the PR; `off`: neither. |
| `review.default` | `auto` · `skill:<name>` · `agent:<name>` | `auto` | Audit flow; `auto` picks the session's skills by stack. |
| `review.projects.<project>` | `skill:<name>` · `agent:<name>` | `review.default` | Audit flow for that project. |
| `review.checks` | list of `skill:<name>` / `agent:<name>` | `[]` | Run on every review; an agent returns `PASS` / `FAIL` / `SKIPPED`, `FAIL` blocks READY. |
| `review.ci` | `on` · `off` | unset: init asks | Whether `.github/workflows/sdd-check.yml` is wanted. |
| `generated` | list of quoted globs | `[]` | Files left out of every diff and never flagged. |

`merge` and `parallel` exist only under `worktree`. There is no `commit` switch: task commits always happen, in this session (`none`) or in each sub-session (`worktree`).
