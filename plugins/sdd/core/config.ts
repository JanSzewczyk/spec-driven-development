// The effective configuration: what `/sdd:implement`, `/sdd:review` and the git actions will use,
// value by value, set or default. Pure; shown by the board's Config pane, read by `sdd config`.
import { generatedPaths, isolationOf, overrides, reviewChecks, section, text } from './capabilities.ts'
import type { Capabilities, Project } from './capabilities.ts'
import { parseCommandTable } from './constitution.ts'
import type { CommandRow } from './constitution.ts'
import { ACTION_KEYS, IMPLEMENTATION_DEFAULT, REVIEW_DEFAULTS, WORKTREE_DEFAULTS, WORKTREE_KEYS } from './formats.ts'

export type FlowRef = { kind: 'skill' | 'agent' | 'command'; name: string; where: string }
// `parent` names the entry an option belongs to (merge and parallel belong to isolation: worktree); a view nests it under that entry.
export type ConfigEntry = { key: string; value: string; source: 'set' | 'default'; parent?: string }
export type ConfigSection = { title: string; entries: ConfigEntry[] }
export type Config = { path: string; legacy: boolean; projects: Project[]; commands: CommandRow[]; sections: ConfigSection[]; generated: number; configured: boolean }

const SESSION_GIT = 'the session (git + gh)'

// Every `skill:` / `agent:` / `command:` value the user set in implementation, actions and review.
export function flowRefs(caps: Capabilities): FlowRef[] {
  const out: FlowRef[] = []
  const add = (value: string, where: string) => {
    const m = value.trim().match(/^(skill|agent|command):(\S.*)$/)
    if (m) out.push({ kind: m[1] as FlowRef['kind'], name: m[2].trim(), where })
  }
  add(text(section(caps, 'implementation').default), 'Implementation default')
  for (const [k, v] of overrides(caps, 'implementation')) add(v, 'Implementation ' + k)
  for (const [k, v] of Object.entries(section(caps, 'actions'))) add(text(v), 'Actions ' + k)
  add(text(section(caps, 'review').default), 'Review default')
  for (const [k, v] of overrides(caps, 'review')) add(v, 'Review ' + k)
  for (const c of reviewChecks(caps)) add(c, 'Review checks')
  return out
}

// What `/sdd:implement`, `/sdd:review` and the git actions will really use: the user's value, or the default.
export function effectiveConfig(caps: Capabilities, constitution: string | null): Config {
  const entry = (key: string, value: string, fallback: string): ConfigEntry => {
    const set = value !== '' && value !== fallback
    return { key, value: value !== '' ? value : fallback, source: set ? 'set' : 'default' }
  }
  const perProject = (own: Map<string, string>, fallback: string, all: boolean): ConfigEntry[] =>
    caps.projects
      .filter((p) => all || own.has(p.name))
      .map((p) => {
        const v = own.get(p.name)
        return v ? { key: p.name, value: v, source: v === fallback ? 'default' : 'set' } : { key: p.name, value: fallback, source: 'default' }
      })

  const impl = section(caps, 'implementation')
  const implDefault = entry('default', text(impl.default), IMPLEMENTATION_DEFAULT)
  const implementation: ConfigEntry[] = [implDefault, ...perProject(new Map(overrides(caps, 'implementation')), implDefault.value, true)]
  const iso = isolationOf(caps)
  implementation.push(entry('isolation', iso.mode === 'worktree' ? 'worktree' : '', 'none'))
  if (iso.mode === 'worktree') {
    for (const k of Object.keys(WORKTREE_KEYS)) implementation.push({ ...entry(k, iso[k as 'merge' | 'parallel'], WORKTREE_DEFAULTS[k]), parent: 'isolation' })
  }

  const act = section(caps, 'actions')
  const actions: ConfigEntry[] = ACTION_KEYS.map((k) => (text(act[k]) ? { key: k, value: text(act[k]), source: 'set' } : { key: k, value: SESSION_GIT, source: 'default' }))

  const rev = section(caps, 'review')
  const revDefault = entry('default', text(rev.default), REVIEW_DEFAULTS.default)
  const review: ConfigEntry[] = [entry('tests', text(rev.tests), REVIEW_DEFAULTS.tests), entry('publish', text(rev.publish), REVIEW_DEFAULTS.publish), revDefault]
  review.push(...perProject(new Map(overrides(caps, 'review')), revDefault.value, false))
  review.push(entry('ci', text(rev.ci), 'unset'))
  const checks = reviewChecks(caps)
  review.push({ key: 'checks', value: checks.length ? checks.join(', ') : 'none', source: checks.length ? 'set' : 'default' })

  const sections: ConfigSection[] = [
    { title: 'Implementation', entries: implementation },
    { title: 'Actions', entries: actions },
    { title: 'Review', entries: review },
  ]
  return {
    path: caps.path,
    legacy: caps.legacy,
    projects: caps.projects,
    commands: constitution ? (parseCommandTable(constitution) ?? []) : [],
    sections,
    generated: generatedPaths(caps).length,
    configured: sections.some((sec) => sec.entries.some((e) => e.source === 'set' && e.key !== 'ci')), // ci is about CI, not about who does a step
  }
}

