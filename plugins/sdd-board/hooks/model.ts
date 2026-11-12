// Pure model: turns parsed artifacts into a pipeline phase and a suggested next command.
import type { PlanInfo, SpecInfo, Task } from './parse.ts'

export type Feature = {
  slug: string
  spec: SpecInfo
  planStatus: string | null
  plan: PlanInfo | null
  tasks: Task[] | null
  review: Verdict | null
  modified: number
}

export type StepState = 'done' | 'current' | 'todo'
export type Step = { key: string; label: string; state: StepState }
export type Next = { command: string; model: string; why: string }
export type Derived = { phase: string; steps: Step[]; next: Next | null }

export const STEP_LABELS: [string, string][] = [
  ['spec', 'Spec'],
  ['clarify', 'Clarify'],
  ['plan', 'Plan'],
  ['tasks', 'Tasks'],
  ['implement', 'Implement'],
  ['review', 'Review'],
]

// One color per status, shared by chips, steppers and bars. Chosen to read on light and dark.
export const PALETTE: Record<string, string> = {
  draft: '#8b93a1',
  clarified: '#4c8dff',
  planned: '#9b6bff',
  'tasks-ready': '#9b6bff',
  'in-progress': '#e8a317',
  review: '#1fb5c9',
  done: '#2fb170',
  bad: '#e5484d',
}

export const TEXT_COLOR: Record<string, string> = {
  draft: 'gray',
  clarified: 'blue',
  planned: 'magenta',
  'tasks-ready': 'magenta',
  'in-progress': 'yellow',
  review: 'cyan',
  done: 'green',
  bad: 'red',
}

export function taskCounts(tasks: Task[] | null) {
  const c = { total: 0, draft: 0, 'in-progress': 0, review: 0, done: 0 } as Record<string, number>
  for (const t of tasks ?? []) {
    c.total += 1
    const k = t.status in c ? t.status : 'draft'
    c[k] += 1
  }
  return c
}

// Dependencies of a task that are not implemented yet (status review or done). Unknown ids count
// as open, so a typo in depends_on shows up instead of silently unblocking the task.
export function blockedBy(task: Task, tasks: Task[] | null): string[] {
  if (task.status !== 'draft' || task.dependsOn.length === 0) return []
  const status = new Map<string, string>()
  for (const t of tasks ?? []) status.set(t.id, t.status)
  return task.dependsOn.filter((id) => {
    const st = status.get(id)
    return st !== 'review' && st !== 'done'
  })
}

export function taskDone(t: Task): boolean {
  return t.status === 'review' || t.status === 'done'
}

export function derive(f: Feature): Derived {
  const tasks = f.tasks ?? []
  const hasTasks = tasks.length > 0
  const allDone = hasTasks && tasks.every(taskDone)
  let idx: number // index of current step; 6 = everything done
  let next: Next | null
  const status = f.spec.status
  if (f.review === 'READY' || status === 'done') {
    idx = 6
    next = null
  } else if (allDone) {
    idx = 5
    next = { command: '/sdd:review', model: 'Opus', why: f.review === 'NOT READY' ? 'The last review was not ready: fix the findings, then review again.' : 'All tasks are implemented. Run the final audit before the PR.' }
  } else if (hasTasks) {
    idx = 4
    // First task not yet implemented whose dependencies are done; else the first unfinished one.
    const open = tasks.filter((t) => !taskDone(t))
    const ready = open.find((t) => blockedBy(t, tasks).length === 0) ?? open[0]
    next = { command: '/sdd:implement ' + ready.id, model: 'Sonnet', why: 'Hand the task to the implementation flow.' }
  } else if (status === 'planned' || f.planStatus !== null) {
    idx = 3
    next = { command: '/sdd:tasks', model: 'Sonnet', why: 'Split the plan into self-contained tasks.' }
  } else if (status === 'clarified') {
    idx = 2
    next = { command: '/sdd:plan', model: 'Opus', why: 'Write the architecture plan. Run it in Plan Mode.' }
  } else {
    idx = 1
    next = { command: '/sdd:clarify', model: 'Opus', why: 'Answer the gap questions so the spec is ready for planning.' }
  }
  const steps: Step[] = STEP_LABELS.map(([key, label], i) => ({
    key,
    label,
    state: i < idx ? 'done' : i === idx ? 'current' : 'todo',
  }))
  const phase = idx >= 6 ? 'done' : STEP_LABELS[idx][0]
  return { phase, steps, next }
}

export type Check = { key: string; label: string; ok: boolean; hint?: string }
export type Gate = { command: string; checks: Check[]; open: number }

const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many)

// What has to be true before the suggested next command is worth running. Read from the artifacts only.
export function gate(f: Feature): Gate | null {
  const d = derive(f)
  if (!d.next) return null
  const command = d.next.command
  const verb = command.split(' ')[0]
  const s = f.spec
  const checks: Check[] = []
  const content = () => {
    checks.push({ key: 'summary', label: 'Summary written', ok: s.hasSummary })
    checks.push({ key: 'stories', label: 'User stories added', ok: s.storyCount > 0 })
    checks.push({ key: 'ac', label: 'Acceptance criteria defined', ok: s.acReal > 0, hint: s.acReal > 0 ? plural(s.acReal, 'criterion', 'criteria') : 'none yet' })
    checks.push({ key: 'edge', label: 'Edge cases listed', ok: s.edgeCases > 0 })
  }
  const questions = () =>
    checks.push({ key: 'questions', label: 'Open questions answered', ok: s.openQuestions === 0, hint: s.openQuestions ? plural(s.openQuestions, 'question', 'questions') + ' left' : undefined })
  if (verb === '/sdd:clarify') {
    content()
  } else if (verb === '/sdd:plan') {
    content()
    questions()
  } else if (verb === '/sdd:tasks') {
    questions()
    checks.push({ key: 'plan', label: 'Plan written', ok: !!f.plan && f.plan.missing.length === 0, hint: !f.plan ? 'plan.md not found' : f.plan.missing.length ? 'missing: ' + f.plan.missing.join(', ') : undefined })
    checks.push({ key: 'plan-questions', label: 'Plan questions resolved', ok: !!f.plan && f.plan.openItems === 0, hint: f.plan && f.plan.openItems ? plural(f.plan.openItems, 'item', 'items') + ' left' : undefined })
  } else if (verb === '/sdd:implement') {
    const tasks = f.tasks ?? []
    const target = tasks.find((t) => t.id === command.split(' ')[1])
    const waits = target ? blockedBy(target, tasks) : []
    checks.push({ key: 'ac', label: 'Task has acceptance criteria', ok: !!target && target.acceptance.length > 0 })
    checks.push({ key: 'deps', label: 'Dependencies implemented', ok: waits.length === 0, hint: waits.length ? 'waiting on ' + waits.join(', ') : undefined })
    questions()
  } else if (verb === '/sdd:review') {
    checks.push({ key: 'tasks', label: 'All tasks implemented', ok: true })
    questions()
    checks.push({ key: 'verdict', label: 'Last review findings fixed', ok: f.review !== 'NOT READY', hint: f.review === 'NOT READY' ? 'the last review was not ready' : undefined })
  }
  return { command, checks, open: checks.filter((c) => !c.ok).length }
}

// Overview order: in progress first, finished last.
const RANK: Record<string, number> = { implement: 0, review: 1, tasks: 2, plan: 3, clarify: 4, done: 6 }

export function sortFeatures(list: Feature[], current: string | null): Feature[] {
  const rank = (f: Feature) => (f.slug === current ? -1 : (RANK[derive(f).phase] ?? 5))
  return [...list].sort((a, b) => rank(a) - rank(b) || b.modified - a.modified)
}

export function currentSlug(list: Feature[], branch: string, pinned: string | null): string | null {
  if (pinned && list.some((f) => f.slug === pinned)) return pinned
  const slug = branch.includes('/') ? branch.slice(branch.indexOf('/') + 1) : branch
  if (slug && list.some((f) => f.slug === slug)) return slug
  // Fallback: the newest feature still in progress. Finished ones are never "current" by themselves.
  const latest = [...list].filter((f) => derive(f).phase !== 'done').sort((a, b) => b.modified - a.modified)[0]
  return latest ? latest.slug : null
}

export function ago(ms: number, now: number): string {
  if (!ms) return ''
  const m = Math.max(0, Math.round((now - ms) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  if (h < 48) return h + ' h ago'
  return Math.round(h / 24) + ' d ago'
}

export function warnings(f: Feature, branch: string): string[] {
  const out: string[] = []
  const d = derive(f)
  if (d.phase !== 'done' && f.spec.branch && branch && f.spec.branch !== branch) out.push('You are on ' + branch + ', the spec belongs to ' + f.spec.branch)
  if (f.review === 'NOT READY') out.push('Last review: not ready')
  return out
}
