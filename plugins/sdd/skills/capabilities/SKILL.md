---
name: capabilities
description: Configure specs/capabilities.yml — who implements tasks, who runs branch/commit/PR, how /sdd:review verifies — from the skills, agents and plugins you have installed, then confirm each choice with you
allowed-tools: Bash, Read, Edit, Glob, Grep, AskUserQuestion, mcp__sdd__doctor_check
argument-hint: "(optional: implementation | actions | review)"
disable-model-invocation: true
---

# SDD Capabilities

Fills `implementation`, `actions` and `review` in `specs/capabilities.yml` from what the environment
actually offers, then asks the user to confirm or correct every choice. Keys and defaults: [references/capabilities.md](${CLAUDE_PLUGIN_ROOT}/references/capabilities.md).
Nothing is written before the user has confirmed the draft.

`$ARGUMENTS` limits the run to one section (`implementation`, `actions`, `review`); empty → all three.
Start with a task list (load, discover, draft, confirm, write, re-check) and keep it current.

## 1. Load

- `specs/capabilities.yml` missing → STOP: "Run `/sdd:doctor init` first." (also when only the old
  `specs/capabilities.md` exists: `init` migrates it).
- Read it whole. Note each project from `projects` (name, kind, stack) and the current value of
  every key: a non-default value is a decision the user already made — show it as such in the draft
  and change it only when they say so.
- `specs/constitution.md` §2 gives the project's check commands; they tell you what exists to verify with.

## 2. Discover what is available

Collect candidates; read-only.

- **This session:** the skills and agents the session lists (Skill tool listing, Agent tool
  `subagent_type`s). Use the exact names, including a plugin prefix (`git-workflow:create-commit`).
- **Installed plugins**, including disabled ones and ones installed before: `claude plugin list`
  (fall back to `~/.claude/plugins/installed_plugins.json`). For each, read its `skills/*/SKILL.md` and
  `agents/*.md` frontmatter `name` and `description` under the install path. Mark a candidate
  *installed, not enabled in this session* when it is not in the session listing — it cannot be
  used until the user enables it.
- **User and project files:** `~/.claude/skills`, `~/.claude/agents`, `.claude/skills`, `.claude/agents`
  (frontmatter only).
- **Repository signals:** `gh auth status` and a GitHub `origin` (can the session open PRs), CI config
  (`.github/workflows`, …), an e2e or UI test setup (Playwright, Cypress, Maestro, Detox …), a dev
  command in constitution §2 (the app can be started for a QA check).

Match by description, not by name alone, and per project stack:

| Section | Look for |
|---|---|
| `implementation` | an agent or skill that **writes code** for the project's stack (a `*-developer`, `*-engineer`, a frontend/backend expert). Not reviewers, testers, planners |
| `actions` | skills/agents that create a branch, a commit, a pull request |
| `review` audit flow | skills/agents that **audit** code for the stack (accessibility, performance, security, framework rules) |
| `review.checks` | an agent that runs the app and tests behaviour (QA, e2e); only when the app can be started |

A candidate that fits more than one project's stack is offered per project; one that fits none is dropped.

## 3. Draft

For each section build a proposal with a one-line reason per value, and mark confidence:

- **Clear** — exactly one fitting candidate, or the current value stays.
- **Choice** — several candidates fit; list them, recommend one.
- **Gap** — nothing fits, or the choice depends on how the team works.

Defaults are valid answers: no fitting implementer → `default: in-session`; no git-action tooling →
leave `actions.branch` / `commit` / `pr` at `null`; never invent a name that was not discovered.

Show the whole draft as one YAML block — the keys exactly as they would be written, each with
its reason beneath as a comment — and say which candidates were found but are not enabled.

## 4. Confirm and fill the gaps

Ask with `AskUserQuestion`, not free text. The question must stand alone (name the section and the
proposed lines).

1. **One confirmation first:** "Is this draft correct?" — *Yes, write it* / *Change something*.
2. If *Change something*, or any value is a **Choice** or **Gap**, ask one question per section
   that needs it (up to four per call), options being the discovered candidates, the recommended
   one first, plus the default (`in-session` / unset). Examples of gaps worth asking:
   - several implementers fit one project, or none fits and the user may have one outside the
     scan (ask for its name, then check it exists);
   - whether `publish` should be `ask` or `off`, and whether `tests` may be `skip`;
   - `implementation.isolation`: `none` (this session implements and commits each task) or
     `worktree:` (a sub-session, worktree and branch per task). Ask `merge` (`pr` / `auto`) and
     `parallel` only after the user chose `worktree:`; they go under it;
   - whether a QA/e2e `review.checks` entry should run on every review, given what it costs;
   - a project with no check commands in constitution §2 — say that `tests: run` has nothing to run there;
   - a candidate that is installed but not enabled — enable it first, or leave it out.
3. Ask only what the scan cannot settle; a **Clear** value is not re-asked unless the user chose
   *Change something*. After the answers, show the final lines once more only if they differ from
   the confirmed draft.

## 5. Write

- Edit only the values under `implementation`, `actions` and `review`; keep the comments, `format`,
  `projects`, `generated` and every line the user did not change byte-for-byte. A section missing
  from the file is added from the template in its usual order. Two-space indentation; quote a key or
  value that starts with `@` (npm scopes) or another YAML indicator.
- One value per key, grammar exactly as in the reference (`skill:<name>`, `agent:<name>`,
  `command:<shell>`, `in-session`; per project under `implementation.projects` / `review.projects`,
  `<project>: <value>`; `review.checks` as a list). Unknown keys stay untouched, and so does
  `review.ci` unless the user asked: it is about CI, not about who does a step.
- Print one line per section: changed / unchanged.

## 6. Re-check

Run `mcp__sdd__doctor_check` (tool missing → say the check was skipped) and report any finding on
capabilities. Finish with the next step: `/sdd:spec feat <description>` when ready, otherwise
`/sdd:doctor init`. Mention that re-running `/sdd:capabilities` after installing plugins refreshes the choices.
