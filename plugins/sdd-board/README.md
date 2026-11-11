# sdd-board

A side panel for **Claude Code Desktop** that shows where each [Spec-Driven Development](../../README.md) feature stands. It is a Claude Code *mod* and a companion to the `sdd` plugin: it only reads the `specs/` folder of your project and never writes to it.

Needs Claude Code 2.1.287 or later (tested with 2.1.309).

## What you get

- **Current** tab — the active spec (picked from the git branch, the one you pinned, or the most recently changed): title, status, branch, a pipeline stepper (Spec → Clarify → Plan → Tasks → Implement → Review), the next `/sdd:*` command with a **Put in prompt** button, task progress, Stories with their tasks, warnings, and a viewer for `spec`, `plan`, `tasks` and `review`.
- **All** tab — every spec with its phase and task progress, a filter, and **Show** to make one current.
- Updates on its own: after Claude writes under `specs/`, after a branch switch, after each turn, and every 4 seconds for edits made elsewhere.
- Desktop and VS Code draw SVG (stepper, progress bar); the terminal gets a text version of the same layout.

The button only fills the prompt. It never runs a command for you.

## Use

```text
/plugin install sdd-board@spec-driven-development
/sdd-board        # open or focus the panel
```

The panel also opens by itself when the project has a `specs/` folder (at least 144 columns wide, unless you opened it once). Try it from a checkout without installing: `claude --plugin-dir plugins/sdd-board`.

## How it decides the next step

| On disk | Next |
| --- | --- |
| spec `draft` | `/sdd:clarify` |
| spec `clarified` | `/sdd:plan` |
| spec `planned`, no `tasks.md` | `/sdd:tasks` |
| tasks exist, some Story not finished | `/sdd:implement S<n>` for the first unfinished Story |
| every task in `review` or `done` | `/sdd:review` |
| spec `done` or review verdict GO | nothing, open the PR |

## Develop

```bash
cd plugins/sdd-board
claude plugin validate .
claude plugin test
```

Parsing lives in `hooks/parse.ts`, phase logic in `hooks/model.ts`, drawing in `hooks/view.ts` and `hooks/svg.ts`; `hooks/register.ts` holds only the hooks and the mods API calls.
