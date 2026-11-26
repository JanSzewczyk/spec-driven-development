# SDD CLI

`sdd` reads and edits the SDD files of the repository it runs in (`specs/`). Skills call it through
Bash for deterministic steps, so the model does not parse or hand-edit those files. `bin/sdd` is on
the Bash `PATH` while the plugin is enabled; it needs Node.js 22.18+ (TypeScript runs natively) and
exits `127` without it, in which case a skill does the step by hand.

```bash
sdd help
sdd task next [<id> | all]
sdd task status T2 in-progress --branch feat/x--ULOG-T2
sdd config set implementation.isolation.worktree.merge auto
```

Output is one JSON object on stdout. Exit `0` ok, `1` wrong usage, `2` refused by the files or a rule
(the `error` says what to do). A command that writes adds `changed`: the files it wrote.

## Layout

| File | Role |
|---|---|
| `bin/sdd` | Bash wrapper: checks Node, runs `cli/main.ts` |
| `cli/main.ts` | Parses `sdd <group> <action>`, loads every file in `cli/commands/`, prints the result |
| `cli/command.ts` | The `Command` contract, the `Ctx` a command gets, shared helpers. No `node:` imports |
| `cli/context.ts` | The real `Ctx`: repository root, `node:fs`, git |
| `cli/args.ts` | Argument parsing and `sdd help` |
| `cli/commands/<group>-<action>.ts` | One command each |
| `hooks/core/` | The rules and parsers, shared with the mod |

## Adding a command

1. Put the logic in `hooks/core/` as a pure function (text in, text or data out).
2. Add `cli/commands/<group>-<action>.ts` exporting `command: Command` (`group`, `action`,
   `summary`, `usage`, `readOnly`, `run(ctx, args, flags)`). Read and write only through `ctx`.
   `main.ts` finds it by itself and `sdd help` lists it.
3. Test the pure function and the command with an in-memory `Ctx` in `tests/cli.test.ts`
   (`claude plugin test` loads no `node:` modules, so tests import `command.ts`, never `context.ts`).
4. Call it from the skill that needed the step, with the manual fallback in one sentence.
