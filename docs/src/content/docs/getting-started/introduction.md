---
title: Introduction
description: What SDD is and why it exists.
---

Vibe coding (loose prompt, AI guesses, iterate by trial and error) works for demos but produces spaghetti in production: every fix breaks something else, security gaps multiply, the codebase becomes unmaintainable.

SDD enforces **canonical phases**: `constitution → spec → clarify → plan → tasks → implement → review`. Claude reads and confirms a plan before a single line of code is written, and a final review checks the result against the acceptance criteria before anything is committed.

The framework **manages the thinking and the verification**: research, spec, plan, self-contained tasks, a hand-off to *your* implementation flow, and a final audit. Implementation itself is left to the flow or agents you already use.

## What you get

| Piece | Count | Role |
|---|---|---|
| Skills (slash commands) | 11 | `/sdd:doctor`, `/sdd:constitution`, `/sdd:spec`, `/sdd:clarify`, `/sdd:plan`, `/sdd:tasks`, `/sdd:implement`, `/sdd:review`, `/sdd:retro`, `/sdd:analyze`, `/sdd:capabilities`. None is started by Claude on its own. |
| Agents | 3 | `spec-verifier` and `reviewer` verify, `codebase-surveyor` maps the code for `/sdd:plan`. |
| Mod | 1 | Registers the `doctor_check` tool behind `/sdd:doctor check`. |
| [sdd-board](/spec-driven-development/board/overview/) | optional | Claude Code Desktop side panel showing where each spec stands. |

## Built on

[GitHub Spec Kit](https://github.com/github/spec-kit) (canonical phases), BMAD Method (sharding, role-based sub-agents), Amazon Kiro (Mermaid generation), OpenSpec (lightweight CLI for legacy code) and Claude Code's own slash commands, plan mode and agents.

Next: [install the plugin](/spec-driven-development/getting-started/installation/).
