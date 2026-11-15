---
title: File structure
description: What SDD creates in your project and what is in the plugin repository.
---

## In your project

Only per-project artifacts. Commands, agents and verification skills live in the installed plugin.

```text
your-project/
├── specs/
│   ├── constitution.md       # source of truth, edited by /sdd:constitution
│   ├── template.md           # base for new feature specs
│   ├── capabilities.yml      # projects (written by init) + flows, actions, review, generated (yours)
│   └── <feature-slug>/
│       ├── spec.md           # business specification
│       ├── plan.md           # decisions, contracts, file-by-file changes
│       ├── tasks.md          # self-contained tasks under one Epic
│       └── review.md         # written by /sdd:review
├── .claude/
└── CLAUDE.md                 # optional, yours, never touched by SDD
```

SDD creates or edits only `specs/constitution.md`, `specs/template.md`, `specs/capabilities.yml` and, with sibling repositories, `permissions.additionalDirectories` in `.claude/settings.json`. Everything else, including the root `CLAUDE.md`, is yours.

## In the plugin repository

```text
spec-driven-development/
├── .claude-plugin/marketplace.json   # marketplace: sdd + sdd-board
├── .github/workflows/                # plugin-checks.yml, release.yml
├── actions/sdd-check/                # GitHub Action running the doctor rules elsewhere
├── docs/                             # this documentation site
├── shared/sdd-core/                  # TypeScript used by both plugins and the action
├── scripts/                          # sync-core.sh, release.sh
├── tests/fixtures/                   # sdd-ok / sdd-broken projects for the action's CI job
└── plugins/
    ├── sdd-board/                    # Desktop side panel (mod), requires sdd
    └── sdd/
        ├── .claude-plugin/plugin.json
        ├── hooks/                    # register.ts (doctor_check tool), core/ (copy of shared)
        ├── tests/                    # doctor check rules
        ├── references/               # shared by the skills
        ├── skills/                   # 11 skills, each /sdd:<name>
        └── agents/                   # spec-verifier, reviewer, codebase-surveyor
```
