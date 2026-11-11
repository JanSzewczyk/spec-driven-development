// Drawing code. Gets the resolved elements, never the mods API: actions arrive as callbacks.
import { PALETTE, TEXT_COLOR, STEP_LABELS, ago, derive, storyDone, taskCounts, warnings } from './model.ts'
import type { Feature } from './model.ts'
import { dotsSvg, progressSvg, stepperSvg } from './svg.ts'

export type Actions = {
  tab: (t: 'current' | 'all') => void
  fill: (text: string) => void
  run: (command: string, args: string) => void
  pin: (slug: string) => void
  toggle: (storyId: string) => void
  doc: (kind: string) => void
  filter: (v: string) => void
}

export type Ctx = {
  surface: string
  cols: number
  tab: 'current' | 'all'
  features: Feature[]
  current: Feature | null
  branch: string
  running: string | null
  expanded: Record<string, boolean>
  filter: string
  hasSpecs: boolean
  now: number
  actions: Actions
}

const GLYPH: Record<string, string> = { draft: '○', 'in-progress': '◐', review: '◑', done: '●' }
const rich = (surface: string) => surface === 'desktop' || surface === 'vscode'

function bar(done: number, total: number, width: number): string {
  const w = Math.max(8, Math.min(width, 24))
  const filled = total ? Math.round((done / total) * w) : 0
  return '█'.repeat(filled) + '░'.repeat(w - filled)
}

function chip(el: any, status: string, label?: string) {
  const { Text } = el
  const key = status in TEXT_COLOR ? status : 'draft'
  return Text({ color: TEXT_COLOR[key], weight: 'semibold', children: [' ' + (label ?? status) + ' '] })
}

// Status badge: a small bordered pill on Desktop/VS Code, a plain colored label in the terminal.
function badge(el: any, ctx: Ctx, status: string) {
  const { Box, Text } = el
  const key = status in TEXT_COLOR ? status : 'draft'
  if (!rich(ctx.surface)) return chip(el, status)
  return Box({
    borderStyle: 'round', borderColor: TEXT_COLOR[key], paddingX: 1,
    children: [Text({ color: TEXT_COLOR[key], weight: 'semibold', children: [status] })],
  })
}

function tabBar(el: any, ctx: Ctx) {
  const { Box, Button } = el
  const mk = (id: 'current' | 'all', label: string, hotkey: string) =>
    Button({
      key: 'tab-' + id,
      label,
      hotkey,
      plain: true,
      dimColor: ctx.tab !== id,
      onPress: () => ctx.actions.tab(id),
    })
  return Box({
    flexDirection: 'row',
    columnGap: 3,
    children: [mk('current', 'Current', '1'), mk('all', 'All (' + ctx.features.length + ')', '2')],
  })
}

function stepper(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Svg } = el
  const d = derive(f)
  if (rich(ctx.surface)) {
    return Svg({ alt: 'Pipeline: ' + d.steps.map((s) => s.label + ' ' + s.state).join(', '), width: 330, height: 62, source: stepperSvg(d.steps, 330) })
  }
  const line = d.steps.map((s) => (s.state === 'done' ? '●' : s.state === 'current' ? '◉' : '○') + ' ' + s.label).join(' ─ ')
  return Box({ flexDirection: 'column', children: [Text({ wrap: 'wrap', children: [line] })] })
}

function nextCard(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button } = el
  const d = derive(f)
  if (!d.next) {
    return Box({
      borderStyle: 'round', borderColor: 'green', padding: 'md', flexDirection: 'column', rowGap: 1,
      children: [
        Text({ color: 'green', weight: 'semibold', children: ['✓ Feature done'] }),
        Text({ dimColor: true, wrap: 'wrap', children: ['Review passed. Open the pull request when you are ready.'] }),
      ],
    })
  }
  const cmd = d.next.command
  return Box({
    borderStyle: 'round', borderColor: 'yellow', padding: 'md', flexDirection: 'column', rowGap: 1,
    children: [
      Text({ dimColor: true, children: ['NEXT STEP · model: ' + d.next.model] }),
      Text({ mono: true, weight: 'semibold', color: 'yellow', children: [cmd] }),
      Text({ dimColor: true, wrap: 'wrap', children: [d.next.why] }),
      Button({ key: 'fill-next', label: 'Put in prompt', hotkey: 'n', variant: 'primary', onPress: () => ctx.actions.fill(cmd) }),
    ],
  })
}

function specFacts(f: Feature): string {
  const s = f.spec
  return ['AC ' + s.acDone + '/' + s.acTotal, s.openQuestions ? s.openQuestions + ' open question(s)' : 'no open questions'].join(' · ')
}

function progress(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Svg } = el
  const c = taskCounts(f.stories)
  const rows: any[] = []
  if (c.total > 0) {
    const done = c.done + c.review
    rows.push(Text({ weight: 'semibold', children: ['Tasks ' + done + '/' + c.total + (c.done ? ' · ' + c.done + ' done' : '')] }))
    rows.push(
      rich(ctx.surface)
        ? Svg({ alt: done + ' of ' + c.total + ' tasks implemented', width: 330, height: 8, source: progressSvg(c, 330) })
        : Text({ color: 'green', children: [bar(done, c.total, ctx.cols - 12)] }),
    )
  }
  return Box({ flexDirection: 'column', rowGap: 1, children: rows })
}

function stories(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button } = el
  if (!f.stories || f.stories.length === 0) return null
  const firstOpen = f.stories.find((s) => !storyDone(s))
  return Box({
    flexDirection: 'column', rowGap: 1,
    children: f.stories.map((s) => {
      const done = storyDone(s)
      const open = ctx.expanded[s.id] ?? (firstOpen ? firstOpen.id === s.id : false)
      const n = s.tasks.filter((t) => t.status === 'review' || t.status === 'done').length
      const head = Button({
        key: 'story-' + s.id,
        plain: true,
        onPress: () => ctx.actions.toggle(s.id),
        children: [(open ? '▾ ' : '▸ ') + s.id + ' · ' + (s.name || 'Story') + '  ' + n + '/' + s.tasks.length + (done ? ' ✓' : '')],
      })
      const rows = open
        ? s.tasks.map((t) =>
            Box({
              flexDirection: 'row', columnGap: 1, paddingLeft: 2,
              children: [
                Text({ color: TEXT_COLOR[t.status] ?? 'gray', children: [GLYPH[t.status] ?? '○'] }),
                Text({ mono: true, dimColor: true, children: [t.id] }),
                Text({ wrap: 'truncate-end', children: [t.title || t.type] }),
                Text({ dimColor: true, wrap: 'truncate-end', children: [[t.agent, t.model].filter(Boolean).join(' · ')] }),
              ],
            }),
          )
        : []
      return Box({ flexDirection: 'column', children: [head, ...rows] })
    }),
  })
}

function docSwitch(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button } = el
  const kinds = ['spec', 'plan', 'tasks', 'review'].filter((k) => k === 'spec' || (k === 'plan' && f.planStatus !== null) || (k === 'tasks' && f.stories) || (k === 'review' && f.review))
  return Box({
    flexDirection: 'row', columnGap: 2,
    children: [
      Text({ dimColor: true, children: ['Open in a new tab:'] }),
      ...kinds.map((k) => Button({ key: 'doc-' + k, label: k, plain: true, onPress: () => ctx.actions.doc(k) })),
    ],
  })
}

function startCard(el: any, ctx: Ctx, title: string, body: string) {
  const { Box, Text, Button } = el
  return Box({
    borderStyle: 'round', padding: 'md', flexDirection: 'column', rowGap: 1,
    children: [
      Text({ weight: 'semibold', children: [title] }),
      Text({ dimColor: true, wrap: 'wrap', children: [body] }),
      Button({ key: 'fill-empty', label: 'Start a new spec', variant: 'primary', onPress: () => ctx.actions.fill('/sdd:spec feat ') }),
    ],
  })
}

function emptyState(el: any, ctx: Ctx) {
  const { Box, Text, Button } = el
  if (!ctx.hasSpecs) {
    return Box({
      borderStyle: 'round', padding: 'md', flexDirection: 'column', rowGap: 1,
      children: [
        Text({ weight: 'semibold', children: ['SDD is not set up in this project'] }),
        Text({ dimColor: true, wrap: 'wrap', children: ['We could not find an SDD configuration here (no specs/ folder). To use Spec-Driven Development in this project, click the button: it runs the setup in this session and creates specs/, the constitution and the project hooks.'] }),
        Button({ key: 'init-sdd', label: 'Init SDD in this project', variant: 'primary', onPress: () => ctx.actions.run('sdd:doctor', 'init') }),
      ],
    })
  }
  if (ctx.features.length === 0) return startCard(el, ctx, 'No features yet', 'Start with a spec: describe the feature in a few words and the flow takes it from there.')
  return startCard(el, ctx, 'Nothing in progress', 'All your features are finished. Want to build something new? Start a new spec for the next feature or piece of functionality.')
}

function doneCard(el: any, ctx: Ctx) {
  const { Box, Text, Button } = el
  return Box({
    borderStyle: 'round', borderColor: 'green', padding: 'md', flexDirection: 'column', rowGap: 1,
    children: [
      Text({ color: 'green', weight: 'semibold', children: ['✓ Feature done'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Review passed. Open the pull request when you are ready, or start the next feature.'] }),
      Button({ key: 'fill-empty', label: 'Start a new spec', plain: true, onPress: () => ctx.actions.fill('/sdd:spec feat ') }),
    ],
  })
}

// What each phase shows below the header (everything else stays hidden until it matters):
//   clarify, plan, tasks -> next step, spec facts (acceptance criteria, open questions)
//   implement            -> next step, task progress, stories (first open one expanded)
//   review               -> next step, task progress, review verdict, stories
//   done                 -> "Feature done" card above the stepper, nothing else
export function renderCurrent(el: any, ctx: Ctx) {
  const { Box, Text } = el
  const f = ctx.current
  if (!f) return emptyState(el, ctx)
  const d = derive(f)
  const done = d.phase === 'done'
  const warn = warnings(f, ctx.branch)
  const kids: any[] = [
    Box({
      flexDirection: 'column', rowGap: 1,
      children: [
        Text({ size: 'title', weight: 'semibold', wrap: 'wrap', children: [f.spec.title || f.slug] }),
        Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [badge(el, ctx, done ? 'done' : f.spec.status || 'draft'), Text({ mono: true, dimColor: true, wrap: 'truncate-end', children: [f.spec.branch || f.slug] })] }),
        Text({ dimColor: true, children: [[f.spec.type, f.spec.owner, ago(f.modified, ctx.now)].filter(Boolean).join(' · ')] }),
      ],
    }),
  ]
  if (ctx.running) kids.push(Text({ color: 'yellow', children: ['⟳ ' + ctx.running + ' running…'] }))
  if (done) kids.push(doneCard(el, ctx))
  kids.push(stepper(el, ctx, f))
  if (!done) kids.push(nextCard(el, ctx, f))
  if (d.phase === 'implement' || d.phase === 'review') kids.push(progress(el, ctx, f))
  else if (!done) kids.push(Text({ dimColor: true, children: [specFacts(f)] }))
  if (!done && f.review) kids.push(Text({ color: f.review === 'GO' ? 'green' : 'red', weight: 'semibold', children: ['Review: ' + f.review] }))
  for (const w of warn) kids.push(Text({ color: 'red', wrap: 'wrap', children: ['⚠ ' + w] }))
  if (d.phase === 'implement' || d.phase === 'review') {
    const st = stories(el, ctx, f)
    if (st) kids.push(st)
  }
  kids.push(docSwitch(el, ctx, f))
  return Box({ flexDirection: 'column', rowGap: 1, children: kids })
}

export function renderDoc(el: any, doc: { slug: string; kind: string; text: string | null }) {
  const { Box, Text, Markdown } = el
  return Box({
    flexDirection: 'column', rowGap: 1, padding: 'sm',
    children: [
      Text({ dimColor: true, mono: true, children: ['specs/' + doc.slug + '/' + doc.kind + '.md'] }),
      doc.text === null ? Text({ dimColor: true, children: ['This file does not exist (any more).'] }) : Markdown({ key: 'doc-body', text: doc.text }),
    ],
  })
}

export function renderAll(el: any, ctx: Ctx) {
  const { Box, Text, Button, Select } = el
  if (ctx.features.length === 0) return emptyState(el, ctx)
  const filtered = ctx.features.filter((f) => {
    const p = derive(f).phase
    return ctx.filter === 'all' || (ctx.filter === 'done' ? p === 'done' : p !== 'done')
  })
  const cards = filtered.map((f) => {
    const d = derive(f)
    const c = taskCounts(f.stories)
    const isCurrent = ctx.current?.slug === f.slug
    return Box({
      borderStyle: 'round', borderColor: isCurrent ? 'yellow' : undefined, paddingX: 1, flexDirection: 'column',
      children: [
        Box({ flexDirection: 'row', columnGap: 1, children: [Text({ weight: 'semibold', wrap: 'truncate-end', children: [f.spec.title || f.slug] }), chip(el, d.phase === 'done' ? 'done' : f.spec.status || 'draft')] }),
        Text({ mono: true, dimColor: true, wrap: 'truncate-end', children: [f.slug] }),
        rich(ctx.surface)
          ? el.Svg({ alt: 'Phase: ' + d.phase, width: d.steps.length * 16, height: 12, source: dotsSvg(d.steps) })
          : Text({ children: [d.steps.map((s) => (s.state === 'done' ? '●' : s.state === 'current' ? '◉' : '○')).join(' ')] }),
        Text({ dimColor: true, children: [(d.phase === 'done' ? 'done' : 'phase: ' + (STEP_LABELS.find((s) => s[0] === d.phase)?.[1] ?? d.phase)) + (c.total ? ' · ' + (c.done + c.review) + '/' + c.total + ' tasks' : '') + (f.modified ? ' · ' + ago(f.modified, ctx.now) : '')] }),
        Button({ key: 'show-' + f.slug, label: isCurrent ? 'Showing' : 'Show', plain: true, dimColor: isCurrent, onPress: () => ctx.actions.pin(f.slug) }),
      ],
    })
  })
  return Box({
    flexDirection: 'column', rowGap: 1,
    children: [
      Select({
        key: 'filter', label: 'Show', value: ctx.filter,
        options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'In progress' }, { value: 'done', label: 'Finished' }],
        onSelect: (v: string) => ctx.actions.filter(v),
      }),
      ...(cards.length ? cards : [Text({ dimColor: true, children: ['Nothing matches this filter.'] })]),
    ],
  })
}

export function renderPane(el: any, ctx: Ctx) {
  const { Box, Text } = el
  // No specs/ folder: the tabs have nothing to show, so only the setup card is drawn.
  if (!ctx.hasSpecs) return Box({ flexDirection: 'column', padding: 'sm', children: [emptyState(el, ctx)] })
  return Box({
    flexDirection: 'column', rowGap: 1, padding: 'sm',
    children: [tabBar(el, ctx), Text({ children: [' '] }), ctx.tab === 'current' ? renderCurrent(el, ctx) : renderAll(el, ctx)],
  })
}

export { PALETTE }
