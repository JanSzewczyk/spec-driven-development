# `specs/capabilities.yml`

Read this when a step reads `implementation`, `actions` or `review`. A missing key means its default.
`/sdd:doctor init` writes `projects`; the rest is the user's. Only the format-2 `specs/capabilities.md`
exists → a skill stops with "Run `/sdd:doctor init`" (it migrates the file); the doctor and the board
still read it.

## Who does a step

`skill:<name>` · `agent:<name>` · `command:<shell>` · `in-session`

| Value | Hand-over |
|---|---|
| `skill:<name>` | Skill tool, the input as the argument |
| `agent:<name>` | Agent tool with that `subagent_type`, the input as the prompt |
| `command:<shell>` | Bash, the input on stdin |
| `in-session` | the session does it itself |

## Keys

| Key | Values | Default | Effect |
|---|---|---|---|
| `format` | integer | written by init | format version; a lower one is migrated by `/sdd:doctor init` |
| `projects` | list of `name`, `kind`, `path`, `stack`, `repo` | written by init | the projects; `repo: true` marks a sibling repository |
| `implementation.default` | any value above | `in-session` | who implements a task |
| `implementation.projects.<project>` | any value above | `implementation.default` | who implements that project's tasks |
| `implementation.isolation` | `none` · `worktree:` | `none` | `none`: this session implements and commits every task. `worktree:`: each task in its own sub-session, worktree and branch `<spec-branch>--<EPIC>-T<n>`, committed there |
| `implementation.isolation.worktree.merge` | `pr` · `auto` | `pr` | `pr`: a PR per task, a human merges. `auto`: rebase and fast-forward |
| `implementation.isolation.worktree.parallel` | integer ≥ 1 | `3` | tasks running at once |
| `actions.branch` | `skill:` · `agent:` · `command:` | `null` | who creates the branch; `null`: the session with git |
| `actions.commit` | `skill:` · `agent:` · `command:` | `null` | who commits; `null`: the session with git |
| `actions.pr` | `skill:` · `agent:` · `command:` | `null` | who opens the PR; `null`: the session with `gh` |
| `review.tests` | `run` · `skip` | `run` | run the test suite in `/sdd:review` |
| `review.publish` | `ask` · `off` | `ask` | after READY: confirm, then commit and open the PR; `off`: neither |
| `review.default` | `auto` · `skill:<name>` · `agent:<name>` | `auto` | audit flow; `auto` picks the session's skills by stack |
| `review.projects.<project>` | `skill:<name>` · `agent:<name>` | `review.default` | audit flow for that project |
| `review.checks` | list of `skill:<name>` / `agent:<name>` | `[]` | run on every review; an agent returns `PASS` / `FAIL` / `SKIPPED`, `FAIL` blocks READY |
| `review.ci` | `on` · `off` | unset: init asks | whether `.github/workflows/sdd-check.yml` is wanted |
| `generated` | list of quoted globs | `[]` | files left out of every diff and never flagged |

`merge` and `parallel` exist only under `worktree`. There is no `commit` switch: task commits always
happen, in this session (`none`) or in each sub-session (`worktree`).
