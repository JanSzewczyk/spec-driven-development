import { expect, test } from 'claude-code/testing'
import { applyTaskStatus, setDocStatus, setTaskField, taskBlock, taskFields, taskIdOf } from '../hooks/core/tasks-edit.ts'
import { nextTasks } from '../hooks/core/next.ts'
import type { NextInput } from '../hooks/core/next.ts'
import { renderScalar, setYamlScalar } from '../hooks/core/yaml-edit.ts'
import { configValues, setConfigValue } from '../hooks/core/config-edit.ts'
import { parseCapabilities } from '../hooks/core/capabilities.ts'
import { parseSpec, parsePlanStatus, parseTasks } from '../hooks/core/parse.ts'
import { help, parseArgs } from '../cli/args.ts'
import type { Ctx } from '../cli/command.ts'
import { command as configGet } from '../cli/commands/config-get.ts'
import { command as configSet } from '../cli/commands/config-set.ts'
import { command as taskNext } from '../cli/commands/task-next.ts'
import { command as taskShow } from '../cli/commands/task-show.ts'
import { command as taskStatus } from '../cli/commands/task-status.ts'

const SPEC = `# Feature: User login
**Branch:** feat/user-login
**Status:** planned  <!-- draft → clarified → planned → in-progress → done -->
`
const PLAN = `# Plan\n**Status:** tasks-ready\n`
const TASKS = `# Tasks
**Epic:** ULOG

### T1: API endpoint
project: api
status: draft
depends_on: []
acceptance: AC1
scope:
- add POST /login
files: apps/api/login.py

### T2: Form
project: web
status: draft
depends_on: [T1]
acceptance: AC2

### T3: Docs
project: web
status: draft
depends_on: []

Order: T1 ∥ T3 → T2
`
const CAPS = `format: 3
projects:
  - name: web
    path: apps/web
  - name: api
    path: apps/api
    repo: true

implementation:
  default: in-session         # who implements a task
  projects:
    api: agent:python-developer
  isolation: none             # this session implements and commits every task

review:
  tests: run                  # run | skip
  ci: off
`

const input = (over: Partial<NextInput> = {}): NextInput => ({
  branch: 'feat/user-login',
  features: [{ slug: 'user-login', spec: SPEC, plan: PLAN, tasks: TASKS, review: null }],
  capabilities: CAPS,
  legacyCapabilities: null,
  arg: '',
  ...over,
})

// ---------- task next ----------

test('next lists the open tasks in dependency order with blockers and flows', () => {
  const r = nextTasks(input())
  if ('stop' in r) throw new Error(r.stop)
  expect(r.feature).toEqual({ slug: 'user-login', branch: 'feat/user-login', epic: 'ULOG', dir: 'specs/user-login' })
  expect(r.tasks.map((t) => t.id)).toEqual(['T1', 'T2', 'T3'])
  expect(r.tasks.map((t) => t.ready)).toEqual([true, false, true])
  expect(r.tasks[1].blockedBy).toEqual(['T1'])
  expect(r.tasks[0].flow).toBe('agent:python-developer')
  expect(r.tasks[0].repo).toBe(true)
  expect(r.tasks[2].flow).toBe('in-session')
  expect(r.tasks[0].fullId).toBe('ULOG-T1')
  expect(r.isolation).toEqual({ mode: 'none' })
})

test('next with "all" is the same as no argument', () => {
  expect(nextTasks(input({ arg: 'all' }))).toEqual(nextTasks(input()))
})

test('next skips finished tasks and unblocks their dependants', () => {
  const tasks = TASKS.replace('status: draft', 'status: review')
  const r = nextTasks(input({ features: [{ slug: 'user-login', spec: SPEC, plan: PLAN, tasks, review: null }] }))
  if ('stop' in r) throw new Error(r.stop)
  expect(r.tasks.map((t) => t.id)).toEqual(['T2', 'T3'])
  expect(r.tasks[0].ready).toBe(true)
  expect(r.done).toBe(false)
})

test('next for one blocked task stops and names the blockers', () => {
  const r = nextTasks(input({ arg: 'ULOG-T2' }))
  expect('stop' in r && r.stop).toContain('waits for T1')
})

test('next stops on a missing feature, epic, legacy file and cycle', () => {
  const noFeature = nextTasks(input({ branch: 'main' }))
  expect('stop' in noFeature && noFeature.features).toEqual([{ slug: 'user-login', branch: 'feat/user-login' }])
  const noEpic = nextTasks(input({ features: [{ slug: 'user-login', spec: SPEC, plan: PLAN, tasks: TASKS.replace('**Epic:** ULOG', ''), review: null }] }))
  expect('stop' in noEpic && noEpic.stop).toContain('epic id')
  const legacy = nextTasks(input({ capabilities: null, legacyCapabilities: '# caps' }))
  expect('stop' in legacy && legacy.stop).toContain('/sdd:doctor init')
  const cycle = nextTasks(input({ features: [{ slug: 'user-login', spec: SPEC, plan: PLAN, tasks: TASKS.replace('depends_on: []\nacceptance: AC1', 'depends_on: [T2]\nacceptance: AC1'), review: null }] }))
  expect('stop' in cycle && cycle.stop).toContain('cycle')
})

test('next in worktree mode marks running tasks and what to reconcile', () => {
  const caps = CAPS.replace('isolation: none             # this session implements and commits every task', 'isolation:\n    worktree:\n      merge: pr')
  const tasks = TASKS.replace('status: draft\ndepends_on: []\nacceptance: AC1', 'status: in-progress\npr: 12\ndepends_on: []\nacceptance: AC1')
  const r = nextTasks(input({ capabilities: caps, features: [{ slug: 'user-login', spec: SPEC, plan: PLAN, tasks, review: null }] }))
  if ('stop' in r) throw new Error(r.stop)
  expect(r.isolation).toEqual({ mode: 'worktree', merge: 'pr', parallel: '3' })
  expect(r.reconcile).toEqual(['T1'])
  expect(r.tasks[0].running).toBe(true)
  expect(r.tasks[0].ready).toBe(false)
})

test('next without capabilities.yml falls back to in-session and no isolation', () => {
  const r = nextTasks(input({ capabilities: null }))
  if ('stop' in r) throw new Error(r.stop)
  expect(r.tasks[0].flow).toBe('in-session')
  expect(r.isolation).toEqual({ mode: 'none' })
})

// ---------- task status ----------

const docs = { tasks: TASKS, spec: SPEC, plan: PLAN }

test('the first in-progress moves the task, spec and plan', () => {
  const r = applyTaskStatus(docs, 'T1', 'in-progress')
  if (!r.ok) throw new Error(r.error)
  expect(parseTasks(r.tasks).find((t) => t.id === 'T1')!.status).toBe('in-progress')
  expect(parseSpec(r.spec!).status).toBe('in-progress')
  expect(r.spec).toContain('<!-- draft')
  expect(parsePlanStatus(r.plan!)).toBe('in-progress')
})

test('status keeps a later spec status and every other line', () => {
  const spec = setDocStatus(SPEC, 'done')
  const r = applyTaskStatus({ ...docs, spec }, 'ULOG-T3', 'in-progress')
  if (!r.ok) throw new Error(r.error)
  expect(parseSpec(r.spec!).status).toBe('done')
  expect(r.tasks.split('\n').length).toBe(TASKS.split('\n').length)
})

test('status refuses to move backwards and rejects unknown values', () => {
  const tasks = setTaskField(TASKS, 'T1', 'status', 'review')
  const back = applyTaskStatus({ ...docs, tasks }, 'T1', 'in-progress')
  expect(back.ok).toBe(false)
  expect(applyTaskStatus(docs, 'T1', 'started').ok).toBe(false)
  expect(applyTaskStatus(docs, 'T9', 'review').ok).toBe(false)
  expect(applyTaskStatus(docs, 'T1', 'review', { branch: 'x' }).ok).toBe(false)
})

test('branch and pr are written with in-progress and removed at review', () => {
  const started = applyTaskStatus(docs, 'T2', 'in-progress', { branch: 'feat/user-login--ULOG-T2', pr: '14' })
  if (!started.ok) throw new Error(started.error)
  const t2 = parseTasks(started.tasks).find((t) => t.id === 'T2')!
  expect([t2.branch, t2.pr]).toEqual(['feat/user-login--ULOG-T2', '14'])
  const merged = applyTaskStatus({ ...docs, tasks: started.tasks }, 'T2', 'review')
  if (!merged.ok) throw new Error(merged.error)
  const after = parseTasks(merged.tasks).find((t) => t.id === 'T2')!
  expect([after.status, after.branch, after.pr]).toEqual(['review', '', ''])
})

test('task ids, blocks and fields', () => {
  expect([taskIdOf('t2'), taskIdOf('ULOG-T2'), taskIdOf('x')]).toEqual(['T2', 'T2', ''])
  const block = taskBlock(TASKS, 'T1')!
  expect(block[0]).toBe('### T1: API endpoint')
  expect(taskFields(block).scope).toBe('- add POST /login')
  expect(taskBlock(TASKS, 'T3')!.some((l) => l.startsWith('Order:'))).toBe(false)
})

// ---------- config ----------

test('renderScalar quotes only what needs it', () => {
  expect(renderScalar('skill:nextjs:run-nextjs-task')).toBe('skill:nextjs:run-nextjs-task')
  expect(renderScalar('3')).toBe('3')
  expect(renderScalar('')).toBe('null')
  expect(renderScalar('command:make test # x')).toBe('"command:make test # x"')
})

test('config set changes a scalar and keeps its comment column', () => {
  const r = setConfigValue(CAPS, 'review.tests', 'skip')
  if (!r.ok) throw new Error(r.error)
  expect(r.text).toContain('  tests: skip                 # run | skip')
  expect(r.previous).toBe('run')
})

test('config set turns `isolation: none` into a worktree mapping and back', () => {
  const r = setConfigValue(CAPS, 'implementation.isolation.worktree.merge', 'auto')
  if (!r.ok) throw new Error(r.error)
  expect(r.text).toContain('  isolation:\n    worktree:\n      merge: auto')
  expect(configValues(parseCapabilities(r.text))['implementation.isolation.worktree.merge']).toEqual({ value: 'auto', source: 'set' })
  const back = setConfigValue(r.text, 'implementation.isolation', 'none')
  if (!back.ok) throw new Error(back.error)
  expect(back.text).toContain('  isolation: none')
  expect(back.text).not.toContain('worktree')
})

test('config set adds a missing key or section at the end of its parent', () => {
  const r = setConfigValue(CAPS, 'actions.commit', 'skill:git-workflow:create-commit')
  if (!r.ok) throw new Error(r.error)
  expect(r.text.trimEnd().endsWith('actions:\n  commit: skill:git-workflow:create-commit')).toBe(true)
  const p = setConfigValue(CAPS, 'implementation.projects.web', 'skill:nextjs:run-nextjs-task')
  if (!p.ok) throw new Error(p.error)
  expect(p.text).toContain('    api: agent:python-developer\n    web: skill:nextjs:run-nextjs-task')
})

test('config set refuses what the doctor would flag, lists and init-owned keys', () => {
  const bad = setConfigValue(CAPS, 'implementation.isolation.worktree.merge', 'foo')
  expect(!bad.ok && bad.error).toContain('unknown value')
  const project = setConfigValue(CAPS, 'implementation.projects.mobile', 'in-session')
  expect(!project.ok && project.error).toContain('not a listed project')
  expect(setConfigValue(CAPS, 'projects', 'x').ok).toBe(false)
  expect(setConfigValue(CAPS, 'review.checks', 'agent:qa').ok).toBe(false)
  expect(setConfigValue(CAPS, 'review.tests.deep', 'x').ok).toBe(false)
})

test('setYamlScalar refuses a path through a list', () => {
  const r = setYamlScalar(CAPS, ['projects', 'name'], 'x')
  expect(!r.ok && r.error).toContain('list')
})

// ---------- CLI ----------

test('parseArgs reads positional arguments and flags', () => {
  expect(parseArgs(['task', 'status', 'T1', 'in-progress', '--branch', 'b', '--pr=12', '--help'])).toEqual({
    positional: ['task', 'status', 'T1', 'in-progress'],
    flags: { branch: 'b', pr: '12', help: true },
  })
})

test('every command follows the contract and shows in help', () => {
  const commands = [configGet, configSet, taskNext, taskShow, taskStatus]
  expect(commands.map((c) => `${c.group} ${c.action}`)).toEqual(['config get', 'config set', 'task next', 'task show', 'task status'])
  for (const c of commands) {
    expect(typeof c.run).toBe('function')
    expect(c.summary.length > 0).toBe(true)
  }
  const text = help(commands)
  for (const c of commands) expect(text).toContain(`sdd ${c.group} ${c.action}`)
})

// An in-memory repository for the commands.
function fakeCtx(files: Record<string, string>, branch = 'feat/user-login'): Ctx {
  const ctx: Ctx = {
    root: '/repo',
    changed: [],
    read: (rel) => files[rel] ?? null,
    write(rel, text) {
      files[rel] = text
      if (!ctx.changed.includes(rel)) ctx.changed.push(rel)
    },
    branch: () => branch,
    capabilities: () => ({ yml: files['specs/capabilities.yml'] ?? null, md: files['specs/capabilities.md'] ?? null }),
    features: () => [{ slug: 'user-login', spec: files['specs/user-login/spec.md'] ?? null, plan: files['specs/user-login/plan.md'] ?? null, tasks: files['specs/user-login/tasks.md'] ?? null, review: null }],
    feature: () => (branch === 'feat/user-login' ? ctx.features()[0] : null),
  }
  return ctx
}
const repo = () => ({ 'specs/capabilities.yml': CAPS, 'specs/user-login/spec.md': SPEC, 'specs/user-login/plan.md': PLAN, 'specs/user-login/tasks.md': TASKS })

test('task status writes tasks, spec and plan and reports them', () => {
  const files = repo()
  const ctx = fakeCtx(files)
  const r = taskStatus.run(ctx, ['T1', 'in-progress'], {})
  expect(r).toEqual({ ok: true, data: { task: 'T1', from: 'draft', to: 'in-progress' } })
  expect(ctx.changed).toEqual(['specs/user-login/tasks.md', 'specs/user-login/spec.md', 'specs/user-login/plan.md'])
  const usage = taskStatus.run(fakeCtx(repo()), ['T1'], {})
  expect(!usage.ok && usage.code).toBe(1)
  const off = taskStatus.run(fakeCtx(repo(), 'main'), ['T1', 'review'], {})
  expect(!off.ok && off.code).toBe(2)
})

test('task show and next read through the context', () => {
  const show = taskShow.run(fakeCtx(repo()), ['ULOG-T1'], {})
  expect(show.ok && show.data.fullId).toBe('ULOG-T1')
  const next = taskNext.run(fakeCtx(repo()), ['T2'], {})
  expect(!next.ok && next.code).toBe(2)
})

test('config get and set go through capabilities.yml', () => {
  const files = repo()
  const set = configSet.run(fakeCtx(files), ['review.publish', 'off'], {})
  expect(set.ok).toBe(true)
  const get = configGet.run(fakeCtx(files), ['review.publish'], {})
  expect(get).toEqual({ ok: true, data: { key: 'review.publish', value: 'off', source: 'set' } })
  const missing = configGet.run(fakeCtx({}), [], {})
  expect(!missing.ok && missing.error).toContain('/sdd:doctor init')
})
