---
name: constitution
description: Edit the project constitution at specs/constitution.md (full long-form rules with rationale)
allowed-tools: Read, Edit, Bash, Glob
argument-hint: "(none — opens specs/constitution.md for editing)"
disable-model-invocation: true
---

# SDD Constitution

Edit `specs/constitution.md` — the source-of-truth constitution for this project. This is the long-form
document where every rule carries its *Why*. This command operates only on `specs/constitution.md`.

> 💰 **Recommended session model: Opus** — reconciling conventions and rationale is
> judgement-heavy.

If `specs/constitution.md` does not exist yet, instruct the user to run `/sdd:doctor init` first
(it bootstraps the constitution from the bundled template).

## Steps

### 1. Verify constitution exists

```bash
test -f specs/constitution.md && echo present || echo MISSING
```

If missing → STOP. Tell the user: "Run `/sdd:doctor init` first to bootstrap `specs/constitution.md`."

### 2. Read constitution

Read the full file so you have its current state in context.

### 3. Propose edits

Help the user fill in or update the canonical sections:

1. **Tech stack** — runtime versions, framework, DB, tests, lint. Include the *Why this stack* paragraph.
2. **Run/build commands** — one row per project: `test`, `coverage`, `typecheck`, `lint`,
   `dev`; document non-obvious flags.
3. **Architecture** — one paragraph + Mermaid diagram. The *Boundaries we maintain* list is the high-value piece.
4. **Code conventions** — short list + concrete good/bad code examples from the repo.
5. **WHAT NOT TO DO ⛔** — every entry MUST include a `**Why:**` line and (when available) `**Incident:**` reference. If the user gives a rule without a reason, ask for the rationale instead of guessing.
6. **Testing philosophy** — the two technology-neutral TDD shapes (test-first by default; contract-first only when the unit's deliverable is itself a public interface/contract other code references by shape).
7. **Error handling philosophy** — typed errors, no silent catches, expected vs unexpected.
8. **Out of scope** — explicit non-goals. Protects future contributors.

When a requested change **contradicts** the existing constitution (e.g. "use npm" vs "pnpm only"),
STOP and surface the conflict — quote the offending lines. Do NOT silently pick a winner; let the
user decide, then update the constitution accordingly.

### 4. Length is fine

The constitution has no token limit. Be specific and complete. If you need a paragraph to explain
*why* a rule exists, write the paragraph.

### 5. Output

Show the user:
- ✅ Edited: `specs/constitution.md`
- ⚠️ Conflicts surfaced for the user to resolve (if any)
- ❓ Rules that still need a `**Why:**` from the user (if any)

## Constraints

- ✅ The ONLY write target is `specs/constitution.md`. Always.
- ✅ Every "WHAT NOT TO DO" entry should carry its rationale.
- ⛔ DO NOT modify the project-root `CLAUDE.md` or any per-module `CLAUDE.md`. Both are
  user-owned and outside this command's write scope.
- ⛔ DO NOT put changelog / ADR-style history here — that belongs in `docs/adr/` or `CHANGELOG.md`.
- ⛔ DO NOT invent rationale (`**Why:**`) for a rule. Ask the user.
