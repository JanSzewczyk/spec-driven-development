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

// `gh pr list --json number,state` output → state by PR number. Throws on output that is not that list.
export function prStates(json: string): Map<number, PrState> {
  const list = JSON.parse(json)
  if (!Array.isArray(list)) throw new Error('gh pr list: expected a JSON array')
  const out = new Map<number, PrState>()
  for (const pr of list) {
    const state = String(pr?.state ?? '').toUpperCase()
    if (typeof pr?.number === 'number' && (state === 'OPEN' || state === 'MERGED' || state === 'CLOSED')) out.set(pr.number, state)
  }
  return out
}

// The Reconcile rules: a task with `pr:` follows its PR; one with only `branch:` is merged once the
// branch is an ancestor of the SDD branch. null: not isolated, already recorded, or not known yet.
export function mergeState(task: Task, states: Map<number, PrState> | null, isAncestor: boolean | null): MergeState | null {
  if (task.status === 'review' || task.status === 'done') return null
  if (task.pr) {
    const n = prNumber(task.pr)
    const state = n === null || states === null ? undefined : states.get(n)
    return state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : state === 'OPEN' ? 'open' : null
  }
  if (task.branch) return isAncestor === true ? 'merged' : null
  return null
}
