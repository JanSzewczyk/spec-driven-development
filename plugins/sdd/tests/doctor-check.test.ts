import { expect, test } from 'claude-code/testing'
import { commandOf, effectiveConfig, loadCapabilities, needs, parseCapabilities, parseCommandTable, parseLegacyCapabilities, runChecks } from '../hooks/core/check.ts'
import { parseYaml } from '../hooks/core/yaml.ts'
import { gather } from '../hooks/core/gather.ts'
import type { Io } from '../hooks/core/gather.ts'
import { parseEpicId, parseTasks } from '../hooks/core/parse.ts'
import type { Snapshot } from '../hooks/core/check.ts'

const CONSTITUTION = `# Project Constitution

## 1. Tech stack
- Runtime: node

## 2. Run/build commands

| Project | Path | test | coverage | typecheck | lint | dev |
|---------|------|------|----------|-----------|------|-----|
| web | \`apps/web\` | \`pnpm nx run web:test\` | | \`pnpm nx run web:typecheck\` | | \`pnpm nx run web:dev\` |
| api | \`apps/api\` | \`cd apps/api && uv run pytest\` | | | | |

## 4. Code conventions
- x

## 5. WHAT NOT TO DO ⛔
- x
`

const CAPABILITIES = `format: 3

projects:
  - name: web
    kind: web
    path: apps/web
    stack: TypeScript, Next.js; pnpm
  - name: api
    kind: backend
    path: apps/api
    stack: Python 3.13, FastAPI; uv

implementation:
  default: in-session
  projects:
    api: agent:python-developer
  isolation: none

actions:
  branch: null
  commit: skill:create-commit
  pr: null

review:
  tests: run
  publish: ask
  default: auto
  ci: on
  checks: [agent:qa]

generated:
  - "**/uv.lock"
`

// The same configuration in the format-2 Markdown file.
const LEGACY = `# Project Capabilities

<!-- sdd-format: 2 -->

## Projects

<!-- auto-generated -->
- **web** — web · apps/web · TypeScript, Next.js; pnpm
- **api** — backend · apps/api · Python 3.13, FastAPI; uv

## Implementation

<!-- user-override -->
default: in-session
api: agent:python-developer
commit: off

## Actions

<!-- user-override -->
branch:
commit: skill:create-commit
pr:

## Review

<!-- user-override -->
tests: run
publish: ask
default: auto
ci: on
checks: agent:qa

## Generated / out-of-band paths

<!-- user-override -->
- \`**/uv.lock\`
`

const TEMPLATE = `# Feature: {{feature_title}}

**Branch:** {{type}}/{{feature_slug}}
**Status:** draft

## Summary (business)
## User stories
## Acceptance criteria
## Edge cases
## Non-goals (out of scope)
## Open questions
`

const SPEC = `# Feature: Login

**Branch:** feat/login
**Status:** planned

## Acceptance criteria

- [ ] AC1: logs in
- [ ] AC2: shows error
`

const PLAN = `# Plan: Login

**Status:** tasks-ready

## High-level approach
x
## File-by-file change list
- a
## Risks & mitigations
- r
`

const TASKS = `# Tasks: Login

**Spec:** \`specs/login/spec.md\`  **Plan:** \`specs/login/plan.md\`
**Epic:** LOG

## Epic: Login

### T1: API
project: api
status: draft
depends_on: []
acceptance: AC1
scope:
- a
files: apps/api/*

### T2: Web
project: web
status: draft
depends_on: [T1]
acceptance: AC2
scope:
- a
files: apps/web/*
`

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    mode: 'session',
    workflow: '# sdd-workflow: 2\nname: SDD Check\n',
    constitution: CONSTITUTION,
    template: TEMPLATE,
    capabilities: CAPABILITIES,
    legacyCapabilities: null,
    legacy: [],
    features: [{ slug: 'login', spec: SPEC, plan: PLAN, tasks: TASKS, review: null }],
    settings: null,
    git: { isRepo: true, clean: true, gh: true, ghAuth: true },
    paths: { 'apps/web': true, 'apps/api': true },
    tools: {},
    flows: {},
    ...over,
  }
}

function allTools(s: Snapshot): Snapshot {
  const tools: Record<string, boolean> = {}
  for (const t of needs(s.constitution, loadCapabilities(s.capabilities, s.legacyCapabilities)).tools) tools[t.key] = true
  return { ...s, tools }
}

function texts(r: ReturnType<typeof runChecks>, id: number): string[] {
  return r.checks.find((c) => c.id === id)!.findings.map((f) => f.text)
}

test('a complete project is READY', () => {
  const r = runChecks(allTools(snapshot()))
  expect(r.status).toBe('READY')
  expect(r.passed).toBe(7)
  expect(r.projects.map((p) => p.name)).toEqual(['web', 'api'])
})

test('missing files fail the first three checks and the verdict is NOT_READY', () => {
  const r = runChecks(snapshot({ constitution: null, template: null, capabilities: null, legacyCapabilities: null, features: [] }))
  expect(r.checks.slice(0, 3).map((c) => c.status)).toEqual(['fail', 'fail', 'fail'])
  expect(r.status).toBe('NOT_READY')
})

test('legacy files are named in the hint', () => {
  const r = runChecks(snapshot({ constitution: null, legacy: ['specs/_constitution.md'] }))
  expect(texts(r, 1)[0]).toContain('_constitution.md')
})

test('a project without a test command is a warning', () => {
  const r = runChecks(allTools(snapshot({ constitution: CONSTITUTION.replace('`cd apps/api && uv run pytest`', '') })))
  expect(r.checks[0].status).toBe('warn')
  expect(texts(r, 1)[0]).toContain('"api"')
})

test('the old dev / ui-preview column still reads as dev', () => {
  const rows = parseCommandTable(CONSTITUTION.replace('| dev |', '| dev / ui-preview |'))!
  expect(rows[0].commands.dev).toBe('pnpm nx run web:dev')
})

test('a legacy Command | Purpose table counts as project root', () => {
  const legacy = '## Run/build\n\n| Command | Purpose |\n|---|---|\n| `npm test` | run tests |\n'
  const rows = parseCommandTable(legacy)!
  expect(rows[0].project).toBe('root')
  expect(rows[0].commands.test).toBe('npm test')
})

test('commandOf skips cd and env assignments', () => {
  expect(commandOf('cd apps/api && CI=1 uv run pytest')).toEqual({ dir: 'apps/api', exe: 'uv' })
  expect(commandOf('')).toBeNull()
})

test('capabilities: legacy ui key and unknown values warn', () => {
  const caps = CAPABILITIES.replace('tests: run', 'tests: run\n  ui: auto').replace('default: in-session', 'default: someone')
  const r = runChecks(allTools(snapshot({ capabilities: caps })))
  const t = texts(r, 3).join('\n')
  expect(t).toContain('`ui:`')
  expect(t).toContain('implementation.default: "someone"')
})

test('capabilities: projects and constitution must agree', () => {
  const caps = CAPABILITIES.replace('- name: api', '- name: worker').replace('    api: agent:python-developer', '    worker: agent:python-developer')
  const t = texts(runChecks(allTools(snapshot({ capabilities: caps }))), 3).join('\n')
  expect(t).toContain('"worker" is in specs/capabilities.yml but not in constitution')
  expect(t).toContain('"api" is in constitution section 2 but not in specs/capabilities.yml')
})

test('legacy capabilities.md: read like the YAML file, plus one migrate warning', () => {
  const r = runChecks(allTools(snapshot({ capabilities: null, legacyCapabilities: LEGACY })))
  const c3 = r.checks[2]
  expect(c3.name).toBe('specs/capabilities.md')
  expect(c3.findings.map((f) => [f.text.includes('migrates it to specs/capabilities.yml'), f.fix])).toEqual([[true, 'init']])
  expect(r.projects.map((p) => p.name)).toEqual(['web', 'api'])
  const legacy = parseLegacyCapabilities(LEGACY)
  const yaml = parseCapabilities(CAPABILITIES)
  expect(legacy.projects).toEqual(yaml.projects)
  expect(effectiveConfig(legacy, CONSTITUTION).sections).toEqual(effectiveConfig(yaml, CONSTITUTION).sections)
  expect(parseLegacyCapabilities(LEGACY.replace('## Projects', '## Stack profile')).projects.length).toBe(2)
})

test('legacy capabilities.md: isolation, merge and parallel move under worktree; commit is dropped', () => {
  const md = LEGACY.replace('commit: off', 'commit: task\nisolation: worktree\nmerge: auto\nparallel: 2')
  expect(parseLegacyCapabilities(md).doc.implementation).toEqual({ default: 'in-session', projects: { api: 'agent:python-developer' }, isolation: { worktree: { merge: 'auto', parallel: '2' } } })
  expect((parseLegacyCapabilities(LEGACY.replace('commit: off', 'merge: auto')).doc.implementation as any).isolation).toBeUndefined()
})

test('legacy capabilities.md: an npm-scoped project line is read', () => {
  const md = LEGACY.replace('- **web** — web', '- **@acme/web** — web').replace('checks: agent:qa', 'checks: agent:qa\n@acme/web: agent:nextjs:code-reviewer')
  expect((parseLegacyCapabilities(md).doc.review as any).projects).toEqual({ '@acme/web': 'agent:nextjs:code-reviewer' })
})

test('the YAML file wins over the legacy one', () => {
  expect(loadCapabilities(CAPABILITIES, LEGACY)!.legacy).toBe(false)
  expect(loadCapabilities(null, LEGACY)!.legacy).toBe(true)
  expect(loadCapabilities(null, null)).toBeNull()
})

test('capabilities: a YAML syntax error fails check 3 with its line', () => {
  const r = runChecks(allTools(snapshot({ capabilities: CAPABILITIES.replace('  tests: run', '  tests: &x run') })))
  expect(r.checks[2].status).toBe('fail')
  expect(texts(r, 3)).toEqual([expect.stringMatching(/^line 25: anchors/)])
})

test('capabilities: an npm-scoped project name must be quoted', () => {
  const scoped = CAPABILITIES.replace('- name: web', '- name: "@acme/web"').replace('    api: agent:python-developer', '    api: agent:python-developer\n    "@acme/web": in-session')
  const constitution = CONSTITUTION.replace('| web |', '| @acme/web |')
  expect(texts(runChecks(allTools(snapshot({ capabilities: scoped, constitution }))), 3)).toEqual([])
  expect(parseCapabilities(scoped).projects[0].name).toBe('@acme/web')
  const bare = texts(runChecks(allTools(snapshot({ capabilities: scoped.replace('"@acme/web"', '@acme/web') }))), 3)
  expect(bare).toEqual(['line 4: a plain value cannot start with "@": quote it'])
})

test('capabilities: unknown keys, wrong shapes and an old format warn', () => {
  const caps = CAPABILITIES.replace('format: 3', 'format: 2\nextra: 1').replace('  ci: on', '  ci: on\n  verbose: yes').replace('checks: [agent:qa]', 'checks: agent:qa').replace('    stack: Python 3.13, FastAPI; uv', '    stack: x\n    repo: maybe\n    owner: me')
  const t = texts(runChecks(allTools(snapshot({ capabilities: caps }))), 3).join('\n')
  expect(t).toContain('`format` is 2')
  expect(t).toContain('unknown key "extra"')
  expect(t).toContain('review: unknown key "verbose"')
  expect(t).toContain('`review.checks` must be a list')
  expect(t).toContain('projects[1]: `repo` is true or false')
  expect(t).toContain('projects[1]: unknown key "owner"')
})

test('a dirty tree and a missing gh warn; no repository fails', () => {
  expect(runChecks(allTools(snapshot({ git: { isRepo: true, clean: false, gh: false, ghAuth: null } }))).checks[3].status).toBe('warn')
  expect(runChecks(allTools(snapshot({ git: { isRepo: false, clean: null, gh: null, ghAuth: null } }))).checks[3].status).toBe('fail')
})

test('gh is not needed when a pr action is set', () => {
  const caps = CAPABILITIES.replace('pr: null', 'pr: skill:create-pull-request')
  const r = runChecks(allTools(snapshot({ capabilities: caps, git: { isRepo: true, clean: true, gh: false, ghAuth: null } })))
  expect(r.checks[3].status).toBe('pass')
})

test('offline skips the gh lookups without a warning', () => {
  const r = runChecks(allTools(snapshot({ git: { isRepo: true, clean: true, gh: null, ghAuth: null } })))
  expect(r.checks[3].status).toBe('pass')
})

test('an unresolvable tool and a missing project path warn', () => {
  const s = snapshot({ paths: { 'apps/web': true, 'apps/api': false } })
  const tools: Record<string, boolean> = {}
  for (const t of needs(s.constitution, parseCapabilities(s.capabilities!)).tools) tools[t.key] = t.exe !== 'uv'
  const t = texts(runChecks({ ...s, tools }), 5).join('\n')
  expect(t).toContain('`uv` not found')
  expect(t).toContain('"apps/api" does not exist')
})

test('sibling repositories: missing settings entry and malformed JSON', () => {
  const caps = CAPABILITIES.replace('    path: apps/api', '    path: ../api-repo\n    repo: true')
  const s = allTools(snapshot({ capabilities: caps, paths: { 'apps/web': true, '../api-repo': true }, settings: '{"permissions":{"additionalDirectories":[]}}' }))
  expect(texts(runChecks(s), 6).join('\n')).toContain('not in permissions.additionalDirectories')
  const bad = runChecks({ ...s, settings: '{ nope' })
  expect(bad.checks[5].status).toBe('fail')
  const ok = runChecks({ ...s, settings: '{"permissions":{"additionalDirectories":["../api-repo"]}}' })
  expect(ok.checks[5].status).toBe('pass')
})

test('features: broken tasks are reported', () => {
  const broken = TASKS.replace('acceptance: AC2', 'acceptance: AC9').replace('depends_on: [T1]', 'depends_on: [T7]').replace('project: api', 'project: ghost')
  const t = texts(runChecks(allTools(snapshot({ features: [{ slug: 'login', spec: SPEC, plan: PLAN, tasks: broken, review: null }] }))), 7).join('\n')
  expect(t).toContain('project "ghost"')
  expect(t).toContain('acceptance AC9 is not in spec.md')
  expect(t).toContain('depends_on T7 does not exist')
  expect(t).toContain('AC2 is served by no task')
})

test('features: a dependency cycle and a duplicate branch fail', () => {
  const cyc = TASKS.replace('depends_on: []', 'depends_on: [T2]')
  const s = allTools(snapshot({
    features: [
      { slug: 'login', spec: SPEC, plan: PLAN, tasks: cyc, review: null },
      { slug: 'login-2', spec: SPEC, plan: null, tasks: null, review: null },
    ],
  }))
  const t = texts(runChecks(s), 7).join('\n')
  expect(t).toContain('dependency cycle')
  expect(t).toContain('branch "feat/login" is also used')
})

test('features: bad statuses, duplicate AC ids, missing spec and review verdict', () => {
  const spec = SPEC.replace('**Status:** planned', '**Status:** wip').replace('- [ ] AC2', '- [ ] AC1')
  const s = allTools(snapshot({
    features: [
      { slug: 'login', spec, plan: PLAN.replace('tasks-ready', 'ready'), tasks: null, review: 'no verdict here' },
      { slug: 'orphan', spec: null, plan: null, tasks: TASKS, review: null },
    ],
  }))
  const t = texts(runChecks(s), 7).join('\n')
  expect(t).toContain('"wip"')
  expect(t).toContain('duplicate acceptance criteria ids AC1')
  expect(t).toContain('plan.md')
  expect(t).toContain('no READY / NOT READY verdict')
  expect(t).toContain('specs/orphan/spec.md missing')
})

test('three failing checks give NOT_READY, one or two give PARTIAL', () => {
  const one = runChecks(allTools(snapshot({ template: null })))
  expect(one.status).toBe('PARTIAL')
  const three = runChecks(allTools(snapshot({ template: null, git: { isRepo: false, clean: null, gh: null, ghAuth: null }, features: [{ slug: 'x', spec: null, plan: null, tasks: TASKS, review: null }] })))
  expect(three.status).toBe('NOT_READY')
})

test('a skill or agent that is not installed warns; unknown (null) does not', () => {
  const s = allTools(snapshot({ flows: { 'agent:python-developer': false, 'skill:create-commit': null, 'agent:qa': true } }))
  const t = texts(runChecks(s), 3).join('\n')
  expect(t).toContain('Implementation api: agent:python-developer is not installed')
  expect(t).not.toContain('create-commit')
  expect(t).not.toContain('agent:qa')
})

test('a command: value whose executable is missing is a tooling warning', () => {
  const caps = CAPABILITIES.replace('pr: null', 'pr: command:gh-pr-bot --draft')
  const s = snapshot({ capabilities: caps })
  const tools: Record<string, boolean> = {}
  for (const t of needs(s.constitution, parseCapabilities(s.capabilities!)).tools) tools[t.key] = t.exe !== 'gh-pr-bot'
  const t = texts(runChecks({ ...s, tools }), 5).join('\n')
  expect(t).toContain('`gh-pr-bot` not found')
})

test('capabilities at their defaults ask for /sdd:capabilities; a set value does not', () => {
  const defaults = CAPABILITIES.replace('    api: agent:python-developer\n', '').replace('commit: skill:create-commit', 'commit: null').replace('checks: [agent:qa]', 'checks: []')
  expect(texts(runChecks(allTools(snapshot({ capabilities: defaults }))), 3).join('\n')).toContain('/sdd:capabilities')
  expect(texts(runChecks(allTools(snapshot())), 3).join('\n')).not.toContain('/sdd:capabilities')
})

test('effectiveConfig shows set values and defaults per project', () => {
  const c = effectiveConfig(parseCapabilities(CAPABILITIES), CONSTITUTION)
  const impl = c.sections[0].entries
  expect(impl.find((e) => e.key === 'api')).toEqual({ key: 'api', value: 'agent:python-developer', source: 'set' })
  expect(impl.find((e) => e.key === 'web')).toEqual({ key: 'web', value: 'in-session', source: 'default' })
  expect(c.sections[1].entries.find((e) => e.key === 'branch')?.source).toBe('default')
  expect(c.sections[1].entries.find((e) => e.key === 'commit')?.value).toBe('skill:create-commit')
  expect(c.sections[2].entries.find((e) => e.key === 'checks')?.value).toBe('agent:qa')
  expect(c.configured).toBe(true)
  expect(c.generated).toBe(1)
  expect(c.commands.length).toBe(2)
})

test('capabilities: isolation is none or worktree with its options under it', () => {
  const run = (iso: string) => texts(runChecks(allTools(snapshot({ capabilities: CAPABILITIES.replace('  isolation: none', iso) }))), 3)
  expect(run('  isolation: none')).toEqual([])
  expect(run('  isolation:\n    worktree:')).toEqual([])
  expect(run('  isolation: { worktree: {} }')).toEqual([])
  expect(run('  isolation:\n    worktree:\n      merge: auto\n      parallel: 2')).toEqual([])
  expect(run('  isolation: worktree').join()).toContain('write `worktree:` as a key')
  expect(run('  isolation:\n    none: true').join()).toContain('not key(s) `none`')
  expect(run('  isolation:\n    worktree:\n      merge: sideways\n      parallel: 0\n      fast: 1').join('\n')).toContain('`isolation.worktree.merge`: "sideways"')
  expect(run('  isolation:\n    worktree:\n      parallel: 0').join()).toContain('`isolation.worktree.parallel`: "0"')
  expect(run('  isolation:\n    worktree:\n      fast: 1').join()).toContain('unknown key "fast"')
  expect(run('  isolation: none\n  merge: pr').join()).toContain('`merge` belongs under `isolation.worktree`')
  const commit = runChecks(allTools(snapshot({ capabilities: CAPABILITIES.replace('  isolation: none', '  isolation: none\n  commit: off') }))).checks[2].findings
  expect(commit.find((f) => f.text.includes('`commit` is no longer read'))?.fix).toBe('init')
})

test('capabilities: project overrides must name a listed project', () => {
  const t = texts(runChecks(allTools(snapshot({ capabilities: CAPABILITIES.replace('    api: agent:python-developer', '    api: agent:python-developer\n    ghost: in-session').replace('  default: auto', '  default: auto\n  projects:\n    web: nope') }))), 3).join('\n')
  expect(t).toContain('implementation.projects: "ghost" is not a listed project')
  expect(t).toContain('review.projects.web: "nope" is not skill:<name> | agent:<name>')
})

test('capabilities: an old format marker, an unset ci and a missing or old workflow ask for init', () => {
  const run = (over: Partial<Snapshot>) => runChecks(allTools(snapshot(over))).checks[2].findings
  expect(run({ capabilities: CAPABILITIES.replace('format: 3\n', '') }).find((f) => f.text.includes('`format` is not set'))?.fix).toBe('init')
  expect(run({ capabilities: CAPABILITIES.replace('  ci: on\n', '') }).find((f) => f.text.includes('`review.ci` is not set'))?.fix).toBe('init')
  expect(run({ workflow: null }).find((f) => f.text.includes('is missing'))?.fix).toBe('init')
  expect(run({ workflow: '# sdd-workflow: 1\n' }).find((f) => f.text.includes('older than the template'))?.fix).toBe('init')
  expect(run({ capabilities: CAPABILITIES.replace('  ci: on', '  ci: off'), workflow: null })).toEqual([])
})

test('features: epic id is required, well formed and unique', () => {
  const t = (tasks: string, other = TASKS) => texts(runChecks(allTools(snapshot({ features: [
    { slug: 'login', spec: SPEC, plan: PLAN, tasks, review: null },
    { slug: 'logout', spec: SPEC.replace('feat/login', 'feat/logout'), plan: null, tasks: other, review: null },
  ] }))), 7).join('\n')
  expect(t(TASKS.replace('**Epic:** LOG\n', ''), TASKS.replace('LOG', 'OUT'))).toContain('no `**Epic:**` id')
  expect(t(TASKS.replace('LOG', 'LOG-12'), TASKS.replace('LOG', 'OUT'))).toContain('is not 2-8 capital letters')
  expect(t(TASKS)).toContain('epic id LOG is also used by specs/login/')
  expect(t(TASKS.replace('LOG', 'LOG-7f3a'), TASKS.replace('LOG', 'OUT'))).not.toContain('epic id')
})

test('features: task branch and pr are validated', () => {
  const run = (extra: string, caps = CAPABILITIES) => texts(runChecks(allTools(snapshot({ capabilities: caps, features: [{ slug: 'login', spec: SPEC, plan: PLAN, tasks: TASKS.replace('status: draft\ndepends_on: []', 'status: in-progress\ndepends_on: []\n' + extra), review: null }] }))), 7).join('\n')
  expect(run('branch: feat/login--LOG-T1\npr: #12')).toBe('')
  expect(run('branch: feat/other')).toContain('is not feat/login--LOG-T1')
  expect(run('pr: soon')).toContain('pr "soon" is not a pull request')
  const isolated = CAPABILITIES.replace('  isolation: none', '  isolation:\n    worktree:')
  expect(run('', isolated)).toContain('in-progress with isolation: worktree but no `branch:`')
})

test('parseEpicId and the task branch and pr fields', () => {
  expect(parseEpicId(TASKS)).toBe('LOG')
  expect(parseEpicId('# Tasks\n## Epic: x\n')).toBe('')
  const t = parseTasks(TASKS.replace('depends_on: []', 'depends_on: []\nbranch: feat/login--LOG-T1\npr: https://github.com/o/r/pull/3'))
  expect(t[0].branch).toBe('feat/login--LOG-T1')
  expect(t[0].pr).toBe('https://github.com/o/r/pull/3')
  expect(t[1].branch).toBe('')
})

test('ci mode does not judge git, tools or sibling repositories', () => {
  const r = runChecks(snapshot({ mode: 'ci', git: { isRepo: false, clean: false, gh: false, ghAuth: false }, paths: { 'apps/web': false } }))
  expect(r.checks.slice(3, 6).map((c) => c.summary)).toEqual(['not checked in CI', 'not checked in CI', 'not checked in CI'])
  expect(r.checks.slice(3, 6).every((c) => c.status === 'pass')).toBe(true)
  expect(r.status).toBe('READY')
})

test('effectiveConfig shows merge and parallel only with isolation: worktree', () => {
  const keys = (caps: string) => effectiveConfig(parseCapabilities(caps), CONSTITUTION).sections[0].entries.map((e) => e.key)
  const none = effectiveConfig(parseCapabilities(CAPABILITIES), CONSTITUTION)
  expect(none.sections[0].entries.find((e) => e.key === 'isolation')).toEqual({ key: 'isolation', value: 'none', source: 'default' })
  expect(keys(CAPABILITIES)).toEqual(['default', 'web', 'api', 'isolation'])
  const wt = effectiveConfig(parseCapabilities(CAPABILITIES.replace('  isolation: none', '  isolation:\n    worktree:\n      merge: auto')), CONSTITUTION).sections[0].entries
  expect(wt.slice(3)).toEqual([
    { key: 'isolation', value: 'worktree', source: 'set' },
    { key: 'merge', value: 'auto', source: 'set', parent: 'isolation' },
    { key: 'parallel', value: '3', source: 'default', parent: 'isolation' },
  ])
  expect(none.sections[2].entries.find((e) => e.key === 'ci')).toEqual({ key: 'ci', value: 'on', source: 'set' })
})

test('yaml: the accepted subset', () => {
  const r = parseYaml(`# comment
a: 1
b: "x: # y"
c: 'it''s'
d: [p, "q, r", 3]
e: {}
f:
- one
- k: v
  l: [x]
g:
  h: ~
  i:
  j: on
k: -1
`)
  expect(r.errors).toEqual([])
  expect(r.value).toEqual({ a: 1, b: 'x: # y', c: "it's", d: ['p', 'q, r', 3], e: {}, f: ['one', { k: 'v', l: ['x'] }], g: { h: null, i: null, j: 'on' }, k: -1 })
})

test('yaml: unsupported constructs are errors with their line', () => {
  const err = (t: string) => parseYaml(t).errors[0]
  expect(err('a: &x 1')).toEqual({ line: 1, message: expect.stringContaining('anchors') })
  expect(err('a:\n  - *x')?.line).toBe(2)
  expect(err('a: !!str 1')?.message).toContain('tags')
  expect(err('a: |\n  x')?.message).toContain('block scalars')
  expect(err('a: 1\na: 2')).toEqual({ line: 2, message: 'duplicate key "a"' })
  expect(err('a: [b, [c]]')?.message).toContain('nested flow')
  expect(err('a: b: c')?.message).toContain('": "')
  expect(err('a: 1\n---\nb: 2')?.message).toContain('one YAML document')
  expect(err('a:\n\tb: 1')?.message).toContain('tabs')
  expect(err('a:\n    b: 1\n  c: 2')).toEqual({ line: 3, message: 'unexpected indentation' })
  expect(err('a: "open')?.message).toContain('unterminated')
})

function fakeIo(files: Record<string, string>): Io {
  return {
    async read(p) { return p in files ? files[p] : null },
    async exists(p) { return p in files || Object.keys(files).some((k) => k.startsWith(p + '/')) },
    async list(dir) {
      const names = new Set<string>()
      for (const k of Object.keys(files)) if (k.startsWith(dir + '/')) names.add(k.slice(dir.length + 1).split('/')[0])
      return [...names].map((name) => ({ name, dir: !(dir + '/' + name in files) }))
    },
    async run() { throw new Error('ci mode must not run commands') },
  }
}

test('gather in ci mode reads specs and the workflow without running anything', async () => {
  const s = await gather(fakeIo({
    'specs/constitution.md': CONSTITUTION,
    'specs/template.md': TEMPLATE,
    'specs/capabilities.yml': CAPABILITIES,
    'specs/login/spec.md': SPEC,
    'specs/login/plan.md': PLAN,
    'specs/login/tasks.md': TASKS,
    '.github/workflows/sdd-check.yml': '# sdd-workflow: 2\n',
  }), { mode: 'ci' })
  expect(s.mode).toBe('ci')
  expect(s.features.map((f) => f.slug)).toEqual(['login'])
  expect(s.workflow).toContain('sdd-workflow')
  expect(runChecks(s).status).toBe('READY')
})
