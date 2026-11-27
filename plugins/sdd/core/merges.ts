// Whether an isolated task's work has reached the SDD branch, before Reconcile records it in tasks.md
// (references/status-lifecycle.md). Pure: the host runs git and gh and hands the output over.
import type { Task } from './parse.ts'

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED'
// merged: on the SDD branch, status not written yet; closed: PR closed unmerged; open: PR still open.
export type MergeState = 'merged' | 'closed' | 'open'

// `<spec-branch>--<EPIC>-T<n>` (skills/implement/references/worktree.md) → the spec branch, else null.
// Epic ids may hold '-' and lowercase letters (LOG-7f3a).
export function taskBranchBase(branch: string): string | null {
  const m = /^(.+?)--.+-T\d+$/.exec(branch)
  return m ? m[1] : null
}

// `<spec-branch>--<EPIC>-T<n>` → the task's full id `<EPIC>-T<n>`, else null.
export function taskOfBranch(branch: string): string | null {
  const m = /^.+?--(.+-T\d+)$/.exec(branch)
  return m ? m[1] : null
}

// The path of the worktree that has `branch` checked out, from `git worktree list --porcelain`.
export function worktreeOf(porcelain: string, branch: string): string | null {
  for (const block of porcelain.split(/\n\s*\n/)) {
    let path: string | null = null
    let head: string | null = null
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim()
      else if (line.startsWith('branch ')) head = line.slice('branch '.length).trim()
    }
    if (path !== null && head === 'refs/heads/' + branch) return path
  }
  return null
}

// A task's `pr:` (`#12`, `12` or a pull request URL) → its number, else null.
export function prNumber(pr: string): number | null {
  const m = /(?:^#?|\/pull\/)(\d+)\/?\s*$/.exec(pr.trim())
  return m ? Number(m[1]) : null
}

export type PrInfo = { state: PrState; url: string }

// `gh pr list --json number,state,url` output → state and link by PR number. Throws on output that is not that list.
export function prList(json: string): Map<number, PrInfo> {
  const list = JSON.parse(json)
  if (!Array.isArray(list)) throw new Error('gh pr list: expected a JSON array')
  const out = new Map<number, PrInfo>()
  for (const pr of list) {
    const state = String(pr?.state ?? '').toUpperCase()
    if (typeof pr?.number === 'number' && (state === 'OPEN' || state === 'MERGED' || state === 'CLOSED')) out.set(pr.number, { state, url: typeof pr?.url === 'string' ? pr.url : '' })
  }
  return out
}

// `gh pr list --json number,state` output → state by PR number. Throws on output that is not that list.
export function prStates(json: string): Map<number, PrState> {
  return new Map([...prList(json)].map(([n, p]) => [n, p.state]))
}

// A task's pull request as the board shows it: number, state and link, each null while unknown.
export type TaskPr = { number: number | null; state: PrState | null; url: string | null }

// Every task with `pr:`, whatever its status, joined with what GitHub said; a `pr:` written as a URL is its own link.
export function taskPrs(tasks: Task[], list: Map<number, PrInfo> | null): Record<string, TaskPr> {
  const out: Record<string, TaskPr> = {}
  for (const t of tasks) {
    if (!t.pr) continue
    const n = prNumber(t.pr)
    const info = n === null || list === null ? undefined : list.get(n)
    const own = /^https?:\/\//.test(t.pr.trim()) ? t.pr.trim() : null
    out[t.id] = { number: n, state: info?.state ?? null, url: info?.url || own }
  }
  return out
}

// Whether a commit message carries the trailer `Task: <id>` that every task commit has; `T1` never matches `T10`.
export function hasTaskTrailer(message: string, id: string): boolean {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^Task:[ \\t]*' + esc + '[ \\t]*$', 'mi').test(message)
}

// The Reconcile rules: a task with `pr:` follows its PR; one with only `branch:` is merged once it has
// landed: the branch is an ancestor of the SDD branch and its tip is a task commit (`Task:` trailer). A
// fresh branch, or one cut from main, is an ancestor too, but has no task commit yet.
// null: not isolated, already recorded, or not known yet.
export function mergeState(task: Task, states: Map<number, PrState> | null, landed: boolean | null): MergeState | null {
  if (task.status === 'review' || task.status === 'done') return null
  if (task.pr) {
    const n = prNumber(task.pr)
    const state = n === null || states === null ? undefined : states.get(n)
    return state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : state === 'OPEN' ? 'open' : null
  }
  if (task.branch) return landed === true ? 'merged' : null
  return null
}
