---
name: doctor
description: Audit (`check`) or set up (`init`) a project for the SDD framework — constitution, spec template, capabilities. Use when the user asks "is my project SDD-ready", wants to set up SDD, or `/sdd:spec` fails for a missing file.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "check | init"
---

# SDD Doctor

## Two roots

| Root | Resolve | Holds |
|------|---------|-------|
| **Repo root** | your cwd (`pwd`) | `specs/`, `.claude/`, manifests, the git repo — **all artifacts are written here** |
| **Plugin root** | `${CLAUDE_PLUGIN_ROOT}` | `templates/`, `references/` — **read-only** |

## Modes

Mode comes from the user message: `check` (default; "audit", "is ready") reports only;
`init` ("setup", "create", "fix") creates or repairs artifacts, then runs `check`.
`init`: follow [references/init.md](references/init.md) — load it only for `init`, and start with a task list of its steps (roots, discover, seed, capabilities, sibling repos, re-check) kept current. Seed files it copies: [constitution](templates/constitution.md.template), [capabilities](templates/capabilities.md.template), [spec template](templates/specs/template.md).

## `check`

Read-only. Batch the shell probes (git, gh, tool lookups) into one or two Bash calls. Status per
check: `pass` ✅ / `warn` ⚠️ / `fail` ❌.

1. **`specs/constitution.md`** — exists with sections Tech stack, Run/build, Conventions, WHAT NOT
   TO DO. Missing → fail; sections missing → warn. A project in the §2 table without a `test`
   command → warn, naming it (fix via `/sdd:constitution`). A legacy §2 `Command | Purpose` list
   counts as project `root`.
2. **`specs/template.md`** — exists with Summary, User stories, Acceptance criteria, Edge cases,
   Non-goals, Open questions. Missing → fail; partial → warn.
3. **`specs/capabilities.md`** — exists with `Projects` (legacy `Stack profile`), `Implementation`,
   `Actions`, `Review` and `Generated / out-of-band paths`. Missing → fail; a section missing → warn, suggest `init`.
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
