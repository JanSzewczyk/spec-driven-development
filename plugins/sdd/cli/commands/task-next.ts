// `sdd task next [<id> | all]`: the open tasks of the current branch's feature, in dependency order.
import { nextTasks } from '../../hooks/core/next.ts'
import type { Command } from '../command.ts'

export const command: Command = {
  group: 'task',
  action: 'next',
  summary: 'feature, epic, isolation and the open tasks in dependency order (ready, blockers, flow); default all',
  usage: '[<id> | all]',
  readOnly: true,
  run(ctx, args) {
    const caps = ctx.capabilities()
    const r = nextTasks({ branch: ctx.branch(), features: ctx.features(), capabilities: caps.yml, legacyCapabilities: caps.md, arg: args[0] ?? '' })
    if ('stop' in r) return { ok: false, code: 2, error: r.stop, ...(r.features ? { data: { features: r.features } } : {}) }
    return { ok: true, data: r }
  },
}
