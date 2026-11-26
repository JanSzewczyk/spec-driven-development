// Pure model: turns parsed artifacts into a pipeline phase and a suggested next command.
import type { Config } from '../../core/config.ts'
import type { FeatureFiles } from '../../core/features.ts'
import { taskBranchBase, taskOfBranch } from '../../core/merges.ts'
import type { MergeState, TaskPr } from '../../core/merges.ts'
import { parseEpicId, parsePlan, parseReview, parseSpec, parseTasks } from '../../core/parse.ts'
import type { PlanInfo, SpecInfo, Task, Verdict } from '../../core/parse.ts'

export type Feature = {
  slug: string
  spec: SpecInfo
  planStatus: string | null
  plan: PlanInfo | null
  tasks: Task[] | null
  epic?: string // `**Epic:**` id from tasks.md; '' or absent in files written before epic ids
  review: Verdict | null
  modified: number
  merges?: Record<string, MergeState> // isolated tasks whose merge state is known (git, gh), by task id
  prs?: Record<string, TaskPr> // tasks with `pr:`, with the PR's state and link once GitHub answered, by task id
  tasksCommitted?: boolean // git has a commit of specs/<slug>/tasks.md (/sdd:tasks commits it); absent while unknown
  flow?: string // how tasks are implemented, from capabilities.yml (implFlow); absent while unknown
}

// One line on how /sdd:implement runs tasks: the implementer, then the isolation and its options.
export function implFlow(cfg: Config | null): string | undefined {
  const entries = cfg?.sections.find((s) => s.title === 'Implementation')?.entries
  if (!entries) return undefined
  const get = (k: string) => entries.find((e) => e.key === k && (k === 'merge' || k === 'parallel' ? e.parent === 'isolation' : !e.parent))?.value
  const who = get('default') ?? 'in-session'
  if (get('isolation') !== 'worktree') return who + ' · in this session'
  return who + ' · worktree · merge ' + (get('merge') ?? 'pr') + ' · parallel ' + (get('parallel') ?? '1')
}

// A feature's files, parsed for the board. Call only with a spec (the board lists a feature once it has one).
export function featureFrom(files: FeatureFiles & { spec: string }, modified: number): Feature {
  const plan = files.plan === null ? null : parsePlan(files.plan)
  return {
    slug: files.slug,
    spec: parseSpec(files.spec),
    planStatus: plan === null ? null : plan.status || 'draft',
    plan,
    tasks: files.tasks === null ? null : parseTasks(files.tasks),
    epic: files.tasks === null ? '' : parseEpicId(files.tasks),
    review: files.review === null ? null : parseReview(files.review),
    modified,
  }
}

export type StepState = 'done' | 'current' | 'todo'
export type Step = { key: string; label: string; state: StepState }
export type Next = { command: string; model: string; why: string }
export type Derived = { phase: string; steps: Step[]; next: Next | null; isRunning: boolean }

export const STEP_LABELS: [string, string][] = [
  ['spec', 'Spec'],
  ['clarify', 'Clarify'],
  ['plan', 'Plan'],
  ['tasks', 'Tasks'],
  ['implement', 'Implement'],
  ['review', 'Review'],
]

// Colors follow Claude Code: each status maps to a CDS role (the drawings use its colors) and to the
// theme key Claude Code maps to the same role (terminal and Desktop text). Theme keys follow the user's
// light or dark theme; ANSI names such as 'yellow' would not.
export type Role = 'success' | 'pro' | 'accent' | 'warning' | 'danger' | 'neutral'

export const STATUS_ROLE: Record<string, Role> = {
  draft: 'neutral',
  clarified: 'accent',
  planned: 'pro',
  'tasks-ready': 'pro',
  'in-progress': 'warning',
  review: 'accent',
  done: 'success',
  bad: 'danger',
}

// 'permission' and 'merged' are Claude Code's accent (blue) and purple keys in both the terminal theme and Desktop.
export const ROLE_KEY: Record<Role, string> = { success: 'success', pro: 'merged', accent: 'permission', warning: 'warning', danger: 'error', neutral: 'inactive' }

export const TEXT_COLOR: Record<string, string> = Object.fromEntries(Object.entries(STATUS_ROLE).map(([status, role]) => [status, ROLE_KEY[role]]))

type Merges = Record<string, MergeState> | undefined

// Merged into the SDD branch but not recorded yet: counts as implemented, as Reconcile will record it.
const isMerged = (t: Task, merges: Merges) => merges?.[t.id] === 'merged'

export function taskCounts(tasks: Task[] | null, merges?: Merges) {
  const c = { total: 0, draft: 0, 'in-progress': 0, review: 0, done: 0 } as Record<string, number>
  for (const t of tasks ?? []) {
    c.total += 1
    const k = isMerged(t, merges) && !taskDone(t) ? 'review' : t.status in c ? t.status : 'draft'
    c[k] += 1
  }
  return c
}

// Dependencies of a task that are not implemented yet (status review or done). Unknown ids count
// as open, so a typo in depends_on shows up instead of silently unblocking the task.
export function blockedBy(task: Task, tasks: Task[] | null, merges?: Merges): string[] {
  if (task.status !== 'draft' || task.dependsOn.length === 0) return []
  const byId = new Map<string, Task>()
  for (const t of tasks ?? []) byId.set(t.id, t)
  return task.dependsOn.filter((id) => {
    const t = byId.get(id)
    return !t || !implemented(t, merges)
  })
}

export function taskDone(t: Task): boolean {
  return t.status === 'review' || t.status === 'done'
}

export function implemented(t: Task, merges?: Merges): boolean {
  return taskDone(t) || isMerged(t, merges)
}

// Tasks merged into the SDD branch whose status Reconcile has not written yet.
export function unrecorded(f: Feature): string[] {
  return (f.tasks ?? []).filter((t) => !taskDone(t) && isMerged(t, f.merges)).map((t) => t.id)
}

// `running` is the /sdd:* command of the turn running now for this feature: only its step is
// 'current' (animated). With nothing running no step is, except a review that was not ready (red).
export function derive(f: Feature, running: string | null = null): Derived {
  const tasks = f.tasks ?? []
  const hasTasks = tasks.length > 0
  const m = f.merges
  const allDone = hasTasks && tasks.every((t) => implemented(t, m))
  const merged = unrecorded(f)
  // Every next command below runs Reconcile first, which records these merges.
  const recorded = merged.length ? ' Merged, not recorded yet: ' + merged.join(', ') + ' (this command records ' + (merged.length === 1 ? 'it' : 'them') + ' first).' : ''
  let idx: number // index of current step; 6 = everything done
  let next: Next | null
  const status = f.spec.status
  if (f.review === 'READY' || status === 'done') {
    idx = 6
    next = null
  } else if (allDone) {
    idx = 5
    next = { command: '/sdd:review', model: 'Opus', why: (f.review === 'NOT READY' ? 'The last review was not ready: fix the findings, then review again.' : 'All tasks are implemented. Run the final audit before the PR.') + recorded }
  } else if (hasTasks) {
    idx = 4
    // First task not yet implemented whose dependencies are done; else the first unfinished one.
    // A task with a pull request (merge: pr) is waiting for a human, not for the implementer.
    // Both /sdd:implement and /sdd:review mark merged task PRs as review first, so once nothing else
    // is left the next step after the merge is the review, not another implement run.
    // A merged task counts as implemented even before Reconcile records it.
    const open = tasks.filter((t) => !implemented(t, m))
    const waiting = open.filter((t) => t.pr)
    // In progress on a task branch: it runs in its own worktree session, nothing to hand over again.
    const elsewhere = open.filter((t) => !t.pr && t.status === 'in-progress' && t.branch)
    const working = open.filter((t) => !t.pr && !elsewhere.includes(t))
    const closed = waiting.filter((t) => m?.[t.id] === 'closed').map((t) => t.id + ' ' + t.pr)
    const prs = waiting.map((t) => t.pr).join(', ')
    const note = (closed.length ? ' Closed without merging: ' + closed.join(', ') + '.' : '') + recorded
    const ready = working.find((t) => blockedBy(t, tasks, m).length === 0) ?? (waiting.length || elsewhere.length ? undefined : working[0])
    const runs = elsewhere.map((t) => t.id).join(', ')
    next = ready
      ? { command: '/sdd:implement ' + ready.id, model: 'Sonnet', why: 'Hand the task to the implementation flow.' + recorded }
      : elsewhere.length
        ? { command: '/sdd:implement', model: 'Sonnet', why: runs + (elsewhere.length === 1 ? ' runs' : ' run') + ' in its own worktree' + (waiting.length ? ' and ' + prs + ' waits for a merge' : '') + '. A running /sdd:implement starts the next tasks as they land; if that session has ended, run it again.' + note }
        : working.length
        ? { command: '/sdd:implement', model: 'Sonnet', why: 'Waiting for ' + prs + ' to be merged. A running /sdd:implement starts the next tasks after the merge; if that session has ended, run it again.' + note }
        : { command: '/sdd:review', model: 'Opus', why: 'Waiting for ' + prs + ' to be merged. A running /sdd:implement names the review after the merge; otherwise review: it marks the merged tasks as review first.' + note }
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
  const verb = running?.match(/^\/sdd:([a-z]+)/)?.[1] ?? ''
  let at = STEP_LABELS.findIndex(([key]) => key === verb)
  // /sdd:spec on a feature past its draft writes another feature: nothing of this one runs.
  if (at === 0 && idx > 1) at = -1
  const isRunning = at >= 0
  const shown = isRunning ? at : f.review === 'NOT READY' && idx === 5 ? 5 : -1
  const steps: Step[] = STEP_LABELS.map(([key, label], i) => ({
    key,
    label,
    state: i === shown ? 'current' : i < idx ? 'done' : 'todo',
  }))
  const phase = idx >= 6 ? 'done' : STEP_LABELS[idx][0]
  return { phase, steps, next, isRunning }
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
    const approved = ['tasks-ready', 'in-progress', 'done'].includes(f.planStatus ?? '')
    checks.push({ key: 'plan-approved', label: 'Plan approved', ok: approved, hint: approved ? undefined : 'plan is ' + (f.planStatus ?? 'missing') })
    if (f.tasksCommitted !== undefined) checks.push({ key: 'tasks-committed', label: 'tasks.md committed', ok: f.tasksCommitted, hint: f.tasksCommitted ? undefined : 'run /sdd:tasks to commit it' })
    checks.push({ key: 'epic', label: 'Epic set', ok: !!f.epic, hint: f.epic || 'no **Epic:** in tasks.md' })
    if (f.flow) checks.push({ key: 'flow', label: 'Implementation', ok: true, hint: f.flow })
    const arg = command.split(' ')[1]
    if (arg === undefined || arg === 'all') {
      const prs = tasks.filter((t) => !implemented(t, f.merges) && t.pr)
      const elsewhere = tasks.filter((t) => !implemented(t, f.merges) && !t.pr && t.status === 'in-progress' && t.branch)
      if (prs.length) checks.push({ key: 'merge', label: 'Task pull requests merged', ok: false, hint: prs.map((t) => t.id + ' ' + t.pr).join(', ') })
      if (elsewhere.length) checks.push({ key: 'worktrees', label: 'Tasks in their worktrees finished', ok: false, hint: elsewhere.map((t) => t.id).join(', ') })
    } else {
      const target = tasks.find((t) => t.id === arg)
      const waits = target ? blockedBy(target, tasks, f.merges) : []
      checks.push({ key: 'ac', label: 'Task has acceptance criteria', ok: !!target && target.acceptance.length > 0 })
      checks.push({ key: 'deps', label: 'Dependencies implemented', ok: waits.length === 0, hint: waits.length ? 'waiting on ' + waits.join(', ') : undefined })
    }
    questions()
  } else if (verb === '/sdd:review') {
    const prs = (f.tasks ?? []).filter((t) => !implemented(t, f.merges) && t.pr)
    if (prs.length) checks.push({ key: 'merge', label: 'Task pull requests merged', ok: false, hint: prs.map((t) => t.id + ' ' + t.pr).join(', ') })
    else checks.push({ key: 'tasks', label: 'All tasks implemented', ok: true })
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
  const base = specBranch(branch)
  const slug = base.includes('/') ? base.slice(base.indexOf('/') + 1) : base
  if (slug && list.some((f) => f.slug === slug)) return slug
  // Fallback: the newest feature still in progress. Finished ones are never "current" by themselves.
  const latest = [...list].filter((f) => derive(f).phase !== 'done').sort((a, b) => b.modified - a.modified)[0]
  return latest ? latest.slug : null
}

// The spec branch a checkout works for: a task branch (`<spec-branch>--<EPIC>-T<n>`) belongs to its spec.
export function specBranch(branch: string): string {
  return taskBranchBase(branch) ?? branch
}

export function ago(ms: number, now: number): string {
  if (!ms) return ''
  return elapsed(now - ms)
}

// A duration as the board words it: 'just now', '5 min ago', '3 h ago', '2 d ago'.
export function elapsed(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  if (h < 48) return h + ' h ago'
  return Math.round(h / 24) + ' d ago'
}

// How fresh the board's data is: when specs/ was last read and, once asked, when GitHub was. The poll
// redraws when this text changes, so it ages even while nothing else does.
export function freshness(updatedAt: number | null, checkedAt: number | null, now: number): string {
  if (updatedAt === null) return ''
  return 'Updated ' + elapsed(now - updatedAt) + (checkedAt === null ? '' : ' · PRs checked ' + elapsed(now - checkedAt))
}

export function warnings(f: Feature, branch: string): string[] {
  const out: string[] = []
  const d = derive(f)
  if (d.phase !== 'done' && f.spec.branch && branch && f.spec.branch !== specBranch(branch)) out.push('You are on ' + branch + ', the spec belongs to ' + f.spec.branch)
  if (f.review === 'NOT READY') out.push('Last review: not ready')
  return out
}

// Which session the board is drawn in: the spec's own branch (the main SDD session, which owns tasks.md
// and merges the task branches), a task branch of that spec (`<spec-branch>--<EPIC>-T<n>`), or neither.
export type Session = { kind: 'main' } | { kind: 'task'; taskId: string; label: string } | { kind: 'none' }

export function sessionOf(f: Feature | null, branch: string): Session {
  if (!f || !f.spec.branch || !branch) return { kind: 'none' }
  if (branch === f.spec.branch) return { kind: 'main' }
  const full = taskOfBranch(branch)
  if (full && taskBranchBase(branch) === f.spec.branch) {
    // Task ids in tasks.md are `T<n>`; the branch carries the epic too (`ULOG-T3`).
    const short = full.replace(/^.*-(T\d+)$/, '$1')
    if ((f.tasks ?? []).some((t) => t.id === short)) return { kind: 'task', taskId: short, label: full }
  }
  return { kind: 'none' }
}

// How a task row reads: its status, or merged / closed while Reconcile has not recorded the merge,
// or blocked while a dependency is open.
export type TaskLook = 'done' | 'review' | 'in-progress' | 'merged' | 'closed' | 'blocked' | 'draft'

export function taskLook(t: Task, tasks: Task[] | null, merges?: Merges): TaskLook {
  if (t.status === 'done' || t.status === 'review') return t.status
  const m = merges?.[t.id]
  if (m === 'merged' || m === 'closed') return m
  if (t.status === 'in-progress') return 'in-progress'
  return blockedBy(t, tasks, merges).length ? 'blocked' : 'draft'
}

// A short duration for timers: '12s', '4m', '1h 5m'.
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm'
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'
}

// The order tasks can run in: wave n holds the tasks whose dependencies all sit in earlier waves, so the
// tasks of one wave can run side by side. A dependency on a missing task is ignored; a cycle is cut where
// it closes (doctor reports it), so the board never loops on one.
export function taskWaves(tasks: Task[]): Task[][] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const level = new Map<string, number>()
  const visiting = new Set<string>()
  const levelOf = (t: Task): number => {
    const known = level.get(t.id)
    if (known !== undefined) return known
    if (visiting.has(t.id)) return -1
    visiting.add(t.id)
    let l = 0
    for (const id of t.dependsOn) {
      const d = byId.get(id)
      if (d) l = Math.max(l, levelOf(d) + 1)
    }
    visiting.delete(t.id)
    level.set(t.id, l)
    return l
  }
  const waves: Task[][] = []
  for (const t of tasks) (waves[levelOf(t)] ??= []).push(t)
  return waves.filter(Boolean)
}
