// Pure parts of the SDD CLI: argument parsing and the help text. Kept apart from main.ts so tests
// can load them (main.ts discovers the command files at run time).
import type { Command, Flags } from './command.ts'

export function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      positional.push(...argv.slice(i + 1))
      break
    }
    const m = a.match(/^--([a-z][\w-]*)(?:=(.*))?$/)
    if (!m) positional.push(a)
    else if (m[2] !== undefined) flags[m[1]] = m[2]
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[m[1]] = argv[++i]
    else flags[m[1]] = true
  }
  return { positional, flags }
}

export function help(commands: Command[], group?: string): string {
  const shown = commands.filter((c) => !group || c.group === group)
  const rows = shown.map((c) => `  sdd ${`${c.group} ${c.action} ${c.usage}`.trim()}\n      ${c.summary}${c.readOnly ? '' : ' (writes)'}`)
  return ['SDD CLI: reads and edits the SDD files of the repository it runs in. Output is JSON.', '', ...rows, '', 'Exit: 0 ok, 1 wrong usage, 2 refused (the message says what to do).'].join('\n')
}
