---
title: /sdd:capabilities
description: Pick implementer, git actions and review checks from what you have installed.
---

Optional, after `/sdd:doctor init`. Scans the session's skills and agents, installed plugins (also ones not enabled), `~/.claude` and `.claude` files, and repo signals (`gh`, CI, e2e setup).

It drafts `implementation`, `actions` and `review` per project with a reason for each value, then asks you to confirm and to settle choices and gaps. It writes only those values, keeps existing decisions unless you change them, and should be re-run after installing plugins.

Keys and defaults: [capabilities reference](/spec-driven-development/configuration/capabilities/).
