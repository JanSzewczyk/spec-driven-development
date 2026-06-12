---
name: doctor
version: 0.3.0
lastUpdated: 2026-06-12
description: Preflight audit of project readiness for the SDD framework. Runs 11 checks (CLAUDE.md loader, specs/template.md, plugin installed + enabled, capabilities.md, hooks, git, gh, tooling, specialist agents, project type, specs/constitution.md). The `init` mode copies bundled templates into the target project and migrates legacy single-file CLAUDE.md into the new dedicated constitution + loader split. Use this skill when the user asks "is my project SDD-ready", "set up SDD", "configure SDD", "why doesn't /sdd:spec work", "init SDD framework", or otherwise indicates they want to start using Spec-Driven Development.
tags: [sdd, spec-driven-development, tdd, claude-code, plugin]
author: Jan Szewczyk
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# SDD Doctor

Audit and auto-setup for the Spec-Driven Development plugin on a target project.

## Modes

| Mode | What it does | When to use |
|------|--------------|-------------|
| `check` (default) | Report only — 11 checks with statuses ✅/⚠️/❌ | Sanity check, audit |
| `init` | Bootstrap or migrate per-project artifacts (constitution, CLAUDE.md loader, specs/template.md, capabilities.md, settings.json) | First-time setup after the plugin is installed, OR upgrading from v0.2.0 (one-time migration) |

## What it checks (11 checks)

1. **`CLAUDE.md` (loader)** at the project root — exists, under 2,500 tokens, contains the operational sections (Tech stack, Run/build), and **carries a pointer reference to `specs/constitution.md`**.
2. **`specs/template.md`** — exists with all required fields (Summary, User stories, Acceptance criteria, Edge cases, Open questions, Testing guidelines).
3. **Plugin installed** — `plugin.json` is reachable at the resolved plugin root (verifies the `sdd` plugin is correctly installed under `~/.claude/plugins/cache/`).
4. **Plugin enabled** — `sdd` appears in `~/.claude/settings.json` under `enabledPlugins` (or equivalent).
5. **`specs/capabilities.md`** — exists and lists specialist agents + skills + task type routing.
6. **`.claude/settings.json`** — PostToolUse hooks for typecheck + lint configured and pointing at the plugin's hook scripts.
7. **Git + gh** — repository initialized, `git status` clean, `gh auth status` ok.
8. **Tooling auto-detect** — if `package.json` is present: `tsc`, `eslint`, `vitest`/`jest` installed; if `pyproject.toml`: `mypy`, `ruff`, `pytest`.
9. **Specialist agents available** — `storybook-tester`, `nextjs-backend-engineer`, `testing-strategist` (or others) discoverable in the plugin marketplace.
10. **Project type detection** — detects the project type (nextjs / react / node / python / other) and shows which specialist agents/skills will be routed to.
11. **`specs/constitution.md`** — the long-form project constitution. Exists with the canonical sections (Tech stack, Run/build, Conventions, WHAT NOT TO DO). No token limit applies here — this is the source of truth that CLAUDE.md condenses.

> **Commands and verification agents are no longer per-project**: they live in the plugin (`commands/`, `agents/` at the plugin root). Once the plugin is installed (checks 3 + 4 pass), Claude Code auto-discovers all 9 slash commands and 4 SDD agents in every project.
>
> **CLAUDE.md and the constitution are independent**: after the one-time migration step, `/sdd:constitution` edits ONLY `specs/constitution.md`. CLAUDE.md is owned by the user — keep it lean and pointing at the constitution.

## How to operate (instructions for Claude)

When this skill is activated:

### 1. Identify the mode

Extract intent from the user message:
- "check" / "audit" / "is ready" / "what's missing" → mode **check**
- "init" / "setup" / "create" / "generate" / "configure" / "migrate" → mode **init**

Default: **check**.

### 2. Invoke the Python helper

The scripts live next to this file inside the plugin. Resolve them via `${CLAUDE_PLUGIN_ROOT}` when Claude Code exposes it, otherwise via absolute path:

```bash
# check
python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/cache/sdd}/skills/doctor/check.py"

# init (bootstraps fresh or migrates v0.2.0 → v0.3.0)
python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/cache/sdd}/skills/doctor/init.py"
```

`check.py` returns JSON on stdout:

```json
{
  "status": "READY" | "PARTIAL" | "NOT_READY",
  "checks": [
    {"id": 1, "name": "CLAUDE.md (loader)", "status": "pass" | "warn" | "fail", "message": "..."},
    ...
  ],
  "stack": {"framework": "nextjs", "language": "typescript", ...}
}
```

### 3. Format the report for the user

Render a Markdown table with the 11 checks, each row showing its status (✅/⚠️/❌) and a short message. End with the overall status and suggested next steps:

- READY → "You can run `/sdd:spec feat <description>`"
- PARTIAL → "Run `/sdd:doctor init` to fill in or migrate the missing per-project files"
- NOT_READY → "If checks 3 or 4 fail, install the plugin first: `claude plugin install https://github.com/JanSzewczyk/spec-driven-development`. Otherwise run `/sdd:doctor init`."

### 4. Init mode — what happens

The `init.py` script:

1. Resolves the plugin root via `$CLAUDE_PLUGIN_ROOT` or by walking up from its own `__file__`.
2. **Constitution + CLAUDE.md setup** — four-case handler:
   - Both files exist → noop.
   - Constitution missing + CLAUDE.md exists → **migrate**: parse `##` sections from CLAUDE.md, seed them into `specs/constitution.md` with `<!-- TODO: add rationale / WHY -->` placeholders alongside each rule, then regenerate CLAUDE.md as the condensed loader.
   - Both missing → copy both templates fresh.
   - Constitution exists, CLAUDE.md missing → copy the CLAUDE.md loader template only.
3. Copies `<plugin>/skills/doctor/templates/specs/template.md` → `<project>/specs/template.md` (skipped if exists).
4. Renders `specs/capabilities.md` by scanning `~/.claude/plugins/cache/<plugin>/{skills,agents}/` for installed capabilities, plus detecting stack from `package.json` / `pyproject.toml`. **Preserves** every `<!-- user-override -->` section from any existing file.
5. **Safe-merges `.claude/settings.json`**:
   - Detects what typecheck / lint tools the project actually uses (parses `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `deno.json`) AND verifies each candidate is on `$PATH` via `shutil.which`.
   - Builds PostToolUse hook entries only for the tools it can run. Stacks: TypeScript (`tsc`), JS/TS lint (Biome → ESLint → oxlint, first available wins), Python (mypy/pyright, ruff), Rust (`cargo check`, clippy), Go (`go vet`, golangci-lint), Deno (`deno check`, `deno lint`).
   - **Never overwrites the file.** Reads existing `settings.json`, deep-copies it, strips only its OWN previously-installed hook entries (identified by their command containing `hooks/typecheck.py` or `hooks/lint.sh`), appends the freshly-built ones. Every other top-level key (`permissions`, `model`, MCP config, user's own PostToolUse hooks) is preserved verbatim.
   - On malformed existing JSON, bails with a clear error to stderr — never touches a corrupt file.
   - When no hookable tools are detected, leaves PostToolUse empty (or strips stale SDD entries only). Check 6 then reports `warn` — that's honest, not a failure.

After the migration step has run once, `/sdd:constitution` is the canonical editor for `specs/constitution.md`. CLAUDE.md is never rewritten by the constitution command; users keep it in sync manually.

## Output report — format

```markdown
# SDD Readiness Report

**Status:** ⚠️ PARTIAL (9/11 checks passed)
**Stack detected:** Next.js 15 + TypeScript strict + Vitest

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | CLAUDE.md (loader) | ✅ | 389 tokens; pointer to constitution present |
| 2 | specs/template.md | ✅ | all fields present |
| 3 | Plugin installed | ✅ | sdd@0.3.0 at ~/.claude/plugins/cache/sdd |
| 4 | Plugin enabled | ✅ | listed in user settings |
| 5 | specs/capabilities.md | ✅ | 4 specialist agents, 12 skills |
| 6 | .claude/settings.json hooks | ❌ | no PostToolUse hooks |
| 7 | Git + gh | ✅ | clean tree, gh ok |
| 8 | Tooling (TS/lint/test) | ✅ | node_modules present |
| 9 | Specialist agents (plugin) | ✅ | storybook-tester, nextjs-backend-engineer |
| 10 | Project type | ✅ | nextjs detected |
| 11 | specs/constitution.md | ✅ | 4/4 required sections present |

## Next steps
- Run `/sdd:doctor init` to fix check 6 (regenerates settings.json with plugin hook paths)
```
