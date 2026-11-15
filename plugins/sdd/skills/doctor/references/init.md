# `init` procedure

Create or repair the per-project artifacts. Write under the **repo root** (cwd); read
templates from `${CLAUDE_PLUGIN_ROOT}/skills/doctor/templates/`. Print one status line per
artifact (created / skipped / merged). Never overwrite an existing `specs/constitution.md`,
`specs/template.md`; never touch the root `CLAUDE.md`.

## 0. Confirm roots and read the findings
`pwd`; verify the templates directory is readable, else stop — the plugin looks broken.

When `specs/` already exists, call `mcp__sdd__doctor_check` first (fallback: SKILL.md). Every
finding with `fix: "init"` is repaired by the steps below; the others (`fix` absent) are the user's.
`init` is therefore also the **update** path: after a plugin upgrade it brings an older project to
the current artifact format.

## 1. Discover projects and tooling
Read the repository; do not match a fixed list. SDD works on **projects**: units with their own
stack and commands.

- **Single app** — one root manifest, no workspace config → one project, `root` (`.`).
- **Monorepo** — a workspace definition lists several (`nx.json`, `turbo.json`,
  `pnpm-workspace.yaml`, `workspaces`, `[tool.uv.workspace]`, Cargo/Go workspace,
  `settings.gradle(.kts)`, `melos.yaml` …); also manifests in sub-directories no workspace lists.
  One project per app/package with code SDD will change; skip pure config packages.
- **Several repositories** — list sibling git repos (`ls -d ../*/.git`) and ask which belong to
  this product (`AskUserQuestion`, multi-select; skip when none). Each chosen repo becomes a
  project (path relative, `../mobile-app`); this repo stays the spec repo — `specs/` lives only
  here. Tell the user the assumption: everyone checks the sibling repos out next to this one
  under the same names (paths are committed in `capabilities.yml` and §2).

Per project record: **name** (workspace project name, else directory), **kind** (web, backend,
mobile, desktop, library, e2e, infra …; ask only when unclear), **path**, **stack** (language,
framework, package manager), sibling repo or not.

Per project, inside its directory, find the **one canonical command** for **test**, **coverage**,
**typecheck** (or compile) and **lint**. These commands go into constitution §2 (the implementer and `/sdd:review` run them). Source, in priority order: declared scripts/tasks
(`package.json` scripts, `Makefile`/`justfile`, Gradle/Cargo/Go/dotnet tasks — prefer
`nx run <project>:lint` / `turbo run … --filter` in workspaces); CI and pre-commit config (what
merges are gated on); tool config files (`tsconfig.json`, `pyproject.toml` `[tool.*]`,
`biome.json`, `.golangci.yml` …); manifest + lockfile (language, package manager). Pick the tool
the project actually configures; no configured tool → leave the category empty (never invent a
linter). Confirm it is runnable (on `$PATH`, via the package manager, or a repo-local wrapper).

## 2. Seed constitution and spec template
- `mkdir -p specs`. Copy with `cp`, not Read + Write; use Edit for the fill-in.
- `specs/constitution.md` absent → `cp` [constitution.md.template](../templates/constitution.md.template), then Edit the §2 table:
  one row per project (`Project`, `Path`, `test`, `coverage`, `typecheck`, `lint`,
  `dev` (starts the app locally) if declared), each command runnable from this repo's root (`cd apps/api && uv
  run pytest`); remove the example rows; empty cell when nothing found. Present → leave untouched.
- `specs/template.md` absent → `cp` [specs/template.md](../templates/specs/template.md) verbatim. Present → skip.
- Legacy renames, only when the new path is absent: `specs/_constitution.md` →
  `specs/constitution.md`, `specs/_template.md` → `specs/template.md`. `.claude/capabilities.md` is
  migrated like `specs/capabilities.md` (step 3).

## 3. `specs/capabilities.yml`
`projects` is regenerated every run; every other key is the user's and stays as written, comments
included. Keys and values: [capabilities.md](${CLAUDE_PLUGIN_ROOT}/references/capabilities.md).
`<version>` below is `version` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

- **New file** → `cp` [capabilities.yml.template](../templates/capabilities.yml.template), replace
  `{{sdd_version}}` with `<version>`, then write `projects`.
- **`projects`** → one entry per project from step 1: `name`, `kind`, `path` (`.` for the root),
  `stack`, and `repo: true` for a sibling repository. Replace only this key's block.
- **Existing file** → keep it; add a missing top-level key from the template, in the template's
  order. Raise `format` to the template's number only after this run's migrations (steps 3 and 5);
  never lower it. Point the `$schema` comment at `sdd--v<version>`.
- **Migration from `specs/capabilities.md`** (format 2, only when the `.yml` is absent): start from
  the template and move every value the user set:

  | Format 2 | Format 3 |
  |---|---|
  | `## Projects` (or `Stack profile`) line `- **<name>** — <kind> · <path> · <stack>`, `(repo)` | `projects` entry, `repo: true` |
  | `## Implementation` `default:` / `<project>:` | `implementation.default` / `implementation.projects.<project>` |
  | `isolation: worktree` with `merge:`, `parallel:` | `implementation.isolation.worktree.merge` / `.parallel` |
  | `isolation: none`, or unset | `implementation.isolation: none`; a stray `merge:` / `parallel:` is dropped |
  | `commit: task` / `commit: off` | dropped; for `off` tell the user tasks are now committed one by one |
  | `## Actions` `<key>:` (empty → `null`) | `actions.<key>` |
  | `## Review` `tests` / `publish` / `default` / `ci`; `<project>:`; `checks: a, b` | `review.*`; `review.projects.<project>`; `review.checks: [a, b]` |
  | `## Generated / out-of-band paths` list | `generated`, each glob in double quotes |
  | `Specialist agents`, `Skills`, routing tables, `ui:` | dropped; name them in the report |

  Show the new file, then delete `specs/capabilities.md` (and `.claude/capabilities.md` if present).
- **Format-3 file with misplaced keys** → move `implementation.merge` / `.parallel` under
  `isolation.worktree` when `isolation` is `worktree:`, else drop them; drop `implementation.commit`
  (same note for `off`).
- Do not set `review.ci` here (step 6).

Idempotency: a second run with no other change writes an identical file. Two-space indentation.

## 4. Sibling repositories only
Only when projects live in sibling repositories (without this Claude cannot edit files there);
otherwise do not touch `.claude/settings.json`. Make the one edit:

1. Read `<repo root>/.claude/settings.json`; missing or empty → start from
   `{ "$schema": "https://json.schemastore.org/claude-code-settings" }`.
2. Malformed JSON → **stop, write nothing**, tell the user: "`.claude/settings.json` is malformed
   JSON — refusing to touch it. Fix it and re-run `/sdd:doctor init`."
3. Ensure `permissions.additionalDirectories` (array) exists; append each sibling path
   (`../mobile-app`) not yet listed. Never remove or reorder entries; leave every other key as is.
4. Write with 2-space indent and a trailing newline.

## 5. Epic ids in existing specs
Each `specs/*/tasks.md` without a `**Epic:**` line gets one, built exactly as in step 3 of
`/sdd:tasks` (slug letters + 4 hex, unique across specs), inserted under the `**Spec:** … **Plan:** …`
line. Leave everything else in the file as it is. Mention in the report that old commits carry no
`Task:` trailers.

## 6. CI workflow
Ask with `AskUserQuestion`, unless `review.ci` is already `on` or `off`, whether to add the
`sdd-check` GitHub workflow: it runs the same rules as `check` on every pull request, on pushes to the
default branch and weekly, and prints a short report of what is missing and what to repair with
`/sdd:doctor init`. Options: "PR, push and weekly (Recommended)", "Pull requests only", "No".

- Yes → `mkdir -p .github/workflows`, `cp` [sdd-check.yml.template](../templates/sdd-check.yml.template)
  to `.github/workflows/sdd-check.yml`, replace `{{sdd_version}}` with `<version>` (for "Pull requests
  only" delete the `push:` and `schedule:` blocks), set `review.ci: on`. The file exists with an older
  `# sdd-workflow: <n>` or another `sdd--v` pin → replace it with the template, keeping the user's
  trigger choice, and show the diff first.
- No → set `review.ci: off`; write no workflow.

The workflow is the only file `init` writes outside `specs/` and `.claude/`.

## 7. Re-check
Run `check` (the `mcp__sdd__doctor_check` tool, or the fallback in SKILL.md) and show the report.
Every `fix: "init"` finding must be gone; list the ones that remain with what the user has to do.
