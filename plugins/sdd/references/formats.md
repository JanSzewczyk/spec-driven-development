# SDD artifact formats and the 7 doctor checks

Read this when running the `/sdd:doctor check` fallback (the `mcp__sdd__doctor_check` tool is not
available) or when a step needs to know what an artifact must contain. The same rules are code in
the plugin (`schemas/capabilities.schema.json`, `hooks/core/formats.ts`, `hooks/core/check.ts`); the tests and `scripts/check-capabilities.ts` keep them aligned.

Headings are matched on their text, ignoring numbers and emoji (`## 2. Run/build commands` is
"Run/build"). Status per check: `pass` ✅ / `warn` ⚠️ / `fail` ❌.

| # | Check | fail | warn |
|---|-------|------|------|
| 1 | `specs/constitution.md` | missing | a section missing (Tech stack, Run/build, Conventions, WHAT NOT TO DO); no commands table; a project row without a `test` command |
| 2 | `specs/template.md` | missing | a section missing (Summary, User stories, Acceptance criteria, Edge cases, Non-goals, Open questions); a placeholder missing (`{{feature_title}}`, `{{feature_slug}}`, `{{type}}`); no `**Branch:**` line |
| 3 | `specs/capabilities.yml` | missing; a YAML syntax error (with its line); `implementation.isolation` other than `none` or `worktree:` with `merge` / `parallel` under it | a legacy `specs/capabilities.md` (still read; `init` migrates it); `format` missing or lower than the plugin writes; an unknown key at any level (the old `ui:` included); a key of the wrong shape (`projects`, `review.checks` and `generated` are lists, the sections and `*.projects` mappings); a project without `name`; a value outside [capabilities.md](capabilities.md); `implementation.commit`, or `merge` / `parallel` outside `isolation.worktree`; a `*.projects` key that is not a listed project; a project in capabilities but not in constitution §2 or the reverse; a `skill:` / `agent:` value that is not installed (looked up in `.claude`, `~/.claude` and installed plugins; built-in ones are not scanned; skipped when the plugin registry cannot be read); implementation, actions and review all at their defaults (run `/sdd:capabilities`); `merge: pr` with `worktree` but neither `gh` nor `actions.pr`; `review.ci` unset, or `on` without `.github/workflows/sdd-check.yml` (or an older `# sdd-workflow:` version). `init` repairs the legacy file, `format`, `commit`, misplaced `merge` / `parallel`, `review.ci` and the workflow |
| 4 | Git + gh | no `.git` | dirty tree; `gh` not on PATH or `gh auth status` fails (both only while `actions.pr` is unset) |
| 5 | Tooling | | a project path that does not exist; the first executable of a §2 command or of a `command:` value in capabilities not resolvable (`which`, or `node_modules/.bin`, or a repo-local wrapper) |
| 6 | Sibling repositories | `.claude/settings.json` is malformed JSON | a `repo: true` project not checked out; its path missing from `permissions.additionalDirectories` |
| 7 | Feature specs (`specs/<slug>/`) | `spec.md` missing or without `**Branch:**`; a branch shared by two specs; `**Status:**` outside draft / clarified / planned / in-progress / done; duplicate AC ids; `plan.md` status outside draft / tasks-ready / in-progress / done; a task without `project`, `acceptance` or with a status outside draft / in-progress / review / done; a task `project` not in `projects`; `acceptance` ids not in the spec; `depends_on` pointing nowhere; a dependency cycle; an `**Epic:**` id that is not 2-8 capital letters (`ULOG`; an older `ULOG-7f3a` stays valid) or is used by two specs; a task `pr:` that is not a number or URL | plan sections empty; a task without `scope` or `files`; an AC served by no task; `review.md` without a READY / NOT READY verdict; no `**Epic:**` line (`init` assigns one); a task `branch:` other than `<spec-branch>--<EPIC>-T<n>`; `in-progress` without `branch:` while `isolation` is `worktree:` |

In CI (the `sdd-check` action) checks 4–6 are reported as "not checked in CI". Every finding the doctor can repair carries `fix: "init"`.

Verdict: `READY` (no warn / fail) · `PARTIAL` (warns, or 1–2 fails) · `NOT_READY` (3+ fails).

## `specs/capabilities.yml`

YAML, validated by `schemas/capabilities.schema.json`; keys, values and defaults in
[capabilities.md](capabilities.md). The reader takes a subset: mappings, lists, `[]` / `{}` of plain
values, quoted strings, `#` comments; no anchors, tags or multi-line strings. Quote globs (`"**/x"`) and names starting with `@` (`"@acme/web"`).

## Constitution §2

A table `| Project | Path | test | coverage | typecheck | lint | dev |`, one row per project. The
column `dev` was `dev / ui-preview`; both names are read. A legacy `Command | Purpose` list counts
as project `root`.
