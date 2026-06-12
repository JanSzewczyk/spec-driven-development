---
description: Edit the project constitution at specs/_constitution.md (full long-form rules with rationale)
argument-hint: "(none — opens specs/_constitution.md for editing)"
allowed-tools: Read, Edit, Bash
---

Edit `specs/_constitution.md` — the source-of-truth constitution for this project. This is the long-form
document where every rule carries its *Why*. `CLAUDE.md` at the project root is a separate, independent
session loader for Claude Code — **DO NOT modify `CLAUDE.md`** from this command.

If `specs/_constitution.md` does not exist yet, instruct the user to run `/sdd:doctor init` first
(it bootstraps the constitution and, when applicable, migrates content from an existing legacy
`CLAUDE.md`).

## Steps

### 1. Verify constitution exists

```bash
test -f specs/_constitution.md && echo present || echo MISSING
```

If missing → STOP. Tell the user: "Run `/sdd:doctor init` first to bootstrap `specs/_constitution.md`."

### 2. Read constitution + reference CLAUDE.md for context

```bash
wc -l specs/_constitution.md
```

Read the full file so you have its current state in context. You MAY also read `CLAUDE.md` to
understand what the operational loader currently surfaces, but DO NOT edit it here.

### 3. Propose edits

Help the user fill in or update the canonical sections:

1. **Tech stack** — runtime versions, framework, DB, tests, lint. Include the *Why this stack* paragraph.
2. **Run/build commands** — `dev`, `build`, `test`, `typecheck`, `lint`; document non-obvious flags.
3. **Architecture** — one paragraph + Mermaid diagram. The *Boundaries we maintain* list is the high-value piece.
4. **Code conventions** — short list + concrete good/bad code examples from the repo.
5. **WHAT NOT TO DO ⛔** — every entry MUST include a `**Why:**` line and (when available) `**Incident:**` reference. Without rationale, rules rot.
6. **Testing philosophy** — split between logic (strict TDD) and UI (contract-first TDD).
7. **Error handling philosophy** — typed errors, no silent catches, expected vs unexpected.
8. **Out of scope** — explicit non-goals. Protects future contributors.

### 4. Length is fine

Unlike `CLAUDE.md`, the constitution has no 2,500-token limit. Be specific and complete.
If you need a paragraph to explain *why* a rule exists, write the paragraph.

### 5. Output

Show the user:
- ✅ Edited: `specs/_constitution.md`
- 💡 Reminder: if you changed information that should also surface in `CLAUDE.md` (the loader), update `CLAUDE.md` separately. The two files are intentionally decoupled.

## Constraints

- ✅ Primary target is `specs/_constitution.md`. Always.
- ✅ Every "WHAT NOT TO DO" entry should carry its rationale.
- ⛔ DO NOT modify `CLAUDE.md` from this command. It is a separate, user-owned operational loader.
- ⛔ DO NOT put changelog / ADR-style history here — that belongs in `docs/adr/` or `CHANGELOG.md`.
- ⛔ DO NOT remove the `<!-- MIGRATED:* -->` markers if they are still present — they are how `/sdd:doctor init` re-seeds content on a future migration.
