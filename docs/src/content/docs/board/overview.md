---
title: sdd-board
description: Claude Code Desktop side panel for SDD status.
---

An optional companion mod for **Claude Code Desktop** that shows where each SDD feature stands. It only reads `specs/` and never writes to it. Needs Claude Code 2.1.287 or later; installing it installs `sdd` too.

```text
/plugin install sdd-board@spec-driven-development
/sdd-dashboard    # open or focus the panel
```

The panel opens by itself when the project has `specs/`, in a window at least 144 columns wide, unless you opened it once. Try it from a checkout without installing: `claude --plugin-dir plugins/sdd-board`.

## What it shows

- **Current tab:** the active spec (from the git branch, the one you pinned, or the newest still in progress): title, status, branch, a pipeline stepper (Spec → Clarify → Plan → Tasks → Implement → Review), a readiness checklist for the next command, the suggested next `/sdd:*` command with a **Put in prompt** button, task progress and list, warnings, and buttons that open `spec`, `plan`, `tasks` and `review`.
- **All tab:** every spec with its phase and task progress, filterable; **Show** pins one as current.
- **+ New spec:** puts `/sdd:spec feat ` in the prompt at any time.
- **⚙ Config:** read-only pane with projects, the effective `capabilities.yml` values (set vs default), the per-project commands from constitution §2, and buttons for `/sdd:capabilities` and `/sdd:doctor check`.
- **No SDD in the project:** only a setup card; **Init SDD in this project** runs `/sdd:doctor init`. It is the only button that runs a command; all others only fill the prompt.
- Refreshes by itself after Claude writes under `specs/`, after a branch switch, after each turn, and every 4 s for edits made elsewhere. SVG in Desktop and VS Code, text in the terminal.

## How it picks the next step

| On disk | Next |
|---|---|
| spec `draft` | `/sdd:clarify` |
| spec `clarified` | `/sdd:plan` |
| spec `planned`, no `tasks.md` | `/sdd:tasks` |
| tasks exist, some not implemented | `/sdd:implement T<n>` for the first unfinished task whose dependencies are done |
| every task in `review` or `done` | `/sdd:review` |
| spec `done` or review verdict READY | nothing, open the PR |
