# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-11-13

`sdd` goes to 1.0.0 and `sdd-board` to 0.4.0. The framework now **plans, hands off and verifies** instead of implementing: this changes the `tasks.md` and `capabilities.md` formats and removes the hooks, so existing specs need `/sdd:tasks` re-run and `/sdd:doctor init`.

### Changed

- **Tasks are self-contained, Jira-like tickets under one Epic** (`project`, `status`, `depends_on`, `acceptance` ids, `plan` refs, `scope`, `files`), written by `/sdd:tasks` without agents, models, `tdd` tags, waves or Mermaid diagrams. A task refers to the spec and plan instead of copying them.
- **`/sdd:implement <task-id | all>` is a dispatcher.** It builds a brief (task, AC text, plan sections, the project's commands from constitution §2) and hands it to the flow set in `capabilities.md` `## Implementation` (`skill:`, `agent:`, `command:` or `in-session`, per project or `default`). It runs no checks itself; the implementer does.
- **`/sdd:review` is the single verification gate.** Tests, `spec-verifier`, `ui-critic` and the configured extra checks (e.g. a QA agent) run in parallel; the `reviewer` also checks the constitution's WHAT NOT TO DO rules. Met acceptance criteria are ticked in `spec.md`, tasks with unmet ones go back to `in-progress`, and commit/PR use the `commit` / `pr` actions or git and `gh`.
- **`capabilities.md` holds `## Projects` (auto) plus `## Implementation`, `## Actions` (`branch`, `commit`, `pr`), `## Review` and the generated paths (yours).** Agent and skill lists and the routing table are gone.
- **`/sdd:plan`** records decisions and scope (optional diagrams, `AskUserQuestion` for real forks, "Reference sources" instead of Figma-specific wording); **`/sdd:clarify`** is a single run with proposed answers written to the spec; **`/sdd:spec`** creates the branch through the `branch` action and fills the template with `sed`; **`/sdd:analyze`** delegates to `spec-verifier`.
- **Doctor** is a skill only (`/sdd:doctor check|init`): `SKILL.md` 25 KB → 3 KB, `init` in `references/init.md`, 5 checks, templates trimmed; `init` adds every missing `capabilities.md` section.
- **Every command finds the feature by the `**Branch:**` line of `spec.md`**, so the `branch` action may name branches its own way. `/sdd:clarify` replaces template placeholders and never renumbers acceptance criteria; a `/sdd:tasks` re-run updates `tasks.md` and keeps task ids and statuses.
- **Accepting blockers in `/sdd:review`.** When every blocker is acceptable (out-of-scope change, constitution rule, `ui-critic` issue, non-critical audit finding) the user can accept them with a reason; they go under `## Accepted` in `review.md` and are not raised again.
- **`ui-critic` works on any web UI**: it opens the affected route or a component preview (Storybook when present) from the `dev / ui-preview` command and checks the states the acceptance criteria name.
- **Spec template:** *Testing guidelines* moved out of the business spec into an optional *Testing* section of `plan.md`; doctor now requires *Non-goals* instead.
- **`sdd-board`** reads the new task format and shows a flat task list; its implement gate checks acceptance criteria and dependencies.

### Added

- **`spec-verifier` agent** (replaces `spec-guard` and `drift-detector`): one read of the diff, per-AC status, non-goal violations, out-of-scope, drift and per-task completeness.

### Removed

- Hook generation (`templates/hooks/`, `.claude/hooks/*`, PostToolUse entries); `init` only adds sibling-repo paths to `permissions.additionalDirectories`.
- The `/sdd:doctor` command file (the skill remains), `.claude/roles/` discovery in `/sdd:constitution`, and the `spec-guard` and `drift-detector` agents.

## [0.10.0] — 2026-11-12

`sdd` goes to 0.10.0 (the reviewer's verdict values change) and `sdd-board` to 0.3.1.

### Changed

- **Review verdicts are READY / NOT READY** instead of GO / NO-GO, in `/sdd:review`, the `reviewer` agent (`{verdict: "READY" | "NOT_READY"}`), `review.md` and the sdd-board panel ("Review: not ready"). The panel still reads GO / NO-GO in reviews written before.

## [0.9.0] — 2026-11-12

`sdd` goes to 0.9.0 and `sdd-board` to 0.3.0.

### Added

- **Projects: one framework for any layout and any app.** `capabilities.md` gets a `## Projects` section (replacing `Stack profile`): single app (`root`), monorepo (one project per app/package) or several repositories (projects in sibling checkouts, `specs/` only in the spec repo). Web, backend and mobile projects are peers. Constitution §2 has one command row per project, the routing table a `Stack` column, and `/sdd:doctor init` detects workspaces (Nx, Turborepo, pnpm/yarn/uv/Cargo/Go, Gradle) and asks which sibling repos belong to the product.
- **Task dependencies and parallel waves.** Tasks carry `project`, `tdd` and `depends_on`. `/sdd:tasks` writes each Story's execution waves and a Mermaid flow diagram (one subgraph per wave, one colour per project); `/sdd:implement` runs the tasks of a wave in parallel as subagents (each on its own agent and `model` tier, editing only its own files) and starts the next wave once the previous one is green.
- **Several repositories.** `/sdd:implement` creates the feature branch in each sibling repo it edits, `/sdd:review` diffs, tests and opens a linked PR per repo, and `init` adds sibling repos to `permissions.additionalDirectories`.
- **Path-routed hooks for monorepos.** The hook templates gain a "route by path" shape: each project's typecheck/lint runs from its own directory with its own runner.
- **sdd-board shows each task's project and what it waits on** (open `depends_on`).
- **Agents without a shell or without write access.** `/sdd:implement` runs the tests for a specialist that has no Bash (tests call → red check → implementation call → green check) and runs a task routed to a read-only agent on `general-purpose`; `/sdd:tasks` and `doctor init` no longer route tasks to read-only agents. Found in a trial run on an Nx (Next.js) + FastAPI monorepo.

### Changed

- **One task per unit of behaviour.** The test → implementation (and contract → tests → implementation) chain now happens inside one task (`tdd: test-first | contract-first`) instead of being split into 2–3 tasks; a contract shared between projects stays its own task. A `tasks.md` in the old format still runs, sequentially.
- **No frontend bias in examples.** Task, plan and routing examples show a web + backend + mobile feature; `drift-detector` and `analyze` look for tests by each project's convention; `reviewer` picks audits per project; `ui-critic` reviews web projects and skips mobile/desktop UI without a screenshot tool.

## [0.8.0] — 2026-11-12

`sdd` goes to 0.8.0 and `sdd-board` to 0.2.1 (the verdict fix below).

### Fixed

- **`/sdd:plan` works in Plan Mode.** Plan Mode blocks every write except the session's plan file, so the command now drafts the plan there and calls ExitPlanMode; the approval is the human review, and only then is `specs/<slug>/plan.md` written. Without Plan Mode it writes directly, as before.
- **`/sdd:review` and its agents see the real feature diff.** SDD commits only at the end of review, so `git diff main..HEAD` was empty. `/sdd:review`, `/sdd:analyze`, `spec-guard` and `drift-detector` now diff against the merge base and include uncommitted and untracked files; per-Story spec-guard runs are limited to the Story's files.
- **`/sdd:review` invokes `reviewer`.** It was named in the description and constraints but never called. It now runs the suite once, then spec-guard, drift-detector and ui-critic, and hands their results to `reviewer`, which writes `review.md` and does not re-run the tests or start `ui-critic` itself.
- **`/sdd:review` asks before committing and stages only the confirmed files** instead of `git add -A`; the `done` statuses are set before the commit, so they are part of it.
- **No reads of the project `CLAUDE.md`.** `/sdd:plan`, `/sdd:implement`, `reviewer` and `ui-critic` take the constitution, test/coverage commands, coverage targets and Storybook command from `specs/constitution.md`.
- **`/sdd:clarify` picks the spec from the branch or argument** and asks when neither resolves, instead of taking the most recently modified spec; its `allowed-tools` now let it read the branch.
- **`/sdd:implement` runs a Story's tasks in their listed order** instead of matching React-specific `type` names; the `spec-guard` description says once per Story.

- **sdd-board reads the review verdict from the `**Verdict:**` header.** The richer `review.md` quotes findings from several agents, and a stray "NO-GO" in one of them used to mark a GO review as NO-GO.

### Changed

- The constitution's §2 Run/build table gains `coverage` and `ui-preview` rows and is the single source for those commands; `/sdd:doctor init` fills it from the detected tooling when it seeds the constitution, and `check` warns when the `test` row is empty.

## [sdd-board 0.2.0] — 2026-11-12

### Added

- **Setup card** for projects without `specs/`: only a card is drawn, and **Init SDD in this project** runs `/sdd:doctor init` in the session. The tabs appear on their own once `specs/` exists.
- **Readiness checklist** above the next-step card in every phase (spec content, open questions, plan sections, task routing, review verdict). The card is yellow while a check is open and green when all pass.
- **Phase-aware Current tab**: a "Feature done" card for finished features, tasks and stories only in Implement and Review, **+ New spec** in the tab bar, and "Nothing in progress" when no feature is open.
- **Documents open in their own pane** (spec, plan, tasks, review) instead of expanding below; pill status badge; stepper and progress bar sized to the pane; panel title "Spec-driven Development by Szum-Tech".

### Fixed

- "All resolved" and "none" notes in Open questions no longer count as open questions.
- A `# comment` after a task `status:` no longer turns the task into a draft.

## [0.7.4] — 2026-11-11

### Changed

- **Author metadata** of `sdd` and `sdd-board` and the marketplace owner now read "Szum Tech Team" with email and profile URL, matching the other Szum-Tech marketplace. `sdd-board` goes to 0.1.1.

## [0.7.3] — 2026-11-11

### Added

- **`plugins/sdd/README.md`**, a short plugin README with the install line, pointing at the repository README for the full guide.

### Fixed

- **Install instructions in the README** now use `/plugin marketplace add` followed by `/plugin install sdd@spec-driven-development`, and the fork instructions point at `plugins/sdd/.claude-plugin/plugin.json`.

## [0.7.2] — 2026-11-11

### Changed

- **The `sdd` plugin moved to `plugins/sdd/`** so the repository can host several plugins in one marketplace. Content is unchanged; the marketplace entry now points at `./plugins/sdd`. Install it as before with `/plugin install sdd@spec-driven-development`, or load a checkout with `claude --plugin-dir plugins/sdd`.

### Added

- **`sdd-board` 0.1.0** — a new companion plugin (a Claude Code mod) that docks an SDD panel next to the transcript in Claude Code Desktop. *Current* tab: the active spec with its phase stepper, the next `/sdd:*` command (one button puts it in the prompt), progress, Stories with their tasks, and a spec/plan/tasks/review viewer. *All* tab: every spec with its phase. See `plugins/sdd-board/`.

## [0.7.1] — 2026-11-03

### Changed

- **The plugin manifest moved to `.claude-plugin/plugin.json`**, where Claude Code reads it; `/sdd:doctor check` #3 now looks there. Both manifests open with a SchemaStore `$schema`, and `plugin.json` gained `displayName` and `keywords` for the `/plugin` browser.
- **Versioning policy**: the version is now bumped in every change that touches the plugin (managed `CLAUDE.md` block and `plugin-checks` CI, which fails a pull request without a bump). CI uses the shared `plugin-checks` action from `claude-plugins`.
- **Removed unread frontmatter keys** (`version`, `lastUpdated`, `tags`, `author`) from `skills/doctor/SKILL.md`.

### Added

- **`plugin-checks` CI workflow** runs the marketplace-doctor drift check on every pull request and push to `main`.
- **Plugin tables in `CLAUDE.md` and `README.md`**, so `marketplace-doctor` audits the listed commands, agents and skills against the plugin.
- **Plugin development section in `CLAUDE.md`** (managed by `/plugin-dev-setup`) describing layout, per-change steps and the release procedure.

## [0.7.0] — 2026-08-02

### Added

- **`drift-detector`, `spec-guard`, and `reviewer` now exclude generated/out-of-band paths from diff analysis.** Files matching the `Generated / out-of-band paths` globs declared in `specs/capabilities.md` (e.g. regenerated mocks, schemas, hook scripts written by `/sdd:doctor init`) are no longer flagged as drift or out-of-scope changes. `capabilities.md.template` gained a dedicated `Generated / out-of-band paths` section for project-specific glob declarations, and `/sdd:tasks`, `/sdd:implement`, and the lifecycle docs were updated to reflect the exclusion rule.
- **Verification agents (`drift-detector`, `reviewer`, `spec-guard`, `ui-critic`) now declare explicit `model` and `color` frontmatter attributes**, for clearer per-agent configuration and UI distinction.

### Fixed

- Corrected `json` code-block language annotations in `reviewer.md`, `spec-guard.md`, and `ui-critic.md` that were rendering incorrectly.

### Changed

- **The TDD model is now technology-neutral — no frontend tools are mandated by the flow.** The old "Logic → strict TDD vs UI components (React/Next.js) → contract-first TDD" dichotomy is replaced by a stack-agnostic, cost-aware criterion: **test-first is the default** (trivially stub a missing symbol so the test fails on a real assertion), and **contract-first** (contract → tests → implementation, 3 tasks) is the **narrow exception** — used only when the unit's deliverable is itself a public interface/contract other code references by shape. This biases decomposition toward fewer tasks (avoids re-inflating task count in statically-typed languages where every not-yet-built unit fails to resolve). A UI component is now *one example* of a contract-first unit, alongside typed service interfaces and API/RPC schemas — not the definition. Within a Story, phase ordering is enforced by task order, not by parsing `type` strings.
- **Removed the empty-placeholder-with-test-id practice.** The contract phase no longer mandates a "skeleton component returning `<div data-testid="…" />`", inline-props-in-`.tsx`, the "never a separate `.types.ts`" rule, or Storybook. The framework now imposes **no file-layout rule** for where interfaces/types live — it follows the project's own conventions. The contract is just "declare the public interface so consumers/tests can reference it (plus a minimal stub only if the language needs one to compile)." Updated across `commands/tasks.md`, `commands/implement.md`, `commands/constitution.md`, the spec/constitution templates, `capabilities.md.template`, `CLAUDE.md`, and the README. Stack-specific `type` names (`ui-contract`/`ui-component-test`/`ui-component`) and tools (`storybook-tester`, `ui-critic`) remain only as **per-project examples** in `capabilities.md` and as opt-in, no-op-when-absent review capabilities.
- **`/sdd:implement` now works a whole Story per session (recommended), not one micro-task per call.** `/sdd:implement S1` resolves the scope to every task in that Story, runs them in TDD order within a single session (one red→green cycle), makes **one** specialist invocation with the Story's combined scope, runs the filtered tests once, and invokes `spec-guard` **once at the Story boundary** instead of once per task. A single task ID (`/sdd:implement T1.2`) still works for surgical re-runs. This removes the per-micro-task ceremony that multiplied token cost — the previous "⛔ one task per invocation, never batch" rule is inverted. `tasks.md`, `review.md`, and the README walkthroughs/examples updated to match.
- **One Epic per feature.** `/sdd:tasks` now emits exactly one Epic per `/sdd:spec` feature and never invents extra Epics; if the work feels like several Epics it flags that the feature should have been split into separate specs.

### Added

- **Document status lifecycle is now advanced automatically.** The `**Status:**` headers in `spec.md`/`plan.md` were previously dead metadata stuck at `draft`. They now move through `draft → clarified → planned → in-progress → done` as the pipeline runs: `/sdd:clarify` → `clarified`, `/sdd:plan` → `planned`, `/sdd:implement` (first run) → `in-progress`, `/sdd:review` (GO) → `done`. `/sdd:tasks` sets `plan.md` to `tasks-ready`. Each step only advances forward, never backward.

## [0.6.0] — 2026-06-12

### Added

- **Open-ended, language-agnostic hook generation.** `/sdd:doctor init` no longer matches against a fixed catalog of stacks. It now discovers *how the specific project checks its code* — from declared scripts/tasks (`package.json`, `Makefile`, `justfile`, Gradle/Maven, etc.), CI and pre-commit config, and tool config files — and generates hooks that reproduce those exact commands, for **any** language or tool, including ones never enumerated (Kotlin, Swift, Ruby, PHP, C#/.NET, Elixir, a tool released last month). The `templates/hooks/*.sh.template` blocks are now framed as *worked examples of the hook shape*, and `SKILL.md` instructs the skill to add new blocks by analogy for tools the examples don't cover. Java (Maven/Gradle — compile as typecheck, Checkstyle/PMD/SpotBugs as lint) is included as one such worked example.

### Changed (breaking)

- **The `doctor` skill is now fully LLM-driven — the Python helpers are gone.** `skills/doctor/check.py` and `skills/doctor/init.py` were removed; `SKILL.md` now contains the entire procedure for both `check` (10 read-only inspections) and `init` (create/repair per-project artifacts), which Claude performs directly with its file tools. The skill now makes the file-location contract explicit and verifiable: every artifact is written under the **project root** (Claude's working directory, resolved with `pwd`), while seed templates are read from the **plugin root** (`${CLAUDE_PLUGIN_ROOT}`) — removing the path/working-directory ambiguity that could land artifacts in the wrong place. Stack detection is more flexible (package manager, monorepo/workspaces, project scripts). New supporting files: `skills/doctor/reference/settings-merge.md` (the mechanical safe-merge procedure) and `skills/doctor/templates/hooks/{typecheck,lint}.sh.template` (per-tool shell snippets composed into project hooks). Output contracts are unchanged — `specs/capabilities.md` sections, `.claude/hooks/*.sh` paths, and the `Edit|Write|MultiEdit` PostToolUse entry are identical, so `/sdd:plan`, `/sdd:tasks`, `/sdd:implement`, and `/sdd:review` are unaffected. The repo no longer ships any runtime code; manual exercise of the skill replaces the `check.py`/`init.py` smoke test.
- **`capabilities.md` moved from `.claude/` to `specs/`.** All SDD project artifacts now live together under `specs/` (`constitution.md`, `template.md`, `capabilities.md`, feature folders). The `.claude/` directory is reserved for Claude Code infrastructure (`settings.json`). Check 5 now verifies `specs/capabilities.md`. Slash commands and verification agents that consult capabilities (e.g. `/sdd:plan`, `/sdd:tasks`, `/sdd:review`, `reviewer` agent) updated accordingly.
- **Auto-migration in `/sdd:doctor init`.** If a project still has `.claude/capabilities.md` from earlier versions, init now moves it to `specs/capabilities.md` (only when the new path is absent — never clobbers) and patches any pointer reference inside `CLAUDE.md` from `.claude/capabilities.md` → `specs/capabilities.md`. Path-only fix; never touches user-authored content.

### Fixed

- **`generate_capabilities_md()` is now byte-stable idempotent from the first run.** Two bugs surfaced and were fixed:
  - The user-override extractor used `(.+?)` with `re.DOTALL`, which non-greedily backtracked across `## ` boundaries and could swallow auto-generated sections into a fake "title". On re-init, those sections were appended again and the file grew on every run. Title pattern tightened to `[^\n]+?` so it can only match a single heading line.
  - When substituting user-override sections back, the trailing blank-line separator between sections was being collapsed by one. Body now preserves `\n\n` trailing; the final EOF newline is normalised at the end of the generator.

### Fixed

- **`/sdd:doctor init` no longer destructively overwrites `.claude/settings.json`.** Earlier versions rendered the bundled `settings.json.template` and wrote it back verbatim, wiping any user-authored keys (custom permissions, other PostToolUse hooks, MCP config, model overrides). Now `init` reads the existing file, strips only its OWN previously-installed hook entries (identified by command path containing `hooks/typecheck.py` or `hooks/lint.sh`), and appends fresh entries. Every other key is preserved verbatim. On malformed JSON in the existing file, init bails with a clear error and refuses to touch the file.

### Changed

- **Stack-aware hook entries.** Instead of installing a hardcoded TypeScript + ESLint hook pair on every project, `init` now detects what typecheck / lint tools are actually present by parsing `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `deno.json` AND verifying each candidate is on `$PATH`. Hook entries are emitted only for tools we can actually run.
- **Expanded language coverage in the hook scripts.** `hooks/typecheck.py` now handles `.ts/.tsx` (tsc), `.py` (mypy → pyright fallback), `.rs` (cargo check), `.go` (go vet). `hooks/lint.sh` now picks Biome → ESLint → oxlint (first available) for JS/TS, Ruff for Python, `cargo clippy` for Rust, `golangci-lint` for Go.
- **Hook scripts no-op gracefully when tools are missing.** Previously a missing ESLint (or any required tool) could exit with code 2 and unnecessarily block Claude on stacks that don't use that linter. Now hooks check `shutil.which` / `command -v` before invoking and exit 0 when the tool isn't installed.

### Removed

- `skills/doctor/templates/settings.json.template` — hook entries are built programmatically by `init.py` from detected tools; no static template needed.

## [0.3.0] — 2026-06-12

### Changed (breaking)

- **Skill renamed — dropped the redundant `sdd-` prefix.** The skill directory is now `skills/doctor/` and its `name:` frontmatter is `doctor`; the wrapper command file is `commands/doctor.md`. The plugin namespace (`sdd:`) already disambiguates this against any same-named skill in another plugin, so the prefix added noise without value.
- **Verification agents renamed (drop the `sdd-` prefix).** `sdd-spec-guard` → `spec-guard`, `sdd-drift-detector` → `drift-detector`, `sdd-reviewer` → `reviewer`, `sdd-ui-critic` → `ui-critic`. Same reasoning as the doctor rename: the `sdd` plugin namespace already disambiguates these against specialist agents from the marketplace; the prefix added noise without value. `Task` tool invocations updated to use the bare names (`subagent_type: spec-guard`, etc.). `plugin.json` `agents` array updated to the new paths.
- **Documentation now uses the plugin-namespaced invocation form `/sdd:<command>`** — `/sdd:doctor`, `/sdd:constitution`, `/sdd:spec`, `/sdd:clarify`, `/sdd:plan`, `/sdd:tasks`, `/sdd:implement`, `/sdd:review`, `/sdd:analyze`. This is how commands are actually invoked when the plugin is installed in another project (`/<plugin>:<command>`). Command files under `commands/` keep their plain names (`spec.md`, `plan.md`, …); the `sdd` namespace comes from `plugin.json`.
- **Underscore prefix dropped from project artifacts under `specs/`.** Both `specs/_constitution.md` → `specs/constitution.md` and `specs/_template.md` → `specs/template.md`. The underscore was an alphabetical-sort affordance from the template-repo era; in the plugin model it adds noise without value.
- **Auto-migration in `/sdd:doctor init`.** When a project has the legacy underscored names, init renames them to the new paths and patches `CLAUDE.md`'s pointer string (`specs/_constitution.md` → `specs/constitution.md`). Path-only fix — never touches user-authored content. Idempotent (no-op when already migrated).
- **Dedicated `specs/constitution.md` as the source of truth.** The Constitution is no longer collapsed into `CLAUDE.md`. It now lives as a long-form artifact under `specs/constitution.md` with no token limit. `/sdd:constitution` edits this file exclusively. `CLAUDE.md` becomes a separate, independent session loader (<2,500 tokens) that points at the constitution. The two files are intentionally decoupled — `/sdd:constitution` never modifies `CLAUDE.md`.
- **Doctor expanded to 11 checks.** New check 11 verifies `specs/constitution.md` exists with the canonical sections (Tech stack, Run/build, Conventions, WHAT NOT TO DO). Existing check 1 now additionally verifies that `CLAUDE.md` contains a pointer reference to `specs/constitution.md` and warns if missing.
- **One-time v0.2.0 → v0.3.0 migration in `/sdd:doctor init`.** When the target project has a populated `CLAUDE.md` but no `specs/constitution.md`, init parses `##` sections from CLAUDE.md, seeds them into the new constitution with `<!-- TODO: add rationale / WHY -->` placeholders, then overwrites CLAUDE.md with the new condensed loader template. The original CLAUDE.md content is preserved inside the constitution. Subsequent inits are idempotent (skip both files when present).

### Added

- `skills/doctor/templates/constitution.md.template` — long-form constitution scaffold with `<!-- MIGRATED:* -->` markers used by the migration routine. Includes canonical sections plus optional ones (Testing philosophy, Error handling philosophy, Out of scope).
- `setup_constitution()` four-case handler in `init.py` (both present / migrate / both missing / loader-only).
- `_rename_legacy_underscored_files()` in `init.py` — handles the v0.3.0-style → v0.4.0-style path rename and CLAUDE.md pointer patch.
- `check_constitution()` in `check.py`, plus pointer-reference verification in `check_claude_md()`.

### Changed (non-breaking)

- `skills/doctor/templates/CLAUDE.md.template` refactored from a self-contained constitution into a condensed session loader that points at `specs/constitution.md`.
- `commands/constitution.md` rewritten to target `specs/constitution.md` and to explicitly avoid touching `CLAUDE.md`.

## [0.2.0] — 2026-06-08

### Changed (breaking)

- **Distribution model: template repo → Claude Code plugin.** SDD is now installed once per machine with `claude plugin install https://github.com/JanSzewczyk/spec-driven-development`. Slash commands, verification agents, hooks, and the `doctor` skill are auto-discovered in every project — no per-project copy required.
- **Repo layout flattened.** `commands/`, `agents/`, `hooks/`, `skills/` are now at the plugin root (previously under `template/.claude/`). Per-project templates moved into `skills/doctor/templates/`.
- **`/sdd:doctor init` semantics.** Now copies bundled templates from `<plugin>/skills/doctor/templates/` into the target project and renders `.claude/settings.json` with absolute paths to the plugin's hook scripts (`${PLUGIN_ROOT}` placeholder substituted at install time).
- **Doctor checks.** Old checks 3 ("commands present") and 4 ("agents present") are replaced with "Plugin installed" and "Plugin enabled" — the per-project `.claude/commands` and `.claude/agents` directories are no longer expected.

### Added

- `plugin.json` manifest at repo root.
- `skills/doctor/templates/settings.json.template` with `${PLUGIN_ROOT}` placeholder, rendered by `init.py` at run time.
- `resolve_plugin_root()` helper in both `check.py` and `init.py` (uses `$CLAUDE_PLUGIN_ROOT` env var, falls back to `__file__` walk).
- Plugin-canonical fields in `SKILL.md` frontmatter (`version`, `lastUpdated`, `tags`, `author`, `allowed-tools`).

### Removed

- `bootstrap.sh` — superseded by `claude plugin install`. Old projects already bootstrapped are unaffected; the plugin works on top of existing `.claude/` files without conflict.
- `template/` directory — contents promoted to plugin root or relocated under `skills/doctor/templates/`.

### Migration notes

If you already bootstrapped a project with v0.1.0:

1. Install the plugin: `claude plugin install https://github.com/JanSzewczyk/spec-driven-development`.
2. (Optional) Delete the now-redundant `.claude/commands/`, `.claude/agents/`, `.claude/hooks/`, `.claude/skills/` from your project — the plugin provides them globally.
3. Re-run `/sdd:doctor init` to regenerate `.claude/settings.json` with hook paths pointing at the plugin instead of the (now-deleted) project-local hooks.
4. Your `CLAUDE.md`, `specs/`, and `capabilities.md` `<!-- user-override -->` sections are preserved untouched.

## [0.1.0] — 2026-06-04

### Added

- Initial release of the SDD Framework as a template repository with `bootstrap.sh`.
- 9 slash commands: `doctor`, `constitution`, `spec`, `clarify`, `plan`, `tasks`, `implement`, `review`, `analyze`.
- 4 verification sub-agents: `spec-guard`, `drift-detector`, `reviewer`, `ui-critic`.
- `doctor` skill with 10-point readiness check and `init`/`fix` modes (auto-detect installed plugins + stack).
- Hooks: `typecheck.py` and `lint.sh` (PostToolUse, exit 2 blocks Claude).
- Project templates: `CLAUDE.md.template`, `specs/template.md`, `capabilities.md.template`, `settings.json`.
- Contract-first TDD for UI components — `/sdd:tasks` emits a 3-task chain (`ui-contract` → `ui-component-test` → `ui-component`) so React/Next.js components get a meaningful red phase. Props interface lives inline in `.tsx` (no separate `.types.ts`).
- Three-tier agent hierarchy: Orchestrator → Specialist agents (plugin-based) → Verification agents (SDD-owned), with Skills loaded on demand.
- Per-task routing via YAML tags (`type`, `agent`, `skills`) in `tasks.md` — automatically auto-generated by `/sdd:tasks` from `capabilities.md` rules.
- Conventional Commits-style branches (`feat/...`, `fix/...`) enforced by `/sdd:spec`.
- Comprehensive README with quick start, end-to-end example, slash command reference, sub-agent reference, best practices, anti-patterns, design decisions, and troubleshooting.
