---
name: doctor
version: 0.4.0
lastUpdated: 2026-06-12
description: Preflight audit of project readiness for the SDD framework. Runs 10 checks (specs/constitution.md, specs/template.md, plugin installed + enabled across user/project/local settings, capabilities.md, hooks, git, gh, tooling, specialist agents, project type). The `init` mode copies bundled templates into the target project and bootstraps `specs/constitution.md` when missing. The root `CLAUDE.md` is user-owned and never read or modified by this skill. Use this skill when the user asks "is my project SDD-ready", "set up SDD", "configure SDD", "why doesn't /sdd:spec work", "init SDD framework", or otherwise indicates they want to start using Spec-Driven Development.
tags: [sdd, spec-driven-development, tdd, claude-code, plugin]
author: Jan Szewczyk
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# SDD Doctor

Audit and auto-setup for the Spec-Driven Development plugin on a target project.

## Modes

| Mode | What it does | When to use |
|------|--------------|-------------|
| `check` (default) | Report only — 10 checks with statuses ✅/⚠️/❌ | Sanity check, audit |
| `init` | Bootstrap per-project artifacts (constitution, specs/template.md, capabilities.md, settings.json) | First-time setup after the plugin is installed |

## What it checks (10 checks)

1. **`specs/constitution.md`** — the long-form project constitution. Exists with the canonical sections (Tech stack, Run/build, Conventions, WHAT NOT TO DO). No token limit — this is the source of truth.
2. **`specs/template.md`** — exists with all required fields (Summary, User stories, Acceptance criteria, Edge cases, Open questions, Testing guidelines).
3. **Plugin installed** — `plugin.json` is reachable at the resolved plugin root (verifies the `sdd` plugin is correctly installed under `~/.claude/plugins/cache/`).
4. **Plugin enabled** — `sdd` appears under `enabledPlugins` (or equivalent) in **any** of three Claude Code settings layers: `~/.claude/settings.json` (user-global), `<project>/.claude/settings.json` (per-project, committed), or `<project>/.claude/settings.local.json` (gitignored local override). The report names which layer(s) enabled it.
5. **`specs/capabilities.md`** — exists and lists specialist agents + skills + task type routing.
6. **`.claude/settings.json`** — PostToolUse hooks for typecheck + lint configured and pointing at the plugin's hook scripts.
7. **Git + gh** — repository initialized, `git status` clean, `gh auth status` ok.
8. **Tooling auto-detect** — if `package.json` is present: `tsc`, `eslint`, `vitest`/`jest` installed; if `pyproject.toml`: `mypy`, `ruff`, `pytest`.
9. **Specialist agents available** — `storybook-tester`, `nextjs-backend-engineer`, `testing-strategist` (or others) discoverable in the plugin marketplace.
10. **Project type detection** — detects the project type (nextjs / react / node / python / other) and shows which specialist agents/skills will be routed to.

> **Commands and verification agents are not per-project**: they live in the plugin (`commands/`, `agents/` at the plugin root). Once the plugin is installed (checks 3 + 4 pass), Claude Code auto-discovers all slash commands and SDD agents in every project.
>
> **`CLAUDE.md` is owned by the user**: the SDD framework uses and modifies only `specs/constitution.md`. The root `CLAUDE.md` (if present) is never read or written by `/sdd:doctor` or `/sdd:constitution`.

## How to operate (instructions for Claude)

When this skill is activated:

### 1. Identify the mode

Extract intent from the user message:
- "check" / "audit" / "is ready" / "what's missing" → mode **check**
- "init" / "setup" / "create" / "generate" / "configure" → mode **init**

Default: **check**.

### 2. Invoke the Python helper

The scripts live next to this file inside the plugin. Resolve them via `${CLAUDE_PLUGIN_ROOT}` when Claude Code exposes it, otherwise via absolute path:

```bash
# check
python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/cache/sdd}/skills/doctor/check.py"

# init (bootstraps missing per-project artifacts)
python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/cache/sdd}/skills/doctor/init.py"
```

`check.py` returns JSON on stdout:

```json
{
  "status": "READY" | "PARTIAL" | "NOT_READY",
  "checks": [
    {"id": 1, "name": "specs/constitution.md", "status": "pass" | "warn" | "fail", "message": "..."},
    ...
  ],
  "stack": {"framework": "nextjs", "language": "typescript", ...}
}
```

### 3. Format the report for the user

Render a Markdown table with the 10 checks, each row showing its status (✅/⚠️/❌) and a short message. End with the overall status and suggested next steps:

- READY → "You can run `/sdd:spec feat <description>`"
- PARTIAL → "Run `/sdd:doctor init` to fill in the missing per-project files"
- NOT_READY → "If checks 3 or 4 fail, install the plugin first: `claude plugin install https://github.com/JanSzewczyk/spec-driven-development`. Otherwise run `/sdd:doctor init`."

### 4. Init mode — what happens

The `init.py` script:

1. Resolves the plugin root via `$CLAUDE_PLUGIN_ROOT` or by walking up from its own `__file__`.
2. **Constitution bootstrap** — if `specs/constitution.md` is missing, copies the bundled template into place. If it already exists, leaves it untouched. The script never reads or writes the project-root `CLAUDE.md`.
3. Copies `<plugin>/skills/doctor/templates/specs/template.md` → `<project>/specs/template.md` (skipped if exists).
4. Renders `specs/capabilities.md` by scanning `~/.claude/plugins/cache/<plugin>/{skills,agents}/` for installed capabilities, plus detecting stack from `package.json` / `pyproject.toml`. **Preserves** every `<!-- user-override -->` section from any existing file.
5. **Safe-merges `.claude/settings.json`**:
   - Detects what typecheck / lint tools the project actually uses (parses `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `deno.json`) AND verifies each candidate is on `$PATH` via `shutil.which`.
   - Builds PostToolUse hook entries only for the tools it can run. Stacks: TypeScript (`tsc`), JS/TS lint (Biome → ESLint → oxlint, first available wins), Python (mypy/pyright, ruff), Rust (`cargo check`, clippy), Go (`go vet`, golangci-lint), Deno (`deno check`, `deno lint`).
   - **Never overwrites the file.** Reads existing `settings.json`, deep-copies it, strips only its OWN previously-installed hook entries (identified by their command containing `hooks/typecheck.py` or `hooks/lint.sh`), appends the freshly-built ones. Every other top-level key (`permissions`, `model`, MCP config, user's own PostToolUse hooks) is preserved verbatim.
   - On malformed existing JSON, bails with a clear error to stderr — never touches a corrupt file.
   - When no hookable tools are detected, leaves PostToolUse empty (or strips stale SDD entries only). Check 6 then reports `warn` — that's honest, not a failure.

`/sdd:constitution` is the canonical editor for `specs/constitution.md`. The root `CLAUDE.md`, if you keep one, stays under your manual control.

## Output report — format

```markdown
# SDD Readiness Report

**Status:** ⚠️ PARTIAL (8/10 checks passed)
**Stack detected:** Next.js 15 + TypeScript strict + Vitest

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | specs/constitution.md | ✅ | 4/4 required sections present |
| 2 | specs/template.md | ✅ | all fields present |
| 3 | Plugin installed | ✅ | sdd@0.4.0 at ~/.claude/plugins/cache/sdd |
| 4 | Plugin enabled | ✅ | enabled in user, project settings |
| 5 | specs/capabilities.md | ✅ | 4 specialist agents, 12 skills |
| 6 | .claude/settings.json hooks | ❌ | no PostToolUse hooks |
| 7 | Git + gh | ✅ | clean tree, gh ok |
| 8 | Tooling (TS/lint/test) | ✅ | node_modules present |
| 9 | Specialist agents (plugin) | ✅ | storybook-tester, nextjs-backend-engineer |
| 10 | Project type | ✅ | nextjs detected |

## Next steps
- Run `/sdd:doctor init` to fix check 6 (regenerates settings.json with plugin hook paths)
```
