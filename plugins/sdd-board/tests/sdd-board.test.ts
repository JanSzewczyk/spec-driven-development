import { expect, mock, test } from 'claude-code/testing'
import { parseReview, parseSpec, parseTasks } from '../hooks/parse.ts'
import { currentSlug, derive } from '../hooks/model.ts'
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

### Story S1: Form

\`\`\`yaml
- id: T1.1
  title: Write tests
  type: unit-test
  agent: orchestrator
  model: sonnet
  status: done

- id: T1.2
  title: Implement form
  type: ui-component
  agent: orchestrator
  model: sonnet
  status: in-progress
\`\`\`

### Story S2: Errors

\`\`\`yaml
- id: T2.1
  title: Error states
  type: unit-test
  agent: orchestrator
  model: haiku
  status: draft
\`\`\`
`

const files: Record<string, string> = {
  'specs/user-login/spec.md': SPEC,
  'specs/user-login/plan.md': '# Plan\n\n**Status:** tasks-ready\n',
  'specs/user-login/tasks.md': TASKS,
}

function feature(over: Partial<Feature>): Feature {
  return { slug: 'x', spec: parseSpec(SPEC), planStatus: null, stories: null, review: null, modified: 0, ...over }
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

test('parseTasks groups tasks into stories with their status', () => {
  const stories = parseTasks(TASKS)
  expect(stories.length).toBe(2)
  expect(stories[0].tasks.map((t) => t.status)).toEqual(['done', 'in-progress'])
  expect(stories[1].tasks[0].model).toBe('haiku')
})

test('parseReview tells GO from NO-GO', () => {
  expect(parseReview('Verdict: NO-GO')).toBe('NO-GO')
  expect(parseReview('Verdict: GO')).toBe('GO')
  expect(parseReview('nothing')).toBeNull()
})

test('derive walks the pipeline', () => {
  expect(derive(feature({ spec: { ...parseSpec(SPEC), status: 'draft' } })).next?.command).toBe('/sdd:clarify')
  expect(derive(feature({ spec: { ...parseSpec(SPEC), status: 'clarified' } })).next?.command).toBe('/sdd:plan')
  expect(derive(feature({})).next?.command).toBe('/sdd:tasks')
  const stories = parseTasks(TASKS)
  expect(derive(feature({ planStatus: 'tasks-ready', stories })).next?.command).toBe('/sdd:implement S1')
  stories[0].tasks.forEach((t) => (t.status = 'review'))
  expect(derive(feature({ planStatus: 'tasks-ready', stories })).next?.command).toBe('/sdd:implement S2')
  stories[1].tasks.forEach((t) => (t.status = 'review'))
  expect(derive(feature({ planStatus: 'tasks-ready', stories })).next?.command).toBe('/sdd:review')
  expect(derive(feature({ planStatus: 'tasks-ready', stories, review: 'GO' })).next).toBeNull()
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
  expect(filled).toEqual(['/sdd:implement S1', '/sdd:implement S1'])
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

const DONE = { 'specs/user-login/review.md': 'Verdict: GO' }

test('a finished feature shows the done card and hides tasks and stories', async ($, on) => {
  stubProject($, on, true, { files: DONE })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '✓ Feature done' })).toBeDefined()
  expect(await ui.find({ key: 'fill-next' })).toBeUndefined()
  expect(await ui.find({ key: 'story-S1' })).toBeUndefined()
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
