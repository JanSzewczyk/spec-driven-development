# SDD artifact formats and the 7 doctor checks

Read this when running the `/sdd:doctor check` fallback (the `mcp__sdd__doctor_check` tool is not
available) or when a step needs to know what an artifact must contain. The same rules are code in
`shared/sdd-core/` (`formats.ts`, `check.ts`); a test keeps the two lists aligned.

Headings are matched on their text, ignoring numbers and emoji (`## 2. Run/build commands` is
"Run/build"). Status per check: `pass` ✅ / `warn` ⚠️ / `fail` ❌.

| # | Check | fail | warn |
|---|-------|------|------|
| 1 | `specs/constitution.md` | missing | a section missing (Tech stack, Run/build, Conventions, WHAT NOT TO DO); no commands table; a project row without a `test` command |
| 2 | `specs/template.md` | missing | a section missing (Summary, User stories, Acceptance criteria, Edge cases, Non-goals, Open questions); a placeholder missing (`{{feature_title}}`, `{{feature_slug}}`, `{{type}}`); no `**Branch:**` line |
| 3 | `specs/capabilities.md` | missing | a section missing (Projects, Implementation, Actions, Review, Generated / out-of-band paths); a marker missing (`<!-- auto-generated -->` on Projects, `<!-- user-override -->` on the rest); a value that is not `skill:` / `agent:` / `command:` / `in-session`; an unknown key (the old `ui:` included); legacy sections (`Stack profile`, `Specialist agents`, `Skills`, routing tables); a project in capabilities but not in constitution §2 or the reverse |
| 4 | Git + gh | no `.git` | dirty tree; `gh` not on PATH or `gh auth status` fails (both only while no `pr` action is set under `## Actions`) |
| 5 | Tooling | | a project path that does not exist; the first executable of a §2 command not resolvable (`which`, or `node_modules/.bin`, or a repo-local wrapper) |
| 6 | Sibling repositories | `.claude/settings.json` is malformed JSON | a `(repo)` project not checked out; its path missing from `permissions.additionalDirectories` |
| 7 | Feature specs (`specs/<slug>/`) | `spec.md` missing or without `**Branch:**`; a branch shared by two specs; `**Status:**` outside draft / clarified / planned / in-progress / done; duplicate AC ids; `plan.md` status outside draft / tasks-ready / in-progress / done; a task without `project`, `acceptance` or with a status outside draft / in-progress / review / done; a task `project` not in `## Projects`; `acceptance` ids not in the spec; `depends_on` pointing nowhere; a dependency cycle | plan sections empty; a task without `scope` or `files`; an AC served by no task; `review.md` without a READY / NOT READY verdict |

Verdict: `READY` (no warn / fail) · `PARTIAL` (warns, or 1–2 fails) · `NOT_READY` (3+ fails).

## `specs/capabilities.md`

`Projects` lines: `- **<name>** — <kind> · <path> · <stack>` with `(repo)` after the path of a
sibling repository. `## Implementation`, `## Actions` and `## Review` hold `key: value` lines; the
values are in [capabilities.md](capabilities.md).

## Constitution §2

A table `| Project | Path | test | coverage | typecheck | lint | dev |`, one row per project. The
column `dev` was `dev / ui-preview`; both names are read. A legacy `Command | Purpose` list counts
as project `root`.
