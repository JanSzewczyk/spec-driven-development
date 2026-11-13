// Pure rules behind `/sdd:doctor check`: everything takes already-read text and probe results, so
// the same code runs in the doctor tool and in tests. No mods API in here.
import { parsePlan, parseReview, parseSpec, parseTasks } from './parse.ts'
import type { Task } from './parse.ts'
import {
  ACTION_KEYS,
  AUTO_MARKER,
  CAPABILITIES_LEGACY_PROJECTS,
  CAPABILITIES_SECTIONS,
  COMMAND_COLUMNS,
  COMMAND_COLUMN_ALIASES,
  CONSTITUTION_SECTIONS,
  FLOW_VALUE,
  OVERRIDE_MARKER,
  PLAN_STATUSES,
  REVIEW_KEYS,
  SPEC_STATUSES,
  SPEC_TEMPLATE_PLACEHOLDERS,
  SPEC_TEMPLATE_SECTIONS,
  TASK_STATUSES,
} from './formats.ts'
import type { Level } from './formats.ts'

export type Finding = { level: 'warn' | 'fail'; text: string }
export type CheckResult = { id: number; name: string; status: Level; summary: string; findings: Finding[] }
export type Verdict = 'READY' | 'PARTIAL' | 'NOT_READY'
export type Project = { name: string; kind: string; path: string; stack: string; repo: boolean }
export type CommandRow = { project: string; path: string; commands: Record<string, string> }
export type FeatureFiles = { slug: string; spec: string | null; plan: string | null; tasks: string | null; review: string | null }
export type GitProbe = {
  isRepo: boolean
  clean: boolean | null // null: not a repository
  gh: boolean | null // gh on PATH; null: not probed
  ghAuth: boolean | null // null: not probed (offline, or gh missing)
}
export type Snapshot = {
  constitution: string | null
  template: string | null
  capabilities: string | null
  legacy: string[] // legacy files found: specs/_constitution.md, specs/_template.md, .claude/capabilities.md
  features: FeatureFiles[]
  settings: string | null // .claude/settings.json, null when absent
  git: GitProbe
  paths: Record<string, boolean> // project and sibling paths -> exists
  tools: Record<string, boolean> // ToolNeed.key -> resolvable
}
export type Report = { status: Verdict; passed: number; total: number; projects: Project[]; checks: CheckResult[] }
export type ToolNeed = { key: string; exe: string; dir: string | null; project: string }

// ---------- text helpers ----------

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

type Heading = { title: string; line: number }

function headings(text: string, prefix = '## '): Heading[] {
  const out: Heading[] = []
  text.split('\n').forEach((l, i) => {
    if (l.startsWith(prefix)) out.push({ title: l.slice(prefix.length).trim(), line: i })
  })
  return out
}

// Lines of the first `## ` section whose title satisfies `match`, comments included.
function sectionLines(text: string, match: (title: string) => boolean): string[] | null {
  const lines = text.split('\n')
  const hs = headings(text)
  const i = hs.findIndex((h) => match(h.title))
  if (i < 0) return null
  const end = i + 1 < hs.length ? hs[i + 1].line : lines.length
  return lines.slice(hs[i].line + 1, end)
}

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

// ---------- capabilities ----------

export type Capabilities = {
  projects: Project[]
  sections: Record<string, string[]> // title -> raw lines
  legacyProjects: boolean
}

export function parseCapabilities(text: string): Capabilities {
  const sections: Record<string, string[]> = {}
  for (const h of headings(text)) {
    const lines = sectionLines(text, (t) => t === h.title)
    if (lines) sections[h.title] = lines
  }
  const raw = sections.Projects ?? sections[CAPABILITIES_LEGACY_PROJECTS]
  const projects: Project[] = []
  for (const line of stripComments((raw ?? []).join('\n')).split('\n')) {
    const m = line.match(/^\s*-\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+?)\s*$/)
    if (!m) continue
    const parts = m[2].split(/\s+·\s+/)
    const pathRaw = parts[1] ?? ''
    projects.push({
      name: m[1].trim(),
      kind: (parts[0] ?? '').trim(),
      path: cell(pathRaw.replace(/\(repo\)/, '')),
      stack: parts.slice(2).join(' · ').trim(),
      repo: /\(repo\)/.test(pathRaw),
    })
  }
  return { projects, sections, legacyProjects: sections.Projects === undefined && sections[CAPABILITIES_LEGACY_PROJECTS] !== undefined }
}

function keyValues(lines: string[]): [string, string][] {
  const out: [string, string][] = []
  for (const l of stripComments(lines.join('\n')).split('\n')) {
    const m = l.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (m) out.push([m[1], m[2].replace(/\s{2,}#.*$/, '').trim()])
  }
  return out
}

// ---------- what the doctor has to probe ----------

export function needs(constitution: string | null, capabilities: string | null): { paths: string[]; tools: ToolNeed[] } {
  const paths = new Set<string>()
  const tools = new Map<string, ToolNeed>()
  const caps = capabilities ? parseCapabilities(capabilities) : null
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
  return { paths: [...paths], tools: [...tools.values()] }
}

// ---------- checks ----------

function finish(id: number, name: string, findings: Finding[], summary: string): CheckResult {
  const status: Level = findings.some((f) => f.level === 'fail') ? 'fail' : findings.length > 0 ? 'warn' : 'pass'
  return { id, name, status, summary, findings }
}

const warn = (text: string): Finding => ({ level: 'warn', text })
const fail = (text: string): Finding => ({ level: 'fail', text })

function checkConstitution(s: Snapshot): CheckResult {
  const name = 'specs/constitution.md'
  if (s.constitution === null) {
    const hint = s.legacy.includes('specs/_constitution.md') ? ' (found legacy specs/_constitution.md: `init` renames it)' : ''
    return finish(1, name, [fail('missing' + hint + '. Run `/sdd:doctor init`')], '')
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
    return finish(2, name, [fail('missing' + hint + '. Run `/sdd:doctor init`')], '')
  }
  const f: Finding[] = []
  const titles = headings(s.template).map((h) => h.title.toLowerCase())
  for (const sec of SPEC_TEMPLATE_SECTIONS) if (!titles.some((t) => t.includes(sec.toLowerCase()))) f.push(warn(`section "${sec}" missing`))
  for (const p of SPEC_TEMPLATE_PLACEHOLDERS) if (!s.template.includes(p)) f.push(warn(`placeholder ${p} missing (\`/sdd:spec\` fills it)`))
  if (!/^\*\*Branch:\*\*/m.test(s.template)) f.push(warn('`**Branch:**` line missing (every command finds the feature by it)'))
  return finish(2, name, f, 'sections and placeholders present')
}

function checkCapabilities(s: Snapshot, caps: Capabilities | null): CheckResult {
  const name = 'specs/capabilities.md'
  if (s.capabilities === null || caps === null) {
    const hint = s.legacy.includes('.claude/capabilities.md') ? ' (found legacy .claude/capabilities.md: `init` moves it)' : ''
    return finish(3, name, [fail('missing' + hint + '. Run `/sdd:doctor init`')], '')
  }
  const f: Finding[] = []
  if (caps.legacyProjects) f.push(warn('section "Stack profile" is the old name of "Projects": run `/sdd:doctor init`'))
  for (const sec of CAPABILITIES_SECTIONS) {
    const present = sec === 'Projects' ? caps.sections.Projects !== undefined || caps.legacyProjects : caps.sections[sec] !== undefined
    if (!present) f.push(warn(`section "${sec}" missing: run \`/sdd:doctor init\``))
  }
  for (const legacy of ['Specialist agents', 'Skills', 'Task type → routing rules', 'Custom routing rules']) {
    if (caps.sections[legacy] !== undefined) f.push(warn(`legacy section "${legacy}" is no longer read: delete it`))
  }
  const projectsMarker = (caps.sections.Projects ?? []).join('\n')
  if (caps.sections.Projects !== undefined && !projectsMarker.includes(AUTO_MARKER)) f.push(warn(`"Projects" lacks ${AUTO_MARKER}`))
  for (const sec of CAPABILITIES_SECTIONS.slice(1)) {
    const body = (caps.sections[sec] ?? []).join('\n')
    if (caps.sections[sec] !== undefined && !body.includes(OVERRIDE_MARKER)) f.push(warn(`"${sec}" lacks ${OVERRIDE_MARKER}`))
  }
  if (caps.projects.length === 0) f.push(warn('no project listed under "Projects"'))
  const names = new Set(caps.projects.map((p) => p.name))

  const impl = keyValues(caps.sections.Implementation ?? [])
  if (caps.sections.Implementation !== undefined && !impl.some(([k]) => k === 'default')) f.push(warn('Implementation: no `default:` line (falls back to in-session)'))
  for (const [k, v] of impl) {
    if (k !== 'default' && !names.has(k)) f.push(warn(`Implementation: "${k}" is not a listed project`))
    if (!FLOW_VALUE.test(v)) f.push(warn(`Implementation: "${k}: ${v}" is not skill:<name> | agent:<name> | command:<shell> | in-session`))
  }
  for (const [k, v] of keyValues(caps.sections.Actions ?? [])) {
    if (!ACTION_KEYS.includes(k)) f.push(warn(`Actions: unknown key "${k}"`))
    else if (v !== '' && !/^(?:skill|agent|command):\S/.test(v)) f.push(warn(`Actions: "${k}: ${v}" is not skill:<name> | agent:<name> | command:<shell>`))
  }
  for (const [k, v] of keyValues(caps.sections.Review ?? [])) {
    if (k === 'checks') {
      for (const item of v.split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!/^(?:skill|agent):\S/.test(item)) f.push(warn(`Review: check "${item}" is not skill:<name> | agent:<name>`))
      }
    } else if (REVIEW_KEYS[k]) {
      if (!REVIEW_KEYS[k].test(v)) f.push(warn(`Review: "${k}: ${v}" has an unknown value`))
    } else if (k === 'ui') {
      f.push(warn('Review: `ui:` is no longer read (visual review is your own `checks:` entry): delete it'))
    } else if (names.has(k)) {
      if (!/^(?:skill|agent):\S/.test(v)) f.push(warn(`Review: "${k}: ${v}" is not skill:<name> | agent:<name>`))
    } else {
      f.push(warn(`Review: unknown key "${k}"`))
    }
  }

  const rows = s.constitution ? parseCommandTable(s.constitution) : null
  if (rows) {
    const inTable = new Set(rows.map((r) => r.project).filter(Boolean))
    for (const n of names) if (!inTable.has(n)) f.push(warn(`project "${n}" is in capabilities.md but not in constitution section 2`))
    for (const n of inTable) if (!names.has(n) && names.size > 0) f.push(warn(`project "${n}" is in constitution section 2 but not in capabilities.md`))
  }
  return finish(3, name, f, `${caps.projects.length} project(s), sections and values valid`)
}

function checkGit(s: Snapshot): CheckResult {
  const name = 'Git + gh'
  const g = s.git
  if (!g.isRepo) return finish(4, name, [fail('not a git repository (`.git` missing)')], '')
  const f: Finding[] = []
  if (g.clean === false) f.push(warn('working tree is not clean'))
  if (g.gh === false) f.push(warn('`gh` not found on PATH (needed for the PR unless a `pr` action is set)'))
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
  const wanted = needs(s.constitution, s.capabilities).tools
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
        else if (projects.size > 0 && !projects.has(t.project)) f.push(fail(`${where}: project "${t.project}" is not listed in capabilities.md`))
        if (!TASK_STATUSES.includes(t.status)) f.push(fail(`${where}: status "${t.status}" is not one of ${TASK_STATUSES.join(' | ')}`))
        if (t.acceptance.length === 0) f.push(fail(`${where}: no \`acceptance:\` ids`))
        for (const a of t.acceptance) if (ids.length > 0 && !ids.includes(a)) f.push(fail(`${where}: acceptance ${a} is not in spec.md`))
        for (const d of t.dependsOn) if (!tasks.some((o) => o.id === d)) f.push(fail(`${where}: depends_on ${d} does not exist`))
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

export function runChecks(s: Snapshot): Report {
  const caps = s.capabilities === null ? null : parseCapabilities(s.capabilities)
  const checks = [
    checkConstitution(s),
    checkTemplate(s),
    checkCapabilities(s, caps),
    checkGit(s),
    checkTooling(s, caps),
    checkSiblings(s, caps),
    checkFeatures(s, caps),
  ]
  const fails = checks.filter((c) => c.status === 'fail').length
  const warns = checks.filter((c) => c.status === 'warn').length
  const status: Verdict = fails >= 3 ? 'NOT_READY' : fails > 0 || warns > 0 ? 'PARTIAL' : 'READY'
  return { status, passed: checks.filter((c) => c.status === 'pass').length, total: checks.length, projects: caps?.projects ?? [], checks }
}
