// Pure model: turns parsed artifacts into a pipeline phase and a suggested next command.
import type { Config } from '../../core/config.ts'
import type { FeatureFiles } from '../../core/features.ts'
import { taskBranchBase, taskOfBranch } from '../../core/merges.ts'
import type { MergeState, TaskPr } from '../../core/merges.ts'
import { parseEpicId, parsePlan, parseReview, parseReviewDetail, parseSpec, parseTasks } from '../../core/parse.ts'
import type { Blocker, Finding, PlanInfo, ReviewDetail, SpecInfo, Task, Verdict } from '../../core/parse.ts'
import type { AgentRun, Live } from './live.ts'

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
  reviewDetail?: ReviewDetail | null // what review.md records per check
  reviewFlow?: ReviewFlow // the review: section of capabilities.yml; absent while unknown
  reviewAt?: number // when review.md was last written
  reviewCommits?: number // commits on the branch after review.md was written
  fixedSince?: string[] // task ids (T<n>) whose `Task:` commits landed after review.md was written
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
    reviewDetail: files.review === null ? null : parseReviewDetail(files.review),
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

// Tasks the last NOT READY review sent back with a must-fix blocker: still owed, or committed since.
// `untasked` counts must-fix blockers that name no task of tasks.md: no commit can show them fixed.
export function mustFix(f: Feature): { owed: string[]; fixed: string[]; untasked: number } {
  if (f.review !== 'NOT READY') return { owed: [], fixed: [], untasked: 0 }
  const tasks = f.tasks ?? []
  const since = new Set(f.fixedSince ?? [])
  const must = (f.reviewDetail?.blockers ?? []).filter((b) => b.mustFix)
  const named = [...new Set(must.filter((b) => b.task && tasks.some((t) => t.id === b.task)).map((b) => b.task))]
  const untasked = must.filter((b) => !b.task || !tasks.some((t) => t.id === b.task)).length
  return { owed: named.filter((id) => !since.has(id)), fixed: named.filter((id) => since.has(id)), untasked }
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
    // A review that was not ready names the tasks to re-run for its must-fix blockers.
    // A task committed after review.md was written counts as fixed: the next step is the review again.
    const { owed, fixed, untasked } = mustFix(f)
    next = owed.length
      ? { command: '/sdd:implement ' + owed[0], model: 'Sonnet', why: 'The last review was not ready: ' + owed.join(', ') + (owed.length === 1 ? ' has' : ' have') + ' must-fix blockers. Re-run ' + (owed.length === 1 ? 'it' : 'each') + ', then /sdd:review again.' + (fixed.length ? ' Fixed since: ' + fixed.join(', ') + '.' : '') + recorded }
      : { command: '/sdd:review', model: 'Opus', why: (f.review !== 'NOT READY' ? 'All tasks are implemented. Run the final audit before the PR.' : fixed.length && !untasked ? 'Fixed since the last review: ' + fixed.join(', ') + '. Review again to replace the NOT READY verdict.' : 'The last review was not ready: fix the findings, then review again.') + recorded }
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
        ? { command: '/sdd:implement', model: 'Sonnet', why: runs + (elsewhere.length === 1 ? ' runs in its own worktree' : ' run in their own worktrees') + (waiting.length ? ' and ' + prs + ' waits for a merge' : '') + '. A running /sdd:implement starts the next tasks as they land; if that session has ended, run it again.' + note }
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
  // Tasks in progress (in their own sessions, or waiting on a PR) keep Implement moving while this session is idle.
  const working = at < 0 && idx === 4 && tasks.some((t) => t.status === 'in-progress' && !implemented(t, m))
  const isRunning = at >= 0 || working
  const shown = at >= 0 ? at : working ? 4 : f.review === 'NOT READY' && idx === 5 ? 5 : -1
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
    const { owed, fixed, untasked } = mustFix(f)
    const isFixed = f.review !== 'NOT READY' || (fixed.length > 0 && owed.length === 0 && untasked === 0)
    checks.push({ key: 'verdict', label: 'Last review findings fixed', ok: isFixed, hint: f.review !== 'NOT READY' ? undefined : isFixed ? 'committed since: ' + fixed.join(', ') : 'the last review was not ready' })
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

// The review: section of capabilities.yml as /sdd:review runs it, with each project's test command.
export type ReviewFlow = { tests: string; publish: string; default: string; projects: Record<string, string>; checks: string[]; commands: Record<string, string> }

const REVIEW_KEYS = new Set(['tests', 'publish', 'default', 'ci', 'checks'])

export function reviewFlow(cfg: Config | null): ReviewFlow | undefined {
  const entries = cfg?.sections.find((s) => s.title === 'Review')?.entries
  if (!cfg || !entries) return undefined
  const get = (k: string) => entries.find((e) => e.key === k)?.value ?? ''
  const projects: Record<string, string> = {}
  for (const e of entries) if (!REVIEW_KEYS.has(e.key)) projects[e.key] = e.value
  const checks = get('checks') === 'none' ? [] : get('checks').split(',').map((c) => c.trim()).filter(Boolean)
  const commands: Record<string, string> = {}
  for (const r of cfg.commands) commands[r.project] = r.commands.coverage || r.commands.test || ''
  return { tests: get('tests') || 'run', publish: get('publish') || 'ask', default: get('default') || 'auto', projects, checks, commands }
}

// One check of /sdd:review, in the order it runs them: step 2 in parallel (tests per project,
// spec-verifier, each review.checks entry, each agent audit), the reviewer agent (constitution rules,
// skill audits), then publish. `ran` = finished in this run, its result not written to review.md yet.
export type CheckState = 'pass' | 'fail' | 'warn' | 'running' | 'ran' | 'queued' | 'skipped' | 'unknown'
export type ReviewCheck = { key: string; stage: 1 | 2 | 3; name: string; source: string; state: CheckState; summary: string; findings: Finding[]; since?: number }
export type ReviewView = { checks: ReviewCheck[]; isRunning: boolean; verdict: Verdict | null; blockers: Blocker[]; accepted: string[]; at?: number; commitsSince?: number; fixed: string[] }

const lastPart = (v: string) => v.replace(/^(agent|skill|command):/, '').split(':').pop() ?? v
const sameAgent = (type: string, flow: string) => lastPart(type) === lastPart(flow)
const counted = (f: Finding[]) => (['critical', 'major', 'minor'] as const).map((s) => f.filter((x) => x.severity === s).length + ' ' + s).join(' · ')

// The projects the review covers: those the tasks touch, else every configured one.
function reviewProjects(f: Feature, flow: ReviewFlow): string[] {
  const own = [...new Set((f.tasks ?? []).map((t) => t.project).filter(Boolean))]
  return own.length ? own : Object.keys(flow.commands)
}

// The agents of a running /sdd:review, so the live strip leaves them to the Review card.
export function isReviewAgent(type: string, flow: ReviewFlow | undefined): boolean {
  if (/(^|:)(spec-verifier|reviewer)$/.test(type)) return true
  if (!flow) return false
  return [...flow.checks, ...Object.values(flow.projects), flow.default].some((v) => v.startsWith('agent:') && sameAgent(type, v))
}

export function reviewView(f: Feature, live: Live | null, running: string | null): ReviewView | null {
  const flow = f.reviewFlow
  if (!flow) return null
  const d = f.reviewDetail ?? null
  // Running: this turn runs /sdd:review, or review agents still work in the background after it.
  const isRunning = (!!live?.turn && /^\/sdd:review\b/.test(running ?? '')) || (live?.agents ?? []).some((a) => a.status === 'working' && isReviewAgent(a.type, flow))
  const since = live?.turn && /^\/sdd:review\b/.test(running ?? '') ? live.turn.since : 0
  const agents = (live?.agents ?? []).filter((a) => a.since >= since)
  const projects = reviewProjects(f, flow)
  const flowOf = (p: string) => flow.projects[p] ?? flow.default
  const checks: ReviewCheck[] = []
  const add = (c: Omit<ReviewCheck, 'state' | 'summary' | 'findings'>, state: CheckState, summary = '', findings: Finding[] = []) => checks.push({ ...c, state, summary, findings })
  // Live state of a check run by an agent of this turn.
  const agentState = (match: (a: AgentRun) => boolean): [CheckState, number | undefined] => {
    const a = agents.filter(match).pop()
    return a ? [a.status === 'working' ? 'running' : a.status === 'completed' ? 'ran' : 'fail', a.since] : ['queued', undefined]
  }
  const usedAudits = new Set<number>()
  const auditOf = (flowValue: string, project?: string) => {
    const name = lastPart(flowValue)
    let i = (d?.audits ?? []).findIndex((a, j) => !usedAudits.has(j) && lastPart(a.name) === name && (!project || a.label === '' || project.endsWith(a.label) || a.label.endsWith(project)))
    if (i < 0) i = (d?.audits ?? []).findIndex((a, j) => !usedAudits.has(j) && lastPart(a.name) === name)
    if (i < 0) return null
    usedAudits.add(i)
    return d!.audits[i]
  }
  const fromAudit = (a: ReturnType<typeof auditOf>): [CheckState, string, Finding[]] => {
    if (!a) return ['unknown', 'not in review.md', []]
    const state: CheckState = a.result === 'PASS' ? (a.findings.some((x) => x.severity !== 'minor') ? 'warn' : 'pass') : a.result === 'FAIL' ? 'fail' : a.result === 'SKIPPED' ? 'skipped' : 'unknown'
    return [state, a.counts ? a.counts.replace(/ (critical|major) /g, ' $1 · ') : a.findings.length ? counted(a.findings) : a.note, a.findings]
  }

  // Step 2: in parallel.
  const anySpawned = agents.length > 0
  for (const p of projects) {
    const c = { key: 'tests:' + p, stage: 1 as const, name: 'tests · ' + p, source: 'review.tests: ' + flow.tests + (flow.commands[p] ? ' · ' + flow.commands[p] : '') }
    if (flow.tests === 'skip') add(c, 'skipped', 'review.tests: skip')
    else if (isRunning) {
      const cmd = flow.commands[p]
      const now = live?.tool?.tool === 'Bash' && !!cmd && live.tool.detail.includes(cmd)
      add({ ...c, since: now ? live!.tool!.at : undefined }, now ? 'running' : anySpawned ? 'ran' : 'queued')
    } else {
      const t = d?.tests.find((x) => x.project === p || x.project.endsWith(p) || p.endsWith(x.project))
      add(c, !t ? 'unknown' : t.passed === false ? 'fail' : t.passed === true ? 'pass' : 'unknown', t ? t.text : 'not in review.md')
    }
  }
  {
    const c = { key: 'spec-verifier', stage: 1 as const, name: 'spec-verifier', source: 'always · ACs, non-goals, drift' }
    if (isRunning) {
      const [st, at] = agentState((a) => /spec-verifier$/.test(a.type))
      add({ ...c, since: at }, st)
    } else if (d?.ac) add(c, d.ac.met >= d.ac.total ? 'pass' : 'fail', d.ac.met + '/' + d.ac.total + ' AC met')
    else add(c, 'unknown', 'not in review.md')
  }
  flow.checks.forEach((v, i) => {
    const c = { key: 'check:' + i, stage: 1 as const, name: lastPart(v), source: 'review.checks · ' + v }
    if (!v.startsWith('agent:')) return // skill checks run inside the reviewer
    if (isRunning) {
      const [st, at] = agentState((a) => sameAgent(a.type, v))
      add({ ...c, since: at }, st)
    } else add(c, ...fromAudit(auditOf(v)))
  })
  for (const p of projects) {
    const v = flowOf(p)
    if (!v.startsWith('agent:')) continue
    const c = { key: 'audit:' + p, stage: 1 as const, name: lastPart(v) + ' · ' + p, source: (flow.projects[p] ? 'review.projects.' + p : 'review.default') + ' · ' + v }
    if (isRunning) {
      const [st, at] = agentState((a) => sameAgent(a.type, v))
      add({ ...c, since: at }, st)
    } else add(c, ...fromAudit(auditOf(v, p)))
  }

  // The reviewer agent: constitution rules and the skill audits.
  const [revState, revAt] = isRunning ? agentState((a) => /(^|:)reviewer$/.test(a.type)) : ['queued' as CheckState, undefined]
  {
    const c = { key: 'rules', stage: 2 as const, name: 'constitution rules', source: 'constitution §5 · WHAT NOT TO DO', since: revAt }
    if (isRunning) add(c, revState)
    else if (d && (d.rules.respected || d.rules.violated.length)) add(c, d.rules.violated.length ? 'warn' : 'pass', d.rules.respected + ' respected · ' + d.rules.violated.length + ' violated', d.rules.violated)
    else add(c, 'unknown', 'not in review.md')
  }
  {
    const skills = [...new Set([flow.default, ...projects.map(flowOf), ...flow.checks].filter((v) => !v.startsWith('agent:')))]
    const c = { key: 'skills', stage: 2 as const, name: 'skill audits', source: skills.length ? skills.join(', ') : 'none: every audit is an agent', since: revAt }
    const rest = (d?.audits ?? []).filter((_, i) => !usedAudits.has(i))
    if (isRunning) add(c, skills.length ? revState : 'skipped')
    else if (!skills.length && !rest.length) add(c, 'skipped', 'none configured')
    else if (!rest.length) add(c, 'unknown', 'not in review.md')
    else {
      const parts = rest.map((a) => fromAudit(a))
      const order: CheckState[] = ['fail', 'warn', 'pass', 'unknown', 'skipped']
      const worst = order.find((o) => parts.some((p) => p[0] === o)) ?? 'unknown'
      add(c, worst === 'unknown' && rest.every((a) => a.result === null) ? 'skipped' : worst, rest.length === 1 ? parts[0][1] || rest[0].name : rest.map((a) => a.name + (a.result ? ' ' + a.result : '')).join(', '), parts.flatMap((p) => p[2]))
    }
  }
  // Publish: after READY.
  {
    const c = { key: 'publish', stage: 3 as const, name: 'commit and PR', source: 'review.publish: ' + flow.publish }
    if (isRunning) add(c, 'queued')
    else if (d?.verdict === 'READY') add(c, flow.publish === 'off' ? 'skipped' : 'pass', flow.publish === 'off' ? 'review.publish: off' : 'after READY')
    else if (d?.verdict === 'NOT READY') add(c, 'skipped', 'not run: NOT READY')
    else add(c, 'queued', 'after READY')
  }
  return { checks, isRunning, verdict: isRunning ? null : (d?.verdict ?? null), blockers: isRunning ? [] : (d?.blockers ?? []), accepted: d?.accepted ?? [], at: f.reviewAt, commitsSince: f.reviewCommits, fixed: f.fixedSince ?? [] }
}
