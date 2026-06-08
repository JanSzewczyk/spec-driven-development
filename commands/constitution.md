---
description: Edit project constitution (CLAUDE.md — tech stack, conventions, WHAT NOT TO DO)
argument-hint: "(none — opens CLAUDE.md for editing)"
allowed-tools: Read, Edit
---

Edit `CLAUDE.md` at the project root — the "constitution" that Claude reads on every session.

## Steps

### 1. Read `CLAUDE.md` and count tokens

```bash
wc -c CLAUDE.md  # rough estimate: ~4 chars per token
```

Display to the user:
- The current content
- Estimated tokens vs the 2,500 limit

### 2. Propose edits

Help the user fill in or update the following sections:

1. **Tech stack** — runtime versions, framework, DB
2. **Run/build commands** — `dev`, `build`, `test`, `typecheck`, `lint`
3. **Architecture** — one-liner
4. **Code conventions** — a short list (lint should enforce the rest)
5. **WHAT NOT TO DO** — THE most important section. Capture SPECIFIC anti-patterns with concrete examples.

### 3. After editing — check the limit

If the file exceeds 2,500 tokens:
- Propose **sharding** per module: `apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`
- The root `CLAUDE.md` should contain only cross-cutting concerns

## Constraints

- ✅ `CLAUDE.md` under 2,500 tokens (the supported limit)
- ✅ The "WHAT NOT TO DO" section is mandatory — append a lesson here after every Claude mistake
- ⛔ DO NOT put change history / changelog / architectural decisions here (those belong in `docs/`)
