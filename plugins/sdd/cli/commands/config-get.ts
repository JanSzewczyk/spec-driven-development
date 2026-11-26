// `sdd config get [<key>]`: what the flow uses from specs/capabilities.yml, set or default.
import { loadCapabilities } from '../../core/capabilities.ts'
import { configValues } from '../../core/config-edit.ts'
import type { Command } from '../command.ts'
import { fail } from '../command.ts'

export const command: Command = {
  group: 'config',
  action: 'get',
  summary: 'effective value of a capabilities.yml key (set or default); no key: all of them and the projects',
  usage: '[<key>]',
  readOnly: true,
  run(ctx, args) {
    const { yml, md } = ctx.capabilities()
    const caps = loadCapabilities(yml, md)
    if (!caps) return fail(2, 'specs/capabilities.yml is missing. Run `/sdd:doctor init`.')
    if (caps.errors.length > 0) return fail(2, `${caps.path}: line ${caps.errors[0].line}: ${caps.errors[0].message}`)
    const values = configValues(caps)
    if (args[0] === undefined) return { ok: true, data: { path: caps.path, legacy: caps.legacy, projects: caps.projects, values } }
    const v = values[args[0]]
    if (!v) return fail(2, `unknown key "${args[0]}"; keys: ${Object.keys(values).join(', ')}`)
    return { ok: true, data: { key: args[0], ...v } }
  },
}
