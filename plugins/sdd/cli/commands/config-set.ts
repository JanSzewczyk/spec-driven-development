// `sdd config set <key> <value>`: changes one value in specs/capabilities.yml, keeping comments
// and order; refused when the doctor's rules would flag the result.
import { setConfigValue } from '../../core/config-edit.ts'
import { CAPABILITIES_PATH } from '../../core/formats.ts'
import type { Command } from '../command.ts'
import { fail } from '../command.ts'

export const command: Command = {
  group: 'config',
  action: 'set',
  summary: 'set one capabilities.yml value by dotted key (e.g. implementation.isolation.worktree.merge auto), validated',
  usage: '<key> <value>',
  readOnly: false,
  run(ctx, args) {
    if (args.length < 2) return fail(1, 'usage: sdd config set <key> <value>  (null clears a value)')
    const { yml, md } = ctx.capabilities()
    if (yml === null) return fail(2, md !== null ? 'Run `/sdd:doctor init` to migrate specs/capabilities.md.' : 'specs/capabilities.yml is missing. Run `/sdd:doctor init`.')
    const value = args.slice(1).join(' ')
    const r = setConfigValue(yml, args[0], value)
    if (!r.ok) return fail(2, r.error)
    ctx.write(CAPABILITIES_PATH, r.text)
    return { ok: true, data: { key: args[0], previous: r.previous, value } }
  },
}
