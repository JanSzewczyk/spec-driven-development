// Pure model: turns parsed artifacts into a pipeline phase and a suggested next command.
import type { SpecInfo, Story } from './parse.ts'

export type Feature = {
  slug: string
  spec: SpecInfo
  planStatus: string | null
  stories: Story[] | null
  review: 'GO' | 'NO-GO' | null
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

export function taskCounts(stories: Story[] | null) {
  const c = { total: 0, draft: 0, 'in-progress': 0, review: 0, done: 0 } as Record<string, number>
  for (const s of stories ?? []) {
    for (const t of s.tasks) {
      c.total += 1
      const k = t.status in c ? t.status : 'draft'
      c[k] += 1
    }
  }
  return c
}

export function storyDone(s: Story): boolean {
  return s.tasks.length > 0 && s.tasks.every((t) => t.status === 'review' || t.status === 'done')
}

export function derive(f: Feature): Derived {
  const hasTasks = !!f.stories && f.stories.some((s) => s.tasks.length > 0)
  const allDone = hasTasks && (f.stories ?? []).every(storyDone)
  let idx: number // index of current step; 6 = everything done
  let next: Next | null
  const status = f.spec.status
  if (f.review === 'GO' || status === 'done') {
    idx = 6
    next = null
  } else if (allDone) {
    idx = 5
    next = { command: '/sdd:review', model: 'Opus', why: f.review === 'NO-GO' ? 'The last review was NO-GO: fix the findings, then review again.' : 'All tasks are implemented. Run the final audit before the PR.' }
  } else if (hasTasks) {
    idx = 4
    const open = (f.stories ?? []).find((s) => !storyDone(s))
    const sid = open ? open.id : 'S1'
    next = { command: '/sdd:implement ' + sid, model: 'Sonnet', why: 'Implement the whole Story in one session (test first, then code).' }
  } else if (status === 'planned' || f.planStatus !== null) {
    idx = 3
    next = { command: '/sdd:tasks', model: 'Sonnet', why: 'Break the plan into tagged, routed tasks.' }
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
  if (f.spec.openQuestions > 0 && d.phase !== 'clarify' && d.phase !== 'done') out.push(f.spec.openQuestions + ' open question(s) in the spec')
  if (d.phase !== 'done' && f.spec.branch && branch && f.spec.branch !== branch) out.push('You are on ' + branch + ', the spec belongs to ' + f.spec.branch)
  if (f.review === 'NO-GO') out.push('Last review verdict: NO-GO')
  return out
}
