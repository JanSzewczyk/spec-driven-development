---
title: Agents
description: "The three sub-agents: two verify, one surveys."
---

Agents are invoked through the Agent tool by commands, never directly by you. Implementation is whatever flow you configure.

## spec-verifier

One read of the feature diff against the documentation: every acceptance criterion (met or unmet with evidence), non-goal violations, out-of-scope changes, drift between `spec.md`, `plan.md`, `tasks.md` and code, and the completeness of each task. Runs on Sonnet.

**Called by** [`/sdd:review`](/spec-driven-development/commands/review/) and [`/sdd:analyze`](/spec-driven-development/commands/analyze/). **Output:** JSON.

```json
{
  "satisfied": true,
  "ac": [{"id": "AC1", "status": "met", "evidence": "src/auth/reset.py:42"}],
  "non_goal_violations": [],
  "out_of_scope": [{"file": "src/Header.tsx", "summary": "unrelated logo change"}],
  "drift": [{"layer": "plan→tasks", "detail": "plan.md L67 names packages/sms/twilio.ts, no task creates it"}],
  "tasks": [{"id": "T1", "status": "complete", "unmet_ac": []}]
}
```

It never writes code, never suggests fixes and never judges code quality (that is `reviewer`'s job).

## reviewer

Final quality audit before the PR. Decides READY or NOT READY. Runs on Opus.

**Called by** `/sdd:review`, which passes the test results and the `spec-verifier` and extra-check results. It does not re-run the suite or start sub-agents itself.

1. Reads the test results (any failure means NOT READY).
2. Checks coverage against the targets in constitution §6.
3. Checks the diff against every **WHAT NOT TO DO** rule, one line per rule.
4. Runs the audit skills configured for each touched project, or with `auto` picks the ones the session has for its stack.
5. Writes `specs/<slug>/review.md` with the verdict.

It never returns READY if a test fails, `spec-verifier` is not satisfied, an extra check failed, or a critical security or accessibility violation exists.

**Output:** JSON `{verdict: "READY" | "NOT_READY", blockers: [...], warnings: [...]}`.

## codebase-surveyor

Read-only map of the projects a feature touches, so `/sdd:plan` reuses what exists: structure, naming and test conventions, and code to reuse with paths. At most 30 lines per run; says "none found" instead of guessing. Runs on Haiku.

**Called by** [`/sdd:plan`](/spec-driven-development/commands/plan/) with the spec's Summary, acceptance criteria and the affected projects. **Output:** Markdown, per project: `Structure`, `Conventions`, `Reuse` (`path`: what it does).

:::tip
Visual or functional checks of the running app (a QA or UI agent) are yours: add them to `review.checks`.
:::
