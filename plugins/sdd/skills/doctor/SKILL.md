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
`init`: follow [references/init.md](references/init.md) — load it only for `init`, and start with a task list of its steps (roots and findings, discover, seed, capabilities, sibling repos, epic ids, CI workflow, re-check) kept current. Seed files it copies: [constitution](templates/constitution.md.template), [capabilities](templates/capabilities.yml.template), [spec template](templates/specs/template.md), [sdd-check workflow](templates/sdd-check.yml.template).

## `check`

Read-only. Call the `mcp__sdd__doctor_check` tool (add `offline: true` when the user says there is
no network): it returns JSON `{status, passed, total, projects, checks: [{id, name, status, summary,
findings: [{level, text, fix?}]}]}` for the 7 checks of [references/formats.md](${CLAUDE_PLUGIN_ROOT}/references/formats.md).
Render it as the report below.

Tool not available (mods are off: `--safe-mode`, `disableAllHooks`, WSL, Claude Code older than
2.1.287) → run the same 7 checks yourself from that reference, batching the shell probes (git, gh,
`which`) into one or two Bash calls, and say in the report that the check ran without the tool.

### Report

```markdown
# 🩺 SDD Readiness Report

> **⚠️ PARTIAL** · 5/7 checks passed · `▰▰▰▰▰▱▱`
> **Projects:** `web` Next.js 15, TS, Vitest (pnpm) · `api` FastAPI (uv)

| # | Check | Status | Result |
|:-:|-------|:------:|--------|
| 1 | `specs/constitution.md` | ✅ | sections and commands table present |
| 2 | `specs/template.md` | ✅ | sections and placeholders present |
| 3 | `specs/capabilities.yml` | ⚠️ | 2 findings |
| 4 | Git + gh | ✅ | repository present |
| 5 | Tooling | ⚠️ | 1 finding |
| 6 | Sibling repositories | ✅ | no sibling repositories |
| 7 | Feature specs | ✅ | 2 feature(s) valid |

## Findings

**3 · `specs/capabilities.yml`**
- ⚠️ `format` is 2, this version writes 3 · 🔧 init
- ⚠️ `review.ci` is not set · 🔧 init

**5 · Tooling**
- ⚠️ api: `uv` not found · ✋ manual

## Next steps
1. `/sdd:doctor init` repairs: format, `review.ci`
2. Install `uv` for `api`
```

- **Header:** the tool's `status` as ✅ READY / ⚠️ PARTIAL / ❌ NOT READY, `passed/total`, and a bar
  of `total` cells, `▰` per passed check and `▱` per other.
- **Table:** all checks, in id order, whatever their status. Status: ✅ pass, ⚠️ warn, ❌ fail.
  Result: the check's `summary` when it passed, `N finding(s)` otherwise. Use the check's `name`
  as the tool returns it.
- **Findings:** only for checks that did not pass, one bold `<id> · <name>` line and one bullet
  per finding — level icon, text, then `🔧 init` (`fix: "init"`, repaired by `/sdd:doctor init`)
  or `✋ manual` (the user has to change it). Omit the section when every check passed.
- **Next steps:** numbered. All `init` fixes in one item ("`/sdd:doctor init` repairs: …"), then
  one item per manual fix. READY → the only step is `/sdd:spec feat <description>`.
- Ran without the tool → add `> Ran without the doctor_check tool (<reason>).` under the header.
