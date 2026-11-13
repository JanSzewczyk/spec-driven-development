---
description: AI finds gaps in the current spec, asks the questions and writes the answers (SDD step 2)
argument-hint: "(optional path to spec.md)"
allowed-tools: Read, Edit, Glob, AskUserQuestion, Bash(git branch:*)
---

The **Clarify** phase of SDD: find the gaps in the specification and close them with the user in
this one run. No code, no plan, no technology choices (frameworks, test layers belong to
`/sdd:plan` and the constitution).

## Steps

### 1. Find the spec

Use the path from `$ARGUMENTS`, else the `specs/*/spec.md` whose `**Branch:**` equals
`git branch --show-current`. If none matches, list `specs/*/spec.md` and ask which one — never
guess by "most recently modified".

### 2. Find the gaps

Read the whole spec. A section is a gap when it is empty (a fresh `/sdd:spec` skeleton has only the
Summary), ambiguous, not testable (an AC without a concrete input → output), or contradicts another.
Rank gaps by how much they would block `/sdd:plan`. On a skeleton that means: who uses it (user
stories), acceptance criteria, non-goals, then edge cases.

No real gaps → say so in one line, set `Status: clarified`, point to `/sdd:plan`, stop.

### 3. Ask, up to 5 questions

Ask about the most important gaps only, at most 5 per run. Use `AskUserQuestion`, up to 4
per call: each question gets your proposed answer as the first option ("Assumption: …") plus
alternatives; the user's free text is always possible. Questions without sensible options go in a
numbered list in the chat. Nothing is written to the spec before the user confirms it.

### 4. Write to the spec

- Put each answer into its section. Replace the template's placeholder lines (`AC1: given input X
  → produces output Y`, `AC2: ...`, `- ?`, `- ...`, `<role>`); keep everything else the user wrote.
- **Acceptance criteria ids are stable:** never renumber or reuse one — tasks, `spec-verifier` and
  the board refer to them. A new criterion takes the next unused number; a dropped one is removed
  and its number is never given out again.
- Questions the user could not answer now → bullets in **Open questions**, so they survive
  `/clear` and show in the board. Remove a bullet once answered.
- Set `**Status:**` to `clarified` when it is `draft` (never move it backwards).

### 5. Output

Answered / still open counts and the next step: `/sdd:clarify` again if gaps remain, else `/sdd:plan`.
