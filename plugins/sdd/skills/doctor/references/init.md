# `init` procedure

Create or repair the per-project artifacts. Write under the **repo root** (cwd); read
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
  `specs/constitution.md`, `specs/_template.md` → `specs/template.md`, `.claude/capabilities.md` →
  `specs/capabilities.md`.

## 3. `specs/capabilities.md`
Sections are `<!-- auto-generated -->` (regenerate every run) or `<!-- user-override -->` (keep
byte-for-byte). **Keep these exact headings — other commands match them.**

- `## Projects` — auto-generated: `- **<name>** — <kind> · <path> · <stack>`, `(repo)` after a
  sibling repo's path.
- `## Implementation`, `## Actions`, `## Review`, `## Generated / out-of-band paths` —
  user-override. New file → `cp` [capabilities.md.template](../templates/capabilities.md.template), then Edit `## Projects`. Existing file → keep them;
  add each one that is missing from the template, in the template's order.
- Legacy files: drop the old auto-generated `Specialist agents` and `Skills` sections and rename
  `Stack profile` → `Projects`. Leave `Task type → routing rules` and `Custom routing rules` as they
  are (user content, no longer read) and tell the user they can delete them.

Idempotency: a second run with no other change writes an identical file. Match each `## ` heading
as a single line; a section ends exactly where the next `## ` begins; one blank line between
sections.

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

## 5. Re-check
Run `check` (the `mcp__sdd__doctor_check` tool, or the fallback in SKILL.md) and show the report.
