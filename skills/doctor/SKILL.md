---
name: doctor
version: 0.2.0
lastUpdated: 2026-06-08
description: Preflight audit of project readiness for the SDD framework. Runs 10 checks (CLAUDE.md, specs/_template.md, plugin installed + enabled, capabilities.md, hooks, git, gh, tooling, specialist agents, project type). The `init` mode copies bundled templates into the target project. Use this skill when the user asks "is my project SDD-ready", "set up SDD", "configure SDD", "why doesn't /sdd:spec work", "init SDD framework", or otherwise indicates they want to start using Spec-Driven Development.
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
| `init` | Copy bundled templates into the project + render `.claude/capabilities.md` and `.claude/settings.json` with plugin paths resolved | First-time setup inside a project after the plugin is installed |

## What it checks (10 checks)

1. **`CLAUDE.md`** at the project root — exists, under 2,500 tokens, contains the sections Tech stack / Run-build / Conventions / **WHAT NOT TO DO**.
2. **`specs/_template.md`** — exists with all required fields (Summary, User stories, Acceptance criteria, Edge cases, Open questions, Testing guidelines).
3. **Plugin installed** — `plugin.json` is reachable at the resolved plugin root (verifies the `sdd` plugin is correctly installed under `~/.claude/plugins/cache/`).
4. **Plugin enabled** — `sdd` appears in `~/.claude/settings.json` under `enabledPlugins` (or equivalent).
5. **`.claude/capabilities.md`** — exists and lists specialist agents + skills + task type routing.
6. **`.claude/settings.json`** — PostToolUse hooks for typecheck + lint configured and pointing at the plugin's hook scripts.
7. **Git + gh** — repository initialized, `git status` clean, `gh auth status` ok.
8. **Tooling auto-detect** — if `package.json` is present: `tsc`, `eslint`, `vitest`/`jest` installed; if `pyproject.toml`: `mypy`, `ruff`, `pytest`.
9. **Specialist agents available** — `storybook-tester`, `nextjs-backend-engineer`, `testing-strategist` (or others) discoverable in the plugin marketplace.
10. **Project type detection** — detects the project type (nextjs / react / node / python / other) and shows which specialist agents/skills will be routed to.

> **Commands and verification agents are no longer per-project**: they live in the plugin (`commands/`, `agents/` at the plugin root). Once the plugin is installed (checks 3 + 4 pass), Claude Code auto-discovers all 9 slash commands and 4 SDD agents in every project.

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

# init (copy templates into the current project)
python3 "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/cache/sdd}/skills/doctor/init.py"
```

`check.py` returns JSON on stdout:

```json
{
  "status": "READY" | "PARTIAL" | "NOT_READY",
  "checks": [
    {"id": 1, "name": "CLAUDE.md", "status": "pass" | "warn" | "fail", "message": "..."},
    ...
  ],
  "stack": {"framework": "nextjs", "language": "typescript", ...}
}
```

### 3. Format the report for the user

Render a Markdown table with the 10 checks, each row showing its status (✅/⚠️/❌) and a short message. End with the overall status and suggested next steps:

- READY → "You can run `/sdd:spec feat <description>`"
- PARTIAL → "Run `/sdd:doctor init` to fill in the missing per-project files"
- NOT_READY → "If checks 3 or 4 fail, install the plugin first: `claude plugin install https://github.com/janszewczyk/sdd-plugin`. Otherwise run `/sdd:doctor init`."

### 4. Init mode — what happens

The `init.py` script:

1. Resolves the plugin root via `$CLAUDE_PLUGIN_ROOT` or by walking up from its own `__file__`.
2. Copies `<plugin>/skills/doctor/templates/CLAUDE.md.template` → `<project>/CLAUDE.md` (skipped if already exists — never overwrites user content).
3. Copies `<plugin>/skills/doctor/templates/specs/_template.md` → `<project>/specs/_template.md` (skipped if exists).
4. Renders `.claude/capabilities.md` by scanning `~/.claude/plugins/cache/<plugin>/{skills,agents}/` for installed capabilities, plus detecting stack from `package.json` / `pyproject.toml`. **Preserves** every `<!-- user-override -->` section from any existing file.
5. Renders `.claude/settings.json` from the bundled `settings.json.template`, substituting `${PLUGIN_ROOT}` with the absolute plugin path so the PostToolUse hooks resolve to `<plugin>/hooks/typecheck.py` and `<plugin>/hooks/lint.sh`.

## Output report — format

```markdown
# SDD Readiness Report

**Status:** ⚠️ PARTIAL (8/10 checks passed)
**Stack detected:** Next.js 15 + TypeScript strict + Vitest

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | CLAUDE.md exists & valid | ✅ | 1.2k tokens |
| 2 | specs/_template.md | ✅ | all fields present |
| 3 | Plugin installed | ✅ | sdd@0.2.0 at ~/.claude/plugins/cache/sdd |
| 4 | Plugin enabled | ✅ | listed in user settings |
| 5 | .claude/capabilities.md | ✅ | 4 specialist agents, 12 skills |
| 6 | .claude/settings.json hooks | ❌ | no PostToolUse hooks |
| 7 | Git + gh | ✅ | clean tree, gh ok |
| 8 | Tooling (TS/lint/test) | ✅ | node_modules present |
| 9 | Specialist agents (plugin) | ✅ | storybook-tester, nextjs-backend-engineer |
| 10 | Project type | ✅ | nextjs detected |

## Next steps
- Run `/sdd:doctor init` to fix check 6 (regenerates settings.json with plugin hook paths)
```
