---
name: sdd-doctor
description: Preflight audit of project readiness for the SDD framework. Runs 10 checks (CLAUDE.md, specs/_template.md, commands, agents, hooks, capabilities.md, git, gh, tooling, project type). The `init` mode generates every missing file in one go. The `fix <id>` mode repairs a specific check. Use this skill when the user asks "is my project SDD-ready", "set up SDD", "configure SDD", "why doesn't /spec work", "init SDD framework", or otherwise indicates they want to start using Spec-Driven Development.
---

# SDD Doctor

Audit and auto-setup for the Spec-Driven Development framework on a project.

## Modes

| Mode | What it does | When to use |
|------|--------------|-------------|
| `check` (default) | Report only — 10 checks with statuses ✅/⚠️/❌ | Sanity check, audit |
| `init` | Generate ALL missing files + populate `capabilities.md` (auto-detect installed plugins + stack detection) | First-time install in a project |
| `fix <N>` | Repair a specific check by number (e.g. `fix 6` adds hooks) | Targeted repair |

## What it checks (10 checks)

1. **`CLAUDE.md`** at the project root — exists, under 2,500 tokens, contains the sections Tech stack / Run-build / Conventions / **WHAT NOT TO DO**.
2. **`specs/_template.md`** — exists with all required fields (Summary, User stories, Acceptance criteria, Edge cases, Open questions, Testing guidelines).
3. **`.claude/commands/`** — all 9 commands present: `sdd-doctor`, `constitution`, `spec`, `clarify`, `plan`, `tasks`, `implement`, `review`, `analyze`.
4. **`.claude/agents/`** — the generic SDD agents present: `sdd-spec-guard`, `sdd-drift-detector`, `sdd-reviewer`, `sdd-ui-critic`.
5. **`.claude/capabilities.md`** — exists and lists specialist agents + skills + task type routing.
6. **`.claude/settings.json`** — PostToolUse hooks for typecheck + lint configured.
7. **Git + gh** — repository initialized, `git status` clean, `gh auth status` ok.
8. **Tooling auto-detect** — if `package.json` is present: `tsc`, `eslint`, `vitest`/`jest` installed; if `pyproject.toml`: `mypy`, `ruff`, `pytest`.
9. **Specialist agents available** — `storybook-tester`, `nextjs-backend-engineer`, `testing-strategist` (or others) discoverable in the plugin marketplace.
10. **Project type detection** — detects the project type (nextjs / react / node / python / other) and shows which specialist agents/skills will be routed to.

## How to operate (instructions for Claude)

When this skill is activated:

### 1. Identify the mode

Extract intent from the user message:
- "check" / "audit" / "is ready" / "what's missing" → mode **check**
- "init" / "setup" / "create" / "generate" / "configure" → mode **init**
- "fix N" (where N is a number) → mode **fix**

Default: **check**.

### 2. Invoke the Python helper

All checks and auto-fix logic live in scripts next to this file:

```bash
# check
python3 .claude/skills/sdd-doctor/check.py

# init (auto-detect + generate all missing)
python3 .claude/skills/sdd-doctor/init.py

# fix a specific check
python3 .claude/skills/sdd-doctor/init.py --fix <N>
```

`check.py` returns JSON on stdout:

```json
{
  "status": "READY" | "PARTIAL" | "NOT_READY",
  "checks": [
    {"id": 1, "name": "CLAUDE.md", "status": "pass" | "warn" | "fail", "message": "..."},
    ...
  ],
  "stack": {"framework": "nextjs", "type": "typescript", ...}
}
```

### 3. Format the report for the user

Render a Markdown table with the 10 checks, each row showing its status (✅/⚠️/❌) and a short message about what is wrong. End with the overall status and suggested next steps:

- READY → "You can run `/spec feat <description>`"
- PARTIAL → "Run `/sdd-doctor fix <N>` for the missing checks OR `/sdd-doctor init` to regenerate everything"
- NOT_READY → "Run `/sdd-doctor init` to generate the missing skeleton"

### 4. Init mode — auto-detect details

The `init.py` script:

1. Scans `~/.claude/settings.json` → `enabledPlugins`.
2. Iterates over `~/.claude/plugins/cache/<plugin>/{skills,agents}/` to find available capabilities (reads frontmatter `name` and `description`).
3. Detects the stack from `package.json` / `pyproject.toml` / `Cargo.toml`.
4. Generates `.claude/capabilities.md` with 4 sections: Specialist agents, Skills, Stack profile, Task type routing rules. **Preserves** every section marked `<!-- user-override -->`.
5. Copies any missing files from its template bundle (the same files that live in the sdd-template repo).
6. Updates `.claude/settings.json` so PostToolUse hooks run the typecheck/lint appropriate for the detected stack.

## Output report — format

```markdown
# SDD Readiness Report

**Status:** ⚠️ PARTIAL (8/10 checks passed)
**Stack detected:** Next.js 15 + TypeScript strict + Vitest

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | CLAUDE.md exists & valid | ✅ | 1.2k tokens |
| 2 | specs/_template.md | ✅ | all fields present |
| 3 | .claude/commands/ (9 files) | ⚠️ | missing: analyze.md |
| 4 | .claude/agents/ (4 generic) | ✅ | |
| 5 | .claude/capabilities.md | ✅ | 4 specialist agents, 12 skills |
| 6 | .claude/settings.json hooks | ❌ | no PostToolUse hooks |
| 7 | Git + gh | ✅ | clean tree, gh ok |
| 8 | Tooling (TS/lint/test) | ✅ | tsc, eslint, vitest |
| 9 | Specialist agents (plugin) | ✅ | storybook-tester, nextjs-backend-engineer |
| 10 | Project type | ✅ | nextjs detected |

## Next steps
- `/sdd-doctor fix 3 6` — fill in analyze.md + hooks
- OR `/sdd-doctor init` — full regeneration
```
