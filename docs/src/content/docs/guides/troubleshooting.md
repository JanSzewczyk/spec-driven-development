---
title: Troubleshooting
description: Symptoms, causes and fixes.
---

| Symptom | Likely cause | Fix |
|---|---|---|
| `/sdd:spec` stops with "Run `/sdd:doctor init` first" | `specs/template.md` missing | `/sdd:doctor init` |
| A command cannot find the feature | No `spec.md` has your current branch in `**Branch:**` (renamed branch) | Switch to the spec's branch, or fix the `**Branch:**` line |
| `/sdd:implement` does not use my flow | No `implementation.projects` entry for the project, so it falls back to `default` (`in-session`) | Add `<project>: skill:<name>`, `agent:<name>` or `command:<shell>` under `implementation.projects`, or set `implementation.default` |
| `spec-verifier` returns `satisfied: true` for incomplete code | Acceptance criteria too vague | Rewrite them to be measurable (`input X → output Y`) |
| `/sdd:plan` works without Plan Mode | Plan Mode is recommended, not required | Enable it (Shift+Tab) for safety |
| Only `specs/capabilities.md` exists | Written by SDD before 2.0 | `/sdd:doctor init` migrates it to `capabilities.yml` |
| `/sdd:doctor` does a manual check | Mods do not run in WSL or under `--safe-mode` | Run in a supported environment, or accept the fallback |
