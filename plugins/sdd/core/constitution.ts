// Constitution §2 (Run/build commands): one row of commands per project. Pure; used by the doctor
// rules (tools to probe) and the effective configuration (the board's Config pane).
import { sectionLines, stripComments } from './capabilities.ts'
import { COMMAND_COLUMNS, COMMAND_COLUMN_ALIASES } from './formats.ts'

export type CommandRow = { project: string; path: string; commands: Record<string, string> }

function cell(v: string): string {
  return v.replace(/`/g, '').trim()
}

export function parseCommandTable(constitution: string): CommandRow[] | null {
  const body = sectionLines(constitution, (t) => /run\s*\/\s*build/i.test(t))
  if (!body) return null
  const rows = stripComments(body.join('\n'))
    .split('\n')
    .filter((l) => /^\s*\|/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-*:?$/.test(c)))
  if (rows.length === 0) return null
  const header = rows[0].map((h) => h.toLowerCase())
  const data = rows.slice(1)
  if (/project/.test(header[0] ?? '')) {
    const cols = header.map((h) => COMMAND_COLUMN_ALIASES[h] ?? h)
    return data.map((r) => {
      const commands: Record<string, string> = {}
      for (const name of COMMAND_COLUMNS) {
        const i = cols.indexOf(name)
        commands[name] = i >= 0 ? cell(r[i] ?? '') : ''
      }
      const pathAt = cols.indexOf('path')
      return { project: cell(r[0] ?? ''), path: pathAt >= 0 ? cell(r[pathAt] ?? '') : '', commands }
    })
  }
  if (header.some((h) => /command/.test(h))) {
    // Legacy `Command | Purpose` list: one project, `root`.
    const commands: Record<string, string> = {}
    for (const name of COMMAND_COLUMNS) commands[name] = ''
    const test = data.find((r) => /\btest/i.test(r.join(' ')) && !/coverage|typecheck|lint/i.test(r.join(' ')))
    if (test) commands.test = cell(test[0] ?? '')
    return [{ project: 'root', path: '.', commands }]
  }
  return null
}

// First executable of a command, after `cd <dir> &&` and leading `VAR=value` words.
export function commandOf(command: string): { dir: string | null; exe: string } | null {
  let rest = command.trim()
  let dir: string | null = null
  for (;;) {
    const m = rest.match(/^cd\s+(\S+)\s*&&\s*/)
    if (!m) break
    dir = m[1]
    rest = rest.slice(m[0].length)
  }
  const tokens = rest.split(/\s+/).filter((t) => t !== '' && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t))
  return tokens.length > 0 ? { dir, exe: tokens[0] } : null
}

