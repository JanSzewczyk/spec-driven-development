// Pure edits of the SDD artifacts: a task's fields in tasks.md and the `**Status:**` line of
// spec.md / plan.md. Text in, text out; every other line is kept as it is, so the board and the
// parsers read the result like a hand-written file. No mods API in here.
import { parsePlanStatus, parseSpec, parseTasks } from './parse.ts'
import { PLAN_STATUSES, SPEC_STATUSES, TASK_STATUSES } from './formats.ts'

const HEADING = /^###\s+(T\d+)\s*[:\-–·]\s*(.*)$/i
const FIELD = /^([a-z_]+):(.*)$/

// `T2`, `t2` or `ULOG-T2` → `T2`; '' when it is not a task id.
export function taskIdOf(input: string): string {
  const m = input.trim().match(/^(?:[A-Z]{2,8}(?:-[0-9a-f]{4})?-)?(T\d+)$/i)
  return m ? m[1].toUpperCase() : ''
}

// Line range [start, end) of a task's block: its heading up to the next heading.
function blockRange(lines: string[], id: string): [number, number] | null {
  const start = lines.findIndex((l) => l.match(HEADING)?.[1].toUpperCase() === id)
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && !/^#{1,3}\s/.test(lines[end]) && !/^Order:/.test(lines[end])) end++
  while (end > start + 1 && lines[end - 1].trim() === '') end--
  return [start, end]
}

// The lines of a task's block, heading included; null when the task is not in the file.
export function taskBlock(text: string, id: string): string[] | null {
  const lines = text.split('\n')
  const r = blockRange(lines, id)
  return r ? lines.slice(r[0], r[1]) : null
}

// Every `key: value` field of a task block; list fields (`scope:` followed by bullets) keep their bullets.
export function taskFields(block: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  let last = ''
  for (const line of block.slice(1)) {
    const f = line.match(FIELD)
    if (f) {
      last = f[1]
      out[last] = f[2].trim()
    } else if (last && /^\s*[-*]\s/.test(line)) {
      out[last] = (out[last] ? out[last] + '\n' : '') + line.trim()
    }
  }
  return out
}

function fieldLine(lines: string[], [start, end]: [number, number], key: string): number {
  for (let i = start + 1; i < end; i++) if (lines[i].match(FIELD)?.[1] === key) return i
  return -1
}

// Sets `key: value` in a task's block: replaces the line, or adds it after `status:` (after the
// heading when there is no `status:`). A trailing `# comment` on the line is kept.
export function setTaskField(text: string, id: string, key: string, value: string): string {
  const lines = text.split('\n')
  const r = blockRange(lines, id)
  if (!r) throw new Error(`task ${id} is not in tasks.md`)
  const at = fieldLine(lines, r, key)
  if (at >= 0) {
    const comment = lines[at].match(/\s+#.*$/)?.[0] ?? ''
    lines[at] = `${key}: ${value}${comment}`
  } else {
    const status = fieldLine(lines, r, 'status')
    const project = fieldLine(lines, r, 'project')
    lines.splice((status >= 0 ? status : project >= 0 ? project : r[0]) + 1, 0, `${key}: ${value}`)
  }
  return lines.join('\n')
}

export function removeTaskField(text: string, id: string, key: string): string {
  const lines = text.split('\n')
  const r = blockRange(lines, id)
  if (!r) throw new Error(`task ${id} is not in tasks.md`)
  const at = fieldLine(lines, r, key)
  if (at >= 0) lines.splice(at, 1)
  return lines.join('\n')
}

// Replaces the value of `**Status:**`, keeping a trailing `<!-- … -->` note.
export function setDocStatus(text: string, status: string): string {
  return text.replace(/^(\*\*Status:\*\*\s*)([^\s<][^<]*?)?(\s*(?:<!--.*)?)$/m, (_, head, _old, tail) => head + status + (tail || ''))
}

const later = (order: string[], from: string, to: string) => order.indexOf(to) > order.indexOf(from)

export type StatusInput = { tasks: string; spec: string | null; plan: string | null }
export type StatusResult =
  | { ok: true; tasks: string; spec: string | null; plan: string | null; from: string; to: string }
  | { ok: false; error: string }

// What `/sdd:implement` writes when a task moves: the task's status (only forward), its `branch:` /
// `pr:` while it runs in a worktree (removed at `review`), and `in-progress` on spec.md and plan.md
// when the first task starts. Moving backwards is `/sdd:review`'s and `/sdd:tasks`' job, not this one's.
export function applyTaskStatus(input: StatusInput, rawId: string, to: string, opts: { branch?: string; pr?: string } = {}): StatusResult {
  const id = taskIdOf(rawId)
  if (!id) return { ok: false, error: `"${rawId}" is not a task id (T<n> or <EPIC>-T<n>)` }
  if (!TASK_STATUSES.includes(to)) return { ok: false, error: `"${to}" is not a task status (${TASK_STATUSES.join(' | ')})` }
  const task = parseTasks(input.tasks).find((t) => t.id === id)
  if (!task) return { ok: false, error: `task ${id} is not in tasks.md` }
  const from = TASK_STATUSES.includes(task.status) ? task.status : 'draft'
  if (later(TASK_STATUSES, to, from)) return { ok: false, error: `${id} is ${from}; a status moves only forward (${TASK_STATUSES.join(' → ')})` }
  if ((opts.branch || opts.pr) && to !== 'in-progress') return { ok: false, error: '--branch and --pr go with in-progress' }

  let tasks = setTaskField(input.tasks, id, 'status', to)
  if (opts.branch) tasks = setTaskField(tasks, id, 'branch', opts.branch)
  if (opts.pr) tasks = setTaskField(tasks, id, 'pr', opts.pr)
  if (to === 'review' || to === 'done') tasks = removeTaskField(removeTaskField(tasks, id, 'branch'), id, 'pr')

  let { spec, plan } = input
  if (to === 'in-progress') {
    if (spec !== null && later(SPEC_STATUSES, parseSpec(spec).status, 'in-progress')) spec = setDocStatus(spec, 'in-progress')
    if (plan !== null && later(PLAN_STATUSES, parsePlanStatus(plan), 'in-progress')) plan = setDocStatus(plan, 'in-progress')
  }
  return { ok: true, tasks, spec, plan, from, to }
}
