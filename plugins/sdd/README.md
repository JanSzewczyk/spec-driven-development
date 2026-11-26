# sdd — Spec-Driven Development

Claude Code plugin that carries a feature through a fixed pipeline: `/sdd:spec` → `/sdd:clarify` → `/sdd:plan` → `/sdd:tasks` → `/sdd:implement` → `/sdd:review`, with self-contained tasks handed to your own implementation flow and a final audit against the spec.

| Part | What |
| --- | --- |
| Skills (slash commands) | `/sdd:constitution`, `spec`, `clarify`, `plan`, `tasks`, `implement`, `review`, `retro`, `analyze`, `capabilities` (configure `specs/capabilities.yml` from your installed skills and agents), `doctor` (`check` / `init`: readiness audit and setup) |
| Agents | `spec-verifier`, `reviewer`, `codebase-surveyor` |
| Mod | registers the `doctor_check` tool behind `/sdd:doctor check` and the [board](#board) side panel (`/sdd-dashboard`); needs Claude Code 2.1.287+, without it `/sdd:doctor check` falls back to a manual check |
| CLI | `sdd` (`bin/sdd`, on the Bash `PATH`): task and config reads and edits the skills call instead of editing `specs/` by hand (`sdd help`; needs Node.js 22.18+, [cli/README.md](cli/README.md)) |

## Install

```text
/plugin marketplace add JanSzewczyk/spec-driven-development
/plugin install sdd@spec-driven-development
```

Then run `/sdd:doctor check` and `/sdd:doctor init` in your project.

The full guide (flow, commands, agents, implementation hand-off) is in the [repository README](../../README.md).

## Board

A side panel that shows where each feature stands. It only reads `specs/` and never writes to it. Desktop and VS Code draw it with SVG; the terminal gets a text version.

```text
/sdd-dashboard    # open or focus the panel
```

It opens by itself at session start when the project has `specs/` when the window has room for it; a board you close stays closed until `/sdd-dashboard`. To open it only with `/sdd-dashboard`, turn off the `show_board` option of the `sdd` plugin (`/plugin` → sdd → configure). The panel was the separate `sdd-board` plugin up to sdd-board 0.9.7; the marketplace moves those installs to `sdd`.

### What you get

- **Current** tab — the active spec (picked from the git branch, the one you pinned, or the newest one still in progress): title, a status badge, branch, a pipeline stepper (Spec → Clarify → Plan → Tasks → Implement → Review), the next `/sdd:*` command with a **Put in prompt** button, task progress, the task list, warnings, and buttons that open `spec`, `plan`, `tasks` and `review` in their own tab. What shows depends on the phase: every phase shows a **readiness checklist** (what must be true before the next command, e.g. summary, user stories, acceptance criteria, answered open questions, a complete plan) above the next-step card, which stays yellow until all checks pass and turns green when they do. *Implement* and *Review* add task progress and the task list, and a finished feature shows only a "Feature done" card above the stepper. When every feature is finished (and you are on no feature branch) it offers **Start a new spec**.
- **⚙ Config** button (top right of the tab bar) — opens a configuration pane next to the panel, read-only: counters (projects, customised values, commands set), projects with kind and stack, the effective values of `specs/capabilities.yml` (`implementation`, `actions`, `review`; a format-2 `capabilities.md` is shown with a migrate button; `agent:`/`skill:` values split into type, namespace and name, a filled dot marks a value you set, an empty one a default; `merge` and `parallel` hang under `isolation: worktree` behind a connector, because they belong to it), the per-project commands from constitution §2 (collapsible, with a bar per command; a missing `test` is flagged), and buttons that run `/sdd:capabilities` and `/sdd:doctor check`. When everything is at its default it says so. Editing stays in `/sdd:capabilities`.
- **No SDD in the project** — only a setup card is shown (no tabs). **Init SDD in this project** runs `/sdd:doctor init` in the session; the tabs appear on their own once `specs/` exists.
- **+ New spec** in the tab bar puts `/sdd:spec feat ` in the prompt at any time, so you can start a spec from `main` while another feature is in progress.
- **All** tab — every spec with its phase and task progress, a filter, and **Show** to make one current.
- Updates on its own: after Claude or a sub-agent writes under `specs/`, after a branch switch, merge, pull or `gh pr` command, after each turn, and, while the panel is shown, every 4 seconds for edits made elsewhere. While shown it also asks GitHub about task PRs at most once a minute and checks task branches fast-forwarded into the SDD branch, so a merged task shows as merged before Reconcile records it. In a task worktree it reads the statuses from the SDD branch's checkout. A footer line says when the data was last read ("Updated just now · PRs checked 2 min ago").
- Desktop and VS Code draw SVG (stepper, progress bar); the terminal gets a text version of the same layout.

**Put in prompt** buttons only fill the prompt; they never run a command for you. The one exception is **Init SDD in this project**, which runs `/sdd:doctor init` straight away (if it cannot start, it is put in the prompt instead).

### How it decides the next step

| On disk | Next |
| --- | --- |
| spec `draft` | `/sdd:clarify` |
| spec `clarified` | `/sdd:plan` |
| spec `planned`, no `tasks.md` | `/sdd:tasks` |
| tasks exist, some not implemented | `/sdd:implement T<n>` for the first unfinished task whose dependencies are done |
| the rest wait for task PRs (`pr:`), and unfinished tasks depend on them | merge them; a running `/sdd:implement all` continues by itself, else run it again after the merge |
| only task PRs (`pr:`) are left | `/sdd:review` after the merge (it marks the merged tasks `review` first) |
| every task in `review` or `done` | `/sdd:review` |
| spec `done` or review verdict READY | nothing, open the PR |

### Develop

`hooks/register.ts` composes the doctor tool (`hooks/doctor.ts`) and the board; the board's hooks are in `hooks/board/register.ts`, phase logic in `hooks/board/model.ts`, drawing in `hooks/board/view.ts` and `hooks/board/svg.ts`, parsing in `core/parse.ts`. Tests: `tests/board.test.ts` (`claude plugin test`).
