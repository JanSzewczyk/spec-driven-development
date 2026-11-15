---
title: /sdd:clarify
description: Close gaps in the spec before planning.
---

Fills the skeleton `/sdd:spec` created, so manual editing is optional. Claude reads `spec.md`, finds gaps (empty sections, ambiguous requirements, untestable acceptance criteria) and asks **up to 5 questions**, each with a proposed answer you can accept. Answers go straight into the spec; anything unanswered stays in *Open questions*. Run it again if gaps remain.

:::note
Do not run it in Plan Mode: it writes into `spec.md`, which Plan Mode blocks.
:::
