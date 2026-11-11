---
description: AI asks gap questions about the current spec (SDD step 2)
argument-hint: "(optional path to spec.md)"
allowed-tools: Read, Edit
---

The **Clarify** phase of SDD. Your job is to actively probe gaps in the specification.
**Do not** generate code or a plan.

> 💰 **Recommended session model: Opus** — surfacing the right gap questions is judgement-heavy and
> saves far more downstream than it costs.

## Steps

### 1. Find the spec

Default to the most recently modified `specs/*/spec.md` OR the path from `$ARGUMENTS`.

Also check which branch is active:
```bash
git branch --show-current
```

If the branch name is `<type>/<slug>`, locate `specs/<slug>/spec.md`.

### 2. Ask 5-10 questions

Read the entire spec. For each section, ask 1-2 of the most important questions:

**Summary** — are the problem and target audience unambiguous?
**User stories** — are they complete? Any missing edge roles?
**Functional requirements** — is each requirement atomic and testable?
**Acceptance criteria** — does each AC have a clear input/output? Are they measurable?
**Edge cases** — what about: no network, race conditions, invalid input, concurrent users, rate limiting, third-party API errors?
**Non-goals** — what does this feature explicitly NOT do? (guards against scope creep)
**Open questions** — list everything ambiguous.
**Testing guidelines** — which test layers? What framework? Test data?
**Dependencies** — are there other features/services that must be ready first?

### 3. Output format

```markdown
## Clarify questions for `specs/<slug>/spec.md`

1. **<section>**: <question>?
2. **<section>**: <question>?
...

⏸️  Answer in this thread, then run `/sdd:clarify` again so I can update the spec.
OR use `/sdd:plan` if everything is clear.
```

### 4. After receiving answers (when the user continues the conversation)

Edit `spec.md`, filling in the gaps based on the answers. **Do not** delete existing content,
only append. Update the "Open questions" section — remove questions that were answered.

Then advance the document lifecycle: set the `**Status:**` header to `clarified` (only if it is
currently `draft`; never move it backwards from a later state).

## Constraints

- ⛔ DO NOT generate architecture / plan / code
- ⛔ DO NOT assume answers for the user — ask
- ✅ Concrete questions, NOT vague ones ("what do you think about this")
