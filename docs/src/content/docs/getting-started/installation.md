---
title: Installation
description: Install the sdd plugin and the optional sdd-board panel.
---

## Prerequisites

- **[Claude Code](https://claude.com/claude-code) 2.1.287 or later**, the first version with mods. `sdd` registers the `doctor_check` tool as a mod; in WSL or under `--safe-mode`, where mods do not run, `/sdd:doctor` falls back to a manual check.
- **Git**: every feature lives on its own branch.
- **[GitHub CLI](https://cli.github.com/)** (`gh`), authenticated: `/sdd:review` opens the PR with it when no `pr` action is configured; `/sdd:doctor check` warns without it.

## Install the plugin

Once per machine, inside Claude Code:

```text
/plugin marketplace add JanSzewczyk/spec-driven-development
/plugin install sdd@spec-driven-development
```

Or from the shell:

```bash
claude plugin marketplace add JanSzewczyk/spec-driven-development
claude plugin install sdd@spec-driven-development
```

Enable it in `~/.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "sdd@spec-driven-development": true
  }
}
```

Verify:

```bash
claude plugin list | grep sdd
```

The 11 skills, 3 agents and the `doctor_check` tool are now available in **every** project. Nothing is copied per project.

## Install sdd-board (optional)

```text
/plugin install sdd-board@spec-driven-development
/sdd-dashboard
```

`sdd-board` declares `sdd` as a dependency, so installing it installs `sdd` too. Details: [sdd-board](/spec-driven-development/board/overview/).

## Fork for your organization

For a customized copy (org-specific defaults in the templates):

1. Fork the repository and update `homepage` in `plugins/sdd/.claude-plugin/plugin.json`.
2. Optional: edit `plugins/sdd/skills/doctor/templates/capabilities.yml.template` to pre-set the implementation flow.
3. Optional: edit `plugins/sdd/skills/doctor/templates/constitution.md.template` to seed your standard WHAT NOT TO DO rules.
4. Bump `version` in `plugin.json` and in the `sdd` entry of `.claude-plugin/marketplace.json`. On merge to `main`, the release workflow tags `sdd--v<version>` and creates a GitHub Release.
5. Users add your fork with `/plugin marketplace add <your-org>/<your-repo>` and install with `/plugin install sdd@spec-driven-development`.
