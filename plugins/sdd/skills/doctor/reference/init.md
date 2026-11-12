# `init` procedure

Create or repair the per-project artifacts. Write under the **project root** (cwd); read
templates from `${CLAUDE_PLUGIN_ROOT}/skills/doctor/templates/`. Print one status line per
artifact (created / skipped / merged). Never overwrite an existing `specs/constitution.md`,
`specs/template.md`; never touch the root `CLAUDE.md`.

## 0. Confirm roots
`pwd`; verify the templates directory is readable, else stop — the plugin looks broken.

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
  under the same names (paths are committed in `capabilities.md` and §2).

Per project record: **name** (workspace project name, else directory), **kind** (web, backend,
mobile, desktop, library, e2e, infra …; ask only when unclear), **path**, **stack** (language,
framework, package manager), sibling repo or not.

Per project, inside its directory, find the **one canonical command** for **test**, **coverage**,
**typecheck** (or compile) and **lint**. These commands go into constitution §2 (`/sdd:implement` and the review run them). Source, in priority order: declared scripts/tasks
(`package.json` scripts, `Makefile`/`justfile`, Gradle/Cargo/Go/dotnet tasks — prefer
`nx run <project>:lint` / `turbo run … --filter` in workspaces); CI and pre-commit config (what
merges are gated on); tool config files (`tsconfig.json`, `pyproject.toml` `[tool.*]`,
`biome.json`, `.golangci.yml` …); manifest + lockfile (language, package manager). Pick the tool
the project actually configures; no configured tool → leave the category empty (never invent a
linter). Confirm it is runnable (on `$PATH`, via the package manager, or a repo-local wrapper).

## 2. Seed constitution and spec template
- `mkdir -p specs`. Copy with `cp`, not Read + Write; use Edit for the fill-in.
- `specs/constitution.md` absent → `cp templates/constitution.md.template`, then Edit the §2 table:
  one row per project (`Project`, `Path`, `test`, `coverage`, `typecheck`, `lint`,
  `dev / ui-preview` if declared), each command runnable from this repo's root (`cd apps/api && uv
  run pytest`); remove the example rows; empty cell when nothing found. Present → leave untouched.
- `specs/template.md` absent → `cp templates/specs/template.md` verbatim. Present → skip.
- Legacy renames, only when the new path is absent: `specs/_constitution.md` →
  `specs/constitution.md`, `specs/_template.md` → `specs/template.md`, `.claude/capabilities.md` →
  `specs/capabilities.md`.

## 3. `specs/capabilities.md`
Sections are `<!-- auto-generated -->` (regenerate every run) or `<!-- user-override -->` (keep
byte-for-byte). **Keep these exact headings — other commands match them.**

- `## Specialist agents (delegate implementation work)` — the agents available in **this
  session** (the agent list you already have), excluding `sdd:*`: `- **<name>** — <one line>`.
  No cache scan: it picks up disabled plugins and stale versions.
- `## Skills (load into context on demand)` — the skills available in this session, excluding
  `sdd:*`: `- **<name>**` (names only; the session list carries the descriptions).
- `## Projects` — `- **<name>** — <kind> · <path> · <stack>`, `(repo)` after a sibling repo's
  path. A legacy `## Stack profile` becomes `## Projects` (the only rename init performs).
- `## Task type → routing rules`, `## Custom routing rules`, `## Generated / out-of-band paths` —
  user-override. New file → copy these three from `templates/capabilities.md.template`
  (`cp` the template, then Edit the auto sections). New file and an installed agent clearly fits a
  project's stack → add a stack-specific `implementation` row in `Custom routing rules`, only for
  an agent whose tools include Write/Edit (read-only agents get no row).

Idempotency: a second run with no other change writes an identical file. Match each `## ` heading
as a single line; a section ends exactly where the next `## ` begins; one blank line between
sections; the set of headings after regeneration equals the set before.

## 4. Sibling repositories only
When projects live in sibling repositories, add each path (`../mobile-app`) to
`permissions.additionalDirectories` in `.claude/settings.json` following
`reference/settings-merge.md`; without it Claude cannot edit files there. No sibling repos → do
not touch `.claude/settings.json`.

## 5. Re-check
Run `check` and show the report.
