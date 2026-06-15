---
description: Edit the project constitution at specs/constitution.md (full long-form rules with rationale)
argument-hint: "(none — opens specs/constitution.md for editing)"
allowed-tools: Read, Edit, Bash, Glob
---

Edit `specs/constitution.md` — the source-of-truth constitution for this project. This is the long-form
document where every rule carries its *Why*. This command operates only on `specs/constitution.md`.

If `specs/constitution.md` does not exist yet, instruct the user to run `/sdd:doctor init` first
(it bootstraps the constitution from the bundled template).

## Steps

### 1. Verify constitution exists

```bash
test -f specs/constitution.md && echo present || echo MISSING
```

If missing → STOP. Tell the user: "Run `/sdd:doctor init` first to bootstrap `specs/constitution.md`."

### 2. Discover project Claude roles (read-only context)

Before proposing any edits, scan `.claude/roles/` for project-defined Claude roles. These are the
team's authoritative descriptions of the specialist personas Claude takes on in this codebase
(e.g. `backend-engineer.md`, `frontend-reviewer.md`, `qa-strategist.md`), and they almost always
carry the operational truths that must be reflected in the constitution — the stack they assume,
the commands they run, the conventions they enforce, the things they refuse to do.

```bash
# List every role definition the project ships
ls -1 .claude/roles/*.md 2>/dev/null
```

If `.claude/roles/` does not exist or is empty → skip this step and proceed to §3; note in the
final output that no project roles were discovered.

For every role file found, `Read` it once. Build a mental map keyed by role:

- **Stack the role assumes** (Runtime / Framework / DB / Tests / Lint) → feed into constitution §1.
- **Commands the role runs** (`dev`, `build`, `test`, `typecheck`, `lint`, deploy, migrations) → feed into constitution §2.
- **Boundaries / responsibilities** ("owns X, never touches Y") → feed into constitution §3 (Architecture → *Boundaries we maintain*).
- **Conventions enforced** (naming, commit style, error handling, file layout) → feed into constitution §4.
- **"WHAT NOT TO DO" / refusals** the role declares → feed into constitution §5. Each one needs a
  `**Why:**` — if the role file does not give a reason, surface a question to the user rather than
  inventing one.
- **Testing posture** (TDD strictness, coverage thresholds, what the role does *not* test) → feed into constitution §6.
- **Error handling stance** → feed into constitution §7.

When several roles cover the same area, deduplicate before drafting — but preserve role attribution
in your working notes so you can ask the user the right question when they contradict each other.

⛔ **Never modify role files.** They are user-owned. The constitution is the only output target.

### 3. Read constitution

```bash
wc -l specs/constitution.md
```

Read the full file so you have its current state in context. With both the constitution and the
`.claude/roles/` files in context, you can compare what's already canonised against what the roles
assert — surfacing duplicates, contradictions, and gaps role-by-role.

### 4. Propose edits

Help the user fill in or update the canonical sections, integrating discovered context from step 2:

1. **Tech stack** — runtime versions, framework, DB, tests, lint. Include the *Why this stack* paragraph. **If `.claude/roles/` files already pin a stack, pre-fill from them and ask the user to confirm rather than asking from scratch.**
2. **Run/build commands** — `dev`, `build`, `test`, `typecheck`, `lint`; document non-obvious flags. **Lift these verbatim from role files when they appear there.**
3. **Architecture** — one paragraph + Mermaid diagram. The *Boundaries we maintain* list is the high-value piece — fold in each role's stated ownership and "never touches" lines.
4. **Code conventions** — short list + concrete good/bad code examples from the repo. **Cross-check against the conventions roles enforce; raise contradictions explicitly.**
5. **WHAT NOT TO DO ⛔** — every entry MUST include a `**Why:**` line and (when available) `**Incident:**` reference. **For every "DO NOT" rule pulled from a role file without a stated reason, ask the user for the rationale instead of guessing.**
6. **Testing philosophy** — the two technology-neutral TDD shapes (test-first by default; contract-first only when the unit's deliverable is itself a public interface/contract other code references by shape). Reconcile with each role's testing posture.
7. **Error handling philosophy** — typed errors, no silent catches, expected vs unexpected.
8. **Out of scope** — explicit non-goals. Protects future contributors.

When two roles, or a role and the existing constitution, **contradict** each other (e.g. role A says
"use npm", role B says "use pnpm"; or a role says "skip type-check on `.test.ts`" while the
constitution says "type-check everything"), STOP and surface the conflict — quote the offending
files/lines. Do NOT silently pick a winner. Let the user decide which is authoritative; then update
the constitution accordingly. Role files stay as-is — if the user wants to also align them, that's
a separate manual step they own.

### 5. Length is fine

The constitution has no token limit. Be specific and complete. If you need a paragraph to explain
*why* a rule exists, write the paragraph.

### 6. Output

Show the user:
- ✅ Edited: `specs/constitution.md`
- 📂 Roles consulted: `<list>` from `.claude/roles/` (or `none — .claude/roles/ absent`)
- ⚠️ Conflicts surfaced for the user to resolve (if any)
- ❓ Rules pulled from roles that still need a `**Why:**` from the user (if any)

## Constraints

- ✅ The ONLY write target is `specs/constitution.md`. Always.
- ✅ Every "WHAT NOT TO DO" entry should carry its rationale.
- ✅ Treat every file under `.claude/roles/` as **read-only input** — discover them, read them, fold
  their content into the proposed edits.
- ⛔ DO NOT modify any file under `.claude/roles/`. They are user-owned; the user keeps them in sync
  manually.
- ⛔ DO NOT modify the project-root `CLAUDE.md` or any per-module `CLAUDE.md`. They are likewise
  user-owned and outside this command's write scope.
- ⛔ DO NOT put changelog / ADR-style history here — that belongs in `docs/adr/` or `CHANGELOG.md`.
- ⛔ DO NOT invent rationale (`**Why:**`) for a rule you pulled from a role. Ask the user.
