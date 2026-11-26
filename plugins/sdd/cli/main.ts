// SDD CLI entry point: `sdd <group> <action> [args] [--flag value]`. Commands are the files in
// ./commands (each exports `command`), found at run time: adding one needs no change here.
// Output: JSON on stdout. Exit 0 ok, 1 wrong usage, 2 refused by the files or a rule.
import { readdirSync, realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Context } from './context.ts'
import type { Command, Result } from './command.ts'
import { help, parseArgs } from './args.ts'

export async function loadCommands(): Promise<Command[]> {
  const dir = new URL('./commands/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()
  const out: Command[] = []
  for (const f of files) out.push((await import(new URL(f, dir).href)).command as Command)
  return out
}

export async function main(argv: string[], cwd: string): Promise<{ code: number; out: string }> {
  const commands = await loadCommands()
  const { positional, flags } = parseArgs(argv)
  const [group, action, ...args] = positional
  if (!group || group === 'help' || (flags.help && !action)) {
    const known = group && group !== 'help' ? commands.some((c) => c.group === group) : true
    return { code: known ? 0 : 1, out: known ? help(commands, group && group !== 'help' ? group : undefined) : JSON.stringify({ error: `unknown group "${group}"; run \`sdd help\`` }) }
  }
  const cmd = commands.find((c) => c.group === group && c.action === action)
  if (!cmd) return { code: 1, out: JSON.stringify({ error: `unknown command "${[group, action].filter(Boolean).join(' ')}"; run \`sdd help\`` }) }
  if (flags.help) return { code: 0, out: help([cmd]) }

  const ctx = new Context(cwd)
  let r: Result
  try {
    r = cmd.run(ctx, args, flags)
  } catch (error) {
    r = { ok: false, code: 2, error: String((error as Error).message ?? error) }
  }
  if (r.ok) return { code: 0, out: JSON.stringify(ctx.changed.length ? { ...r.data, changed: ctx.changed } : r.data) }
  return { code: r.code, out: JSON.stringify({ error: r.error, ...(r.data ?? {}) }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const { code, out } = await main(process.argv.slice(2), process.cwd())
  process.stdout.write(out + '\n')
  process.exitCode = code
}
