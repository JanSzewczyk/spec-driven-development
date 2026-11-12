---
name: doctor
description: Audit (`check`) or set up (`init`) a project for the SDD framework — constitution, spec template, capabilities. Use for "is my project SDD-ready", "set up SDD", "why doesn't /sdd:spec work".
argument-hint: "check | init"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
---

# SDD Doctor

LLM-driven: you run every check and file operation yourself — no helper scripts.

## Two roots

| Root | Resolve | Holds |
|------|---------|-------|
| **Project root** | your cwd (`pwd`) | `specs/`, `.claude/`, manifests, the git repo — **all artifacts are written here** |
| **Plugin root** | `${CLAUDE_PLUGIN_ROOT}` | `templates/`, `reference/` — **read-only** |

## Modes

Mode comes from the user message: `check` (default; "audit", "is ready") reports only;
`init` ("setup", "create", "fix") creates or repairs artifacts, then runs `check`.
`init`: follow `${CLAUDE_PLUGIN_ROOT}/skills/doctor/reference/init.md` — load it only for `init`.

## `check`

Read-only. Batch the shell probes (git, gh, tool lookups) into one or two Bash calls. Status per
check: `pass` ✅ / `warn` ⚠️ / `fail` ❌.

1. **`specs/constitution.md`** — exists with sections Tech stack, Run/build, Conventions, WHAT NOT
   TO DO. Missing → fail; sections missing → warn. A project in the §2 table without a `test`
   command → warn, naming it (fix via `/sdd:constitution`). A legacy §2 `Command | Purpose` list
   counts as project `root`.
2. **`specs/template.md`** — exists with Summary, User stories, Acceptance criteria, Edge cases,
   Open questions, Testing guidelines. Missing → fail; partial → warn.
3. **`specs/capabilities.md`** — exists with `Projects` (legacy `Stack profile`), `Implementation`
   and `Generated / out-of-band paths`. Missing → fail; a section missing → warn, suggest `init`.
   A project in `Projects` but not in constitution §2 (or reverse) → warn.
4. **Git + gh** — `.git` exists; `git status --porcelain` clean; `gh` on PATH and
   `gh auth status` ok. Dirty tree or no gh → warn.
5. **Tooling** — per project in `Projects`: its path exists and the executables of its §2
   commands resolve (e.g. `node_modules` present, `uv`/`ruff`/`pytest` reachable). Missing → warn.

### Report

```markdown
# SDD Readiness Report

**Status:** ⚠️ PARTIAL (4/5 passed)
**Projects:** web — Next.js 15, TS, Vitest (pnpm) · api — FastAPI (uv)

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 5 | Tooling | ⚠️ | api: `uv` not found |

✅ 4 passed: 1, 2, 3, 4

## Next steps
- <one bullet per fix>
```

List only non-✅ rows plus a one-line summary of the passed ones.
Overall: `READY` (no warn/fail) / `PARTIAL` (warns or 1–2 fails) / `NOT_READY` (3+ fails).
Next step: READY → `/sdd:spec feat <description>`; otherwise `/sdd:doctor init`.
