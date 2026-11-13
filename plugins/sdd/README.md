# sdd — Spec-Driven Development

Claude Code plugin that carries a feature through a fixed pipeline: `/sdd:spec` → `/sdd:clarify` → `/sdd:plan` → `/sdd:tasks` → `/sdd:implement` → `/sdd:review`, with self-contained tasks handed to your own implementation flow and a final audit against the spec.

| Part | What |
| --- | --- |
| Skills (slash commands) | `/sdd:constitution`, `spec`, `clarify`, `plan`, `tasks`, `implement`, `review`, `retro`, `analyze`, `doctor` (`check` / `init`: readiness audit and setup) |
| Agents | `spec-verifier`, `reviewer`, `codebase-surveyor` |
| Mod | registers the `doctor_check` tool behind `/sdd:doctor check` (needs Claude Code 2.1.287+; without it the skill falls back to a manual check) |

## Install

```text
/plugin marketplace add JanSzewczyk/spec-driven-development
/plugin install sdd@spec-driven-development
```

Then run `/sdd:doctor check` and `/sdd:doctor init` in your project.

The full guide (flow, commands, agents, implementation hand-off) is in the [repository README](../../README.md). The optional Claude Code Desktop panel for it is [sdd-board](../sdd-board/README.md).
