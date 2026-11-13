import { expect, test } from 'claude-code/testing'
import { commandOf, needs, parseCapabilities, parseCommandTable, runChecks } from '../hooks/core/check.ts'
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
    constitution: CONSTITUTION,
    template: TEMPLATE,
    capabilities: CAPABILITIES,
    legacy: [],
    features: [{ slug: 'login', spec: SPEC, plan: PLAN, tasks: TASKS, review: null }],
    settings: null,
    git: { isRepo: true, clean: true, gh: true, ghAuth: true },
    paths: { 'apps/web': true, 'apps/api': true },
    tools: {},
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
