// Which tasks `/sdd:implement` works on next: the feature of the current branch, its epic, the
// tasks in dependency order with what blocks each, who implements it and the isolation mode.
// Pure: takes already-read files. No mods API in here.
import { isolationOf, loadCapabilities, overrides, section, text } from './capabilities.ts'
import type { Isolation } from './capabilities.ts'
import type { FeatureFiles } from './features.ts'
import { IMPLEMENTATION_DEFAULT } from './formats.ts'
import { parseEpicId, parseSpec, parseTasks } from './parse.ts'
import { taskIdOf } from './tasks-edit.ts'

export type NextInput = {
  branch: string // git branch --show-current
  features: FeatureFiles[]
  capabilities: string | null // specs/capabilities.yml
  legacyCapabilities: string | null // specs/capabilities.md, read only when the YAML file is absent
  arg: string // '' or 'all': every open task; otherwise one task id
}
export type NextTask = {
  id: string
  fullId: string // <EPIC>-T<n>
  title: string
  status: string
  project: string
  repo: boolean // the project is a sibling repository
  flow: string // skill:<name> | agent:<name> | command:<shell> | in-session
  dependsOn: string[]
  blockedBy: string[] // dependencies not yet review|done
  running: boolean // isolation worktree: it has a branch or a PR and waits to be merged
  ready: boolean // can be handed over now
  branch: string
  pr: string
}
export type NextResult =
  | { stop: string; features?: { slug: string; branch: string }[] }
  | {
      feature: { slug: string; branch: string; epic: string; dir: string }
      isolation: Isolation
      reconcile: string[] // tasks with a branch or PR: run Reconcile before trusting their status
      tasks: NextTask[] // the open tasks asked for, in dependency order
      done: boolean // nothing left to implement: next is /sdd:review
    }

const FINISHED = ['review', 'done']

// Dependency order, keeping the file order among tasks that do not depend on each other; null on a cycle.
function ordered<T extends { id: string; dependsOn: string[] }>(tasks: T[]): T[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out: T[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (t: T): boolean => {
    const s = state.get(t.id)
    if (s === 'done') return true
    if (s === 'visiting') return false
    state.set(t.id, 'visiting')
    for (const d of t.dependsOn) {
      const dep = byId.get(taskIdOf(d))
      if (dep && !visit(dep)) return false
    }
    state.set(t.id, 'done')
    out.push(t)
    return true
  }
  for (const t of tasks) if (!visit(t)) return null
  return out
}

export function nextTasks(input: NextInput): NextResult {
  if (input.capabilities === null && input.legacyCapabilities !== null) return { stop: 'Run `/sdd:doctor init` to migrate specs/capabilities.md.' }
  const caps = loadCapabilities(input.capabilities, null)
  if (caps && caps.errors.length > 0) return { stop: `specs/capabilities.yml: line ${caps.errors[0].line}: ${caps.errors[0].message}. Fix it or run \`/sdd:doctor check\`.` }

  const feature = input.features.find((f) => f.spec !== null && parseSpec(f.spec).branch === input.branch)
  if (!feature) {
    return {
      stop: `No specs/*/spec.md has **Branch:** ${input.branch || '(no branch)'}. List the specs and ask which feature to implement.`,
      features: input.features.filter((f) => f.spec !== null).map((f) => ({ slug: f.slug, branch: parseSpec(f.spec!).branch })),
    }
  }
  if (feature.tasks === null) return { stop: `specs/${feature.slug}/tasks.md is missing. Run \`/sdd:tasks\`.` }
  const epic = parseEpicId(feature.tasks)
  if (!epic) return { stop: 'Run `/sdd:tasks` (or `/sdd:doctor init`) to assign an epic id.' }

  const isolation: Isolation = caps ? isolationOf(caps) : { mode: 'none' }
  const flowDefault = (caps ? text(section(caps, 'implementation').default) : '') || IMPLEMENTATION_DEFAULT
  const perProject = new Map(caps ? overrides(caps, 'implementation') : [])
  const repos = new Set((caps?.projects ?? []).filter((p) => p.repo).map((p) => p.name))

  const all = parseTasks(feature.tasks)
  const sorted = ordered(all)
  if (!sorted) return { stop: 'tasks.md has a dependency cycle. Fix `depends_on` or re-run `/sdd:tasks`.' }
  const statusOf = new Map(all.map((t) => [t.id, t.status]))
  const view = (t: (typeof all)[number]): NextTask => {
    const blockedBy = t.dependsOn.map(taskIdOf).filter((d) => d && !FINISHED.includes(statusOf.get(d) ?? ''))
    const running = isolation.mode === 'worktree' && t.status === 'in-progress' && (t.branch !== '' || t.pr !== '')
    return {
      id: t.id,
      fullId: `${epic}-${t.id}`,
      title: t.title,
      status: t.status,
      project: t.project,
      repo: repos.has(t.project),
      flow: perProject.get(t.project) || flowDefault,
      dependsOn: t.dependsOn.map(taskIdOf).filter(Boolean),
      blockedBy,
      running,
      ready: !FINISHED.includes(t.status) && blockedBy.length === 0 && !running,
      branch: t.branch,
      pr: t.pr,
    }
  }

  const arg = input.arg.trim()
  let picked: NextTask[]
  if (arg === '' || arg.toLowerCase() === 'all') {
    picked = sorted.filter((t) => !FINISHED.includes(t.status)).map(view)
  } else {
    const id = taskIdOf(arg)
    const task = all.find((t) => t.id === id)
    if (!task) return { stop: `"${arg}" is not a task in specs/${feature.slug}/tasks.md (ids: ${all.map((t) => t.id).join(', ') || 'none'}).` }
    const v = view(task)
    if (v.blockedBy.length > 0) return { stop: `${v.fullId} waits for ${v.blockedBy.join(', ')} (not review or done yet).` }
    picked = [v]
  }

  return {
    feature: { slug: feature.slug, branch: input.branch, epic, dir: `specs/${feature.slug}` },
    isolation,
    reconcile: isolation.mode === 'worktree' ? all.filter((t) => t.branch !== '' || t.pr !== '').map((t) => t.id) : [],
    tasks: picked,
    done: all.every((t) => FINISHED.includes(t.status)),
  }
}
