---
description: Generate the architectural plan from the spec (SDD step 3) — run in Plan Mode
argument-hint: "(optional path to spec.md)"
allowed-tools: Read, Write, Edit, Glob, Grep, Task, AskUserQuestion, ExitPlanMode, Bash(git branch:*)
---

The **Plan** phase of SDD. Produce `plan.md`: the architectural and technical **decisions** and the
**scope** of the change. No code.

Run it in **Plan Mode**: the plan is drafted in the session's plan file and the `ExitPlanMode`
approval is the human review — `specs/<slug>/plan.md` is written only after you approve it. Without
Plan Mode the command writes `plan.md` directly and stops for you to read and edit it.

## Steps

### 1. Load context

- `specs/constitution.md` (stack, commands, conventions, WHAT NOT TO DO)
- `specs/capabilities.md`, only the `## Projects` section
- the spec: `$ARGUMENTS`, else the `specs/*/spec.md` whose `**Branch:**` equals
  `git branch --show-current` (none → list the specs and ask); its folder is `specs/<current>/`

### 2. Survey the codebase

Spawn a `Explore` subagent aimed at the paths of the affected projects. It returns a summary of at
most ~30 lines: structure and naming patterns, and existing code to **reuse** (with paths). Nothing
else enters the main context.

If `spec.md` links reference sources (mockups, an OpenAPI/protocol spec, ADRs, schemas), extract
them **once, in a subagent**, and return only what the plan needs; cache that in the plan's
*Reference sources* section so later phases do not re-pull the raw material.

### 3. Decide

Where there is a real fork (two sound approaches, a contract shape, a build-vs-reuse choice), ask
1-3 questions with `AskUserQuestion` — your recommendation first — before drafting. Do not park
decisions in *Open questions* that the user can make now.

### 4. Write the plan

The plan carries **decisions and scope, not description**: do not restate the spec or the
constitution, no code, one line per file. Sections (Contracts only when something is shared):

```markdown
# Plan: <feature_title>

**Spec:** `specs/<slug>/spec.md`
**Status:** draft

## High-level approach
<1-2 paragraphs: what is built and the key architectural/technical decisions, each with its reason
and the alternative rejected>

## Contracts
<only when projects or layers share one: schema, API, shared type, generated client, migration —
shape and who provides/consumes it>

## File-by-file change list
### <project> (<kind> · <path>)
- `<path>` — <why> (reuses `<existing code>`) [**contract** when others consume it]
<!-- Group by project from `## Projects` (one group, `root`, in a single-app repo). One line per
     file, tests included. /sdd:tasks turns this into tasks and orders contracts first. -->

## Risks & mitigations
- **Risk** … **Mitigation** …

## Open questions for human review
- …
```

Optional, only when they clarify the change: **Data model** (ER diagram when the schema changes),
**Component diagram** (flowchart when the change spans several components or projects), **API
surface** (table), **Testing** (test layers and where tests live, per project, when the
constitution does not settle it), **Reference sources** (from step 2). Diagrams are Mermaid. Keep the heading
`Open questions` as is — the board counts its bullets.

### 5. Review, save, advance

**Plan Mode:** write the complete plan into the plan file Plan Mode names, call `ExitPlanMode`
(rejected with feedback → revise and call again), and once approved write the content **verbatim** to
`specs/<current>/plan.md`. Approval means "save the plan", not "build it" — stop there.
**No Plan Mode:** write `specs/<current>/plan.md` and stop for the user to read and edit it.

Then set `**Status:**` in `spec.md` to `planned` (unless already later). Report the path and the
next step: `/sdd:tasks` (best after `/clear`; it re-reads `plan.md` from disk).

## Constraints

- Write only `plan.md` (plus the Plan Mode plan file while drafting).
- Do not start implementing — that is `/sdd:tasks` + `/sdd:implement`.
