// Drawing code. Gets the resolved elements, never the mods API: actions arrive as callbacks.
import { ROLE_KEY, STATUS_ROLE, TEXT_COLOR, STEP_LABELS, ago, blockedBy, derive, gate, taskCounts, warnings } from './model.ts'
import type { Feature } from './model.ts'
import type { Config } from './core/check.ts'
import { checkSvg, dividerSvg, dotSvg, dotsSvg, pillSvg, pipsSvg, progressSvg, stepperSvg } from './svg.ts'
import type { Role } from './model.ts'

export type Actions = {
  tab: (t: 'current' | 'all') => void
  fill: (text: string) => void
  run: (command: string, args: string) => void
  pin: (slug: string) => void
  doc: (kind: string) => void
  filter: (v: string) => void
  config: () => void
}

export type Ctx = {
  surface: string
  cols: number
  tab: 'current' | 'all'
  features: Feature[]
  current: Feature | null
  branch: string
  running: string | null
  filter: string
  hasSpecs: boolean
  now: number
  actions: Actions
}

const GLYPH: Record<string, string> = { draft: '○', 'in-progress': '◐', review: '◑', done: '●' }
const rich = (surface: string) => surface === 'desktop' || surface === 'vscode'

// Svg sizes are CSS pixels, the pane reports columns. Estimate the content width from the columns and
// aim slightly past it: the drawings sit in a clipping box and keep a 26 px margin at both ends, so a
// small overshoot is invisible while a shortfall leaves a gap. Tune PX_PER_COLUMN if they come out
// visibly short of (or cut off at) the cards' edges.
const PX_PER_COLUMN = 8
const fullWidth = (ctx: { cols: number }) => Math.max(240, Math.min(900, Math.round((ctx.cols - 2) * PX_PER_COLUMN)))
function wide(el: any, child: any) {
  return el.Box({ overflow: 'hidden', flexDirection: 'column', children: [child] })
}

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

// Status badge: a small tinted pill on Desktop/VS Code, a plain colored label in the terminal.
function badge(el: any, ctx: Ctx, status: string) {
  if (!rich(ctx.surface)) return chip(el, status)
  const key = status in STATUS_ROLE ? status : 'draft'
  const b = pillSvg(status, STATUS_ROLE[key])
  return el.Svg({ alt: 'Status: ' + status, width: b.width, height: b.height, source: b.source })
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
    justifyContent: 'space-between',
    children: [
      Box({
        flexDirection: 'row',
        columnGap: 3,
        children: [
          mk('current', 'Current', '1'),
          mk('all', 'All (' + ctx.features.length + ')', '2'),
          Button({ key: 'new-spec', label: '+ New spec', plain: true, onPress: () => ctx.actions.fill('/sdd:spec feat ') }),
        ],
      }),
      Button({ key: 'open-config', label: '⚙ Config', hotkey: 'c', plain: true, onPress: () => ctx.actions.config() }),
    ],
  })
}

function stepper(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Svg } = el
  const d = derive(f)
  if (rich(ctx.surface)) {
    return wide(el, Svg({ alt: 'Pipeline: ' + d.steps.map((s) => s.label + ' ' + s.state).join(', '), width: fullWidth(ctx), height: 62, source: stepperSvg(d.steps, fullWidth(ctx)) }))
  }
  const line = d.steps.map((s) => (s.state === 'done' ? '●' : s.state === 'current' ? '◉' : '○') + ' ' + s.label).join(' ─ ')
  return Box({ flexDirection: 'column', children: [Text({ wrap: 'wrap', children: [line] })] })
}

// What has to be true before the next command: one row per check, open ones first called out in amber.
function checklist(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Svg } = el
  const g = gate(f)
  if (!g || g.checks.length === 0) return null
  const rows = g.checks.map((c) =>
    Box({
      key: 'check-' + c.key, flexDirection: 'row', columnGap: 1, alignItems: 'center',
      children: [
        rich(ctx.surface)
          ? Svg({ alt: c.ok ? 'done' : 'open', width: 16, height: 16, source: checkSvg(c.ok) })
          : Text({ color: c.ok ? 'success' : 'warning', children: [c.ok ? '✓' : '○'] }),
        Text({ wrap: 'truncate-end', color: c.ok ? undefined : 'warning', dimColor: c.ok, children: [c.label] }),
        c.hint ? Text({ dimColor: true, wrap: 'truncate-end', children: ['· ' + c.hint] }) : null,
      ].filter(Boolean),
    }),
  )
  return Box({
    flexDirection: 'column', rowGap: 1,
    children: [
      Text({ dimColor: true, children: ['BEFORE ' + g.command.split(' ')[0].toUpperCase() + ' · ' + (g.checks.length - g.open) + '/' + g.checks.length]}),
      ...rows,
    ],
  })
}

function nextCard(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button } = el
  const d = derive(f)
  if (!d.next) return null
  const g = gate(f)
  const open = g ? g.open : 0
  const cmd = d.next.command
  const blocked = open > 0
  return Box({
    marginTop: rich(ctx.surface) ? 1 : 0, borderStyle: 'round', borderColor: blocked ? 'warning' : 'success', padding: 'md', flexDirection: 'column', rowGap: 1,
    children: [
      Text({ dimColor: true, children: [(blocked ? 'NEXT STEP · waiting on ' + open + (open === 1 ? ' check' : ' checks') : 'NEXT STEP · ready') + ' · model: ' + d.next.model] }),
      Text({ mono: true, weight: 'semibold', color: blocked ? 'warning' : 'success', children: [cmd] }),
      Text({ dimColor: true, wrap: 'wrap', children: [blocked ? 'Finish the open checks above first, then run this. ' + d.next.why : d.next.why] }),
      Button({ key: 'fill-next', label: 'Put in prompt', hotkey: 'n', variant: 'primary', onPress: () => ctx.actions.fill(cmd) }),
    ],
  })
}

function progress(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Svg } = el
  const c = taskCounts(f.tasks)
  const rows: any[] = []
  if (c.total > 0) {
    const done = c.done + c.review
    rows.push(Text({ weight: 'semibold', children: ['Tasks ' + done + '/' + c.total + (c.done ? ' · ' + c.done + ' done' : '') + (f.epic ? ' · ' + f.epic : '')] }))
    rows.push(
      rich(ctx.surface)
        ? wide(el, Svg({ alt: done + ' of ' + c.total + ' tasks implemented', width: fullWidth(ctx), height: 8, source: progressSvg(c, fullWidth(ctx)) }))
        : Text({ color: 'success', children: [bar(done, c.total, ctx.cols - 12)] }),
    )
  }
  return Box({ flexDirection: 'column', rowGap: 1, children: rows })
}

function taskList(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text } = el
  if (!f.tasks || f.tasks.length === 0) return null
  return Box({
    flexDirection: 'column',
    children: f.tasks.map((t) => {
      const waits = blockedBy(t, f.tasks)
      return Box({
        key: 'task-' + t.id,
        flexDirection: 'row', columnGap: 1,
        children: [
          Text({ color: TEXT_COLOR[t.status] ?? 'inactive', children: [GLYPH[t.status] ?? '○'] }),
          Text({ mono: true, dimColor: true, children: [t.id] }),
          Text({ wrap: 'truncate-end', children: [t.title] }),
          Text({ dimColor: true, wrap: 'truncate-end', children: [t.project] }),
          ...(t.pr ? [Text({ color: 'permission', wrap: 'truncate-end', children: ['PR ' + t.pr] })] : t.branch ? [Text({ dimColor: true, wrap: 'truncate-end', children: [t.branch] })] : []),
          ...(waits.length ? [Text({ dimColor: true, wrap: 'truncate-end', children: ['waits on ' + waits.join(', ')] })] : []),
        ],
      })
    }),
  })
}

function docSwitch(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button } = el
  const kinds = ['spec', 'plan', 'tasks', 'review'].filter((k) => k === 'spec' || (k === 'plan' && f.planStatus !== null) || (k === 'tasks' && f.tasks) || (k === 'review' && f.review))
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
    borderStyle: 'round', borderColor: 'success', padding: 'md', flexDirection: 'column', rowGap: 1,
    children: [
      Text({ color: 'success', weight: 'semibold', children: ['✓ Feature done'] }),
      Text({ dimColor: true, wrap: 'wrap', children: ['Review passed. Open the pull request when you are ready, or start the next feature.'] }),
      Button({ key: 'fill-empty', label: 'Start a new spec', plain: true, onPress: () => ctx.actions.fill('/sdd:spec feat ') }),
    ],
  })
}

// What each phase shows below the header (everything else stays hidden until it matters):
//   clarify, plan, tasks -> next step, spec facts (acceptance criteria, open questions)
//   implement            -> next step, task progress, task list
//   review               -> next step, task progress, review verdict, task list
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
  if (ctx.running) kids.push(Text({ color: 'warning', children: ['⟳ ' + ctx.running + ' running…'] }))
  if (done) kids.push(doneCard(el, ctx))
  kids.push(stepper(el, ctx, f))
  const working = d.phase === 'implement' || d.phase === 'review'
  if (!done) {
    const cl = checklist(el, ctx, f)
    if (cl) kids.push(cl)
  }
  if (working) {
    kids.push(progress(el, ctx, f))
    const tl = taskList(el, ctx, f)
    if (tl) kids.push(tl)
  }
  if (!done) kids.push(nextCard(el, ctx, f))
  if (!done && f.review) kids.push(Text({ color: f.review === 'READY' ? 'success' : 'error', weight: 'semibold', children: ['Review: ' + f.review.toLowerCase()] }))
  for (const w of warn) kids.push(Text({ color: 'error', wrap: 'wrap', children: ['⚠ ' + w] }))
  kids.push(docSwitch(el, ctx, f))
  // Sections get room to breathe on Desktop/VS Code; the terminal keeps one line between them.
  return Box({ flexDirection: 'column', rowGap: rich(ctx.surface) ? 2 : 1, children: kids })
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
    const c = taskCounts(f.tasks)
    const isCurrent = ctx.current?.slug === f.slug
    return Box({
      borderStyle: 'round', borderColor: isCurrent ? 'permission' : undefined, paddingX: 1, flexDirection: 'column',
      children: [
        Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Text({ weight: 'semibold', wrap: 'truncate-end', children: [f.spec.title || f.slug] }), badge(el, ctx, d.phase === 'done' ? 'done' : f.spec.status || 'draft')] }),
        Text({ mono: true, dimColor: true, wrap: 'truncate-end', children: [f.slug] }),
        rich(ctx.surface)
          ? el.Svg({ alt: 'Phase: ' + d.phase, width: d.steps.length * 16, height: 12, source: dotsSvg(d.steps) })
          : Text({ children: [d.steps.map((s) => (s.state === 'done' ? '●' : s.state === 'current' ? '◉' : '○')).join(' ')] }),
        Text({ dimColor: true, children: [(d.phase === 'done' ? 'done' : 'phase: ' + (STEP_LABELS.find((s) => s[0] === d.phase)?.[1] ?? d.phase)) + (c.total ? ' · ' + (c.done + c.review) + '/' + c.total + ' tasks' : '') + (f.modified ? ' · ' + ago(f.modified, ctx.now) : '')] }),
        Button({ key: 'show-' + f.slug, label: isCurrent ? '● Showing' : 'Show', plain: true, dimColor: isCurrent, onPress: () => ctx.actions.pin(f.slug) }),
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


export type ConfigCtx = {
  surface: string
  cols: number
  config: Config | null
  open: string[]
  actions: { run: (command: string, args: string) => void; toggle: (project: string) => void }
}

const COMMAND_LABELS = ['test', 'coverage', 'typecheck', 'lint', 'dev']
const FLOW = /^(agent|skill|command):(.+)$/
// Colors follow Claude Code: a skill is tinted pro (purple) as Claude Code tints skills, an agent accent (blue).
// On Desktop/VS Code the pills are drawings in the CDS role colors; in the terminal the text uses the
// theme key that Claude Code maps to the same role ('merged' and 'permission' have no ANSI fixed value).
const FLOW_ROLE: Record<string, Role> = { agent: 'accent', skill: 'pro', command: 'warning' }
const KIND_ROLE: Record<string, Role> = { backend: 'accent', web: 'success', library: 'pro' }
// Surface Claude Code uses for its own message bubbles (--surface-1 on Desktop).
const TILE_BG = 'userMessageBackground'

// A tinted pill on Desktop/VS Code, a plain colored label in the terminal.
function pill(el: any, isRich: boolean, label: string, role: Role) {
  if (!isRich) return el.Text({ color: ROLE_KEY[role], weight: 'semibold', children: [label] })
  const b = pillSvg(label, role)
  return el.Svg({ alt: label, width: b.width, height: b.height, source: b.source })
}

// "agent:python:python-developer" → pill "agent" + dim "python:" + "python-developer". Anything else is plain text.
function valueNode(el: any, isRich: boolean, e: { key: string; value: string; source: string }) {
  const { Box, Text } = el
  const m = FLOW.exec(e.value)
  if (!m) return Box({ flexGrow: 1, flexDirection: 'row', children: [Text({ mono: true, size: 'footnote', wrap: 'truncate-end', dimColor: e.source === 'default', children: [e.value] })] })
  const parts = m[2].split(':')
  const name = parts.pop() as string
  return Box({
    flexGrow: 1, flexDirection: 'row', columnGap: 1, alignItems: 'center',
    children: [
      pill(el, isRich, m[1], FLOW_ROLE[m[1]]),
      Box({
        flexDirection: 'row',
        children: [
          parts.length ? Text({ mono: true, size: 'footnote', dimColor: true, children: [parts.join(':') + ':'] }) : null,
          Text({ mono: true, size: 'footnote', weight: 'medium', wrap: 'truncate-end', children: [name] }),
        ].filter(Boolean),
      }),
    ],
  })
}

const heading = (el: any, title: string, note: string) =>
  el.Box({
    flexDirection: 'row', justifyContent: 'space-between',
    children: [el.Text({ dimColor: true, weight: 'medium', size: 'caption', children: [title.toUpperCase()] }), el.Text({ dimColor: true, size: 'caption', children: [note] })],
  })

// Hairline across a card. The width overshoots the card on purpose: the clipping box cuts it at the edge.
function divider(el: any, ctx: { cols: number }, key: string) {
  const width = Math.min(1200, ctx.cols * 12)
  return wide(el, el.Svg({ key, alt: 'separator', width, height: 15, source: dividerSvg(width, 15) }))
}

// One card: a heading, then rows in a rounded box. On Desktop/VS Code a hairline with breathing room
// separates the rows (the terminal has no sub-line spacing, so rows stay tight there).
function section(el: any, ctx: { cols: number; rich: boolean }, title: string, note: string, rows: any[]) {
  const { Box } = el
  const body: any[] = []
  rows.forEach((row, i) => {
    if (i > 0 && ctx.rich) body.push(divider(el, ctx, 'div-' + title + '-' + i))
    body.push(row)
  })
  return Box({
    flexDirection: 'column', rowGap: 1,
    children: [heading(el, title, note), Box({ flexDirection: 'column', borderStyle: 'round', paddingX: 1, children: body })],
  })
}

// Read-only view of what the SDD commands will use: capabilities.md with defaults filled in, and the
// per-project commands from constitution section 2. Editing goes through /sdd:capabilities.
export function renderConfig(el: any, ctx: ConfigCtx) {
  const { Box, Text, Button, Svg } = el
  const { config } = ctx
  const isRich = rich(ctx.surface)
  const sctx = { cols: ctx.cols, rich: isRich }
  if (!config) {
    return Box({
      flexDirection: 'column', rowGap: 1, padding: 'sm',
      children: [
        Text({ weight: 'semibold', children: ['specs/capabilities.md not found'] }),
        Text({ dimColor: true, wrap: 'wrap', children: ['Run the setup to create it, then configure it.'] }),
        Button({ key: 'cfg-init', label: 'Init SDD in this project', variant: 'primary', onPress: () => ctx.actions.run('sdd:doctor', 'init') }),
      ],
    })
  }
  const kids: any[] = []

  kids.push(
    Box({
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: 2,
      children: [
        Box({ flexDirection: 'column', children: [Text({ weight: 'medium', size: 'heading', children: ['SDD configuration'] }), Text({ mono: true, dimColor: true, size: 'caption', children: ['specs/capabilities.md'] })] }),
        Box({
          flexDirection: 'row', columnGap: 1, alignItems: 'center',
          children: [
            Button({ key: 'cfg-run', label: 'Configure…', hotkey: 'c', variant: config.configured ? 'secondary' : 'primary', onPress: () => ctx.actions.run('sdd:capabilities', '') }),
            Button({ key: 'cfg-doctor', label: 'Run doctor check', plain: true, onPress: () => ctx.actions.run('sdd:doctor', 'check') }),
          ],
        }),
      ],
    }),
  )

  const rows = config.commands.filter((r) => r.project)
  const entries = config.sections.flatMap((s) => s.entries)
  const tiles: [string, number, number | null, string][] = [
    ['stat-projects', config.projects.length, null, 'projects'],
    ['stat-custom', entries.filter((e) => e.source === 'set').length, entries.length, 'customised'],
    ['stat-commands', rows.reduce((n, r) => n + COMMAND_LABELS.filter((c) => r.commands[c]).length, 0), rows.length * COMMAND_LABELS.length, 'commands set'],
  ]
  kids.push(
    Box({
      flexDirection: 'row', columnGap: 1,
      children: tiles.map(([key, n, of, label]) =>
        Box({
          key, flexDirection: 'column', flexGrow: 1, borderStyle: 'round', paddingX: 1,
          ...(isRich ? { borderColor: TILE_BG, backgroundColor: TILE_BG } : {}),
          children: [
            Box({
              flexDirection: 'row', alignItems: 'flex-end',
              children: [Text({ weight: 'medium', size: 'heading', tabular: true, children: [String(n)] }), of === null ? null : Text({ dimColor: true, size: 'footnote', tabular: true, children: [' / ' + of] })].filter(Boolean),
            }),
            Text({ dimColor: true, size: 'caption', children: [label] }),
          ],
        }),
      ),
    }),
  )

  if (!config.configured) {
    kids.push(
      Box({
        borderStyle: 'round', borderColor: 'warning', padding: 'md', flexDirection: 'column', rowGap: 1,
        children: [
          Text({ color: 'warning', weight: 'semibold', children: ['Everything is at its default'] }),
          Text({ dimColor: true, wrap: 'wrap', size: 'footnote', children: ['Tasks are implemented in the session, git actions use git and gh, review picks audits by stack. /sdd:capabilities scans your installed skills and agents and proposes better values.'] }),
        ],
      }),
    )
  }

  kids.push(
    section(
      el, sctx, 'Projects', String(config.projects.length),
      config.projects.length
        ? config.projects.map((p) =>
            Box({
              key: 'prj-' + p.name, flexDirection: 'column',
              children: [
                Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Text({ mono: true, weight: 'medium', wrap: 'truncate-end', children: [p.name] }), p.kind ? pill(el, isRich, p.kind, KIND_ROLE[p.kind] ?? 'accent') : null].filter(Boolean) }),
                Box({
                  flexDirection: 'row',
                  children: [
                    Text({ mono: true, dimColor: true, size: 'footnote', children: [p.path + (p.repo ? ' (repo)' : '')] }),
                    p.stack ? Text({ dimColor: true, size: 'footnote', wrap: 'truncate-end', children: ['\u00a0·\u00a0' + p.stack] }) : null,
                  ].filter(Boolean),
                }),
              ],
            }),
          )
        : [Text({ color: 'warning', children: ['No project listed: run /sdd:doctor init'] })],
    ),
  )

  for (const sec of config.sections) {
    const set = sec.entries.filter((e) => e.source === 'set').length
    const width = Math.min(18, Math.max(...sec.entries.map((e) => e.key.length)))
    kids.push(
      section(
        el, sctx, sec.title, set ? set + ' set' : 'all default',
        sec.entries.map((e) =>
          Box({
            key: sec.title + '-' + e.key, flexDirection: 'row', columnGap: 1, alignItems: 'center',
            children: [
              isRich
                ? Svg({ alt: e.source === 'set' ? 'set' : 'default', width: 8, height: 8, source: dotSvg(e.source === 'set') })
                : Text({ color: e.source === 'set' ? 'success' : undefined, dimColor: e.source !== 'set', children: [e.source === 'set' ? '●' : '○'] }),
              Box({ width: width + 1, children: [Text({ mono: true, size: 'footnote', dimColor: true, wrap: 'truncate-end', children: [e.key] })] }),
              valueNode(el, isRich, e),
              e.source === 'default' ? Text({ dimColor: true, size: 'caption', children: ['default'] }) : null,
            ].filter(Boolean),
          }),
        ),
      ),
    )
  }

  kids.push(
    section(
      el, sctx, 'Commands', 'constitution §2',
      rows.length
        ? rows.map((r) => {
            const isOpen = ctx.open.includes(r.project)
            const have = COMMAND_LABELS.filter((c) => r.commands[c]).length
            const present = COMMAND_LABELS.map((c) => Boolean(r.commands[c]))
            const pips = isRich
              ? (() => { const p = pipsSvg(present); return el.Svg({ alt: have + ' of ' + COMMAND_LABELS.length + ' commands set', width: p.width, height: p.height, source: p.source }) })()
              : Text({ color: r.commands.test ? 'success' : 'warning', children: [present.map((x) => (x ? '●' : '○')).join('')] })
            return Box({
              key: 'cmd-' + r.project, flexDirection: 'column',
              children: [
                Box({
                  flexDirection: 'row', columnGap: 1, alignItems: 'center',
                  children: [
                    Box({
                      flexGrow: 1, flexDirection: 'row',
                      children: [Button({ key: 'cmd-toggle-' + r.project, plain: true, onPress: () => ctx.actions.toggle(r.project), children: [Text({ dimColor: true, children: [isOpen ? '▾ ' : '▸ '] }), Text({ mono: true, weight: 'medium', children: [r.project] })] })],
                    }),
                    pips,
                    Text({ dimColor: true, size: 'caption', tabular: true, children: [have + '/' + COMMAND_LABELS.length] }),
                  ],
                }),
                ...(isOpen
                  ? [
                      ...(isRich ? [divider(el, sctx, 'div-cmd-' + r.project)] : []),
                      Box({
                        key: 'cmd-' + r.project + '-list', flexDirection: 'column', paddingLeft: 2,
                        children: COMMAND_LABELS.map((c) =>
                          Box({
                            key: 'cmd-' + r.project + '-' + c, flexDirection: 'row', columnGap: 1,
                            children: [
                              Text({ mono: true, size: 'footnote', dimColor: true, children: [c.padEnd(9)] }),
                              r.commands[c]
                                ? Text({ mono: true, size: 'footnote', wrap: 'truncate-end', children: [r.commands[c]] })
                                : Text({ size: 'footnote', dimColor: c !== 'test', color: c === 'test' ? 'warning' : undefined, children: [c === 'test' ? 'missing' : 'none'] }),
                            ],
                          }),
                        ),
                      }),
                    ]
                  : []),
              ],
            })
          })
        : [Text({ color: 'warning', children: ['No commands table: run /sdd:doctor init'] })],
    ),
  )

  kids.push(
    Box({
      flexDirection: 'row', justifyContent: 'space-between', columnGap: 2,
      children: [
        Text({ dimColor: true, size: 'caption', wrap: 'truncate-end', children: [config.generated + ' generated / out-of-band path pattern' + (config.generated === 1 ? '' : 's')] }),
        isRich
          ? Box({
              flexDirection: 'row', columnGap: 1, alignItems: 'center',
              children: [
                Svg({ alt: 'set', width: 8, height: 8, source: dotSvg(true) }), Text({ dimColor: true, size: 'caption', children: ['set'] }),
                Text({ children: [' '] }),
                Svg({ alt: 'default', width: 8, height: 8, source: dotSvg(false) }), Text({ dimColor: true, size: 'caption', children: ['default'] }),
              ],
            })
          : Text({ dimColor: true, children: ['● set  ○ default'] }),
      ],
    }),
  )
  return Box({ flexDirection: 'column', rowGap: 2, padding: 'sm', children: kids })
}
