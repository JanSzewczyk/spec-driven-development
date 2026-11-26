// `sdd task status <id> <status> [--branch <name>] [--pr <url>]`: moves a task forward in tasks.md;
// the first `in-progress` also moves spec.md and plan.md; `review` drops `branch:` and `pr:`.
import { applyTaskStatus } from '../../hooks/core/tasks-edit.ts'
import type { Command } from '../command.ts'
import { fail, noFeature } from '../command.ts'

export const command: Command = {
  group: 'task',
  action: 'status',
  summary: "set a task's status (forward only); first in-progress moves spec and plan; review clears branch/pr",
  usage: '<id> <draft|in-progress|review|done> [--branch <name>] [--pr <url>]',
  readOnly: false,
  run(ctx, args, flags) {
    if (args.length !== 2) return fail(1, 'usage: sdd task status <id> <status> [--branch <name>] [--pr <url>]')
    const feature = ctx.feature()
    if (!feature) return noFeature(ctx)
    if (feature.tasks === null) return fail(2, `specs/${feature.slug}/tasks.md is missing. Run \`/sdd:tasks\`.`)
    const text = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined)
    const r = applyTaskStatus({ tasks: feature.tasks, spec: feature.spec, plan: feature.plan }, args[0], args[1], { branch: text(flags.branch), pr: text(flags.pr) })
    if (!r.ok) return fail(2, r.error)
    const dir = `specs/${feature.slug}/`
    ctx.write(dir + 'tasks.md', r.tasks)
    if (r.spec !== null) ctx.write(dir + 'spec.md', r.spec)
    if (r.plan !== null) ctx.write(dir + 'plan.md', r.plan)
    return { ok: true, data: { task: args[0], from: r.from, to: r.to } }
  },
}
