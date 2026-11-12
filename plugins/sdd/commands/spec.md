---
description: Create a feature spec, branch, and skeleton files (SDD step 1)
argument-hint: "<type> <short description>  # type: feat|fix|chore|refactor|docs"
allowed-tools: Read, Write, Bash, Skill, Agent
---

Invoke the **Specify** phase of Spec-Driven Development. Execute the steps in order. Write only the
business specification: no implementation code, no frameworks or libraries.

## Argument

`$ARGUMENTS` — `<type> <description>`: `<type>` ∈ {`feat`, `fix`, `chore`, `refactor`, `docs`}
(default `feat` when omitted), `<description>` a short feature description (1-10 words).

## Steps

### 1. Branch

Create a git branch for this feature with the `branch` action from `## Actions` in
`specs/capabilities.md` (`skill:` / `agent:` / `command:`; give it the type and the description).
Unset → use a branch-creating skill the session has, else run `git checkout -b <type>/<slug>`
(`slug`: kebab-case, `[a-z0-9-]`, max 50 chars). Then read the real name:

```bash
git branch --show-current
```

`feature_slug` = that name without the `<type>/` prefix. Only this repository (the **spec repo**,
where `specs/` lives) gets the branch now; when `specs/capabilities.md` lists projects in sibling
repositories, `/sdd:implement` creates the same branch name there when it first edits that repo.

### 2. Folder + spec

`feature_title` = the description in Title Case. Substitute the placeholders with `sed`, do not
read the template into context:

```bash
mkdir -p specs/<feature_slug>
sed -e 's|{{feature_title}}|<feature_title>|g' -e 's|{{feature_slug}}|<feature_slug>|g' \
    -e 's|{{type}}|<type>|g' -e "s|{{author}}|$(git config user.name)|g" \
    -e "s|{{date}}|$(date +%F)|g" \
    -e 's|^\*\*Branch:\*\*.*|**Branch:** <branch>|' \
    specs/template.md > specs/<feature_slug>/spec.md
```

Then edit only the **Summary** section: ONE business-level sentence from the description. Leave the
other sections empty (filled manually or by `/sdd:clarify`).

### 3. Output

- ✅ Branch `<branch>` · Spec `specs/<feature_slug>/spec.md`
- 👉 Next: edit the spec, or `/sdd:clarify` to have AI ask gap questions.

Do not commit — `/sdd:review` does.
