---
name: doctor
version: 0.6.0
lastUpdated: 2026-06-12
description: Preflight audit and setup of project readiness for the SDD framework. Runs 10 checks (specs/constitution.md, specs/template.md, plugin installed + enabled across user/project/local settings, capabilities.md, hooks, git, gh, tooling, specialist agents, project type). The `init` mode creates the per-project artifacts (constitution, specs/template.md, capabilities.md, stack-specific hook scripts, settings.json hook entries) directly with file tools — no helper scripts. The root `CLAUDE.md` is user-owned and never read or modified by this skill. Use this skill when the user asks "is my project SDD-ready", "set up SDD", "configure SDD", "why doesn't /sdd:spec work", "init SDD framework", or otherwise indicates they want to start using Spec-Driven Development.
tags: [sdd, spec-driven-development, tdd, claude-code, plugin]
author: Jan Szewczyk
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
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
2. **`specs/template.md`** — exists with all required fields: Summary, User stories,
   Acceptance criteria, Edge cases, Open questions, Testing guidelines. Missing → fail; partial → warn.
3. **Plugin installed** — `${CLAUDE_PLUGIN_ROOT}/plugin.json` (fallback `$HOME/.claude/plugins/cache/sdd/plugin.json`)
   is readable and its `name` is `sdd`. Report `name@version`.
4. **Plugin enabled** — `sdd` appears under `enabledPlugins` (or `plugins`) in **any** of three
   layers: `~/.claude/settings.json` (user), `<project>/.claude/settings.json` (project),
   `<project>/.claude/settings.local.json` (local). Name which layer(s). Strip any `@version`
   suffix when matching. Not listed anywhere → warn (may still auto-load).
5. **`specs/capabilities.md`** — exists and contains the sections: `Specialist agents`,
   `Skills`, `Stack profile`, `Task type` (routing). Missing → fail; partial → warn. A `Model`
   column in the routing table and a `Generated / out-of-band paths` section are expected on
   freshly-initialized files but are optional on legacy files (their absence → warn, not fail;
   suggest re-running `init`).
6. **`.claude/settings.json` hooks** — exists, valid JSON, and `hooks.PostToolUse` contains an
   entry whose command references `.claude/hooks/typecheck.sh` or `.claude/hooks/lint.sh`.
   Missing file → fail; present but no SDD hook entry → warn.
7. **Git + gh** — `.git` exists, `git status --porcelain` (clean vs dirty), `gh` on PATH and
   `gh auth status` ok. Dirty tree or missing gh → warn.
8. **Tooling** — based on the detected stack, confirm the toolchain is installed (e.g. JS/TS:
   `node_modules` present; Python: `mypy`/`ruff`/`pytest` reachable). Missing → warn.
9. **Specialist agents** — scan `~/.claude/plugins/cache/*/` (excluding the `sdd` plugin) for
   `agents/*.md`. List a few. None → warn.
10. **Project type** — report the detected language/framework and package manager (whatever they
    are — not limited to a fixed list) and which specialist agents/skills will be routed to.
    Genuinely undeterminable → warn.

### Discover the project's quality tooling (used by check #8/#10 and all of init)

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

For each category — **typecheck** (or compile, for statically-typed languages where the compiler
*is* the type checker) and **lint** (style/quality/static-analysis) — pick the one canonical
command the project uses. If the project configures no linter, emit no lint hook (don't invent one).
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
| 3 | Plugin installed | ✅ | sdd@0.6.0 at ~/.claude/plugins/cache/sdd |
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
Apply **Discover the project's quality tooling** (above). Record: language, framework, package
manager, monorepo?, and — for **typecheck** (or compile) and **lint** — the one canonical command
the project uses, confirmed runnable. This drives steps 4–5. Whatever the stack is, this is the
same job: find how the project checks code and capture the exact invocation.

When a category offers several candidates, pick the one the project actually configures/uses — e.g.
for a JS/TS linter, whichever of Biome / ESLint / oxlint the project depends on (only one); for a
compiled language, the build tool's compile task. If a category has no configured tool, skip it.

### 2. Seed `specs/constitution.md` and `specs/template.md`
- `mkdir -p specs`.
- **constitution:** if `specs/constitution.md` is absent, copy `templates/constitution.md.template`
  → `specs/constitution.md`. If present, **leave it untouched** (it's the source of truth, edited
  via `/sdd:constitution`).
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
- `## Stack profile` + `<!-- auto-generated -->` — the detected stack as `- **key**: value`.
- `## Task type → routing rules` and `## Custom routing rules` — these carry `<!-- user-override -->`.
  The routing table includes a **`Model`** column (advisory cost tier per task type). Seed the
  defaults from the template: `sonnet` for contract/test/implementation types, `haiku` for
  `refactor`/`generic`. `opus` is reserved for session-level reasoning phases, not task rows.
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
   before (no new duplicates, none lost). If `init` is run twice with no other change, the second
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

### 5. Safe-merge `.claude/settings.json`
Follow `reference/settings-merge.md` **exactly** — it is a mechanical procedure. The essentials:
read → parse → **STOP and report if malformed (never clobber)** → strip only SDD-marked
PostToolUse entries → append the fresh `Edit|Write|MultiEdit` entry (only for detected tools) →
preserve every other key verbatim → write with 2-space indent + trailing newline.

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
