---
title: /sdd:analyze
description: Read-only drift check across spec, plan, tasks and code.
---

Diagnostic, run anytime. It runs `spec-verifier` once over the feature diff and reports in a few lines:

- acceptance criteria that are **met**, **pending** (their task is not implemented yet) or a **gap** (implemented, not covered),
- findings with `file:line` and the next command for each.

Useful mid-feature, after changing the spec, and before `/sdd:review`.

:::note
Read-only: it never edits files and runs no tests.
:::
