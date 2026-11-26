import { expect, mock, test } from 'claude-code/testing'
import { parseEpicId, parsePlan, parseReview, parseSpec, parseTasks } from '../core/parse.ts'
import { blockedBy, clock, currentSlug, derive, freshness, gate, sessionOf, taskLook, warnings } from '../hooks/board/model.ts'
import { mergeState, prList, prNumber, prStates, taskBranchBase, taskOfBranch, taskPrs, worktreeOf } from '../core/merges.ts'
import { emptyLive, isActive, lanesOf, onCommand, onReport, onSpawn, onTool, onTurnComplete, onTurnStart, toolDetail } from '../hooks/board/live.ts'
import type { Feature } from '../hooks/board/model.ts'

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
  expect(s.criteria).toEqual([{ id: 'AC1', text: 'logs in' }, { id: 'AC2', text: 'shows error' }])
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

test('only the step of the running command is current', () => {
  const draft = feature({ spec: { ...parseSpec(SPEC), status: 'draft' } })
  const states = (d: { steps: { state: string }[] }) => d.steps.map((s) => s.state).join(' ')
  expect(states(derive(draft))).toBe('done todo todo todo todo todo')
  expect(states(derive(draft, '/sdd:spec'))).toBe('current todo todo todo todo todo')
  expect(states(derive(draft, '/sdd:clarify'))).toBe('done current todo todo todo todo')
  // /sdd:spec on a feature past its draft writes another one.
  expect(states(derive(feature({}), '/sdd:spec'))).toBe('done done done todo todo todo')
  expect(derive(feature({}), '/sdd:spec').isRunning).toBe(false)
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
  plugin: 'sdd', component: 'Pane', requestId: 'sdd-board',
  viewport: { columns: 140, rows: 40 },
  props: { title: 'SDD', isFocused: true, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type Run = (argv: string[], cwd?: string) => { exitCode: number; stdout: string } | undefined

// `files` is the session's checkout (/work); `main` another checkout at /main. `run` answers host
// commands; `git branch --show-current` answers `branch`, anything else unanswered exits 1.
function stubProject($: any, on: any, withSpecs: boolean | (() => boolean), opts: { branch?: string; files?: Record<string, string>; main?: Record<string, string>; failing?: () => boolean; run?: Run } = {}) {
  const all = { ...files, ...(opts.files ?? {}) }
  const main = opts.main ?? {}
  const pick = (path: string) => (path.startsWith('/main/') ? main : all)
  const has = () => (typeof withSpecs === 'function' ? withSpecs() : withSpecs)
  const clock = mock.clock(on)
  const filled: string[] = []
  const ran: any[] = []
  let refuse = false
  on('session.start', () => ({ cwd: '/work' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  const commands: string[] = []
  on('command.register', (_: any, e: any) => { commands.push(e.name); return { value: undefined } })
  on('ui.toast', () => ({ value: undefined }))
  const opened: string[] = []
  on('ui.open', (_: any, e: any) => { opened.push(e.id); return { value: { isPlaced: true } } })
  const rel = (p: string) => p.replace(/^.*?\/specs/, 'specs')
  on('fs.exists', (_: any, e: any) => {
    if (opts.failing?.()) throw new Error('read refused while a skill runs')
    return { value: has() && (rel(e.path) === 'specs' || rel(e.path) in pick(e.path)) }
  })
  on('fs.list', () => ({ value: [{ name: 'user-login', kind: 'directory', size: 0, isLink: false }] }))
  on('fs.read', (_: any, e: any) => ({ value: pick(e.path)[rel(e.path)] ?? '' }))
  on('fs.stat', () => ({ value: { mtimeMs: 1000 } }))
  const commands_run: string[] = []
  on('process.run', (_: any, e: any) => {
    const argv = [...e.argv]
    commands_run.push(argv.join(' '))
    const answer = opts.run?.(argv, e.init?.cwd)
    if (answer) return { value: { ...answer, stderr: '' } }
    if (argv.join(' ') === 'git branch --show-current') return { value: { exitCode: 0, stdout: (opts.branch ?? 'feat/user-login') + '\n', stderr: '' } }
    return { value: { exitCode: 1, stdout: '', stderr: 'not stubbed' } }
  })
  on('prompt.fill', (_: any, e: any) => { filled.push(e.text); return { isFilled: true } })
  on('command.run', (_: any, e: any) => {
    if (e.command === 'sdd-dashboard') return {}
    ran.push(e.command + ' ' + e.args)
    if (refuse) throw new Error('the session was stopped and nobody has sent input since')
    return {}
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  return Object.assign(filled, { clock, ran, opened, commands, processes: commands_run, files: all as Record<string, string>, refuseSubmit: () => { refuse = true } })
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

test('a failed scan keeps the last good panel instead of the setup card', async ($, on) => {
  let failing = false
  const filled = stubProject($, on, true, { failing: () => failing })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  failing = true
  await filled.clock.advance(4000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'SDD is not set up in this project' })).toBeUndefined()
  expect(await ui.find({ key: 'tab-current' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'User Login' })).toBeDefined()
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

test('a finished feature shows the done card and keeps its task list', async ($, on) => {
  stubProject($, on, true, { files: DONE })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Feature done · review ready' })).toBeDefined()
  expect(await ui.find({ key: 'fill-next' })).toBeUndefined()
  expect(await ui.find({ key: 'task-T1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Tasks/ })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /Finish the open checks first/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^model: (Opus|Sonnet)$/ })).toBeDefined()
    await ui.unmount()
  }
  void filled
})

test('a task whose dependencies are open shows what it waits on', async ($, on) => {
  stubProject($, on, true, { files: { 'specs/user-login/tasks.md': DEPS } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(JSON.stringify(await ui.drawn({ in: 'task-T3' }))).toContain('"waits on T2"')
  await ui.unmount()
})

test('mid-run, a later task still shows what it waits on', async ($, on) => {
  // T1 implemented (review), T2 running (in-progress), T3 not started (draft)
  const midRun = DEPS.replace('status: draft\ndepends_on: [T1]', 'status: in-progress\ndepends_on: [T1]')
  expect(parseTasks(midRun).map((t) => t.status)).toEqual(['review', 'in-progress', 'draft'])
  stubProject($, on, true, { files: { 'specs/user-login/tasks.md': midRun } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(JSON.stringify(await ui.drawn({ in: 'task-T3' }))).toContain('"waits on T2"')
  await ui.unmount()
})

const CAPS = `format: 3

projects:
  - name: api
    kind: backend
    path: apps/api
    stack: Python

implementation:
  default: in-session
  projects:
    api: agent:python-developer
  isolation: none

actions:
  branch: null
  commit: null
  pr: null

review:
  tests: run
  publish: ask
  default: auto
  checks: []
`

// The same configuration in the format-2 Markdown file.
const LEGACY_CAPS = `# Project Capabilities

## Projects

<!-- auto-generated -->
- **api** — backend · apps/api · Python

## Implementation

<!-- user-override -->
default: in-session
api: agent:python-developer
`

const CONSTITUTION = `# Constitution

## 2. Run/build commands

| Project | Path | test | coverage | typecheck | lint | dev |
|---------|------|------|----------|-----------|------|-----|
| api | \`apps/api\` | \`uv run pytest\` | | | | |
`

test('the tab bar has a Config button that opens the configuration pane', async ($, on) => {
  const stub = stubProject($, on, true, { files: { 'specs/capabilities.yml': CAPS, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'open-config' })
  expect(stub.opened).toContain('sdd-board-config')
  await ui.unmount()
})

test('the configuration pane shows set values, defaults and commands', async ($, on) => {
  const filled = stubProject($, on, true, { files: { 'specs/capabilities.yml': CAPS, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'sdd-board-config', surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'python-developer' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'agent' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'uv run pytest' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'customised' })).toBeDefined()
  await ui.press({ key: 'cmd-toggle-api' })
  expect(await ui.find({ type: 'Text', text: 'uv run pytest' })).toBeUndefined()
  await ui.press({ key: 'cmd-toggle-api' })
  expect(await ui.find({ type: 'Text', text: 'uv run pytest' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Everything is at its default' })).toBeUndefined()
  await ui.press({ key: 'cfg-run' })
  await filled.clock.settle()
  expect(filled.ran).toEqual(['sdd:capabilities '])
  await ui.unmount()
})

test('the configuration pane flags a project that is all defaults', async ($, on) => {
  const bare = CAPS.replace('    api: agent:python-developer\n', '')
  stubProject($, on, true, { files: { 'specs/capabilities.yml': bare, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'sdd-board-config', surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Everything is at its default' })).toBeDefined()
  await ui.unmount()
})

test('the configuration pane reads a legacy capabilities.md and offers the migration', async ($, on) => {
  const stub = stubProject($, on, true, { files: { 'specs/capabilities.md': LEGACY_CAPS, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'sdd-board-config', surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'python-developer' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Old Markdown format' })).toBeDefined()
  await ui.press({ key: 'cfg-migrate' })
  await stub.clock.settle()
  expect(stub.ran).toEqual(['sdd:doctor init'])
  await ui.unmount()
})

const WORKTREE_CAPS = CAPS.replace('  isolation: none', '  isolation:\n    worktree:\n      merge: pr\n      parallel: 5')

test('merge and parallel hang under isolation: worktree behind a connector', async ($, on) => {
  stubProject($, on, true, { files: { 'specs/capabilities.yml': WORKTREE_CAPS, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'sdd-board-config', surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '├' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '└' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'parallel' })).toBeDefined()
  await ui.unmount()
})

test('without isolation: worktree there is nothing to nest', async ($, on) => {
  stubProject($, on, true, { files: { 'specs/capabilities.yml': CAPS, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'sdd-board-config', surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '├' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '└' })).toBeUndefined()
  await ui.unmount()
})

test('on Desktop the nested options get connectors and no separator between them', async ($, on) => {
  stubProject($, on, true, { files: { 'specs/capabilities.yml': WORKTREE_CAPS, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'sdd-board-config', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'parallel' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '├' })).toBeUndefined()
  await ui.unmount()
})

test('on Desktop the configuration pane draws tiles and row separators', async ($, on) => {
  stubProject($, on, true, { files: { 'specs/capabilities.yml': CAPS, 'specs/constitution.md': CONSTITUTION } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, requestId: 'sdd-board-config', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'customised' })).toBeDefined()
  expect(await ui.find({ type: 'Svg', alt: 'separator' })).toBeDefined()
  await ui.unmount()
})

test('parseEpicId and the branch and pr of a task', () => {
  const text = '# Tasks: X\n\n**Spec:** `a`  **Plan:** `b`\n**Epic:** LOG-7f3a\n\n## Epic: X\n\n### T1: A\nstatus: in-progress\nbranch: feat/x--LOG-7f3a-T1\npr: #12\n'
  expect(parseEpicId(text)).toBe('LOG-7f3a')
  expect(parseEpicId('# Tasks\n## Epic: x\n')).toBe('')
  const [t] = parseTasks(text)
  expect(t.branch).toBe('feat/x--LOG-7f3a-T1')
  expect(t.pr).toBe('#12')
})

test('tasks waiting for a merge turn the next step into a plain implement run while blocked tasks wait on them', () => {
  const blocked = parseTasks('### T1: A\nstatus: in-progress\npr: #12\n### T2: B\nstatus: draft\ndepends_on: [T1]\n')
  const d = derive(feature({ planStatus: 'tasks-ready', tasks: blocked }))
  expect(d.next?.command).toBe('/sdd:implement')
  expect(d.next?.why).toContain('#12')
  expect(d.phase).toBe('implement')
  const g = gate(feature({ planStatus: 'tasks-ready', tasks: blocked }))!
  expect(g.checks.find((c) => c.key === 'merge')?.hint).toBe('T1 #12')
  const more = parseTasks('### T1: A\nstatus: in-progress\npr: #12\n### T2: B\nstatus: draft\n')
  expect(derive(feature({ planStatus: 'tasks-ready', tasks: more })).next?.command).toBe('/sdd:implement T2')
})

test('when only task pull requests are left, the next step after the merge is the review', () => {
  const waiting = parseTasks('### T1: A\nstatus: review\n### T2: B\nstatus: in-progress\npr: #13\n')
  const d = derive(feature({ planStatus: 'tasks-ready', tasks: waiting }))
  expect(d.next?.command).toBe('/sdd:review')
  expect(d.next?.why).toContain('#13')
  expect(d.phase).toBe('implement')
  const g = gate(feature({ planStatus: 'tasks-ready', tasks: waiting }))!
  expect(g.checks.find((c) => c.key === 'merge')?.hint).toBe('T2 #13')
})

test('the panel opens at session start when the project has specs, not without', async ($, on) => {
  const stub = stubProject($, on, true)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(stub.opened).toEqual(['sdd-board'])
})

test('without specs nothing opens at session start', async ($, on) => {
  const stub = stubProject($, on, false)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(stub.opened).toEqual([])
})

test('one session start registers both the doctor tool and /sdd-dashboard', async ($, on) => {
  const stub = stubProject($, on, true)
  const tools: string[] = []
  on('tool.register', (_: any, e: any) => { tools.push(e.name); return { value: undefined } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(tools).toEqual(['doctor_check'])
  expect(stub.commands).toEqual(['sdd-dashboard'])
})

test('taskBranchBase, worktreeOf, prNumber and prStates read git and gh output', () => {
  expect(taskBranchBase('feat/x--LOG-7f3a-T1')).toBe('feat/x')
  expect(taskBranchBase('feat/user-login--ULOG-T12')).toBe('feat/user-login')
  expect(taskBranchBase('feat/user-login')).toBe(null)
  const porcelain = 'worktree /main\nHEAD abc\nbranch refs/heads/feat/x\n\nworktree /main/.claude/worktrees/t1\nHEAD def\nbranch refs/heads/feat/x--LOG-T1\n'
  expect(worktreeOf(porcelain, 'feat/x')).toBe('/main')
  expect(worktreeOf(porcelain, 'feat/x--LOG-T1')).toBe('/main/.claude/worktrees/t1')
  expect(worktreeOf(porcelain, 'main')).toBe(null)
  expect(prNumber('#12')).toBe(12)
  expect(prNumber('12')).toBe(12)
  expect(prNumber('https://github.com/o/r/pull/34')).toBe(34)
  expect(prNumber('soon')).toBe(null)
  const states = prStates('[{"number":12,"state":"MERGED"},{"number":13,"state":"OPEN"},{"number":14,"state":"CLOSED"}]')
  expect([...states.entries()]).toEqual([[12, 'MERGED'], [13, 'OPEN'], [14, 'CLOSED']])
  expect(() => prStates('{}')).toThrow()
})

test('mergeState follows the Reconcile rules', () => {
  const [byPr, byBranch, recorded, plain] = parseTasks(
    '### T1: A\nstatus: in-progress\npr: #12\n### T2: B\nstatus: in-progress\nbranch: feat/x--L-T2\n### T3: C\nstatus: review\npr: #13\n### T4: D\nstatus: draft\n',
  )
  const states = prStates('[{"number":12,"state":"MERGED"},{"number":13,"state":"MERGED"}]')
  expect(mergeState(byPr, states, null)).toBe('merged')
  expect(mergeState(byPr, prStates('[{"number":12,"state":"CLOSED"}]'), null)).toBe('closed')
  expect(mergeState(byPr, prStates('[{"number":12,"state":"OPEN"}]'), null)).toBe('open')
  expect(mergeState(byPr, null, null)).toBe(null)
  expect(mergeState(byBranch, null, true)).toBe('merged')
  expect(mergeState(byBranch, null, false)).toBe(null)
  expect(mergeState(recorded, states, null)).toBe(null)
  expect(mergeState(plain, states, true)).toBe(null)
})

test('a merged task counts as implemented before Reconcile records it', () => {
  const tasks = parseTasks('### T1: A\nstatus: in-progress\npr: #12\n### T2: B\nstatus: draft\ndepends_on: [T1]\n')
  const merged = feature({ planStatus: 'tasks-ready', tasks, merges: { T1: 'merged' } })
  expect(blockedBy(tasks[1], tasks, merged.merges)).toEqual([])
  expect(derive(merged).next?.command).toBe('/sdd:implement T2')
  expect(derive(merged).next?.why).toContain('Merged, not recorded yet: T1')
  const last = parseTasks('### T1: A\nstatus: review\n### T2: B\nstatus: in-progress\npr: #13\n')
  const d = derive(feature({ planStatus: 'tasks-ready', tasks: last, merges: { T2: 'merged' } }))
  expect(d.phase).toBe('review')
  expect(d.next?.command).toBe('/sdd:review')
  expect(d.next?.why).toContain('T2')
  const closed = derive(feature({ planStatus: 'tasks-ready', tasks, merges: { T1: 'closed' } }))
  expect(closed.next?.command).toBe('/sdd:implement')
  expect(closed.next?.why).toContain('Closed without merging: T1 #12')
})

test('a task branch belongs to its spec: current feature and no branch warning', () => {
  const f = feature({ slug: 'user-login', planStatus: 'tasks-ready', tasks: parseTasks(TASKS) })
  expect(currentSlug([f], 'feat/user-login--ULOG-T3', null)).toBe('user-login')
  expect(warnings(f, 'feat/user-login--ULOG-T3')).toEqual([])
  expect(warnings(f, 'feat/other')).toHaveLength(1)
})

test('freshness says when the data was read', () => {
  expect(freshness(null, null, 5000)).toBe('')
  expect(freshness(1000, null, 30_000)).toBe('Updated just now')
  expect(freshness(0, 0, 180_000)).toBe('Updated 3 min ago · PRs checked 3 min ago')
})

const WORKTREES = 'worktree /work\nHEAD a\nbranch refs/heads/feat/user-login--ULOG-T2\n\nworktree /main\nHEAD b\nbranch refs/heads/feat/user-login\n'

test('in a task worktree the board reads the statuses from the spec branch checkout', async ($, on) => {
  // This checkout still has T2 in-progress; the orchestrator's checkout has moved it to review.
  const filled = stubProject($, on, true, {
    branch: 'feat/user-login--ULOG-T2',
    main: { 'specs/user-login/spec.md': SPEC, 'specs/user-login/tasks.md': TASKS.replace('status: in-progress', 'status: review') },
    run: (argv) => (argv.join(' ') === 'git worktree list --porcelain' ? { exitCode: 0, stdout: WORKTREES } : undefined),
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // A task session opens on its ticket, with the statuses of the orchestrator's checkout.
  expect(await ui.find({ type: 'Text', text: 'Task session · ULOG-T2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Login form' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Statuses read from the feat\/user-login checkout/ })).toBeDefined()
  expect(await ui.find({ key: 'new-spec' })).toBeUndefined()
  await ui.press({ key: 'tab-current' })
  expect(await ui.find({ type: 'Text', text: 'User Login' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^You are on \S+ the spec belongs/ })).toBeUndefined()
  await ui.press({ key: 'fill-next' })
  await ui.unmount()
  expect(filled).toEqual(['/sdd:implement T3'])
})

const PR_TASKS = TASKS.replace('status: in-progress\n', 'status: in-progress\npr: #12\n')

test('a PR merged on GitHub shows as merged, asking GitHub at most once a minute', async ($, on) => {
  const stub = stubProject($, on, true, {
    files: { 'specs/user-login/tasks.md': PR_TASKS },
    run: (argv) => (argv[0] === 'gh' ? { exitCode: 0, stdout: '[{"number":12,"state":"MERGED"}]' } : undefined),
  })
  const asked = () => stub.processes.filter((c) => c.startsWith('gh pr list --base feat/user-login')).length
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'PR #12' })).toBeDefined()
  await ui.unmount()
  expect(asked()).toBe(0) // GitHub is asked only once the panel is drawn
  await stub.clock.advance(4000)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'PR #12 merged' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Merged, not recorded yet: T2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /PRs checked just now/ })).toBeDefined()
  await ui.unmount()
  expect(asked()).toBe(1)
  await stub.clock.advance(40_000)
  expect(asked()).toBe(1)
  await stub.clock.advance(24_000)
  expect(asked()).toBe(2)
})

test('taskPrs joins every task PR, recorded ones too, with its state and link', () => {
  const tasks = parseTasks('### T1: A\nstatus: done\npr: #12\n### T2: B\nstatus: in-progress\npr: https://github.com/o/r/pull/13\n### T3: C\nstatus: draft\n')
  const list = prList('[{"number":12,"state":"MERGED","url":"https://github.com/o/r/pull/12"}]')
  expect(taskPrs(tasks, list)).toEqual({
    T1: { number: 12, state: 'MERGED', url: 'https://github.com/o/r/pull/12' },
    T2: { number: 13, state: null, url: 'https://github.com/o/r/pull/13' },
  })
  expect(taskPrs(tasks, null).T1).toEqual({ number: 12, state: null, url: null })
})

test('an expanded task links its PR and says it merged, also once the task is done', async ($, on) => {
  const stub = stubProject($, on, true, {
    files: { 'specs/user-login/tasks.md': TASKS.replace('status: done\n', 'status: done\npr: #11\n') },
    run: (argv) => (argv[0] === 'gh' ? { exitCode: 0, stdout: '[{"number":11,"state":"MERGED","url":"https://github.com/o/r/pull/11"}]' } : undefined),
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.unmount()
  await stub.clock.advance(4000)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.pointer({ type: 'up', x: 3, y: 0, button: 'left', in: 'task-T1' })
  expect(await ui.find({ key: 'pr-T1' })).toBeDefined()
  expect(await ui.find({ type: 'Link', href: 'https://github.com/o/r/pull/11' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'merged' })).toBeDefined()
  await ui.unmount()
})

test('gh failing leaves the PR state unknown and backs off', async ($, on) => {
  const stub = stubProject($, on, true, {
    files: { 'specs/user-login/tasks.md': PR_TASKS },
    run: (argv) => (argv[0] === 'gh' ? { exitCode: 4, stdout: '' } : undefined),
  })
  const asked = () => stub.processes.filter((c) => c.startsWith('gh ')).length
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.unmount()
  await stub.clock.advance(4000)
  expect(asked()).toBe(1)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'PR #12' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /PRs checked/ })).toBeUndefined()
  await ui.unmount()
  await stub.clock.advance(120_000)
  expect(asked()).toBe(1)
  await stub.clock.advance(600_000)
  expect(asked()).toBe(2)
})

test('a task branch fast-forwarded into the spec branch (merge: auto) shows as merged', async ($, on) => {
  const stub = stubProject($, on, true, {
    files: { 'specs/user-login/tasks.md': TASKS.replace('status: in-progress\n', 'status: in-progress\nbranch: feat/user-login--ULOG-T2\n') },
    run: (argv) => (argv.join(' ') === 'git merge-base --is-ancestor feat/user-login--ULOG-T2 feat/user-login' ? { exitCode: 0, stdout: '' } : undefined),
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'merged' })).toBeDefined()
  await ui.press({ key: 'fill-next' })
  await ui.unmount()
  expect(stub).toEqual(['/sdd:implement T3'])
})

test('a sub-agent writing under specs/ refreshes the board', async ($, on) => {
  const stub = stubProject($, on, true)
  on('tool.call', () => ({ result: 'written' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  stub.files['specs/user-login/tasks.md'] = TASKS.replace('status: in-progress', 'status: review')
  await $.tool.call({ tool: 'Write', file_path: '/work/specs/user-login/tasks.md', content: '', agentId: 'agent-1' } as any)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'fill-next' })
  await ui.unmount()
  expect(stub).toEqual(['/sdd:implement T3'])
})

test('the Updated line ages while scans fail, and the poll redraws it', async ($, on) => {
  let failing = false
  const stub = stubProject($, on, true, { failing: () => failing })
  let redraws = 0
  on('ui.invalidate', () => { redraws += 1; return { value: undefined } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Updated just now' })).toBeDefined()
  await ui.unmount()
  failing = true
  const before = redraws
  await stub.clock.advance(120_000)
  expect(redraws).toBeGreaterThan(before)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Updated 2 min ago' })).toBeDefined()
  await ui.unmount()
})

test('parseTasks reads scope bullets and files', () => {
  const [t] = parseTasks('### T1: A\nproject: web\nscope:\n- form\n- errors\nfiles: src/a.ts, src/b.ts\nnotes: x\n- not scope\n')
  expect(t.scope).toEqual(['form', 'errors'])
  expect(t.files).toBe('src/a.ts, src/b.ts')
  expect(t.project).toBe('web')
})

test('the session kind follows the branch: main SDD session, task session or neither', () => {
  const f = feature({ slug: 'user-login', planStatus: 'tasks-ready', tasks: parseTasks(TASKS), epic: 'ULOG' })
  expect(taskOfBranch('feat/user-login--ULOG-T2')).toBe('ULOG-T2')
  expect(taskOfBranch('feat/user-login')).toBeNull()
  expect(sessionOf(f, 'feat/user-login')).toEqual({ kind: 'main' })
  expect(sessionOf(f, 'feat/user-login--ULOG-T2')).toEqual({ kind: 'task', taskId: 'T2', label: 'ULOG-T2' })
  expect(sessionOf(f, 'feat/user-login--ULOG-T9')).toEqual({ kind: 'none' })
  expect(sessionOf(f, 'main')).toEqual({ kind: 'none' })
  expect(sessionOf(null, 'feat/user-login')).toEqual({ kind: 'none' })
})

test('taskLook shows merged, closed and blocked tasks apart from their status', () => {
  const tasks = parseTasks('### T1: A\nstatus: in-progress\npr: #12\n### T2: B\nstatus: draft\ndepends_on: [T1]\n### T3: C\nstatus: draft\n')
  expect(tasks.map((t) => taskLook(t, tasks))).toEqual(['in-progress', 'blocked', 'draft'])
  expect(taskLook(tasks[0], tasks, { T1: 'merged' })).toBe('merged')
  expect(taskLook(tasks[1], tasks, { T1: 'merged' })).toBe('draft')
  expect(taskLook(tasks[0], tasks, { T1: 'closed' })).toBe('closed')
  expect([clock(12_000), clock(250_000), clock(3_900_000)]).toEqual(['12s', '4m', '1h 5m'])
})

test('the live state follows the turn, its tool calls and its subagents', () => {
  let live = onTurnStart(onCommand(emptyLive(), '/sdd:implement'), 't1', 1000)
  expect(isActive(live)).toBe(true)
  live = onTool(live, 'Bash', toolDetail({ command: 'gh pr list\n--json state' }), undefined, 2000)
  expect(live.tool).toEqual({ tool: 'Bash', detail: 'gh pr list', at: 2000 })
  live = onSpawn(live, 'a1', 'Explore', 'Find the limits', 3000)
  live = onTool(live, 'Read', toolDetail({ file_path: '/repo/apps/api/limits.py' }), 'a1', 4000)
  expect(live.tool?.tool).toBe('Bash')
  expect(live.agents[0].steps).toEqual([{ tool: 'Read', detail: 'apps/api/limits.py', at: 4000 }])
  expect(onTool(live, 'Read', 'x', 'unknown', 5000)).toBe(live)
  live = onReport(live, 'a1', 'completed', 6000)
  expect(live.agents[0]).toMatchObject({ status: 'completed', endedAt: 6000 })
  live = onSpawn(live, 'a2', 'general-purpose', 'Check CI', 7000)
  live = onSpawn(live, 'a3', 'Explore', 'Runs on', 7000, true)
  live = onTurnComplete(live, 8000)
  expect(live.turn).toBeNull()
  expect(live.command).toBeNull()
  expect(live.agents.find((a) => a.id === 'a2')?.status).toBe('stopped')
  // A background agent outlives the main turn until its own turn.complete.
  expect(live.agents.find((a) => a.id === 'a3')?.status).toBe('working')
  expect(isActive(live)).toBe(true)
  live = onReport(live, 'a3', 'completed', 9000)
  expect(isActive(live)).toBe(false)
  expect(onTurnComplete(live, 8000 + 16 * 60_000).agents).toEqual([])
})

test('lanes list running task branches, waiting task PRs and subagents', () => {
  const tasks = parseTasks('### T1: A\nstatus: in-progress\nbranch: feat/x--ULOG-T1\n### T2: B\nstatus: in-progress\nbranch: feat/x--ULOG-T2\npr: #52\n### T3: C\nstatus: review\n')
  const live = onSpawn(emptyLive(), 'a1', 'sdd:spec-verifier', 'Verify', 1000)
  const lanes = lanesOf(live, tasks, 'ULOG', undefined, { T1: { at: 500, subject: 'feat: form' } }, null)
  expect(lanes.map((l) => [l.label, l.kind, l.state])).toEqual([['ULOG-T1', 'task', 'working'], ['ULOG-T2', 'pr', 'waiting'], ['spec-verifier', 'agent', 'working']])
  expect(lanes[0].steps).toEqual([{ tool: 'commit', detail: 'feat: form', at: 500 }])
  expect(lanesOf(live, tasks, 'ULOG', { T2: 'merged' }, {}, 'T1').map((l) => [l.label, l.state])).toEqual([['ULOG-T2', 'done'], ['spec-verifier', 'working']])
})

test('the main SDD session is named and shows the idle live strip', async ($, on) => {
  stubProject($, on, true)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Main SDD session' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Idle · / })).toBeDefined()
    expect(await ui.find({ key: 'new-spec' })).toBeUndefined()
    expect(await ui.find({ key: 'tab-ticket' })).toBeUndefined()
    await ui.unmount()
  }
  // Expanded rows and the task filter are the session's, kept across redraws.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // A press anywhere on a Desktop task row opens it, and one task is open at a time.
  await ui.pointer({ type: 'up', x: 20, y: 0, button: 'left', in: 'task-T1' })
  expect(await ui.find({ key: 'fact-T1-acceptance' })).toBeDefined()
  await ui.pointer({ type: 'up', x: 20, y: 0, button: 'left', in: 'task-T2' })
  expect(await ui.find({ key: 'fact-T2-acceptance' })).toBeDefined()
  expect(await ui.find({ key: 'fact-T1-acceptance' })).toBeUndefined()
  await ui.press({ key: 'tasks-open' })
  expect(await ui.find({ key: 'task-T1' })).toBeUndefined()
  await ui.unmount()
})

test('a task session ticket shows the acceptance criteria from the spec', async ($, on) => {
  stubProject($, on, true, { branch: 'feat/user-login--ULOG-T2', files: { 'specs/user-login/tasks.md': TASKS.replace('# Tasks: User Login', '# Tasks: User Login\n\n**Epic:** ULOG') } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'tab-ticket' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'shows error' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '• form with inline errors' })).toBeDefined()
  await ui.press({ key: 'open-spec' })
  expect(await ui.find({ key: 'phase-card' })).toBeDefined()
  await ui.unmount()
})

test('a task running in its own worktree is not handed over again: the next step is a plain implement run', () => {
  const tasks = parseTasks('### T1: A\nstatus: in-progress\nbranch: feat/x--ULOG-T1\n### T2: B\nstatus: draft\ndepends_on: [T1]\n### T3: C\nstatus: in-progress\nbranch: feat/x--ULOG-T3\npr: #52\n')
  const d = derive(feature({ planStatus: 'tasks-ready', tasks }))
  expect(d.next?.command).toBe('/sdd:implement')
  expect(d.next?.why).toContain('T1 runs in its own worktree and #52 waits for a merge')
  const free = parseTasks('### T1: A\nstatus: in-progress\nbranch: feat/x--ULOG-T1\n### T2: B\nstatus: draft\n')
  expect(derive(feature({ planStatus: 'tasks-ready', tasks: free })).next?.command).toBe('/sdd:implement T2')
})
