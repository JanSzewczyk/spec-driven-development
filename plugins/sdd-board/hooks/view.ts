// Drawing code. Gets the resolved elements, never the mods API: actions arrive as callbacks.
import { PALETTE, TEXT_COLOR, STEP_LABELS, ago, derive, storyDone, taskCounts, warnings } from './model.ts'
import type { Feature } from './model.ts'
import { dotsSvg, progressSvg, stepperSvg } from './svg.ts'

export type Actions = {
  tab: (t: 'current' | 'all') => void
  fill: (text: string) => void
  pin: (slug: string) => void
  toggle: (storyId: string) => void
  doc: (kind: string | null) => void
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
  doc: { kind: string; text: string } | null
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
  const s = f.spec
  const facts = ['AC ' + s.acDone + '/' + s.acTotal, s.openQuestions ? s.openQuestions + ' open question(s)' : 'no open questions']
  rows.push(Text({ dimColor: true, children: [facts.join(' · ')] }))
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
      Text({ dimColor: true, children: ['Open:'] }),
      ...kinds.map((k) =>
        Button({ key: 'doc-' + k, label: k, plain: true, dimColor: ctx.doc?.kind !== k, onPress: () => ctx.actions.doc(ctx.doc?.kind === k ? null : k) }),
      ),
    ],
  })
}

function emptyState(el: any, ctx: Ctx) {
  const { Box, Text, Button } = el
  const missing = !ctx.hasSpecs
  const cmd = missing ? '/sdd:doctor init' : '/sdd:spec feat '
  return Box({
    borderStyle: 'round', padding: 'md', flexDirection: 'column', rowGap: 1,
    children: [
      Text({ weight: 'semibold', children: [missing ? 'This project has no SDD setup yet' : 'No features yet'] }),
      Text({ dimColor: true, wrap: 'wrap', children: [missing ? 'Run the doctor to create specs/, the constitution and the project hooks.' : 'Start with a spec: describe the feature in a few words.'] }),
      Button({ key: 'fill-empty', label: 'Put ' + cmd.trim() + ' in prompt', variant: 'primary', onPress: () => ctx.actions.fill(cmd) }),
    ],
  })
}

export function renderCurrent(el: any, ctx: Ctx) {
  const { Box, Text, Markdown } = el
  const f = ctx.current
  if (!f) return emptyState(el, ctx)
  const d = derive(f)
  const warn = warnings(f, ctx.branch)
  const kids: any[] = [
    Box({
      flexDirection: 'column',
      children: [
        Text({ size: 'title', weight: 'semibold', wrap: 'truncate-end', children: [f.spec.title || f.slug] }),
        Box({ flexDirection: 'row', columnGap: 1, children: [chip(el, f.spec.status || 'draft'), Text({ mono: true, dimColor: true, wrap: 'truncate-end', children: [f.spec.branch || f.slug] })] }),
        Text({ dimColor: true, children: [[f.spec.type, f.spec.owner, ago(f.modified, ctx.now)].filter(Boolean).join(' · ')] }),
      ],
    }),
  ]
  if (ctx.running) kids.push(Text({ color: 'yellow', children: ['⟳ ' + ctx.running + ' running…'] }))
  kids.push(stepper(el, ctx, f))
  kids.push(nextCard(el, ctx, f))
  kids.push(progress(el, ctx, f))
  if (f.review) kids.push(Text({ color: f.review === 'GO' ? 'green' : 'red', weight: 'semibold', children: ['Review: ' + f.review] }))
  for (const w of warn) kids.push(Text({ color: 'red', wrap: 'wrap', children: ['⚠ ' + w] }))
  const st = stories(el, ctx, f)
  if (st) kids.push(st)
  kids.push(docSwitch(el, ctx, f))
  if (ctx.doc) kids.push(Markdown({ key: 'doc-body', text: ctx.doc.text.slice(0, 12000) }))
  void d
  return Box({ flexDirection: 'column', rowGap: 1, children: kids })
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
        Box({ flexDirection: 'row', columnGap: 1, children: [Text({ weight: 'semibold', wrap: 'truncate-end', children: [f.spec.title || f.slug] }), chip(el, f.spec.status || 'draft')] }),
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
  return Box({
    flexDirection: 'column', rowGap: 1, padding: 'sm',
    children: [tabBar(el, ctx), Text({ children: [' '] }), ctx.tab === 'current' ? renderCurrent(el, ctx) : renderAll(el, ctx)],
  })
}

export { PALETTE }
