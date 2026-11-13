---
name: retro
description: Turn the lessons of a reviewed feature into WHAT NOT TO DO rules in the constitution (SDD, after /sdd:review)
allowed-tools: Read, Edit, Glob, AskUserQuestion, Bash(git branch:*)
argument-hint: "(optional path to review.md)"
disable-model-invocation: true
---

# SDD Retro

The **Retro** step of SDD: after `/sdd:review`, capture what went wrong as rules in
`specs/constitution.md` §5 (WHAT NOT TO DO), so the next feature does not repeat it. It writes
only that section.

## Steps

### 1. Load

- `review.md` of the feature: `$ARGUMENTS`, else the `specs/*/spec.md` whose `**Branch:**` equals
  `git branch --show-current`, in its folder (none → list the specs and ask). No `review.md` →
  STOP: "Run `/sdd:review` first."
- `specs/constitution.md` §5 (missing → STOP: "Run `/sdd:doctor init` first.").

### 2. Find lessons

From `review.md` take: blockers and warnings, constitution rules marked violated, items under
`## Accepted`, drift and out-of-scope findings, and failing audits. A lesson is a **repeatable
mistake** another feature could make again — not a one-off bug in this diff.

Drop a lesson that §5 already covers (same rule in other words). No lessons left → say so in one
line and stop.

### 3. Draft the entries

One entry per lesson, in the constitution's format:

```markdown
### DO NOT <what>

**Why:** <the reason: incident, trade-off, upstream constraint>

**Incident:** <feature slug> — <date> — <what happened, one line>
```

`**Why:**` must come from `review.md` or the user. Never invent a reason: where `review.md` gives
none, ask for it.

### 4. Confirm and write

`AskUserQuestion` (multi-select, up to 4 per call): which entries to add; for an entry without a
reason, the question is the reason. Append the chosen entries to §5 with Edit, after the existing
ones. A rule that contradicts an existing §5 entry → show both and let the user decide.

### 5. Output

- ✅ Added: <titles> to `specs/constitution.md` §5
- ⏭️ Skipped: <titles, and why>

## Constraints

- The only write target is `specs/constitution.md`, section 5.
- Do not touch `review.md`, the root `CLAUDE.md` or any other file.
