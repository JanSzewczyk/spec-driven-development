// Pure rules behind `/sdd:doctor check`: everything takes already-read text and probe results, so
// the same code runs in the doctor tool and in tests. No mods API in here.
import { parseEpicId, parsePlan, parseReview, parseSpec, parseTasks } from './parse.ts'
import type { Task } from './parse.ts'
import { generatedPaths, headings, isMap, isolationOf, loadCapabilities, overrides, reviewChecks, section, sectionLines, stripComments, text } from './capabilities.ts'
import type { Capabilities, Project, YamlMap } from './capabilities.ts'
import {
  ACTION_KEYS,
  CAPABILITIES_KEYS,
  CAPABILITIES_PATH,
  COMMAND_COLUMNS,
  COMMAND_COLUMN_ALIASES,
  CONSTITUTION_SECTIONS,
  EPIC_ID,
  FLOW_VALUE,
  IMPLEMENTATION_DEFAULT,
  IMPLEMENTATION_KEYS,
  LEGACY_CAPABILITIES_PATH,
  PLAN_STATUSES,
  PROJECT_KEYS,
  REVIEW_DEFAULTS,
  REVIEW_KEYS,
  SPEC_STATUSES,
  SPEC_TEMPLATE_PLACEHOLDERS,
  SPEC_TEMPLATE_SECTIONS,
  SDD_FORMAT,
  TASK_STATUSES,
  WORKFLOW_MARKER,
  WORKFLOW_PATH,
  WORKFLOW_VERSION,
  WORKTREE_DEFAULTS,
  WORKTREE_KEYS,
  taskBranch,
} from './formats.ts'
import type { Level } from './formats.ts'
export type { Capabilities, Project } from './capabilities.ts'
export { keyValues, loadCapabilities, parseCapabilities, parseLegacyCapabilities } from './capabilities.ts'

// fix: 'init' — `/sdd:doctor init` repairs it by itself; absent — the user has to change something.
export type Finding = { level: 'warn' | 'fail'; text: string; fix?: 'init' | 'manual' }
export type CheckResult = { id: number; name: string; status: Level; summary: string; findings: Finding[] }
export type Verdict = 'READY' | 'PARTIAL' | 'NOT_READY'
export type CommandRow = { project: string; path: string; commands: Record<string, string> }
export type FeatureFiles = { slug: string; spec: string | null; plan: string | null; tasks: string | null; review: string | null }
// session: the doctor in a Claude Code session; ci: the sdd-check GitHub Action (no gh, tools, sibling repos or installed skills to probe).
export type Mode = 'session' | 'ci'
export type GitProbe = {
  isRepo: boolean
  clean: boolean | null // null: not a repository
  gh: boolean | null // gh on PATH; null: not probed
  ghAuth: boolean | null // null: not probed (offline, or gh missing)
}
export type Snapshot = {
  mode: Mode
  workflow: string | null // .github/workflows/sdd-check.yml, null when absent
  constitution: string | null
  template: string | null
  capabilities: string | null // specs/capabilities.yml
  legacyCapabilities: string | null // specs/capabilities.md (format 2), read only when the YAML file is absent
  legacy: string[] // legacy files found: specs/_constitution.md, specs/_template.md, .claude/capabilities.md
  features: FeatureFiles[]
  settings: string | null // .claude/settings.json, null when absent
  git: GitProbe
  paths: Record<string, boolean> // project and sibling paths -> exists
  tools: Record<string, boolean> // ToolNeed.key -> resolvable
  flows: Record<string, boolean | null> // `skill:<name>` / `agent:<name>` -> installed; null: could not be probed
}
export type Report = { status: Verdict; mode: Mode; passed: number; total: number; projects: Project[]; checks: CheckResult[] }
export type ToolNeed = { key: string; exe: string; dir: string | null; project: string }

function isFilled(lines: string[]): boolean {
  return stripComments(lines.join('\n')).replace(/---/g, '').trim() !== ''
}

function cell(v: string): string {
  return v.replace(/`/g, '').trim()
}

// ---------- constitution §2 ----------

export function parseCommandTable(constitution: string): CommandRow[] | null {
  const body = sectionLines(constitution, (t) => /run\s*\/\s*build/i.test(t))
  if (!body) return null
  const rows = stripComments(body.join('\n'))
    .split('\n')
    .filter((l) => /^\s*\|/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-*:?$/.test(c)))
  if (rows.length === 0) return null
  const header = rows[0].map((h) => h.toLowerCase())
  const data = rows.slice(1)
  if (/project/.test(header[0] ?? '')) {
    const cols = header.map((h) => COMMAND_COLUMN_ALIASES[h] ?? h)
    return data.map((r) => {
      const commands: Record<string, string> = {}
      for (const name of COMMAND_COLUMNS) {
        const i = cols.indexOf(name)
        commands[name] = i >= 0 ? cell(r[i] ?? '') : ''
      }
      const pathAt = cols.indexOf('path')
      return { project: cell(r[0] ?? ''), path: pathAt >= 0 ? cell(r[pathAt] ?? '') : '', commands }
    })
  }
  if (header.some((h) => /command/.test(h))) {
    // Legacy `Command | Purpose` list: one project, `root`.
    const commands: Record<string, string> = {}
    for (const name of COMMAND_COLUMNS) commands[name] = ''
    const test = data.find((r) => /\btest/i.test(r.join(' ')) && !/coverage|typecheck|lint/i.test(r.join(' ')))
    if (test) commands.test = cell(test[0] ?? '')
    return [{ project: 'root', path: '.', commands }]
  }
  return null
}

// First executable of a command, after `cd <dir> &&` and leading `VAR=value` words.
export function commandOf(command: string): { dir: string | null; exe: string } | null {
  let rest = command.trim()
  let dir: string | null = null
  for (;;) {
    const m = rest.match(/^cd\s+(\S+)\s*&&\s*/)
    if (!m) break
    dir = m[1]
    rest = rest.slice(m[0].length)
  }
  const tokens = rest.split(/\s+/).filter((t) => t !== '' && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t))
  return tokens.length > 0 ? { dir, exe: tokens[0] } : null
}

// ---------- effective configuration ----------

export type FlowRef = { kind: 'skill' | 'agent' | 'command'; name: string; where: string }
export type ConfigEntry = { key: string; value: string; source: 'set' | 'default' }
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
    for (const k of Object.keys(WORKTREE_KEYS)) implementation.push(entry(k, iso[k as 'merge' | 'parallel'], WORKTREE_DEFAULTS[k]))
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

// ---------- what the doctor has to probe ----------

export function needs(constitution: string | null, caps: Capabilities | null): { paths: string[]; tools: ToolNeed[] } {
  const paths = new Set<string>()
  const tools = new Map<string, ToolNeed>()
  for (const p of caps?.projects ?? []) if (p.path && p.path !== '.') paths.add(p.path)
  const rows = constitution ? (parseCommandTable(constitution) ?? []) : []
  for (const r of rows) {
    const base = caps?.projects.find((p) => p.name === r.project)?.path ?? r.path
    for (const name of COMMAND_COLUMNS) {
      const c = r.commands[name]
      if (!c) continue
      const parsed = commandOf(c)
      if (!parsed) continue
      const key = r.project + '\u0000' + parsed.exe + '\u0000' + (parsed.dir ?? '')
      tools.set(key, { key, exe: parsed.exe, dir: parsed.dir ?? (base && base !== '.' ? base : null), project: r.project })
    }
  }
  for (const r of caps ? flowRefs(caps) : []) {
    if (r.kind !== 'command') continue
    const parsed = commandOf(r.name)
    if (!parsed) continue
    const key = '(capabilities)\u0000' + parsed.exe + '\u0000' + (parsed.dir ?? '')
    tools.set(key, { key, exe: parsed.exe, dir: parsed.dir, project: r.where })
  }
  return { paths: [...paths], tools: [...tools.values()] }
}

// ---------- checks ----------

function finish(id: number, name: string, findings: Finding[], summary: string): CheckResult {
  const status: Level = findings.some((f) => f.level === 'fail') ? 'fail' : findings.length > 0 ? 'warn' : 'pass'
  return { id, name, status, summary, findings }
}

const warn = (text: string, fix?: Finding['fix']): Finding => (fix ? { level: 'warn', text, fix } : { level: 'warn', text })
const fail = (text: string, fix?: Finding['fix']): Finding => (fix ? { level: 'fail', text, fix } : { level: 'fail', text })

function checkConstitution(s: Snapshot): CheckResult {
  const name = 'specs/constitution.md'
  if (s.constitution === null) {
    const hint = s.legacy.includes('specs/_constitution.md') ? ' (found legacy specs/_constitution.md: `init` renames it)' : ''
    return finish(1, name, [fail('missing' + hint + '. Run `/sdd:doctor init`', 'init')], '')
  }
  const f: Finding[] = []
  const titles = headings(s.constitution).map((h) => h.title)
  for (const [label, re] of CONSTITUTION_SECTIONS) if (!titles.some((t) => re.test(t))) f.push(warn(`section "${label}" missing`))
  const rows = parseCommandTable(s.constitution)
  if (rows === null) f.push(warn('no commands table in the Run/build section'))
  else {
    const filled = rows.filter((r) => r.project !== '')
    if (filled.length === 0) f.push(warn('commands table has no project row'))
    for (const r of filled) if (!r.commands.test) f.push(warn(`project "${r.project}" has no \`test\` command (fix via \`/sdd:constitution\`)`))
  }
  return finish(1, name, f, 'sections and commands table present')
}

function checkTemplate(s: Snapshot): CheckResult {
  const name = 'specs/template.md'
  if (s.template === null) {
    const hint = s.legacy.includes('specs/_template.md') ? ' (found legacy specs/_template.md: `init` renames it)' : ''
    return finish(2, name, [fail('missing' + hint + '. Run `/sdd:doctor init`', 'init')], '')
  }
  const f: Finding[] = []
  const titles = headings(s.template).map((h) => h.title.toLowerCase())
  for (const sec of SPEC_TEMPLATE_SECTIONS) if (!titles.some((t) => t.includes(sec.toLowerCase()))) f.push(warn(`section "${sec}" missing`))
  for (const p of SPEC_TEMPLATE_PLACEHOLDERS) if (!s.template.includes(p)) f.push(warn(`placeholder ${p} missing (\`/sdd:spec\` fills it)`))
  if (!/^\*\*Branch:\*\*/m.test(s.template)) f.push(warn('`**Branch:**` line missing (every command finds the feature by it)'))
  return finish(2, name, f, 'sections and placeholders present')
}

const FLOW = 'skill:<name> | agent:<name> | command:<shell> | in-session'
const SKILL_OR_AGENT = /^(?:skill|agent):\S/

// `isolation` is `none`, or a mapping whose only key is `worktree` (its options under it).
function isolationProblems(v: unknown): string[] {
  if (v === undefined || v === null || v === 'none') return []
  const shape = '`implementation.isolation` is `none` or `worktree:` with `merge` / `parallel` under it'
  if (v === 'worktree') return [shape + ': write `worktree:` as a key (`isolation: { worktree: {} }` keeps the defaults)']
  if (!isMap(v)) return [`${shape}, not "${text(v as YamlMap[string])}"`]
  const keys = Object.keys(v)
  if (keys.length !== 1 || keys[0] !== 'worktree') return [`${shape}, not key(s) ${keys.map((k) => '`' + k + '`').join(', ')}`]
  const wt = v.worktree
  if (wt === null) return []
  if (!isMap(wt)) return [shape]
  const out: string[] = []
  for (const [k, val] of Object.entries(wt)) {
    if (!WORKTREE_KEYS[k]) out.push(`\`isolation.worktree\`: unknown key "${k}"`)
    else if (!WORKTREE_KEYS[k].test(text(val))) out.push(`\`isolation.worktree.${k}\`: "${text(val)}" has an unknown value`)
  }
  return out
}

function checkCapabilities(s: Snapshot, caps: Capabilities | null): CheckResult {
  if (caps === null) {
    const hint = s.legacy.includes('.claude/capabilities.md') ? ' (found legacy .claude/capabilities.md: `init` moves it)' : ''
    return finish(3, CAPABILITIES_PATH, [fail('missing' + hint + '. Run `/sdd:doctor init`', 'init')], '')
  }
  const name = caps.path
  const f: Finding[] = []
  for (const e of caps.errors) f.push(fail(`line ${e.line}: ${e.message}`))
  if (caps.legacy) f.push(warn(`${LEGACY_CAPABILITIES_PATH} is the old Markdown format: \`/sdd:doctor init\` migrates it to ${CAPABILITIES_PATH}`, 'init'))
  else if (caps.errors.length === 0 && caps.format < SDD_FORMAT) f.push(warn(`\`format\` is ${caps.format || 'not set'}, this version writes ${SDD_FORMAT}: run \`/sdd:doctor init\` to migrate`, 'init'))

  const doc = caps.doc
  for (const k of Object.keys(doc)) if (!CAPABILITIES_KEYS.includes(k)) f.push(warn(`unknown key "${k}"`))
  for (const k of ['implementation', 'actions', 'review']) if (doc[k] !== undefined && doc[k] !== null && !isMap(doc[k])) f.push(warn(`\`${k}\` must be a mapping`))
  if (doc.projects !== undefined && doc.projects !== null && !Array.isArray(doc.projects)) f.push(warn('`projects` must be a list'))
  else if (Array.isArray(doc.projects)) {
    doc.projects.forEach((p, i) => {
      if (!isMap(p)) return f.push(warn(`projects[${i}] is not a mapping`))
      if (!text(p.name)) f.push(warn(`projects[${i}] has no \`name\``))
      for (const k of Object.keys(p)) if (!PROJECT_KEYS.includes(k)) f.push(warn(`projects[${i}]: unknown key "${k}"`))
      if (p.repo !== undefined && typeof p.repo !== 'boolean') f.push(warn(`projects[${i}]: \`repo\` is true or false`))
    })
  }
  if (caps.projects.length === 0) f.push(warn('no project listed under `projects`', 'init'))
  const names = new Set(caps.projects.map((p) => p.name))

  const impl = section(caps, 'implementation')
  for (const k of Object.keys(impl)) {
    if (k === 'commit') f.push(warn('implementation: `commit` is no longer read (with `isolation: none` the session commits every task, with `worktree` each sub-session does): delete it', 'init'))
    else if (k === 'merge' || k === 'parallel') f.push(warn(`implementation: \`${k}\` belongs under \`isolation.worktree\``, 'init'))
    else if (!IMPLEMENTATION_KEYS.includes(k)) f.push(warn(`implementation: unknown key "${k}"`))
  }
  const implDefault = text(impl.default)
  if (implDefault && !FLOW_VALUE.test(implDefault)) f.push(warn(`implementation.default: "${implDefault}" is not ${FLOW}`))
  if (impl.projects !== undefined && impl.projects !== null && !isMap(impl.projects)) f.push(warn('`implementation.projects` must be a mapping of project: value'))
  for (const [k, v] of overrides(caps, 'implementation')) {
    if (!names.has(k)) f.push(warn(`implementation.projects: "${k}" is not a listed project`))
    if (!FLOW_VALUE.test(v)) f.push(warn(`implementation.projects.${k}: "${v}" is not ${FLOW}`))
  }
  for (const p of isolationProblems(impl.isolation)) f.push(fail(p))

  for (const [k, v] of Object.entries(section(caps, 'actions'))) {
    if (!ACTION_KEYS.includes(k)) f.push(warn(`actions: unknown key "${k}"`))
    else if (text(v) !== '' && !/^(?:skill|agent|command):\S/.test(text(v))) f.push(warn(`actions.${k}: "${text(v)}" is not skill:<name> | agent:<name> | command:<shell>`))
  }

  const rev = section(caps, 'review')
  for (const [k, v] of Object.entries(rev)) {
    if (k === 'checks') {
      if (v !== null && !Array.isArray(v)) f.push(warn('`review.checks` must be a list, e.g. `[agent:qa]`'))
      for (const item of reviewChecks(caps)) if (!SKILL_OR_AGENT.test(item)) f.push(warn(`review.checks: "${item}" is not skill:<name> | agent:<name>`))
    } else if (k === 'projects') {
      if (v !== null && !isMap(v)) f.push(warn('`review.projects` must be a mapping of project: value'))
      for (const [p, val] of overrides(caps, 'review')) {
        if (!names.has(p)) f.push(warn(`review.projects: "${p}" is not a listed project`))
        if (!SKILL_OR_AGENT.test(val)) f.push(warn(`review.projects.${p}: "${val}" is not skill:<name> | agent:<name>`))
      }
    } else if (REVIEW_KEYS[k]) {
      if (text(v) !== '' && !REVIEW_KEYS[k].test(text(v))) f.push(warn(`review.${k}: "${text(v)}" has an unknown value`))
    } else if (k === 'ui') {
      f.push(warn('review: `ui:` is no longer read (visual review is your own `checks:` entry): delete it'))
    } else {
      f.push(warn(`review: unknown key "${k}"`))
    }
  }
  const gen = doc.generated
  if (gen !== undefined && gen !== null && (!Array.isArray(gen) || gen.some((g) => typeof g !== 'string'))) f.push(warn('`generated` must be a list of quoted globs'))

  const iso = isolationOf(caps)
  const prAction = text(section(caps, 'actions').pr) !== ''
  if (iso.mode === 'worktree' && iso.merge === 'pr' && !prAction && s.git.gh === false) {
    f.push(warn('implementation: `merge: pr` needs `gh` (or an `actions.pr`) to open a pull request per task'))
  }
  const ci = text(rev.ci)
  if (ci === '') f.push(warn('`review.ci` is not set (on | off): `/sdd:doctor init` asks whether to add the sdd-check GitHub workflow', 'init'))
  else if (ci === 'on') {
    if (s.workflow === null) f.push(warn(`review.ci is on but ${WORKFLOW_PATH} is missing: run \`/sdd:doctor init\``, 'init'))
    else if (Number(s.workflow.match(WORKFLOW_MARKER)?.[1] ?? 0) < WORKFLOW_VERSION) f.push(warn(`${WORKFLOW_PATH} is older than the template (version ${WORKFLOW_VERSION}): run \`/sdd:doctor init\``, 'init'))
  }

  for (const r of flowRefs(caps)) {
    if (r.kind === 'command') continue
    if (s.flows[r.kind + ':' + r.name] === false) {
      f.push(warn(`${r.where}: ${r.kind}:${r.name} is not installed (looked in .claude, ~/.claude and installed plugins; built-in ones are not scanned). Install or enable it, or fix the name with \`/sdd:capabilities\``))
    }
  }
  if (!effectiveConfig(caps, s.constitution).configured) {
    f.push(warn('implementation, actions and review are all at their defaults: run `/sdd:capabilities` to pick who implements, who runs git and how review verifies (ignore if the defaults are intended)'))
  }

  const rows = s.constitution ? parseCommandTable(s.constitution) : null
  if (rows) {
    const inTable = new Set(rows.map((r) => r.project).filter(Boolean))
    for (const n of names) if (!inTable.has(n)) f.push(warn(`project "${n}" is in ${name} but not in constitution section 2`))
    for (const n of inTable) if (!names.has(n) && names.size > 0) f.push(warn(`project "${n}" is in constitution section 2 but not in ${name}`))
  }
  return finish(3, name, f, `${caps.projects.length} project(s), keys and values valid`)
}

function checkGit(s: Snapshot, caps: Capabilities | null): CheckResult {
  const name = 'Git + gh'
  const g = s.git
  if (!g.isRepo) return finish(4, name, [fail('not a git repository (`.git` missing)')], '')
  const f: Finding[] = []
  if (g.clean === false) f.push(warn('working tree is not clean'))
  // `gh` opens the PR only when no `pr` action is configured.
  const prAction = caps !== null && text(section(caps, 'actions').pr) !== ''
  if (prAction) return finish(4, name, f, 'repository present (`actions.pr` is set, gh not needed)')
  if (g.gh === false) f.push(warn('`gh` not found on PATH (needed for the PR unless `actions.pr` is set)'))
  else if (g.ghAuth === false) f.push(warn('`gh auth status` failed: run `gh auth login`'))
  const skipped = g.gh === null || (g.gh && g.ghAuth === null)
  return finish(4, name, f, 'repository present' + (skipped ? ' (gh not probed)' : ''))
}

function checkTooling(s: Snapshot, caps: Capabilities | null): CheckResult {
  const name = 'Tooling'
  const f: Finding[] = []
  if (!caps || !s.constitution) return finish(5, name, [], 'nothing to check yet')
  for (const p of caps.projects) {
    if (p.path && p.path !== '.' && s.paths[p.path] === false) f.push(warn(`${p.name}: path "${p.path}" does not exist`))
  }
  const wanted = needs(s.constitution, caps).tools
  for (const t of wanted) if (s.tools[t.key] === false) f.push(warn(`${t.project}: \`${t.exe}\` not found`))
  return finish(5, name, f, `${wanted.length} command executable(s) resolved`)
}

function checkSiblings(s: Snapshot, caps: Capabilities | null): CheckResult {
  const name = 'Sibling repositories'
  const siblings = (caps?.projects ?? []).filter((p) => p.repo)
  if (siblings.length === 0) return finish(6, name, [], 'no sibling repositories')
  const f: Finding[] = []
  let dirs: string[] | null = null
  if (s.settings !== null) {
    try {
      const j = JSON.parse(s.settings)
      const list = j?.permissions?.additionalDirectories
      dirs = Array.isArray(list) ? list.map(String) : []
    } catch {
      f.push(fail('.claude/settings.json is malformed JSON: fix it, then re-run `/sdd:doctor init`'))
    }
  }
  for (const p of siblings) {
    if (s.paths[p.path] === false) f.push(warn(`${p.name}: repository "${p.path}" is not checked out next to this one`))
    if (dirs !== null && !dirs.includes(p.path)) f.push(warn(`${p.name}: "${p.path}" is not in permissions.additionalDirectories`))
  }
  if (s.settings === null) f.push(warn('.claude/settings.json missing: `/sdd:doctor init` adds the sibling paths'))
  return finish(6, name, f, `${siblings.length} sibling repositor${siblings.length === 1 ? 'y' : 'ies'} reachable`)
}

function acIds(spec: string): string[] {
  const body = sectionLines(spec, (t) => /acceptance criteria/i.test(t)) ?? []
  const ids: string[] = []
  for (const l of body) {
    const m = l.match(/^\s*-\s*\[[ xX]\]\s*(AC\d+)\b/)
    if (m) ids.push(m[1])
  }
  return ids
}

function cycleOf(tasks: Task[]): string[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const state = new Map<string, number>()
  const stack: string[] = []
  const visit = (id: string): string[] | null => {
    state.set(id, 1)
    stack.push(id)
    for (const d of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(d)) continue
      if (state.get(d) === 1) return [...stack.slice(stack.indexOf(d)), d]
      if (!state.has(d)) {
        const c = visit(d)
        if (c) return c
      }
    }
    stack.pop()
    state.set(id, 2)
    return null
  }
  for (const t of tasks) if (!state.has(t.id)) {
    const c = visit(t.id)
    if (c) return c
  }
  return null
}

function checkFeatures(s: Snapshot, caps: Capabilities | null): CheckResult {
  const name = 'Feature specs'
  const f: Finding[] = []
  const projects = new Set((caps?.projects ?? []).map((p) => p.name))
  const branches = new Map<string, string>()
  const epics = new Map<string, string>()
  const isolated = caps !== null && isolationOf(caps).mode === 'worktree'
  for (const ft of s.features) {
    const at = `specs/${ft.slug}/`
    let ids: string[] = []
    if (ft.spec === null) {
      f.push(fail(`${at}spec.md missing (the folder has other SDD files)`))
    } else {
      const spec = parseSpec(ft.spec)
      if (!spec.branch) f.push(fail(`${at}spec.md: \`**Branch:**\` line missing or empty`))
      else if (branches.has(spec.branch)) f.push(fail(`${at}spec.md: branch "${spec.branch}" is also used by specs/${branches.get(spec.branch)}/`))
      else branches.set(spec.branch, ft.slug)
      if (!SPEC_STATUSES.includes(spec.status)) f.push(fail(`${at}spec.md: \`**Status:**\` "${spec.status}" is not one of ${SPEC_STATUSES.join(' | ')}`))
      ids = acIds(ft.spec)
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
      if (dup.length > 0) f.push(fail(`${at}spec.md: duplicate acceptance criteria ids ${[...new Set(dup)].join(', ')}`))
    }
    if (ft.plan !== null) {
      const plan = parsePlan(ft.plan)
      if (!PLAN_STATUSES.includes(plan.status)) f.push(fail(`${at}plan.md: \`**Status:**\` "${plan.status}" is not one of ${PLAN_STATUSES.join(' | ')}`))
      if (plan.missing.length > 0) f.push(warn(`${at}plan.md: empty or missing ${plan.missing.join(', ')}`))
    }
    if (ft.tasks !== null) {
      const tasks = parseTasks(ft.tasks)
      const epic = parseEpicId(ft.tasks)
      const specBranch = ft.spec === null ? '' : parseSpec(ft.spec).branch
      if (!epic) f.push(warn(`${at}tasks.md: no \`**Epic:**\` id: run \`/sdd:doctor init\` to assign one`, 'init'))
      else if (!EPIC_ID.test(epic)) f.push(fail(`${at}tasks.md: epic id "${epic}" is not <LETTERS>-<4 hex> (ULOG-7f3a)`))
      else if (epics.has(epic)) f.push(fail(`${at}tasks.md: epic id ${epic} is also used by specs/${epics.get(epic)}/`))
      else epics.set(epic, ft.slug)
      if (tasks.length === 0) f.push(fail(`${at}tasks.md: no \`### T<n>:\` task`))
      const taskIds = new Set<string>()
      const blocks = ft.tasks.split(/^(?=###\s+T\d+)/m).slice(1)
      for (const t of tasks) {
        if (taskIds.has(t.id)) f.push(fail(`${at}tasks.md: duplicate task id ${t.id}`))
        taskIds.add(t.id)
      }
      tasks.forEach((t, i) => {
        const block = blocks[i] ?? ''
        const where = `${at}tasks.md ${t.id}`
        if (!t.project) f.push(fail(`${where}: no \`project:\``))
        else if (projects.size > 0 && !projects.has(t.project)) f.push(fail(`${where}: project "${t.project}" is not listed in ${caps?.path ?? CAPABILITIES_PATH}`))
        if (!TASK_STATUSES.includes(t.status)) f.push(fail(`${where}: status "${t.status}" is not one of ${TASK_STATUSES.join(' | ')}`))
        if (t.acceptance.length === 0) f.push(fail(`${where}: no \`acceptance:\` ids`))
        for (const a of t.acceptance) if (ids.length > 0 && !ids.includes(a)) f.push(fail(`${where}: acceptance ${a} is not in spec.md`))
        for (const d of t.dependsOn) if (!tasks.some((o) => o.id === d)) f.push(fail(`${where}: depends_on ${d} does not exist`))
        if (t.pr && !/^(?:#?\d+|https?:\/\/\S+)$/.test(t.pr)) f.push(fail(`${where}: pr "${t.pr}" is not a pull request number or URL`))
        if (t.branch && epic && specBranch && t.branch !== taskBranch(specBranch, epic, t.id)) f.push(warn(`${where}: branch "${t.branch}" is not ${taskBranch(specBranch, epic, t.id)}`))
        if (isolated && t.status === 'in-progress' && !t.branch) f.push(warn(`${where}: in-progress with isolation: worktree but no \`branch:\``))
        for (const field of ['scope', 'files']) if (!new RegExp('^' + field + ':', 'm').test(block)) f.push(warn(`${where}: no \`${field}:\``))
      })
      const cycle = cycleOf(tasks)
      if (cycle) f.push(fail(`${at}tasks.md: dependency cycle ${cycle.join(' → ')}`))
      const covered = new Set(tasks.flatMap((t) => t.acceptance))
      for (const id of ids) if (!covered.has(id)) f.push(warn(`${at}tasks.md: ${id} is served by no task`))
    }
    if (ft.review !== null && parseReview(ft.review) === null) f.push(warn(`${at}review.md: no READY / NOT READY verdict`))
  }
  return finish(7, name, f, `${s.features.length} feature(s) consistent`)
}

const notInCi = (id: number, name: string): CheckResult => finish(id, name, [], 'not checked in CI')

export function runChecks(s: Snapshot): Report {
  const caps = loadCapabilities(s.capabilities, s.legacyCapabilities)
  const ci = s.mode === 'ci'
  const checks = [
    checkConstitution(s),
    checkTemplate(s),
    checkCapabilities(s, caps),
    ci ? notInCi(4, 'Git + gh') : checkGit(s, caps),
    ci ? notInCi(5, 'Tooling') : checkTooling(s, caps),
    ci ? notInCi(6, 'Sibling repositories') : checkSiblings(s, caps),
    checkFeatures(s, caps),
  ]
  const fails = checks.filter((c) => c.status === 'fail').length
  const warns = checks.filter((c) => c.status === 'warn').length
  const status: Verdict = fails >= 3 ? 'NOT_READY' : fails > 0 || warns > 0 ? 'PARTIAL' : 'READY'
  return { status, mode: s.mode, passed: checks.filter((c) => c.status === 'pass').length, total: checks.length, projects: caps?.projects ?? [], checks }
}
