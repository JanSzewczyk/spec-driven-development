# sdd-board

A side panel for **Claude Code Desktop** that shows where each [Spec-Driven Development](../../README.md) feature stands. It is a Claude Code *mod* and a companion to the `sdd` plugin: it only reads the `specs/` folder of your project and never writes to it.

Needs Claude Code 2.1.287 or later (tested with 2.1.309).

## What you get

- **Current** tab — the active spec (picked from the git branch, the one you pinned, or the newest one still in progress): title, a status badge, branch, a pipeline stepper (Spec → Clarify → Plan → Tasks → Implement → Review), the next `/sdd:*` command with a **Put in prompt** button, task progress, Stories with their tasks, warnings, and buttons that open `spec`, `plan`, `tasks` and `review` in their own tab. What shows depends on the phase: the early phases show the next step and the spec's open questions, *Implement* and *Review* add task progress and Stories, and a finished feature shows only a "Feature done" card above the stepper. When every feature is finished (and you are on no feature branch) it offers **Start a new spec**.
- **No SDD in the project** — only a setup card is shown (no tabs). **Init SDD in this project** runs `/sdd:doctor init` in the session; the tabs appear on their own once `specs/` exists.
- **+ New spec** in the tab bar puts `/sdd:spec feat ` in the prompt at any time, so you can start a spec from `main` while another feature is in progress.
- **All** tab — every spec with its phase and task progress, a filter, and **Show** to make one current.
- Updates on its own: after Claude writes under `specs/`, after a branch switch, after each turn, and every 4 seconds for edits made elsewhere.
- Desktop and VS Code draw SVG (stepper, progress bar); the terminal gets a text version of the same layout.

**Put in prompt** buttons only fill the prompt; they never run a command for you. The one exception is **Init SDD in this project**, which runs `/sdd:doctor init` straight away (if it cannot start, it is put in the prompt instead).

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
