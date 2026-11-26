// Read and change specs/capabilities.yml by dotted key. A change is written only when the doctor's
// capabilities rules find nothing new in the result, so the CLI and `/sdd:doctor check` agree on
// what a valid file is. Pure. No mods API in here.
import { effectiveConfig, runChecks } from './check.ts'
import type { Capabilities, Finding, Snapshot } from './check.ts'
import { parseCapabilities } from './capabilities.ts'
import { WORKFLOW_VERSION } from './formats.ts'
import { setYamlScalar } from './yaml-edit.ts'

export type ConfigValue = { value: string; source: 'set' | 'default' }

const FIXED: Record<string, string[]> = {
  implementation: ['default', 'isolation'],
  actions: ['branch', 'commit', 'pr'],
  review: ['tests', 'publish', 'default', 'ci', 'checks'],
}

// Every value /sdd:implement, /sdd:review and the git actions use, by dotted key, set or default.
export function configValues(caps: Capabilities): Record<string, ConfigValue> {
  const out: Record<string, ConfigValue> = {}
  for (const sec of effectiveConfig(caps, null).sections) {
    const name = sec.title.toLowerCase()
    for (const e of sec.entries) {
      const key = e.parent ? `${name}.isolation.worktree.${e.key}` : FIXED[name]?.includes(e.key) ? `${name}.${e.key}` : `${name}.projects.${e.key}`
      out[key] = { value: e.value, source: e.source }
    }
  }
  return out
}

function capabilityFindings(text: string): Finding[] {
  const snapshot: Snapshot = {
    mode: 'ci',
    workflow: `# sdd-workflow: ${WORKFLOW_VERSION}`, // judged elsewhere: a missing workflow is not this edit's problem
    constitution: null,
    template: null,
    capabilities: text,
    legacyCapabilities: null,
    legacy: [],
    features: [],
    settings: null,
    git: { isRepo: true, clean: true, gh: null, ghAuth: null },
    paths: {},
    tools: {},
    flows: {},
  }
  return runChecks(snapshot).checks.find((c) => c.id === 3)?.findings ?? []
}

const DEFAULTS_NOTE = /are all at their defaults/

export type ConfigEdit = { ok: true; text: string; previous: string } | { ok: false; error: string }

export function setConfigValue(text: string, key: string, value: string): ConfigEdit {
  const path = key.split('.').filter(Boolean)
  if (path.length === 0) return { ok: false, error: 'give a key, e.g. implementation.default' }
  if (['format', 'projects', 'generated'].includes(path[0])) return { ok: false, error: `${path[0]} is written by /sdd:doctor init; edit it by hand if you must` }
  if (path.join('.') === 'review.checks') return { ok: false, error: 'review.checks is a list; edit it by hand or with /sdd:capabilities' }
  const before = parseCapabilities(text)
  if (before.errors.length > 0) return { ok: false, error: `specs/capabilities.yml does not parse (line ${before.errors[0].line}: ${before.errors[0].message}); fix it first` }

  const edit = setYamlScalar(text, path, value)
  if (!edit.ok) return edit
  const after = parseCapabilities(edit.text)
  if (after.errors.length > 0) return { ok: false, error: `the change would not parse (line ${after.errors[0].line}: ${after.errors[0].message})` }
  const old = capabilityFindings(text).map((f) => f.text)
  const added = capabilityFindings(edit.text).filter((f) => !old.includes(f.text) && !DEFAULTS_NOTE.test(f.text))
  if (added.length > 0) return { ok: false, error: added.map((f) => f.text).join('; ') }
  return { ok: true, text: edit.text, previous: configValues(before)[path.join('.')]?.value ?? '' }
}
