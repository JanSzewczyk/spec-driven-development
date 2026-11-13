---
name: doctor
description: Audit (`check`) or set up (`init`) a project for the SDD framework — constitution, spec template, capabilities. Use when the user asks "is my project SDD-ready", wants to set up SDD, or `/sdd:spec` fails for a missing file.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, mcp__sdd__doctor_check
argument-hint: "check | init"
disable-model-invocation: true
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

Read-only. Call the `mcp__sdd__doctor_check` tool (add `offline: true` when the user says there is
no network): it returns JSON `{status, passed, total, projects, checks: [{id, name, status, summary,
findings: [{level, text}]}]}` for the 7 checks of [references/formats.md](${CLAUDE_PLUGIN_ROOT}/references/formats.md).
Render it as the report below.

Tool not available (mods are off: `--safe-mode`, `disableAllHooks`, WSL, Claude Code older than
2.1.287) → run the same 7 checks yourself from that reference, batching the shell probes (git, gh,
`which`) into one or two Bash calls, and say in the report that the check ran without the tool.

### Report

```markdown
# SDD Readiness Report

**Status:** ⚠️ PARTIAL (6/7 passed)
**Projects:** web — Next.js 15, TS, Vitest (pnpm) · api — FastAPI (uv)

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 5 | Tooling | ⚠️ | api: `uv` not found |

✅ 6 passed: 1, 2, 3, 4, 6, 7

## Next steps
- <one bullet per fix>
```

List only non-✅ rows (one line per finding in Detail) plus a one-line summary of the passed ones.
Overall status is the tool's `status`.
Next step: READY → `/sdd:spec feat <description>`; otherwise `/sdd:doctor init`.
