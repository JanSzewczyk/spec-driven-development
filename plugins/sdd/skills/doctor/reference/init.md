# `init` procedure

Create or repair the per-project artifacts. Write under the **project root** (cwd); read
templates from `${CLAUDE_PLUGIN_ROOT}/skills/doctor/templates/`. Print one status line per
artifact (created / skipped / merged). Never overwrite an existing `specs/constitution.md`,
`specs/template.md` or hook script; never touch the root `CLAUDE.md`.

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
  under the same names (paths are committed in `capabilities.md`, §2 and the hooks).

Per project record: **name** (workspace project name, else directory), **kind** (web, backend,
mobile, desktop, library, e2e, infra …; ask only when unclear), **path**, **stack** (language,
framework, package manager), sibling repo or not.

Per project, inside its directory, find the **one canonical command** for **test**, **coverage**,
**typecheck** (or compile) and **lint**. Source, in priority order: declared scripts/tasks
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

## 4. Hook scripts
Write `.claude/hooks/typecheck.sh` and `lint.sh` for the tools found in step 1 — whatever the
project uses, not a fixed menu. Skip an existing file (still wire settings to it); a category with
no runnable tool gets no script and no settings entry.

- Read the matching template's header (shebang → `ext=` line; copy verbatim) and only the example
  block closest to the project's tool — they are **worked shapes, not a catalog**. Write a new
  block by analogy for any other tool.
- Block contract: gate on the extension(s) the tool covers; `exit 0` when the tool is not
  runnable; on a real failure print to stderr and `exit 2` (blocks Claude).
  ```bash
  case "$ext" in
    <exts>)
      command -v <runner> >/dev/null 2>&1 || exit 0
      if ! <check command> 2>&1; then echo "❌ <tool> failed for $file_path" >&2; exit 2; fi ;;
  esac
  ```
- Through a runner (`npx`, `pnpm exec`, `bundle exec`, `poetry run`): probe the tool itself first
  and no-op if absent (`npx --no-install --quiet tsc --version >/dev/null 2>&1 || exit 0`), else
  the runner's failure falsely blocks.
- The hook fires after **every** edit: run the project's tool on `$file_path`, not its whole-repo
  script (`pnpm lint`, `make lint`, CI jobs). Whole-project runs only for tools without a per-file
  mode (compilers, `tsc --noEmit`, `go vet ./...`, `cargo check`).
- **Several projects:** route by path first (one branch per project prefix, `*/apps/api/*`), each
  running that project's tool from its own directory with its own runner (`cd apps/api && uv run
  ruff check …`, `pnpm nx run web:typecheck`); never a repo-wide `tsc` or a Python tool from the
  monorepo root. `file_path` is absolute. A path outside every project → `exit 0`.
- Drop the template's instruction block; replace `{{TOOLS}}` with the tool names written; end with
  `exit 0`; `chmod +x`; check with `bash -n`.

## 5. `.claude/settings.json`
Follow `reference/settings-merge.md` exactly (stops on malformed JSON, never clobbers).

## 6. Re-check
Run `check` and show the report.
