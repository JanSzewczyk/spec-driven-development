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

- **Session strip** — on the spec's branch: **Main SDD session**; on a task branch (`<spec-branch>--<EPIC>-T<n>`): **Task session · ULOG-T3**, with a note that the statuses come from the spec branch's checkout.
- **Live strip** (top of Current and Ticket) — what runs now: the `/sdd:*` command of the turn and its time, the latest tool call, and one expandable lane per subagent (`agent.spawn` until its `turn.complete`, with its last tool calls, on a 15-minute time axis), per task running in its worktree (last commit of its branch) and per task PR waiting for a merge; each lane names where it was read from. Idle, it is one line; when `/sdd:clarify`, `/sdd:plan` or `/sdd:tasks` ended its turn on a question or the plan approval, that line says it waits for your reply, its phase stays marked, and your reply resumes it as running.
- **Current** tab — the active spec (picked from the git branch, the one you pinned, or the newest one still in progress): title, a status badge, a **phase bar** (Spec → Clarify → Plan → Tasks → Implement → Review; the current phase wider, with moving stripes), and a phase card: task progress by status, the **readiness checklist** (what must be true before the next command, e.g. summary, user stories, acceptance criteria, answered open questions, a complete plan, task PRs merged), and the next `/sdd:*` command with a **Run** button (sent as if you typed it, queued until the session is idle), **Implement all** while more than one task is open (`/sdd:implement` with no argument, which takes every open task in turn) and **Put in prompt**, or "running now" while that command runs. *Implement*, *Review* and a finished feature add the task flow (waves of tasks that can run side by side, from `depends_on`, once a task depends on another) and the task list (All / Open / Blocked; a row expands to its acceptance ids, dependencies, branch and PR; hovering a row lights its lane). In the *Review* phase a **Review card** replaces the phase card: every check `/sdd:review` runs (from `review:` in `capabilities.yml`: tests per project, spec-verifier, `review.checks`, agent audits, the reviewer's constitution rules and skill audits, commit and PR), live while the review runs, then each check's result from `review.md`, the verdict, must-fix and acceptable blockers with their tasks, and how old `review.md` is. A finished feature shows a "Feature done" card. Then warnings and buttons that open `spec`, `plan`, `tasks` and `review` in their own tab. When every feature is finished (and you are on no feature branch) it offers **Start a new spec**.
- **Ticket** tab — only in a task session, and opened first there: the task's scope, its acceptance criteria with their text from `spec.md`, dependencies, branch, PR and files.
- **Config** button (top right of the tab bar) — opens a configuration pane next to the panel, read-only: counters (projects, customised values, commands set), projects with kind and stack, the effective values of `specs/capabilities.yml` (`implementation`, `actions`, `review`; a format-2 `capabilities.md` is shown with a migrate button; `agent:`/`skill:` values split into type, namespace and name, a filled dot marks a value you set, an empty one a default; `merge` and `parallel` hang under `isolation: worktree` behind a connector, because they belong to it), the per-project commands from constitution §2 (collapsible, with a bar per command; a missing `test` is flagged), and buttons that run `/sdd:capabilities` and `/sdd:doctor check`. When everything is at its default it says so. Editing stays in `/sdd:capabilities`.
- **No SDD in the project** — only a setup card is shown (no tabs). **Init SDD in this project** runs `/sdd:doctor init` in the session; the tabs appear on their own once `specs/` exists.
- **+ New spec** in the tab bar puts `/sdd:spec feat ` in the prompt. It shows on a branch with no spec (e.g. `main`), so you can start a spec there while another feature is in progress; a spec or task session does not offer it.
- **All** tab — every spec with a small phase bar and task progress, a filter, and **Show** to make one current.
- Updates on its own: after Claude or a sub-agent writes under `specs/`, after a branch switch, merge, pull or `gh pr` command, after each turn, and, while the panel is shown, every 4 seconds for edits made elsewhere. While shown it also asks GitHub about task PRs at most once a minute and checks task branches fast-forwarded into the SDD branch, so a merged task shows as merged before Reconcile records it. In a task worktree it reads the statuses from the SDD branch's checkout. A footer line says when the data was last read ("Updated just now · PRs checked 2 min ago").
- Desktop and VS Code draw SVG (phase bar, progress, lanes, status glyphs; motion only inside drawings, stopped by reduced motion); the terminal gets a text version of the same layout.

**Put in prompt** buttons only fill the prompt. **Run** (the next step), **Init SDD in this project** and the Config pane's buttons run their command straight away, queued until the session is idle; if it cannot start, it is put in the prompt instead.

### How it decides the next step

| On disk | Next |
| --- | --- |
| spec `draft` | `/sdd:clarify` |
| spec `clarified` | `/sdd:plan` |
| spec `planned`, no `tasks.md` | `/sdd:tasks` |
| tasks exist, some not implemented | `/sdd:implement T<n>` for the first unfinished task whose dependencies are done and that does not run in its own worktree |
| the rest run in their task worktrees (`branch:`) or wait for task PRs (`pr:`), and unfinished tasks depend on them | `/sdd:implement`: a running one continues by itself as tasks land, else run it again |
| only task PRs (`pr:`) are left | `/sdd:review` after the merge (it marks the merged tasks `review` first) |
| every task in `review` or `done` | `/sdd:review` |
| spec `done` or review verdict READY | nothing, open the PR |

### Develop

`hooks/register.ts` composes the doctor tool (`hooks/doctor.ts`) and the board; the board's hooks are in `hooks/board/register.ts`, phase logic in `hooks/board/model.ts`, the live strip (turn, tool calls, subagents, task lanes) in `hooks/board/live.ts`, drawing in `hooks/board/view.ts` and `hooks/board/svg.ts`, parsing in `core/parse.ts`. Tests: `tests/board.test.ts` (`claude plugin test`).
