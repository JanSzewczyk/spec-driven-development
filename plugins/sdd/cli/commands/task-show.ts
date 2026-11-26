// `sdd task show <id>`: one task's fields as written in tasks.md, with its full id.
import { parseEpicId } from '../../core/parse.ts'
import { taskBlock, taskFields, taskIdOf } from '../../core/tasks-edit.ts'
import type { Command } from '../command.ts'
import { fail, noFeature } from '../command.ts'

export const command: Command = {
  group: 'task',
  action: 'show',
  summary: "one task's fields (project, status, depends_on, acceptance, plan, scope, files, notes, branch, pr)",
  usage: '<id>',
  readOnly: true,
  run(ctx, args) {
    const id = taskIdOf(args[0] ?? '')
    if (!id) return fail(1, 'usage: sdd task show <id>  (T<n> or <EPIC>-T<n>)')
    const feature = ctx.feature()
    if (!feature) return noFeature(ctx)
    if (feature.tasks === null) return fail(2, `specs/${feature.slug}/tasks.md is missing. Run \`/sdd:tasks\`.`)
    const block = taskBlock(feature.tasks, id)
    if (!block) return fail(2, `${id} is not in specs/${feature.slug}/tasks.md`)
    const epic = parseEpicId(feature.tasks)
    const title = block[0].replace(/^###\s+T\d+\s*[:\-–·]\s*/i, '').trim()
    return { ok: true, data: { id, fullId: epic ? `${epic}-${id}` : id, title, feature: feature.slug, fields: taskFields(block) } }
  },
}
