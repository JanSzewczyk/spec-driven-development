---
name: doctor
description: Preflight audit and setup of project readiness for the SDD framework. Runs 10 checks (specs/constitution.md, specs/template.md, plugin installed + enabled across user/project/local settings, capabilities.md, hooks, git, gh, tooling, specialist agents, projects — single app, monorepo or several repositories). The `init` mode creates the per-project artifacts (constitution, specs/template.md, capabilities.md, stack-specific hook scripts, settings.json hook entries) directly with file tools — no helper scripts. The root `CLAUDE.md` is user-owned and never read or modified by this skill. Use this skill when the user asks "is my project SDD-ready", "set up SDD", "configure SDD", "why doesn't /sdd:spec work", "init SDD framework", or otherwise indicates they want to start using Spec-Driven Development.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
---

# SDD Doctor

Audit and auto-setup for the Spec-Driven Development plugin on a target project.

**This skill is LLM-driven.** There are no Python helpers — you (Claude) perform every
check and every file operation yourself, using your own tools. This is deliberate: it lets
you adapt to any stack, package manager, or monorepo layout, and it guarantees files land in
**the project's own directory** rather than wherever a script's working directory happened to be.

## Two roots — never confuse them

| Root | What it is | How to resolve | What lives here |
|------|------------|----------------|-----------------|
| **Project root** | the user's project you're operating on | **your current working directory** (`pwd`) | `specs/`, `.claude/`, `package.json`, the git repo |
| **Plugin root** | the installed SDD plugin | `${CLAUDE_PLUGIN_ROOT}` (fallback `$HOME/.claude/plugins/cache/sdd`) | bundled `templates/`, `reference/` — **read-only** |

> ⛔ **The bug this design fixes:** every artifact you create (`specs/...`, `.claude/...`) MUST
> be written under the **project root** (cwd). Read seed templates from the **plugin root**.
> Never write into the plugin root. When in doubt, run `pwd` and build paths from it explicitly.

## Modes

| Mode | What it does | When to use |
|------|--------------|-------------|
| `check` (default) | Report only — 10 checks with statuses ✅/⚠️/❌ | Sanity check, audit |
| `init` | Create/repair per-project artifacts (constitution, specs/template.md, capabilities.md, stack-specific hooks, settings.json) | First-time setup after the plugin is installed |

Extract the mode from the user message: "check" / "audit" / "is ready" / "what's missing" →
**check**; "init" / "setup" / "create" / "generate" / "configure" / "fix" → **init**.
Default to **check**.

---

## Mode: `check`

Run all 10 checks against the **project root** (cwd) plus the installed plugin. For each, use
Read/Glob/Grep/Bash to inspect, then assign `pass` ✅ / `warn` ⚠️ / `fail` ❌.

1. **`specs/constitution.md`** — exists and contains the canonical sections (Tech stack,
   Run/build, Conventions, WHAT NOT TO DO). Missing file → fail; present but missing sections → warn.
   A project in the §2 Run/build table has no `test` command → warn, naming the project (the SDD
   commands read each project's test command from there; tell the user to fill it via
   `/sdd:constitution`). A legacy §2 table with one `Command | Purpose` list counts as project
   `root`.
2. **`specs/template.md`** — exists with all required fields: Summary, User stories,
   Acceptance criteria, Edge cases, Open questions, Testing guidelines. Missing → fail; partial → warn.
3. **Plugin installed** — `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (fallback `$HOME/.claude/plugins/cache/sdd/.claude-plugin/plugin.json`)
   is readable and its `name` is `sdd`. Report `name@version`.
4. **Plugin enabled** — `sdd` appears under `enabledPlugins` (or `plugins`) in **any** of three
   layers: `~/.claude/settings.json` (user), `<project>/.claude/settings.json` (project),
   `<project>/.claude/settings.local.json` (local). Name which layer(s). Strip any `@version`
   suffix when matching. Not listed anywhere → warn (may still auto-load).
5. **`specs/capabilities.md`** — exists and contains the sections: `Specialist agents`,
   `Skills`, `Projects` (legacy name `Stack profile`), `Task type` (routing). Missing → fail;
   partial → warn. A `Model` and a `Stack` column in the routing table and a `Generated /
   out-of-band paths` section are expected on freshly-initialized files but are optional on
   legacy files (their absence → warn, not fail; suggest re-running `init`). A project listed in
   `Projects` but missing from the constitution's §2 table (or the other way round) → warn.
6. **`.claude/settings.json` hooks** — exists, valid JSON, and `hooks.PostToolUse` contains an
   entry whose command references `.claude/hooks/typecheck.sh` or `.claude/hooks/lint.sh`.
   Missing file → fail; present but no SDD hook entry → warn.
7. **Git + gh** — `.git` exists, `git status --porcelain` (clean vs dirty), `gh` on PATH and
   `gh auth status` ok. Dirty tree or missing gh → warn.
8. **Tooling** — based on the detected stack, confirm the toolchain is installed (e.g. JS/TS:
   `node_modules` present; Python: `mypy`/`ruff`/`pytest` reachable). Missing → warn.
9. **Specialist agents** — scan `~/.claude/plugins/cache/*/` (excluding the `sdd` plugin) for
   `agents/*.md`. List a few. None → warn.
10. **Projects** — report the detected layout (single app / monorepo / several repositories) and,
    per project, its kind, path, language/framework and package manager (whatever they are — not
    limited to a fixed list) and which specialist agents/skills will be routed to. Genuinely
    undeterminable → warn.

### Discover the projects (used by check #10 and all of init)

SDD works on **projects**: a unit with its own stack and its own commands. Work out the layout
before anything else — by reading the repository, not by matching a fixed list:

- **Single app** — one manifest at the root and no workspace config → one project, `root` (`.`).
- **Monorepo** — a workspace definition lists several projects. Signals (examples, not a closed
  list): `nx.json` + `project.json` files (`nx show projects`), `turbo.json`, `pnpm-workspace.yaml`
  / `workspaces` in `package.json`, `[tool.uv.workspace]`, a Cargo or Go workspace,
  `settings.gradle(.kts)` `include(...)`, `melos.yaml`. Also count manifests in sub-directories
  that no workspace lists (an `apps/api/pyproject.toml` beside a JS workspace is a project too).
  One project per app or package that has code SDD will change (skip pure config packages).
- **Several repositories (polyrepo)** — the feature's code also lives in sibling checkouts. You
  cannot see that from the repo itself: in `init`, list sibling directories that are git
  repositories (`ls -d ../*/.git`) and ask the user with the `AskUserQuestion` tool (multi-select)
  which of them belong to this product; skip the question when there are none. Each chosen repo
  becomes a project (or several, if it is itself a monorepo) whose path is relative to this repo
  (`../mobile-app`). This repo stays the **spec repo** — `specs/` lives only here. Tell the user
  the assumption this makes: everyone on the team checks the sibling repos out next to this one,
  under the same directory names (the paths are committed in `capabilities.md`, §2 and the hooks).

For each project record: a short **name** (the Nx/workspace project name, else the directory
name), **kind** (web, backend, mobile, desktop, library, e2e, infra — whatever fits; ask with
`AskUserQuestion` only when the stack leaves it unclear), **path**, **stack** (language,
framework, package manager — e.g. `Python 3.13, FastAPI; uv`, `Flutter 3, Dart`) and, for a
sibling repository, that it is one.

### Discover the project's quality tooling (used by check #8/#10 and all of init)

Run the discovery below **once per project**, inside that project's directory: a monorepo's web
app and its Python API have different tools, configs and runners, and a sibling repository has its
own. Where a workspace tool runs per-project targets (`nx run <project>:lint`, `turbo run lint
--filter=<project>`), prefer that target.

**There is no fixed list of supported stacks.** New languages and code-quality tools appear
constantly — your job is to figure out how *this specific project* checks its code and reproduce
that, whatever language or tool it uses (Kotlin, Swift, Ruby, PHP, C#/.NET, Elixir, Zig, Clojure,
a tool released last month — all in scope). Don't pattern-match against a closed catalog; **read
the project and reason.**

**The single most reliable signal: what does the project itself run to verify code?** Use it to
identify the canonical tool and its config — the hook then runs *that* tool (narrowly, per-file
where possible; see init step 4 for the latency rule). Look, in roughly this priority order:

1. **Declared scripts/tasks** — `package.json` `scripts`, `Makefile` / `justfile` / `Taskfile.yml`
   targets, `composer.json` scripts, `mix.exs` aliases, Gradle/Maven tasks, `cargo`/`go`/`dotnet`
   subcommands. A `typecheck` / `lint` / `check` / `format` script is the project telling you the
   canonical invocation — prefer it over a raw tool call.
2. **CI / pre-commit config** — `.github/workflows/*.yml`, `.gitlab-ci.yml`, `.pre-commit-config.yaml`,
   `lefthook.yml`, Husky hooks. Whatever the project gates merges on *is* its quality bar; mirror it.
3. **Tool config files** — `tsconfig.json`, `pyproject.toml` `[tool.*]`, `biome.json`, `.eslintrc*`,
   `.golangci.yml`, `checkstyle.xml`, `.rubocop.yml`, `phpstan.neon`, `.editorconfig`, etc. Their
   presence reveals which checkers are configured.
4. **Manifest + lockfile** — to identify the language, framework, and package manager (e.g.
   `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`→bun; `pom.xml`→Maven, `gradlew`→Gradle
   wrapper). Detect monorepos (`pnpm-workspace.yaml`, `workspaces`, `turbo.json`, `nx.json`).

For each project and each category — **test**, **coverage**, **typecheck** (or compile, for
statically-typed languages where the compiler *is* the type checker) and **lint**
(style/quality/static-analysis) — pick the one canonical command that project uses. If the project configures no linter, emit no lint hook (don't invent one).
Confirm the tool is actually runnable (on `$PATH`, via the package manager, or a repo-local wrapper
like `./gradlew`) — never wire a command the environment can't execute.

The `templates/hooks/*.sh.template` files give you **worked examples of the hook shape** for several
common ecosystems. They are a starting pattern, **not the set of what's allowed** — when the project
uses something not shown there, write a block for it by analogy (see init step 4).

### Report format (`check`)

```markdown
# SDD Readiness Report

**Status:** ⚠️ PARTIAL (8/10 checks passed)
**Stack detected:** Next.js 15 + TypeScript strict + Vitest (pnpm)

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | specs/constitution.md | ✅ | 4/4 required sections present |
| 2 | specs/template.md | ✅ | all fields present |
| 3 | Plugin installed | ✅ | sdd@0.7.0 at ~/.claude/plugins/cache/sdd |
| 4 | Plugin enabled | ✅ | enabled in user, project settings |
| 5 | specs/capabilities.md | ✅ | 4 sections present |
| 6 | .claude/settings.json hooks | ❌ | no PostToolUse hooks |
| 7 | Git + gh | ✅ | clean tree, gh ok |
| 8 | Tooling | ✅ | node_modules present |
| 9 | Specialist agents | ✅ | storybook-tester, nextjs-backend-engineer |
| 10 | Project type | ✅ | nextjs detected |

## Next steps
- <one bullet per actionable fix>
```

Overall status: `READY` (no fail, no warn) / `PARTIAL` (some warn or 1–2 fail) / `NOT_READY`
(3+ fail). Next-step guidance:
- READY → "You can run `/sdd:spec feat <description>`"
- PARTIAL → "Run `/sdd:doctor init` to fill in the missing per-project files"
- NOT_READY → "If checks 3 or 4 fail, install the plugin first: `claude plugin install
  https://github.com/JanSzewczyk/spec-driven-development`. Otherwise run `/sdd:doctor init`."

---

## Mode: `init`

Create or repair the per-project artifacts. **Everything is written under the project root (cwd).**
Read seed templates from `${CLAUDE_PLUGIN_ROOT}/skills/doctor/templates/` (fallback
`$HOME/.claude/plugins/cache/sdd/skills/doctor/templates/`).

Run these steps in order. Print a one-line status for each artifact (created / skipped / merged).

### 0. Confirm roots
Run `pwd` to lock the project root. Verify the templates directory is readable at the plugin
root. If the templates are missing, stop and tell the user the plugin looks broken.

### 1. Discover the project's quality tooling
Apply **Discover the projects** and then **Discover the project's quality tooling** (above), per
project. Record per project: name, kind, path, stack, sibling repo or not, and — for **test**,
**coverage**, **typecheck** (or compile) and **lint** — the one canonical command that project
uses, confirmed runnable. This drives steps 4–5. Whatever the stack is, this is the
same job: find how the project checks code and capture the exact invocation.

When a category offers several candidates, pick the one the project actually configures/uses — e.g.
for a JS/TS linter, whichever of Biome / ESLint / oxlint the project depends on (only one); for a
compiled language, the build tool's compile task. If a category has no configured tool, skip it.

### 2. Seed `specs/constitution.md` and `specs/template.md`
- `mkdir -p specs`.
- **constitution:** if `specs/constitution.md` is absent, copy `templates/constitution.md.template`
  → `specs/constitution.md`, then fill the **§2 Run/build commands** table with **one row per
  project** from step 1 (`Project`, `Path`, `test`, `coverage`, `typecheck`, `lint`, and
  `dev / ui-preview` when the project declares one), each command written so it runs from this
  repository's root (`cd apps/api && uv run pytest`, `cd ../mobile-app && flutter test`); remove
  the commented example rows; leave a cell empty when nothing was found. Every SDD command and
  agent reads these commands from §2, so this is the one place they live. If the file is present,
  **leave it untouched** (it's the source of truth, edited via `/sdd:constitution`).
- **template:** if `specs/template.md` is absent, copy `templates/specs/template.md` →
  `specs/template.md` verbatim (the `{{placeholders}}` are filled later by `/sdd:spec`). If
  present, skip.
- (Legacy migrations, only if the new path is absent: `specs/_constitution.md` → `specs/constitution.md`,
  `specs/_template.md` → `specs/template.md`, `.claude/capabilities.md` → `specs/capabilities.md`.)
- **Never touch the project-root `CLAUDE.md`** — it is user-owned.

### 3. Generate `specs/capabilities.md`
Scan `~/.claude/plugins/cache/*/` for installed capabilities (skip the `sdd` plugin's own
verification agents). For each plugin: read `agents/*.md` frontmatter (name + description) and
`**/SKILL.md` frontmatter (name + description). Then write `specs/capabilities.md` with these
sections (**keep these exact headings — other commands read them**):

- `## Specialist agents (delegate implementation work)` + `<!-- auto-generated -->` — bullet list
  of discovered agents (`- **name** (plugin) — description`), or a placeholder if none.
- `## Skills (load into context on demand)` + `<!-- auto-generated -->` — bullet list of skills.
- `## Projects` + `<!-- auto-generated -->` — one line per project from step 1:
  `- **<name>** — <kind> · <path> · <stack>`, with `(repo)` after the path of a sibling repository.
  A legacy file's `## Stack profile` section is replaced by `## Projects` (the one heading rename
  init performs).
- `## Task type → routing rules` and `## Custom routing rules` — these carry `<!-- user-override -->`.
  The routing table includes a **`Stack`** column (`*` = any project) and a **`Model`** column
  (cost tier per task type). Seed the defaults from the template: `sonnet` for
  contract/test/implementation types, `haiku` for `refactor`/`generic`. `opus` is reserved for
  session-level reasoning phases, not task rows. When the file is new and an installed specialist
  agent clearly fits one project's stack (a Python developer agent for a Python project, a mobile
  agent for a Flutter project), add a stack-specific `implementation` row for it in `Custom routing
  rules` — but only for an agent whose `tools` frontmatter allows editing files (Write/Edit, or
  `*`). Read-only agents (architects, reviewers, auditors) never
  get a routing row: they cannot carry out a task.
- `## Generated / out-of-band paths` + `<!-- user-override -->` — glob list of generated /
  non-hand-authored files that the diff-consuming agents exclude from context and never flag.

**Idempotency — get this exactly right (it has bitten us before):** re-running init must produce
a **byte-stable** file, not a growing one. Follow these rules:

1. The file has two kinds of section: **auto-generated** (heading immediately followed by
   `<!-- auto-generated -->`) and **user-override** (heading immediately followed by
   `<!-- user-override -->`). Regenerate the auto-generated ones from scratch every run.
2. If `specs/capabilities.md` already exists, **preserve every `<!-- user-override -->` section
   byte-for-byte** — including its heading and its trailing blank line. Take its content from the
   *existing* file, not the template.
3. When you identify a section by its `## Heading`, match the heading as a **single line only**.
   Do NOT let a section's body greedily absorb the next `## ` heading — each section ends exactly
   where the next `## ` begins. (The old regex implementation backtracked across `## ` boundaries
   and swallowed auto-generated sections into a fake "title", which is why the file grew on every
   re-run.)
4. Preserve exactly one blank line between sections — don't collapse or add separators on re-write.
5. Sanity check before writing: the set of `## ` headings after regeneration must equal the set
   before (no new duplicates, none lost) — except the one rename `Stack profile` → `Projects`. If `init` is run twice with no other change, the second
   write must be identical to the first.

If the file doesn't exist, take the user-override sections (`Task type → routing rules`,
`Custom routing rules`, `Generated / out-of-band paths`) verbatim from
`templates/capabilities.md.template`.

### 4. Generate hook scripts for the tools you found
Generate `.claude/hooks/typecheck.sh` and `.claude/hooks/lint.sh` tailored to the command(s) you
discovered in step 1 — **for whatever tools the project uses, not a fixed menu.**

- Open the matching template (`templates/hooks/typecheck.sh.template` / `lint.sh.template`) and
  read **two things**: the **header** (shebang → the `ext=` line — copy it verbatim; it reads the
  PostToolUse payload and extracts `file_path`) and the **worked example blocks** below it.
- Keep the example block(s) that match the project's tools, **adapting the invocation** to how the
  project actually runs the tool (prefer its declared script/task — `pnpm typecheck`, a `Makefile`
  target, `./gradlew checkstyleMain` — over a generic call).
- **If the project uses a tool not shown in the template, write a new block for it by analogy.**
  Follow the same shape every example uses:
  ```bash
  case "$ext" in
    <extensions this tool applies to>)
      command -v <tool-or-runner> >/dev/null 2>&1 || exit 0   # no-op if not runnable
      if ! <the project's actual check command> 2>&1; then
        echo "❌ <tool> failed for $file_path" >&2
        exit 2                                                  # exit 2 BLOCKS Claude
      fi
      ;;
  esac
  ```
  This is the whole contract: gate on the file extension(s) the tool covers, no-op (`exit 0`) when
  the tool isn't reachable, `exit 2` with a message on a real failure. A repo-local wrapper (e.g.
  `[[ -x ./gradlew ]]`) counts as runnable. Whole-project checkers (compilers, `go vet`) may run on
  the whole module rather than the single file — that's fine.
- **For tools invoked through a runner** (`bundle exec`, `npx`, `pnpm exec`, `poetry run`, `pipx`),
  checking that the *runner* exists is not enough — the tool itself may be uninstalled, and the
  runner would then exit non-zero and **falsely block**. Probe the actual tool first and no-op if
  it's absent, e.g. `bundle exec rubocop --version >/dev/null 2>&1 || exit 0` (the JS examples model
  this with `npx --no-install --quiet tsc --version`). Only after the tool resolves do you run the
  real check and let its failure `exit 2`.
- **Run the narrowest invocation that still catches the error — this hook fires after EVERY edit.**
  When you read a project's `lint`/`typecheck` script or CI step, use it to learn *which tool and
  which config* the project uses — then run **that tool on `$file_path`**, not the whole-repo
  command verbatim. `pnpm lint` / `make lint` / a CI job lint the entire repo (and may install deps
  or run tests) — wiring that into a per-edit hook adds seconds to every keystroke-batch and
  regresses the dev loop. Prefer per-file (`eslint "$file_path"`, `ruff check "$file_path"`,
  `rubocop "$file_path"`, per-file type-checkers). Fall back to a whole-project run **only** for
  tools with no per-file mode (compilers, `tsc --noEmit`, `go vet ./...`, `cargo check`).
- Drop the template's instruction-comment block from the output. Replace `{{TOOLS}}` with the
  comma-separated tool names you actually wrote. End the script with `exit 0`.
- After writing, `chmod +x` the file. Sanity-check it parses: `bash -n .claude/hooks/<name>.sh`.
- **Never overwrite an existing hook file.** If `.claude/hooks/typecheck.sh` (or `lint.sh`)
  already exists, skip writing it — the user owns it. Still wire settings.json to point at it.
- If a category has **no** configured/runnable tool, write no script for it (and step 5 adds no
  entry for it). Writing nothing is correct — better than a hook that blocks on a tool that isn't there.
- **Several projects (monorepo or sibling repositories): route by path first, then by extension.**
  One script per category still, but its top-level `case` is on the edited file's path — one
  branch per project prefix (`apps/api/*`, `apps/web/*`, `*/mobile-app/*`) — and each branch runs
  *that project's* tool **from that project's directory with that project's runner**
  (`cd apps/api && uv run ruff check …`, `pnpm nx run web:typecheck`). Never run a repo-wide `tsc`
  or a Python tool from the repository root in a monorepo: the root has the wrong `tsconfig`, and
  `mypy`/`ruff` there miss the project's `pyproject.toml` and virtualenv — the hook then either
  blocks falsely or silently checks nothing. A file outside every project prefix → `exit 0`. The
  "monorepo" example in the templates shows the shape. `file_path` is absolute, so match prefixes
  as `*/apps/api/*` (or strip `$PWD/` first).

### 5. Safe-merge `.claude/settings.json`
Follow `reference/settings-merge.md` **exactly** — it is a mechanical procedure. The essentials:
read → parse → **STOP and report if malformed (never clobber)** → strip only SDD-marked
PostToolUse entries → append the fresh `Edit|Write|MultiEdit` entry (only for detected tools) →
preserve every other key verbatim → write with 2-space indent + trailing newline. With projects in
**sibling repositories**, also add each sibling repo path to `permissions.additionalDirectories`
(append only the missing ones; never remove an entry) — without it Claude cannot edit files there.

### 6. Re-check and report
Run the `check` procedure and present the readiness table so the user sees the new state.

### Idempotency rules (apply throughout init)
- Existing `specs/constitution.md`, `specs/template.md`, and hook scripts are **never overwritten**.
- `specs/capabilities.md` regenerates auto-sections but **preserves `<!-- user-override -->`**.
- `settings.json` strips only SDD-marked entries and re-adds them → **no duplicates** on re-run;
  all user keys preserved; a malformed file is left untouched.

---

## Notes

- **Commands and verification agents are not per-project**: they live in the plugin (`commands/`,
  `agents/`). Once the plugin is installed and enabled (checks 3 + 4), Claude Code auto-discovers
  every slash command and SDD agent in every project — no per-project copy.
- **`CLAUDE.md` is owned by the user**: this framework reads and writes only `specs/...` and the
  SDD-tagged hook entries in `.claude/settings.json`. The root `CLAUDE.md` is never touched.
- **`/sdd:constitution`** is the canonical editor for `specs/constitution.md`.
