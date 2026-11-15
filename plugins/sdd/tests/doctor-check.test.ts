import { expect, test } from 'claude-code/testing'
import { commandOf, effectiveConfig, needs, parseCapabilities, parseCommandTable, runChecks } from '../hooks/core/check.ts'
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

const CAPABILITIES = `# Project Capabilities

<!-- sdd-format: 3 -->

## Projects

<!-- auto-generated -->
- **web** — web · apps/web · TypeScript, Next.js; pnpm
- **api** — backend · apps/api · Python 3.13, FastAPI; uv

## Implementation

<!-- user-override -->
default: in-session
api: agent:python-developer

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
**Epic:** LOG-7f3a

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
    workflow: '# sdd-workflow: 1\nname: SDD Check\n',
    constitution: CONSTITUTION,
    template: TEMPLATE,
    capabilities: CAPABILITIES,
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
  for (const t of needs(s.constitution, s.capabilities).tools) tools[t.key] = true
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
  const r = runChecks(snapshot({ constitution: null, template: null, capabilities: null, features: [] }))
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
  const caps = CAPABILITIES.replace('tests: run', 'tests: run\nui: auto').replace('default: in-session', 'default: someone')
  const r = runChecks(allTools(snapshot({ capabilities: caps })))
  const t = texts(r, 3).join('\n')
  expect(t).toContain('`ui:`')
  expect(t).toContain('"default: someone"')
})

test('capabilities: projects and constitution must agree', () => {
  const caps = CAPABILITIES.replace('- **api**', '- **worker**')
  const t = texts(runChecks(allTools(snapshot({ capabilities: caps }))), 3).join('\n')
  expect(t).toContain('"worker" is in capabilities.md but not in constitution')
  expect(t).toContain('"api" is in constitution section 2 but not in capabilities.md')
})

test('capabilities: the old Stack profile section is reported', () => {
  const caps = CAPABILITIES.replace('## Projects', '## Stack profile')
  expect(parseCapabilities(caps).legacyProjects).toBe(true)
  expect(texts(runChecks(allTools(snapshot({ capabilities: caps }))), 3).join('\n')).toContain('Stack profile')
})

test('a dirty tree and a missing gh warn; no repository fails', () => {
  expect(runChecks(allTools(snapshot({ git: { isRepo: true, clean: false, gh: false, ghAuth: null } }))).checks[3].status).toBe('warn')
  expect(runChecks(allTools(snapshot({ git: { isRepo: false, clean: null, gh: null, ghAuth: null } }))).checks[3].status).toBe('fail')
})

test('gh is not needed when a pr action is set', () => {
  const caps = CAPABILITIES.replace('pr:\n', 'pr: skill:create-pull-request\n')
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
  for (const t of needs(s.constitution, s.capabilities).tools) tools[t.key] = t.exe !== 'uv'
  const t = texts(runChecks({ ...s, tools }), 5).join('\n')
  expect(t).toContain('`uv` not found')
  expect(t).toContain('"apps/api" does not exist')
})

test('sibling repositories: missing settings entry and malformed JSON', () => {
  const caps = CAPABILITIES.replace('- **api** — backend · apps/api', '- **api** — backend · ../api-repo (repo)')
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
  const caps = CAPABILITIES.replace('pr:\n', 'pr: command:gh-pr-bot --draft\n')
  const s = snapshot({ capabilities: caps })
  const tools: Record<string, boolean> = {}
  for (const t of needs(s.constitution, s.capabilities).tools) tools[t.key] = t.exe !== 'gh-pr-bot'
  const t = texts(runChecks({ ...s, tools }), 5).join('\n')
  expect(t).toContain('`gh-pr-bot` not found')
})

test('capabilities at their defaults ask for /sdd:capabilities; a set value does not', () => {
  const defaults = CAPABILITIES.replace('api: agent:python-developer\n', '').replace('commit: skill:create-commit', 'commit:').replace('checks: agent:qa', 'checks:')
  expect(texts(runChecks(allTools(snapshot({ capabilities: defaults }))), 3).join('\n')).toContain('/sdd:capabilities')
  expect(texts(runChecks(allTools(snapshot())), 3).join('\n')).not.toContain('/sdd:capabilities')
})

test('effectiveConfig shows set values and defaults per project', () => {
  const c = effectiveConfig(CAPABILITIES, CONSTITUTION)
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

test('capabilities: new Implementation keys are validated and are not project names', () => {
  const caps = CAPABILITIES.replace('default: in-session\n', 'default: in-session\nisolation: worktree\nmerge: pr\nparallel: 2\n')
  expect(texts(runChecks(allTools(snapshot({ capabilities: caps }))), 3)).toEqual([])
  const bad = CAPABILITIES.replace('default: in-session\n', 'default: in-session\nisolation: sideways\nparallel: 0\n')
  const t = texts(runChecks(allTools(snapshot({ capabilities: bad }))), 3).join('\n')
  expect(t).toContain('"isolation: sideways" has an unknown value')
  expect(t).toContain('"parallel: 0" has an unknown value')
})

test('capabilities: a commit: line under Implementation is no longer read and init deletes it', () => {
  const caps = CAPABILITIES.replace('default: in-session\n', 'default: in-session\ncommit: off\n')
  const f = runChecks(allTools(snapshot({ capabilities: caps }))).checks[2].findings
  const commit = f.filter((x) => x.text.includes('commit'))
  expect(commit.length).toBe(1)
  expect(commit[0].text).toContain('`commit: off` is no longer read')
  expect(commit[0].fix).toBe('init')
})

test('capabilities: an old format marker, an unset ci and a missing or old workflow ask for init', () => {
  const run = (over: Partial<Snapshot>) => runChecks(allTools(snapshot(over))).checks[2].findings
  expect(run({ capabilities: CAPABILITIES.replace('<!-- sdd-format: 3 -->\n\n', '') }).find((f) => f.text.includes('format'))?.fix).toBe('init')
  expect(run({ capabilities: CAPABILITIES.replace('ci: on\n', '') }).find((f) => f.text.includes('`ci:` is not set'))?.fix).toBe('init')
  expect(run({ workflow: null }).find((f) => f.text.includes('is missing'))?.fix).toBe('init')
  expect(run({ workflow: '# sdd-workflow: 0\n' }).find((f) => f.text.includes('older than the template'))?.fix).toBe('init')
  expect(run({ capabilities: CAPABILITIES.replace('ci: on', 'ci: off'), workflow: null })).toEqual([])
})

test('features: epic id is required, well formed and unique', () => {
  const t = (tasks: string, other = TASKS) => texts(runChecks(allTools(snapshot({ features: [
    { slug: 'login', spec: SPEC, plan: PLAN, tasks, review: null },
    { slug: 'logout', spec: SPEC.replace('feat/login', 'feat/logout'), plan: null, tasks: other, review: null },
  ] }))), 7).join('\n')
  expect(t(TASKS.replace('**Epic:** LOG-7f3a\n', ''), TASKS.replace('LOG-7f3a', 'OUT-1234'))).toContain('no `**Epic:**` id')
  expect(t(TASKS.replace('LOG-7f3a', 'log-7F3A'), TASKS.replace('LOG-7f3a', 'OUT-1234'))).toContain('is not <LETTERS>-<4 hex>')
  expect(t(TASKS)).toContain('epic id LOG-7f3a is also used by specs/login/')
})

test('features: task branch and pr are validated', () => {
  const run = (extra: string, caps = CAPABILITIES) => texts(runChecks(allTools(snapshot({ capabilities: caps, features: [{ slug: 'login', spec: SPEC, plan: PLAN, tasks: TASKS.replace('status: draft\ndepends_on: []', 'status: in-progress\ndepends_on: []\n' + extra), review: null }] }))), 7).join('\n')
  expect(run('branch: feat/login--LOG-7f3a-T1\npr: #12')).toBe('')
  expect(run('branch: feat/other')).toContain('is not feat/login--LOG-7f3a-T1')
  expect(run('pr: soon')).toContain('pr "soon" is not a pull request')
  const isolated = CAPABILITIES.replace('default: in-session\n', 'default: in-session\nisolation: worktree\n')
  expect(run('', isolated)).toContain('in-progress with isolation: worktree but no `branch:`')
})

test('parseEpicId and the task branch and pr fields', () => {
  expect(parseEpicId(TASKS)).toBe('LOG-7f3a')
  expect(parseEpicId('# Tasks\n## Epic: x\n')).toBe('')
  const t = parseTasks(TASKS.replace('depends_on: []', 'depends_on: []\nbranch: feat/login--LOG-7f3a-T1\npr: https://github.com/o/r/pull/3'))
  expect(t[0].branch).toBe('feat/login--LOG-7f3a-T1')
  expect(t[0].pr).toBe('https://github.com/o/r/pull/3')
  expect(t[1].branch).toBe('')
})

test('ci mode does not judge git, tools or sibling repositories', () => {
  const r = runChecks(snapshot({ mode: 'ci', git: { isRepo: false, clean: false, gh: false, ghAuth: false }, paths: { 'apps/web': false } }))
  expect(r.checks.slice(3, 6).map((c) => c.summary)).toEqual(['not checked in CI', 'not checked in CI', 'not checked in CI'])
  expect(r.checks.slice(3, 6).every((c) => c.status === 'pass')).toBe(true)
  expect(r.status).toBe('READY')
})

test('effectiveConfig lists the new Implementation keys and ci with their defaults', () => {
  const c = effectiveConfig(CAPABILITIES, CONSTITUTION)
  const impl = c.sections[0].entries
  expect(impl.find((e) => e.key === 'isolation')).toEqual({ key: 'isolation', value: 'none', source: 'default' })
  expect(impl.find((e) => e.key === 'merge')?.value).toBe('pr')
  expect(impl.find((e) => e.key === 'parallel')?.value).toBe('3')
  expect(c.sections[2].entries.find((e) => e.key === 'ci')).toEqual({ key: 'ci', value: 'on', source: 'set' })
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
    'specs/capabilities.md': CAPABILITIES,
    'specs/login/spec.md': SPEC,
    'specs/login/plan.md': PLAN,
    'specs/login/tasks.md': TASKS,
    '.github/workflows/sdd-check.yml': '# sdd-workflow: 1\n',
  }), { mode: 'ci' })
  expect(s.mode).toBe('ci')
  expect(s.features.map((f) => f.slug)).toEqual(['login'])
  expect(s.workflow).toContain('sdd-workflow')
  expect(runChecks(s).status).toBe('READY')
})
