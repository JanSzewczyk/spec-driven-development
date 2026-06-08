---
description: Create a feature spec, branch, and skeleton files (SDD step 1)
argument-hint: "<type> <short description>  # type: feat|fix|chore|refactor|docs"
allowed-tools: Read, Write, Glob, Bash
---

Invoke the **Specify** phase of Spec-Driven Development. Execute the steps in order. DO NOT
write any implementation code — only the business specification.

## Argument

`$ARGUMENTS` — format: `<type> <description>`, where:
- `<type>` ∈ {`feat`, `fix`, `chore`, `refactor`, `docs`} (Conventional Commits)
- `<description>` — short feature description (1-10 words)

If `<type>` is omitted, default to `feat`.

## Steps

### 1. Validate git

```bash
git status --porcelain
```

If the output is non-empty → **STOP**. Ask the user to commit/stash current changes. Do not continue.

### 2. Parse the argument

Extract:
- `type` (first word if it is one of the allowed types, otherwise `feat`)
- `description` (the rest of the argument)
- `feature_slug` (from `description`, kebab-case, `[a-z0-9-]` only, max 50 chars)
- `feature_title` (from `description`, Title Case)

### 3. Branch

```bash
git checkout -b <type>/<feature_slug>
```

Examples:
- `feat/user-can-reset-password`
- `fix/stripe-webhook-timeout`
- `refactor/auth-service`

### 4. Folder + spec

```bash
mkdir -p specs/<feature_slug>/
```

Copy `specs/_template.md` → `specs/<feature_slug>/spec.md` and substitute the placeholders
`{{feature_title}}`, `{{feature_slug}}`, `{{type}}`, `{{author}}` (from `git config user.name`),
`{{date}}` (today).

Fill in the **Summary** section using the `description` argument — ONE business-level sentence.
Leave the other sections empty (the user will fill them via manual editing + `/clarify`).

### 5. Output

Show the user:
- ✅ Branch created: `<type>/<feature_slug>`
- ✅ Spec: `specs/<feature_slug>/spec.md`
- 👉 Next step: edit the spec manually OR run `/clarify` to have AI ask gap questions.

## Constraints

- ⛔ DO NOT write implementation code in `spec.md`
- ⛔ DO NOT add technical details (frameworks, libraries) — this is the business phase
- ⛔ DO NOT commit changes — that is done by `/review`
