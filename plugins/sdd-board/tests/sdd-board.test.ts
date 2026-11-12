import { expect, mock, test } from 'claude-code/testing'
import { parsePlan, parseReview, parseSpec, parseTasks } from '../hooks/parse.ts'
import { blockedBy, currentSlug, derive, gate } from '../hooks/model.ts'
import type { Feature } from '../hooks/model.ts'

const SPEC = `# Feature: User Login

**Branch:** feat/user-login
**Status:** planned  <!-- lifecycle -->
**Type:** feat
**Owner:** Jan
**Created:** 2026-11-01

## Acceptance criteria

- [x] AC1: logs in
- [ ] AC2: shows error

## Open questions

- ?
`

const TASKS = `# Tasks: User Login

## Epic: Login

### T1: Login API
project: api
status: done
depends_on: []
acceptance: AC1

### T2: Login form
project: web
status: in-progress
depends_on: [T1]
acceptance: AC1, AC2
scope:
- form with inline errors

### T3: Error states
project: web
status: draft
depends_on: T2
acceptance: AC2
`

const files: Record<string, string> = {
  'specs/user-login/spec.md': SPEC,
  'specs/user-login/plan.md': '# Plan\n\n**Status:** tasks-ready\n',
  'specs/user-login/tasks.md': TASKS,
}

function feature(over: Partial<Feature>): Feature {
  return { slug: 'x', spec: parseSpec(SPEC), planStatus: null, plan: null, tasks: null, review: null, modified: 0, ...over }
}

test('parseSpec reads header, criteria and open questions', () => {
  const s = parseSpec(SPEC)
  expect(s.title).toBe('User Login')
  expect(s.status).toBe('planned')
  expect(s.branch).toBe('feat/user-login')
  expect(s.acTotal).toBe(2)
  expect(s.acDone).toBe(1)
  expect(s.openQuestions).toBe(0)
})

test('parseTasks reads the tasks with their status', () => {
  const tasks = parseTasks(TASKS)
  expect(tasks.map((t) => t.id)).toEqual(['T1', 'T2', 'T3'])
  expect(tasks.map((t) => t.status)).toEqual(['done', 'in-progress', 'draft'])
  expect(tasks[1].title).toBe('Login form')
})

test('parseTasks ignores trailing comments on a field', () => {
  const [t] = parseTasks('### T1: A\nstatus: done  # skeleton created early\n')
  expect(t.status).toBe('done')
})

const DEPS = `# Tasks: Reset

## Epic: Reset

### T1: Reset API
project: api
status: review
depends_on: []
acceptance: AC1, AC3

### T2: Reset endpoints
project: "api"
status: draft
depends_on: [T1]
acceptance: AC1

### T3: Reset screen
project: web
status: draft
depends_on: [T1, T2]  # needs the endpoints for its integration test
acceptance: AC2
`

test('parseTasks reads project, depends_on and acceptance', () => {
  const tasks = parseTasks(DEPS)
  expect(tasks.map((t) => t.project)).toEqual(['api', 'api', 'web'])
  expect(tasks.map((t) => t.dependsOn)).toEqual([[], ['T1'], ['T1', 'T2']])
  expect(tasks[0].acceptance).toEqual(['AC1', 'AC3'])
  expect(parseTasks(TASKS)[2].dependsOn).toEqual(['T2'])
})

test('blockedBy lists dependencies that are not implemented yet', () => {
  const tasks = parseTasks(DEPS)
  const [t1, t2, t3] = tasks
  expect(blockedBy(t1, tasks)).toEqual([])
  expect(blockedBy(t2, tasks)).toEqual([])
  expect(blockedBy(t3, tasks)).toEqual(['T2'])
  expect(blockedBy({ ...t2, dependsOn: ['T9'] }, tasks)).toEqual(['T9'])
})

test('parseReview tells READY from NOT READY', () => {
  expect(parseReview('Verdict: NOT READY')).toBe('NOT READY')
  expect(parseReview('Verdict: READY')).toBe('READY')
  expect(parseReview('**Verdict:** NOT_READY')).toBe('NOT READY')
  expect(parseReview('# Review\n\n**Verdict:** READY\n\n## Drift (drift-detector)\n- the last round was NOT READY, now fixed\n')).toBe('READY')
  // reviews written before the rename
  expect(parseReview('Verdict: NO-GO')).toBe('NOT READY')
  expect(parseReview('Verdict: GO')).toBe('READY')
  expect(parseReview('nothing')).toBeNull()
  expect(parseReview('# Review\n\n**Verdict:** GO\n\n## Drift (drift-detector)\n- the last round was NO-GO, now fixed\n')).toBe('READY')
  expect(parseReview('**Verdict:** NO_GO')).toBe('NOT READY')
})

test('derive walks the pipeline', () => {
  expect(derive(feature({ spec: { ...parseSpec(SPEC), status: 'draft' } })).next?.command).toBe('/sdd:clarify')
  expect(derive(feature({ spec: { ...parseSpec(SPEC), status: 'clarified' } })).next?.command).toBe('/sdd:plan')
  expect(derive(feature({})).next?.command).toBe('/sdd:tasks')
  const tasks = parseTasks(TASKS)
  expect(derive(feature({ planStatus: 'tasks-ready', tasks })).next?.command).toBe('/sdd:implement T2')
  tasks[1].status = 'review'
  expect(derive(feature({ planStatus: 'tasks-ready', tasks })).next?.command).toBe('/sdd:implement T3')
  tasks[2].status = 'review'
  expect(derive(feature({ planStatus: 'tasks-ready', tasks })).next?.command).toBe('/sdd:review')
  expect(derive(feature({ planStatus: 'tasks-ready', tasks, review: 'READY' })).next).toBeNull()
})

const DRAFT = `# Feature: Flagship

**Status:** clarified

## Summary (business)

<!-- What problem -->

Show one flagship project.

## User stories

- As a **visitor**, I want to see it, so that I know the best work.

## Acceptance criteria

- [ ] AC1: given a flagship → block is shown
- [ ] AC2: ...

## Edge cases

- ?

## Open questions

- Q1: share how?
- Q2: one or many?
`

test('parseSpec skips template placeholders', () => {
  const s = parseSpec(DRAFT)
  expect(s.hasSummary).toBe(true)
  expect(s.storyCount).toBe(1)
  expect(s.acTotal).toBe(2)
  expect(s.acReal).toBe(1)
  expect(s.edgeCases).toBe(0)
  expect(s.openQuestions).toBe(2)
})

test('"all resolved" and "none" notes are not open questions', () => {
  const s = parseSpec('# Feature: X\n\n## Open questions\n\n- _All resolved._ Decisions captured above.\n')
  expect(s.openQuestions).toBe(0)
})

test('parsePlan reports missing sections and ignores "none" notes', () => {
  const p = parsePlan('# Plan\n\n**Status:** draft\n\n## High-level approach\n\nDo it.\n\n## File-by-file change list\n\n## Open questions for human review\n\n- _None blocking._ Minor choices later.\n')
  expect(p.status).toBe('draft')
  expect(p.missing).toEqual(['change list', 'risks'])
  expect(p.openItems).toBe(0)
})

test('the gate lists what blocks the next command', () => {
  const g = gate(feature({ spec: { ...parseSpec(DRAFT), status: 'draft' } }))!
  expect(g.command).toBe('/sdd:clarify')
  expect(g.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(['edge'])
  const plan = gate(feature({ spec: parseSpec(DRAFT) }))!
  expect(plan.command).toBe('/sdd:plan')
  expect(plan.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(['edge', 'questions'])
  const tasks = gate(feature({ planStatus: 'draft', plan: { status: 'draft', missing: [], openItems: 0 }, spec: { ...parseSpec(DRAFT), openQuestions: 0 } }))!
  expect(tasks.command).toBe('/sdd:tasks')
  expect(tasks.open).toBe(0)
  expect(gate(feature({ review: 'READY' }))).toBeNull()
})

test('the implement gate checks acceptance criteria and dependencies', () => {
  const tasks = parseTasks(DEPS)
  tasks[0].status = 'draft'
  tasks[1].acceptance = []
  const g = gate(feature({ planStatus: 'tasks-ready', tasks }))!
  expect(g.command).toBe('/sdd:implement T1')
  expect(g.checks.find((c) => c.key === 'ac')?.ok).toBe(true)
  tasks[0].dependsOn = ['T2']
  expect(gate(feature({ planStatus: 'tasks-ready', tasks }))!.checks.find((c) => c.key === 'deps')?.ok).toBe(false)
})

test('currentSlug prefers pin, then branch, then newest', () => {
  const list = [feature({ slug: 'a', modified: 1 }), feature({ slug: 'user-login', modified: 0 })]
  expect(currentSlug(list, 'feat/user-login', null)).toBe('user-login')
  expect(currentSlug(list, 'main', null)).toBe('a')
  expect(currentSlug(list, 'main', 'user-login')).toBe('user-login')
})

const PANE = {
  plugin: 'sdd-board', component: 'Pane', requestId: 'sdd-board',
  viewport: { columns: 140, rows: 40 },
  props: { title: 'SDD', isFocused: true, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

function stubProject($: any, on: any, withSpecs: boolean | (() => boolean), opts: { branch?: string; files?: Record<string, string> } = {}) {
  const all = { ...files, ...(opts.files ?? {}) }
  const has = () => (typeof withSpecs === 'function' ? withSpecs() : withSpecs)
  const clock = mock.clock(on)
  const filled: string[] = []
  const ran: any[] = []
  let refuse = false
  on('session.start', () => ({ cwd: '/work' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const rel = (p: string) => p.replace(/^.*?\/specs/, 'specs')
  on('fs.exists', (_: any, e: any) => ({ value: has() && (rel(e.path) === 'specs' || rel(e.path) in all) }))
  on('fs.list', () => ({ value: [{ name: 'user-login', kind: 'directory', size: 0, isLink: false }] }))
  on('fs.read', (_: any, e: any) => ({ value: all[rel(e.path)] ?? '' }))
  on('fs.stat', () => ({ value: { mtimeMs: 1000 } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: (opts.branch ?? 'feat/user-login') + '\n', stderr: '' } }))
  on('prompt.fill', (_: any, e: any) => { filled.push(e.text); return { isFilled: true } })
  on('command.run', (_: any, e: any) => {
    if (e.command === 'sdd-board') return {}
    ran.push(e.command + ' ' + e.args)
    if (refuse) throw new Error('the session was stopped and nobody has sent input since')
    return {}
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  return Object.assign(filled, { clock, ran, refuseSubmit: () => { refuse = true } })
}

test('the current tab shows the spec, its next step, and fills the prompt', async ($, on) => {
  const filled = stubProject($, on, true)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'User Login' })).toBeDefined()
    await ui.press({ key: 'fill-next' })
    await ui.unmount()
  }
  expect(filled).toEqual(['/sdd:implement T2', '/sdd:implement T2'])
})

test('the all tab lists every spec and can pin one', async ($, on) => {
  stubProject($, on, true)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-all' })
  expect(await ui.find({ key: 'show-user-login' })).toBeDefined()
  await ui.press({ key: 'show-user-login' })
  expect(await ui.find({ key: 'fill-next' })).toBeDefined()
  await ui.unmount()
})

test('a project without specs shows only the setup card and runs the doctor', async ($, on) => {
  const filled = stubProject($, on, false)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'SDD is not set up in this project' })).toBeDefined()
  expect(await ui.find({ key: 'tab-current' })).toBeUndefined()
  expect(await ui.find({ key: 'tab-all' })).toBeUndefined()
  await ui.press({ key: 'init-sdd' })
  await filled.clock.settle()
  expect(filled.ran).toEqual(['sdd:doctor init'])
  expect(filled).toEqual([])
  await ui.unmount()
})

test('a doctor run that cannot start is left in the prompt box', async ($, on) => {
  const filled = stubProject($, on, false)
  filled.refuseSubmit()
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'init-sdd' })
  await filled.clock.settle()
  expect(filled).toEqual(['/sdd:doctor init'])
  await ui.unmount()
})

test('the tabs appear once specs/ shows up', async ($, on) => {
  let created = false
  const filled = stubProject($, on, () => created)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'tab-current' })).toBeUndefined()
  await ui.unmount()
  created = true
  await filled.clock.advance(4000)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'tab-current' })).toBeDefined()
  expect(await ui.find({ key: 'tab-all' })).toBeDefined()
  await ui.unmount()
})

test("another mod's pane is left alone", async ($, on) => {
  stubProject($, on, true)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'other', surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  await ui.unmount()
})

const DONE = { 'specs/user-login/review.md': 'Verdict: READY' }

test('a finished feature shows the done card and hides the tasks', async ($, on) => {
  stubProject($, on, true, { files: DONE })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '✓ Feature done' })).toBeDefined()
  expect(await ui.find({ key: 'fill-next' })).toBeUndefined()
  expect(await ui.find({ key: 'task-T1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Tasks / })).toBeUndefined()
  await ui.unmount()
})

test('on a branch without a spec, finished features are not current: offer a new spec', async ($, on) => {
  const filled = stubProject($, on, true, { files: DONE, branch: 'main' })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Nothing in progress' })).toBeDefined()
  await ui.press({ key: 'fill-empty' })
  expect(filled).toEqual(['/sdd:spec feat '])
  await ui.unmount()
})

test('documents open in their own pane', async ($, on) => {
  stubProject($, on, true)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'doc-plan' })
  const docs = await $.ui.mount({ ...PANE, requestId: 'sdd-board-doc', surface: 'terminal' })
  expect(await docs.find({ key: 'doc-body' })).toBeDefined()
  await docs.unmount()
  await ui.unmount()
})

test('a new spec can be started from the tab bar, also while a feature is in progress', async ($, on) => {
  const filled = stubProject($, on, true, { branch: 'main' })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'User Login' })).toBeDefined()
    await ui.press({ key: 'new-spec' })
    await ui.unmount()
  }
  expect(filled).toEqual(['/sdd:spec feat ', '/sdd:spec feat '])
})

test('the next step card waits on the open checks', async ($, on) => {
  const filled = stubProject($, on, true, {
    files: { 'specs/user-login/spec.md': DRAFT, 'specs/user-login/tasks.md': '' },
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'check-questions' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /waiting on \d+ check/ })).toBeDefined()
    await ui.unmount()
  }
  void filled
})

test('a task whose dependencies are open shows what it waits on', async ($, on) => {
  stubProject($, on, true, { files: { 'specs/user-login/tasks.md': DEPS } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'waits on T2' })).toBeDefined()
  await ui.unmount()
})

test('mid-run, a later task still shows what it waits on', async ($, on) => {
  // T1 implemented (review), T2 running (in-progress), T3 not started (draft)
  const midRun = DEPS.replace('status: draft\ndepends_on: [T1]', 'status: in-progress\ndepends_on: [T1]')
  expect(parseTasks(midRun).map((t) => t.status)).toEqual(['review', 'in-progress', 'draft'])
  stubProject($, on, true, { files: { 'specs/user-login/tasks.md': midRun } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'waits on T2' })).toBeDefined()
  await ui.unmount()
})
