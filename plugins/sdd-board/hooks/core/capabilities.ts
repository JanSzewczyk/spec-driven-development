// specs/capabilities.yml: read it (or the legacy specs/capabilities.md) into one shape, and the
// accessors every rule uses. No mods API in here.
import { parseYaml } from './yaml.ts'
import type { YamlError, YamlValue } from './yaml.ts'
import { CAPABILITIES_PATH, LEGACY_CAPABILITIES_PATH, LEGACY_SECTIONS, REVIEW_KEYS, SDD_FORMAT_MARKER, WORKTREE_DEFAULTS, WORKTREE_KEYS } from './formats.ts'

export type Project = { name: string; kind: string; path: string; stack: string; repo: boolean }
export type YamlMap = { [key: string]: YamlValue }
export type Isolation = { mode: 'none' } | { mode: 'worktree'; merge: string; parallel: string }
export type Capabilities = {
  path: string // the file it was read from
  legacy: boolean // read from the format-2 Markdown file
  format: number // 0 when not stated
  doc: YamlMap // the top-level mapping, {} when the file is not one
  projects: Project[]
  errors: YamlError[] // YAML syntax errors
}

// ---------- text helpers (also used for constitution and specs) ----------

export function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

export type Heading = { title: string; line: number }

export function headings(text: string, prefix = '## '): Heading[] {
  const out: Heading[] = []
  text.split('\n').forEach((l, i) => {
    if (l.startsWith(prefix)) out.push({ title: l.slice(prefix.length).trim(), line: i })
  })
  return out
}

// Lines of the first `## ` section whose title satisfies `match`, comments included.
export function sectionLines(text: string, match: (title: string) => boolean): string[] | null {
  const lines = text.split('\n')
  const hs = headings(text)
  const i = hs.findIndex((h) => match(h.title))
  if (i < 0) return null
  const end = i + 1 < hs.length ? hs[i + 1].line : lines.length
  return lines.slice(hs[i].line + 1, end)
}

export function keyValues(lines: string[]): [string, string][] {
  const out: [string, string][] = []
  for (const l of stripComments(lines.join('\n')).split('\n')) {
    const m = l.match(/^([@A-Za-z0-9_./-]+):\s*(.*)$/) // `@scope/name` project keys included
    if (m) out.push([m[1], m[2].replace(/\s{2,}#.*$/, '').trim()])
  }
  return out
}

// ---------- value access ----------

export const isMap = (v: unknown): v is YamlMap => v !== null && typeof v === 'object' && !Array.isArray(v)

// A scalar as text: '' for null or absent, '' for a list or mapping.
export function text(v: YamlValue | undefined): string {
  if (v === null || v === undefined || typeof v === 'object') return ''
  return String(v).trim()
}

export function section(caps: Capabilities, key: 'implementation' | 'actions' | 'review'): YamlMap {
  const v = caps.doc[key]
  return isMap(v) ? v : {}
}

// `implementation.projects` / `review.projects`: project name -> value.
export function overrides(caps: Capabilities, key: 'implementation' | 'review'): [string, string][] {
  const v = section(caps, key).projects
  return isMap(v) ? Object.entries(v).map(([k, x]) => [k, text(x)]) : []
}

export function isolationOf(caps: Capabilities): Isolation {
  const v = section(caps, 'implementation').isolation
  if (!isMap(v) || !('worktree' in v)) return { mode: 'none' }
  const wt = isMap(v.worktree) ? v.worktree : {}
  const pick = (k: string) => (WORKTREE_KEYS[k].test(text(wt[k])) ? text(wt[k]) : WORKTREE_DEFAULTS[k])
  return { mode: 'worktree', merge: pick('merge'), parallel: pick('parallel') }
}

export function reviewChecks(caps: Capabilities): string[] {
  const v = section(caps, 'review').checks
  return Array.isArray(v) ? v.map((x) => text(x)).filter(Boolean) : []
}

export function generatedPaths(caps: Capabilities): string[] {
  const v = caps.doc.generated
  return Array.isArray(v) ? v.map((x) => text(x)).filter(Boolean) : []
}

// ---------- readers ----------

function projectsOf(v: YamlValue | undefined): Project[] {
  if (!Array.isArray(v)) return []
  return v.filter(isMap).filter((p) => text(p.name) !== '').map((p) => ({
    name: text(p.name),
    kind: text(p.kind),
    path: text(p.path) || '.',
    stack: text(p.stack),
    repo: p.repo === true,
  }))
}

export function parseCapabilities(source: string): Capabilities {
  const r = parseYaml(source)
  const errors = [...r.errors]
  if (errors.length === 0 && r.value !== null && !isMap(r.value)) errors.push({ line: 1, message: 'the file must be a mapping of `key: value` lines' })
  const doc = isMap(r.value) ? r.value : {}
  return {
    path: CAPABILITIES_PATH,
    legacy: false,
    format: typeof doc.format === 'number' ? doc.format : 0,
    doc,
    projects: projectsOf(doc.projects),
    errors,
  }
}

const cell = (v: string) => v.replace(/`/g, '').trim()

// The format-2 Markdown file, mapped onto the format-3 shape: per-project lines go under `projects`,
// `isolation` / `merge` / `parallel` become `isolation: { worktree: {...} }`, `commit` is dropped
// (format 3 always commits), `checks` becomes a list. Unknown keys are kept so the rules flag them.
export function parseLegacyCapabilities(md: string): Capabilities {
  const sections: Record<string, string[]> = {}
  for (const h of headings(md)) {
    const lines = sectionLines(md, (t) => t === h.title)
    if (lines) sections[h.title] = lines
  }
  const projects: Project[] = []
  for (const line of stripComments((sections[LEGACY_SECTIONS.projects] ?? sections[LEGACY_SECTIONS.oldProjects] ?? []).join('\n')).split('\n')) {
    const m = line.match(/^\s*-\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+?)\s*$/)
    if (!m) continue
    const parts = m[2].split(/\s+·\s+/)
    const pathRaw = parts[1] ?? ''
    projects.push({ name: m[1].trim(), kind: (parts[0] ?? '').trim(), path: cell(pathRaw.replace(/\(repo\)/, '')) || '.', stack: parts.slice(2).join(' · ').trim(), repo: /\(repo\)/.test(pathRaw) })
  }
  const names = new Set(projects.map((p) => p.name))
  const doc: YamlMap = {
    format: Number(md.match(SDD_FORMAT_MARKER)?.[1] ?? 0),
    projects: projects.map((p) => ({ ...p })),
  }

  const implLines = sections[LEGACY_SECTIONS.implementation]
  if (implLines) {
    const impl: YamlMap = {}
    const per: YamlMap = {}
    const flat: Record<string, string> = {}
    for (const [k, v] of keyValues(implLines)) {
      if (k === 'default') impl.default = v || null
      else if (k === 'isolation' || k === 'merge' || k === 'parallel' || k === 'commit') flat[k] = v
      else per[k] = v
    }
    if (Object.keys(per).length > 0) impl.projects = per
    if (flat.isolation === 'worktree') {
      const wt: YamlMap = {}
      if (flat.merge) wt.merge = flat.merge
      if (flat.parallel) wt.parallel = flat.parallel
      impl.isolation = { worktree: wt }
    } else if (flat.isolation) impl.isolation = flat.isolation
    doc.implementation = impl
  }

  const actLines = sections[LEGACY_SECTIONS.actions]
  if (actLines) {
    const act: YamlMap = {}
    for (const [k, v] of keyValues(actLines)) act[k] = v || null
    doc.actions = act
  }

  const revLines = sections[LEGACY_SECTIONS.review]
  if (revLines) {
    const rev: YamlMap = {}
    const per: YamlMap = {}
    for (const [k, v] of keyValues(revLines)) {
      if (k === 'checks') rev.checks = v.split(',').map((x) => x.trim()).filter(Boolean)
      else if (REVIEW_KEYS[k] || !names.has(k)) rev[k] = v || null
      else per[k] = v
    }
    if (Object.keys(per).length > 0) rev.projects = per
    doc.review = rev
  }

  const genLines = sections[LEGACY_SECTIONS.generated]
  if (genLines) {
    doc.generated = stripComments(genLines.join('\n'))
      .split('\n')
      .map((l) => l.match(/^\s*-\s+(\S.*)$/)?.[1])
      .filter((x): x is string => !!x)
      .map(cell)
  }

  return { path: LEGACY_CAPABILITIES_PATH, legacy: true, format: doc.format as number, doc, projects, errors: [] }
}

// capabilities.yml wins; the legacy capabilities.md is read only when the YAML file is absent.
export function loadCapabilities(yml: string | null, md: string | null): Capabilities | null {
  if (yml !== null) return parseCapabilities(yml)
  if (md !== null) return parseLegacyCapabilities(md)
  return null
}
