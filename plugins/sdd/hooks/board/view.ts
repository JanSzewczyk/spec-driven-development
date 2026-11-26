// Drawing code. Gets the resolved elements, never the mods API: actions arrive as callbacks.
import { ROLE_KEY, STATUS_ROLE, STEP_LABELS, ago, blockedBy, clock, derive, gate, implemented, taskCounts, taskLook, taskWaves, warnings } from './model.ts'
import type { Feature, Session, TaskLook } from './model.ts'
import type { Config } from '../../core/config.ts'
import type { Task } from '../../core/parse.ts'
import { prNumber } from '../../core/merges.ts'
import type { PrState, TaskPr } from '../../core/merges.ts'
import { WINDOW_MS } from './live.ts'
import type { Lane, Live } from './live.ts'
import { branchSvg, capSvg, checkSvg, dividerSvg, dotSvg, FILL, liveDotSvg, MID_TRACK, miniPhaseSvg, pillSvg, pipsSvg, prIconSvg, STRIPES_WIDTH, stripesSvg, taskGlyphSvg, taskGraphSvg } from './svg.ts'
import type { Role } from './model.ts'

export type Tab = 'current' | 'all' | 'ticket'

export type Actions = {
  tab: (t: Tab) => void
  fill: (text: string) => void
  run: (command: string, args: string) => void
  pin: (slug: string) => void
  doc: (kind: string) => void
  filter: (v: string) => void
  config: () => void
  toggle?: (key: string) => void // expands or collapses a lane or a task row
  taskFilter?: (v: string) => void
}

export type Ctx = {
  surface: string
  cols: number
  tab: Tab
  features: Feature[]
  current: Feature | null
  branch: string
  running: string | null
  filter: string
  hasSpecs: boolean
  isLoading?: boolean // no scan has finished yet (a reload, a refused first read): neither the board nor the setup card
  now: number
  freshness?: string // "Updated just now · PRs checked 2 min ago"
  source?: string | null // spec branch whose checkout the statuses come from, when not this one
  session?: Session
  live?: Live
  lanes?: Lane[]
  open?: string[] // expanded lanes and task rows, by key
  taskFilter?: string // all | open | blocked
  actions: Actions
}

const GLYPH: Record<TaskLook, string> = { done: '●', review: '◑', 'in-progress': '◐', merged: '◍', closed: '⊘', blocked: '◌', draft: '○' }
const LOOK_KEY: Record<TaskLook, string | undefined> = { done: 'success', review: 'permission', 'in-progress': 'warning', merged: 'success', closed: 'error', blocked: undefined, draft: undefined }
const LANE_ROLE: Record<Lane['kind'], Role> = { agent: 'pro', task: 'warning', pr: 'accent' }
const rich = (surface: string) => surface === 'desktop' || surface === 'vscode'
// The design's raised surface. Desktop draws the theme key userMessageBackground as the pane itself in the
// light theme, so a warm grey at low opacity, which reads in both themes.
const SURFACE = '#7a756a1f'
const ROW_HOVER = '#4a86d424' // the permission blue at low opacity, as the design lights a row under the pointer
// Desktop rounds a Box's corners only through `borderStyle: 'round'`. The border stays clear: a tinted one
// would lie over the tinted background and draw a darker ring.
const CLEAR = '#00000000'
// A row's middle part that takes the free width and gives it back, so truncate-end cuts its text at the edge.
const SHRINK = { flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row' } as const
const roundBg = (bg: string) => ({ borderStyle: 'round', borderColor: CLEAR, backgroundColor: bg })
const PR_KEY: Record<PrState, string> = { OPEN: 'success', MERGED: 'merged', CLOSED: 'error' }
const PR_WORD: Record<PrState, string> = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed without merging' }

// A bar on Desktop and VS Code: a row of Boxes, so the layout gives it the pane's whole width (a drawing
// has to name its size in pixels, and the pane reports only columns). A part grows by its weight and is
// filled with its colour (the track when it has none); stripes run through it when given. Two half-pill
// drawings round the ends and give the row its height: a Box border would add a row above and below.
type BarPart = { grow: number; color?: string; stripes?: string; isMoving?: boolean; alt?: string }
function flexBar(el: any, key: string, alt: string, height: number, parts: BarPart[], track: string = MID_TRACK) {
  const { Box, Svg } = el
  const shown = parts.filter((p) => p.grow > 0)
  // Weights scaled to 1000: CSS hands out only part of the free space when the grows add up to less than 1.
  const total = shown.reduce((a, p) => a + p.grow, 0) || 1
  const cap = (side: 'left' | 'right', p: BarPart | undefined) => {
    const c = capSvg(side, height, p?.color ?? track)
    return Svg({ alt: side === 'left' ? alt : 'bar end', width: c.width, height, source: c.source })
  }
  return Box({
    key, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden', minWidth: 0,
    children: [
      cap('left', shown[0]),
      ...shown.map((p, i) =>
        Box({
          key: key + '-' + i, flexGrow: (p.grow / total) * 1000, flexShrink: 1, width: 0, minWidth: 0, overflow: 'hidden', backgroundColor: p.color ?? track,
          children: p.stripes ? [Svg({ alt: p.alt ?? 'stripes', width: STRIPES_WIDTH, height, source: p.stripes, ...(p.isMoving ? { isInteractive: true } : {}) })] : [],
        }),
      ),
      cap('right', shown[shown.length - 1]),
    ],
  })
}
function wide(el: any, child: any) {
  return el.Box({ overflow: 'hidden', flexDirection: 'column', children: [child] })
}

// A tinted pill on Desktop/VS Code, a plain colored label in the terminal.
function pill(el: any, isRich: boolean, label: string, role: Role) {
  if (!isRich) return el.Text({ color: ROLE_KEY[role], weight: 'semibold', children: [label] })
  const b = pillSvg(label, role)
  return el.Svg({ alt: label, width: b.width, height: b.height, source: b.source })
}

function statusPill(el: any, ctx: Ctx, status: string) {
  return pill(el, rich(ctx.surface), status, STATUS_ROLE[status] ?? 'neutral')
}

function liveDot(el: any, ctx: Ctx, role: Role, isLive: boolean) {
  if (rich(ctx.surface)) return el.Svg({ alt: isLive ? 'running' : 'idle', width: 12, height: 12, source: liveDotSvg(role, isLive), isInteractive: true })
  return el.Text({ color: isLive ? ROLE_KEY[role] : 'inactive', children: [isLive ? '◉' : '○'] })
}

// Which session this is: the spec's main SDD session or the session of one task (T8).
function sessionStrip(el: any, ctx: Ctx) {
  const { Box, Text } = el
  const s = ctx.session
  const f = ctx.current
  if (!s || s.kind === 'none' || !f) return null
  const isRich = rich(ctx.surface)
  if (s.kind === 'main') {
    return Box({
      key: 'session', borderStyle: 'round', borderColor: 'permission', paddingX: 1, flexDirection: 'row', columnGap: 1, alignItems: 'center',
      ...(isRich ? { backgroundColor: SURFACE, paddingY: 'xs' } : {}),
      children: [Text({ color: 'permission', weight: 'semibold', children: ['Main SDD session'] }), Text({ mono: true, dimColor: true, wrap: 'truncate-end', children: [f.spec.branch] })],
    })
  }
  return Box({
    key: 'session', borderStyle: 'round', borderColor: 'merged', paddingX: 1, flexDirection: 'column',
    ...(isRich ? { backgroundColor: SURFACE, paddingY: 'xs' } : {}),
    children: [
      Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Text({ color: 'merged', weight: 'semibold', children: ['Task session · ' + s.label] }), Text({ mono: true, dimColor: true, wrap: 'truncate-end', children: [ctx.branch] })] }),
      ctx.source ? Text({ dimColor: true, size: 'footnote', wrap: 'wrap', children: ['Statuses read from the ' + ctx.source + ' checkout, where the main session writes tasks.md.'] }) : null,
    ].filter(Boolean),
  })
}

function tabBar(el: any, ctx: Ctx) {
  const { Box, Button, Text } = el
  const isRich = rich(ctx.surface)
  const isTask = ctx.session?.kind === 'task'
  const tabs: [Tab, string, string][] = isTask
    ? [['ticket', 'Ticket', '1'], ['current', 'Spec', '2'], ['all', 'All (' + ctx.features.length + ')', '3']]
    : [['current', 'Current', '1'], ['all', 'All (' + ctx.features.length + ')', '2']]
  // Desktop draws every Button as its own native button (hotkey chip, pill under the pointer), so a
  // tinted box around it shows a pill inside a box: there the active tab is the full-strength,
  // semibold label alone. VS Code draws the design's tinted tab.
  const isDesktop = ctx.surface === 'desktop'
  const mk = ([id, label, hotkey]: [Tab, string, string]) => {
    const isActive = ctx.tab === id
    const button = Button({
      key: 'tab-' + id, label, hotkey, plain: true, dimColor: !isActive, onPress: () => ctx.actions.tab(id),
      ...(isDesktop ? { children: [Text({ weight: isActive ? 'semibold' : 'regular', children: [label] })] } : {}),
    })
    if (isDesktop || !isRich) return button
    return Box({ key: 'tabbox-' + id, paddingX: 1, ...(isActive ? roundBg(SURFACE) : { borderStyle: 'round', borderColor: CLEAR }), children: [button] })
  }
  // A new spec is offered only where no spec is being worked on (T9).
  const isSpecSession = ctx.session !== undefined && ctx.session.kind !== 'none'
  return Box({
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    children: [
      Box({
        flexDirection: 'row', columnGap: 1, alignItems: 'center',
        children: [...tabs.map(mk), isSpecSession ? null : Button({ key: 'new-spec', label: '+ New spec', plain: true, onPress: () => ctx.actions.fill('/sdd:spec feat ') })].filter(Boolean),
      }),
      Button({ key: 'open-config', label: 'Config', hotkey: 'c', plain: true, dimColor: true, onPress: () => ctx.actions.config() }),
    ],
  })
}

// What runs now: the /sdd:* command of this turn, its latest tool call, and one lane per subagent,
// task worktree and task pull request. One line when nothing runs.
function liveStrip(el: any, ctx: Ctx) {
  const { Box, Text } = el
  const live = ctx.live
  const lanes = ctx.lanes ?? []
  const isRich = rich(ctx.surface)
  const turn = live?.turn ?? null
  const active = lanes.filter((l) => l.state === 'working' || l.state === 'waiting')
  const waiting = waitingCommand(ctx)
  if (!turn && active.length === 0 && waiting) {
    return Box({
      key: 'live', flexDirection: 'row', columnGap: 1, alignItems: 'center',
      children: [liveDot(el, ctx, 'warning', false), Text({ size: 'footnote', wrap: 'truncate-end', children: [waiting + ' · waits for your reply'] })],
    })
  }
  if (!turn && active.length === 0) {
    const last = live?.lastTurnEnd
    return Box({
      key: 'live', flexDirection: 'row', columnGap: 1, alignItems: 'center',
      children: [liveDot(el, ctx, 'neutral', false), Text({ dimColor: true, size: 'footnote', wrap: 'truncate-end', children: [last ? 'Idle · last turn ended ' + ago(last, ctx.now) : 'Idle · nothing runs in this session'] })],
    })
  }
  const head = turn
    ? Box({
        flexDirection: 'row', columnGap: 1, alignItems: 'center',
        children: [
          liveDot(el, ctx, 'warning', true),
          Box({ ...SHRINK, children: [Text({ mono: true, weight: 'semibold', wrap: 'truncate-end', children: [live?.command ?? 'Turn running'] })] }),
          Text({ dimColor: true, tabular: true, size: 'footnote', children: [clock(ctx.now - turn.since)] }),
        ],
      })
    : Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [liveDot(el, ctx, 'neutral', false), Text({ dimColor: true, size: 'footnote', wrap: 'truncate-end', children: ['This session is idle · ' + active.length + ' running elsewhere'] })] })
  const tool = turn && live?.tool
    ? Box({
        flexDirection: 'row', columnGap: 1, paddingLeft: isRich ? 3 : 2, minWidth: 0,
        children: [
          Text({ size: 'footnote', weight: 'medium', children: [live.tool.tool] }),
          Box({ ...SHRINK, children: [Text({ mono: true, size: 'footnote', dimColor: true, wrap: 'truncate-end', children: [live.tool.detail] })] }),
          Text({ dimColor: true, tabular: true, size: 'caption', children: [clock(ctx.now - live.tool.at)] }),
        ],
      })
    : null
  const timed = lanes.some((l) => l.since !== undefined)
  const laneBox = lanes.length
    ? Box({
        flexDirection: 'column', rowGap: 1,
        children: [isRich && timed ? axisRow(el) : null, ...lanes.map((l) => laneRow(el, ctx, l))].filter(Boolean),
      })
    : null
  return Box({
    key: 'live', borderStyle: 'round', borderColor: turn ? 'warning' : undefined, padding: 'md', flexDirection: 'column', rowGap: isRich ? 2 : 1,
    children: [Box({ flexDirection: 'column', rowGap: 1, children: [head, tool].filter(Boolean) }), laneBox].filter(Boolean),
  })
}

// The live strip's time axis over the lane bars: the window's start, two ticks, now.
function axisRow(el: any) {
  const { Box, Text } = el
  const min = WINDOW_MS / 60_000
  const labels = ['−' + min + 'm', '−' + Math.round((min * 2) / 3) + 'm', '−' + Math.round(min / 3) + 'm', 'now']
  return Box({ key: 'axis', flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 3, children: labels.map((t) => Text({ size: 'caption', dimColor: true, tabular: true, children: [t] })) })
}

// One lane on the time axis: from its start (clamped to the window) to its end or now. A waiting lane is
// hatched, a finished one faded, a failed one red.
function laneBar(el: any, l: Lane, role: Role, now: number) {
  const at = (t: number) => Math.max(0, Math.min(1, 1 - (now - t) / WINDOW_MS))
  const x0 = at(l.since ?? now)
  const x1 = Math.min(1, Math.max(x0 + 0.006, at(l.endedAt ?? now)))
  const lane: BarPart = l.state === 'waiting'
    ? { grow: x1 - x0, stripes: stripesSvg(6, FILL[role]), alt: 'waiting' }
    : { grow: x1 - x0, color: l.state === 'failed' ? FILL.danger : FILL[role] + (l.state === 'working' ? '' : '73') }
  return flexBar(el, l.key + '-bar', l.label + ' on the time axis', 6, [{ grow: x0 }, lane, { grow: 1 - x1 }], '#8b8d9822')
}

function laneRow(el: any, ctx: Ctx, l: Lane) {
  const { Box, Text, Button, Svg } = el
  const isRich = rich(ctx.surface)
  const isOpen = (ctx.open ?? []).includes(l.key)
  const role = LANE_ROLE[l.kind]
  const timer = l.since === undefined ? '' : clock((l.endedAt ?? ctx.now) - l.since)
  const status = { working: timer || 'working', waiting: 'waiting', done: l.kind === 'agent' ? 'done ' + timer : 'merged', failed: l.kind === 'agent' ? 'stopped' : 'closed' }[l.state]
  const glyph = isRich
    ? l.state === 'done'
      ? Svg({ alt: 'done', width: 14, height: 14, source: checkSvg(true) })
      : Svg({ alt: l.state, width: 14, height: 14, source: liveDotSvg(l.state === 'failed' ? 'danger' : role, l.state === 'working', 14), isInteractive: true })
    : Text({ color: l.state === 'done' ? 'success' : l.state === 'failed' ? 'error' : ROLE_KEY[role], children: [l.state === 'done' ? '✓' : l.state === 'waiting' ? '◌' : l.state === 'failed' ? '✕' : '◉'] })
  // A Button holds only text, so the glyph sits between the chevron and the label, both pressable.
  const toggle = () => ctx.actions.toggle?.(l.key)
  const row = Box({
    flexDirection: 'row', columnGap: 1, alignItems: 'center',
    children: [
      Button({ key: l.key + '-chevron', plain: true, dimColor: true, label: isOpen ? '▾' : '▸', onPress: toggle }),
      glyph,
      Box({
        ...SHRINK,
        children: [Button({ key: l.key, plain: true, onPress: toggle, children: [Text({ mono: true, size: 'footnote', weight: 'medium', children: [l.label + ' '] }), Text({ size: 'footnote', dimColor: l.state === 'done' || l.state === 'failed', wrap: 'truncate-end', children: [l.title] })] })],
      }),
    ],
  })
  const bar = isRich && l.since !== undefined
    ? Box({ paddingLeft: 3, children: [laneBar(el, l, role, ctx.now)] })
    : null
  const details = isOpen
    ? Box({
        flexDirection: 'column', paddingLeft: isRich ? 3 : 2,
        children: [
          Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [pill(el, isRich, l.kind === 'pr' ? 'pr' : l.kind === 'agent' ? 'agent' : 'task', l.kind === 'pr' ? 'accent' : l.kind === 'agent' ? 'pro' : 'warning'), Text({ mono: true, size: 'footnote', wrap: 'truncate-end', children: [l.who.replace(/^agent:/, '')] })] }),
          Text({ size: 'footnote', dimColor: true, wrap: 'wrap', children: [l.where] }),
          ...l.steps.slice(-3).map((s, i) =>
            Box({
              key: l.key + '-step-' + i, flexDirection: 'row', columnGap: 1,
              children: [
                Text({ size: 'footnote', weight: 'medium', children: [s.tool] }),
                Box({ ...SHRINK, children: [Text({ mono: true, size: 'footnote', dimColor: true, wrap: 'truncate-end', children: [s.detail] })] }),
                Text({ size: 'caption', dimColor: true, tabular: true, children: [clock(ctx.now - s.at)] }),
              ],
            }),
          ),
          Text({ size: 'caption', dimColor: true, wrap: 'wrap', children: ['source: ' + l.source] }),
        ],
      })
    : null
  return Box({
    key: 'lanebox-' + l.key, flexDirection: 'column', rowGap: isRich ? 1 : 0,
    ...(l.taskId && isRich ? { borderStyle: 'round', borderColor: CLEAR, paddingX: 1, hover: { scope: 'task-' + l.taskId, backgroundColor: ROW_HOVER } } : {}),
    children: [
      Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Box({ ...SHRINK, children: [row] }), Text({ size: 'caption', tabular: true, color: l.state === 'waiting' ? 'permission' : l.state === 'failed' ? 'error' : undefined, dimColor: l.state !== 'waiting' && l.state !== 'failed', children: [status] })] }),
      bar,
      details,
    ].filter(Boolean),
  })
}

function specHeader(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text } = el
  const done = derive(f).phase === 'done'
  return Box({
    flexDirection: 'column', rowGap: 1,
    children: [
      Text({ size: 'title', weight: 'semibold', wrap: 'wrap', children: [f.spec.title || f.slug] }),
      Box({
        flexDirection: 'row', columnGap: 1, alignItems: 'center',
        children: [statusPill(el, ctx, done ? 'done' : f.spec.status || 'draft'), Text({ dimColor: true, size: 'footnote', wrap: 'truncate-end', children: [[f.spec.type, f.spec.owner, f.modified ? 'edited ' + ago(f.modified, ctx.now) : ''].filter(Boolean).join(' · ')] })],
      }),
    ],
  })
}

// The pipeline as one bar: done segments green, the current one wider and moving.
function phaseBar(el: any, ctx: Ctx, f: Feature) {
  const { Text } = el
  const waiting = runningCommand(ctx) ? null : waitingCommand(ctx)
  const d = derive(f, runningCommand(ctx) ?? waiting)
  if (rich(ctx.surface)) {
    const { Box } = el
    const n = d.steps.length
    return Box({
      key: 'phase-bar', flexDirection: 'row', columnGap: 'xs',
      children: d.steps.map((s, i) => {
        const isCurrent = s.state === 'current'
        const isMoving = isCurrent && d.isRunning && !waiting
        const color = s.state === 'done' ? FILL.success : isCurrent ? (d.isRunning ? FILL.warning : FILL.danger) : MID_TRACK
        return Box({
          key: 'phase-' + s.key, flexDirection: 'column', rowGap: 'xs', flexGrow: isCurrent ? 2.2 : 1, flexShrink: 1, width: 0, minWidth: 0,
          children: [
            flexBar(el, 'phase-' + s.key + '-bar', s.label + ' ' + (isMoving ? 'running' : s.state), 8, [isMoving ? { grow: 1, color, stripes: stripesSvg(8, null), isMoving: true, alt: s.label + ' running' } : { grow: 1, color }]),
            Box({
              flexDirection: 'row', justifyContent: i === 0 ? 'flex-start' : i === n - 1 ? 'flex-end' : 'center',
              children: [Text({ size: 'caption', weight: isCurrent ? 'semibold' : undefined, dimColor: s.state === 'todo', wrap: 'truncate-end', children: [s.label] })],
            }),
          ],
        })
      }),
    })
  }
  const i = d.steps.findIndex((s) => s.state === 'current')
  const bar = d.steps.map((s) => (s.state === 'done' ? '██' : s.state === 'current' ? '▓▓▓▓' : '░░')).join(' ')
  const next = STEP_LABELS.find(([key]) => key === d.phase)?.[1]
  return Text({ key: 'phase-bar', wrap: 'wrap', children: [bar + '  ' + (d.isRunning ? i + 1 + '/' + d.steps.length + ' ' + d.steps[i].label + (waiting ? ' waits for your reply' : ' running') : next ? 'Next: ' + next : 'Done')] })
}

// The /sdd:* command of the turn running now, or null.
function runningCommand(ctx: Ctx): string | null {
  return ctx.live?.turn ? (ctx.live.command ?? ctx.running) : null
}

// The phase command waiting for the person's reply between its turns (a question, the plan approval),
// while the phase it writes is still the current feature's open one.
function waitingCommand(ctx: Ctx): string | null {
  const w = ctx.live?.waiting
  if (!w || ctx.live?.turn || !ctx.current) return null
  return derive(ctx.current).phase === w.match(/^\/sdd:([a-z]+)/)?.[1] ? w : null
}

function doneCard(el: any, ctx: Ctx) {
  const { Box, Text, Button } = el
  return Box({
    key: 'done-card', borderStyle: 'round', borderColor: 'success', padding: 'md', flexDirection: 'column', rowGap: 1,
    children: [
      Text({ color: 'success', weight: 'semibold', children: ['Feature done · review ready'] }),
      Text({ dimColor: true, wrap: 'wrap', size: 'footnote', children: ['Open or merge the pull request when you are ready, then start the next feature.'] }),
      Button({ key: 'fill-empty', label: 'Start a new spec', plain: true, onPress: () => ctx.actions.fill('/sdd:spec feat ') }),
    ],
  })
}

// The current phase: task progress, what has to be true before the next command, and that command.
function phaseCard(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Svg } = el
  const d = derive(f)
  const isRich = rich(ctx.surface)
  if (d.phase === 'done') return doneCard(el, ctx)
  const kids: any[] = []
  const c = taskCounts(f.tasks, f.merges)
  const label = STEP_LABELS.find((s) => s[0] === d.phase)?.[1] ?? d.phase
  const right = c.total && (d.phase === 'implement' || d.phase === 'review') ? c.done + c.review + ' of ' + c.total + ' implemented' : d.phase === 'clarify' && f.spec.openQuestions ? f.spec.openQuestions + ' open questions' : ''
  kids.push(Box({ flexDirection: 'row', justifyContent: 'space-between', columnGap: 1, children: [Text({ size: 'heading', weight: 'semibold', children: [label] }), Text({ dimColor: true, size: 'footnote', tabular: true, children: [right] })] }))
  if (c.total && (d.phase === 'implement' || d.phase === 'review')) {
    const todo = c.total - c.done - c.review - c['in-progress']
    kids.push(
      isRich
        ? flexBar(el, 'progress', c.done + ' done, ' + c.review + ' in review, ' + c['in-progress'] + ' in progress of ' + c.total, 8, [{ grow: c.done, color: FILL.success }, { grow: c.review, color: FILL.accent }, { grow: c['in-progress'], color: FILL.warning }, { grow: c.total - c.done - c.review - c['in-progress'] }])
        : Text({ key: 'progress', color: 'success', children: ['█'.repeat(Math.round(((c.done + c.review) / c.total) * 24)) + '░'.repeat(24 - Math.round(((c.done + c.review) / c.total) * 24))] }),
    )
    kids.push(Text({ size: 'caption', dimColor: true, children: [c.done + ' done · ' + c.review + ' in review · ' + c['in-progress'] + ' in progress · ' + todo + ' to do'] }))
  }
  const g = gate(f)
  if (g && g.checks.length) {
    kids.push(
      Box({
        flexDirection: 'column', marginTop: 1,
        children: g.checks.map((ch) =>
          Box({
            key: 'check-' + ch.key, flexDirection: 'row', columnGap: 1, alignItems: 'center',
            children: [
              isRich ? Svg({ alt: ch.ok ? 'done' : 'open', width: 16, height: 16, source: checkSvg(ch.ok) }) : Text({ color: ch.ok ? 'success' : 'warning', children: [ch.ok ? '✓' : '○'] }),
              Text({ size: 'footnote', color: ch.ok ? undefined : 'warning', wrap: 'truncate-end', children: [ch.label] }),
              ch.hint ? Text({ size: 'footnote', dimColor: true, wrap: 'truncate-end', children: ['· ' + ch.hint] }) : null,
            ].filter(Boolean),
          }),
        ),
      }),
    )
  }
  const next = nextBlock(el, ctx, f)
  if (next) kids.push(next)
  return Box({ key: 'phase-card', borderStyle: 'round', padding: 'md', flexDirection: 'column', rowGap: 1, children: kids })
}

function nextBlock(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button } = el
  const d = derive(f)
  if (!d.next) return null
  const g = gate(f)
  const open = g ? g.open : 0
  const cmd = d.next.command
  const verb = cmd.split(' ')[0]
  const isRunning = runningCommand(ctx) === verb
  const isBlocked = open > 0
  const status = isRunning ? 'running now' : 'model: ' + d.next.model
  // /sdd:implement with no argument takes every open task in turn (skills/implement, step 6).
  const left = (f.tasks ?? []).filter((t) => !implemented(t, f.merges)).length
  const canRunAll = verb === '/sdd:implement' && cmd !== verb && left > 1
  return Box({
    key: 'next', marginTop: 1, padding: 'sm', flexDirection: 'column', rowGap: 1,
    ...(rich(ctx.surface) ? roundBg(SURFACE) : { borderStyle: 'round', borderColor: isBlocked ? 'warning' : 'success' }),
    children: [
      Box({
        flexDirection: 'row', justifyContent: 'space-between', columnGap: 1, alignItems: 'center',
        children: [Text({ mono: true, weight: 'semibold', color: isRunning ? 'warning' : 'success', wrap: 'truncate-end', children: [cmd] }), Text({ size: 'caption', dimColor: true, children: [status] })],
      }),
      Text({ size: 'footnote', dimColor: true, wrap: 'wrap', children: [isBlocked && !isRunning ? 'Finish the open checks first. ' + d.next.why : d.next.why] }),
      // Run sends the command as if typed (queued until the session is idle); Put in prompt leaves it to edit.
      isRunning
        ? null
        : Box({
            flexDirection: 'row', columnGap: 1, alignItems: 'center',
            children: [
              Button({ key: 'run-next', label: 'Run ' + verb, hotkey: 'n', variant: 'primary', onPress: () => ctx.actions.run(verb.replace(/^\//, ''), cmd.slice(verb.length).trim()) }),
              canRunAll ? Button({ key: 'run-all', label: 'Implement all ' + left, hotkey: 'a', onPress: () => ctx.actions.run('sdd:implement', '') }) : null,
              Button({ key: 'fill-next', label: 'Put in prompt', plain: true, onPress: () => ctx.actions.fill(cmd) }),
            ].filter(Boolean),
          }),
    ].filter(Boolean),
  })
}

function taskMeta(t: Task, f: Feature, look: TaskLook): { text: string; color?: string } {
  const waits = blockedBy(t, f.tasks, f.merges)
  if (look === 'merged') return { text: t.pr ? 'PR ' + t.pr + ' merged' : 'merged', color: 'success' }
  if (look === 'closed') return { text: 'PR ' + t.pr + ' closed', color: 'error' }
  if (t.pr && !implemented(t, f.merges)) return { text: 'PR ' + t.pr, color: 'permission' }
  if (waits.length) return { text: 'waits on ' + waits.join(', ') }
  return { text: t.project }
}

function taskRows(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button, Svg, Client } = el
  const tasks = f.tasks ?? []
  if (tasks.length === 0) return null
  const isRich = rich(ctx.surface)
  const filter = ctx.taskFilter ?? 'all'
  const open = tasks.filter((t) => !implemented(t, f.merges))
  const blocked = tasks.filter((t) => blockedBy(t, tasks, f.merges).length > 0)
  const list = filter === 'open' ? open : filter === 'blocked' ? blocked : tasks
  const running = new Set((ctx.lanes ?? []).filter((l) => l.state === 'working' && l.taskId).map((l) => l.taskId))
  const fb = (id: string, label: string) => Button({ key: 'tasks-' + id, label, plain: true, dimColor: filter !== id, onPress: () => ctx.actions.taskFilter?.(id) })
  const rows = list.map((t) => {
    const look = taskLook(t, tasks, f.merges)
    const meta = taskMeta(t, f, look)
    const isOpen = (ctx.open ?? []).includes('task-' + t.id)
    const isRunning = running.has(t.id)
    const toggle = () => ctx.actions.toggle?.('task-' + t.id)
    // Desktop: the row is a Client (board/task-row.ts) that takes the pointer over its whole width.
    const hasClient = ctx.surface === 'desktop' && !!Client
    // Desktop draws a Button only as wide as its text and drops the colours of the Text inside it, so the
    // glyph and a status meta (PR, waits on) stay outside; the title and the project each press the row.
    const metaEl = !meta.text
      ? null
      : meta.text === t.project
        ? Button({ key: 'task-' + t.id + '-meta', label: meta.text, plain: true, dimColor: true, onPress: toggle, hover: { scope: 'task-' + t.id, underline: true } })
        : Text({ size: 'caption', color: meta.color, dimColor: !meta.color, wrap: 'truncate-end', children: [meta.text] })
    return Box({
      key: 'taskbox-' + t.id, flexDirection: 'column', rowGap: isOpen && isRich ? 'sm' : 0, paddingX: isRich ? 1 : 0,
      // An open row keeps the tint a row gets under the pointer, facts included.
      ...(isRich ? { paddingY: 'xs', ...(isOpen ? roundBg(ROW_HOVER) : { borderStyle: 'round', borderColor: CLEAR }), hover: { scope: 'task-' + t.id, backgroundColor: ROW_HOVER } } : {}),
      children: [
        Box({
          flexDirection: 'row', columnGap: 1, alignItems: 'center',
          children: [
            isRich ? Svg({ alt: look, width: 14, height: 14, source: taskGlyphSvg(look, isRunning), isInteractive: isRunning }) : Text({ color: LOOK_KEY[look], dimColor: !LOOK_KEY[look], children: [GLYPH[look]] }),
            ...(hasClient
              ? [Client({ key: 'task-' + t.id, module: './task-row.ts', flexGrow: 1, props: { id: t.id, title: t.title, meta: meta.text ?? '', metaColor: meta.color ?? null, isDone: look === 'done' } })]
              : [
                Box({
                  ...SHRINK,
                  children: [
                    Button({
                      key: 'task-' + t.id, plain: true, onPress: toggle, hover: { scope: 'task-' + t.id, underline: true },
                      children: [Text({ mono: true, size: 'footnote', dimColor: true, children: [t.id + ' '] }), Text({ size: 'footnote', dimColor: look === 'done', wrap: 'truncate-end', children: [t.title] })],
                    }),
                  ],
                }),
                metaEl,
                ]),
          ].filter(Boolean),
        }),
        isOpen ? taskFacts(el, ctx, f, t, true) : null,
      ].filter(Boolean),
    })
  })
  return Box({
    key: 'tasks', flexDirection: 'column', rowGap: 1,
    children: [
      Box({
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: 1,
        children: [Text({ weight: 'semibold', children: ['Tasks' + (f.epic ? ' · ' + f.epic : '')] }), Box({ flexDirection: 'row', columnGap: 2, children: [fb('all', 'All ' + tasks.length), fb('open', 'Open ' + open.length), fb('blocked', 'Blocked ' + blocked.length)] })],
      }),
      taskFlow(el, ctx, f, running),
      Box({ flexDirection: 'column', rowGap: isRich ? 'xs' : 0, children: rows.length ? rows : [Text({ dimColor: true, children: ['Nothing matches this filter.'] })] }),
    ].filter(Boolean),
  })
}

// The order the tasks run in, from their depends_on: one row per wave of tasks that can run side by side.
// Shown once some task waits on another; a graph left to right on Desktop and VS Code, one line in the terminal.
function taskFlow(el: any, ctx: Ctx, f: Feature, running: Set<string | undefined>) {
  const { Box, Text, Svg } = el
  const tasks = f.tasks ?? []
  if (tasks.length < 2 || !tasks.some((t) => t.dependsOn.length)) return null
  const waves = taskWaves(tasks)
  if (rich(ctx.surface)) {
    const g = taskGraphSvg(waves.map((w) => w.map((t) => ({ id: t.id, title: t.title, look: taskLook(t, tasks, f.merges), isLive: running.has(t.id), deps: t.dependsOn }))))
    const alt = 'Task flow: ' + waves.map((w, i) => 'wave ' + (i + 1) + ' ' + w.map((t) => t.id).join(' and ')).join(', then ')
    return Box({ key: 'task-flow', flexDirection: 'column', overflow: 'hidden', paddingY: 'xs', children: [Svg({ alt, width: g.width, height: g.height, source: g.source, isInteractive: true })] })
  }
  return Text({ key: 'task-flow', size: 'footnote', dimColor: true, wrap: 'wrap', children: [waves.map((w) => w.map((t) => t.id).join(' ∥ ')).join(' → ')] })
}

// A task's facts: scope, acceptance criteria, dependencies, branch and pull request.
function taskFacts(el: any, ctx: Ctx, f: Feature, t: Task, isCompact: boolean) {
  const { Box, Text } = el
  const tasks = f.tasks ?? []
  const line = (k: string, v: string, opts: { mono?: boolean; color?: string } = {}) =>
    Box({
      key: 'fact-' + t.id + '-' + k, flexDirection: 'row', columnGap: 1,
      children: [Box({ width: 12, children: [Text({ size: 'footnote', dimColor: true, children: [k] })] }), Box({ ...SHRINK, children: [Text({ size: 'footnote', weight: 'semibold', wrap: 'wrap', mono: opts.mono, color: opts.color, children: [v] })] })],
    })
  return Box({
    key: 'facts-' + t.id, flexDirection: 'column', rowGap: rich(ctx.surface) ? 'xs' : 0, paddingLeft: isCompact ? (rich(ctx.surface) ? 3 : 2) : 0, paddingBottom: isCompact && rich(ctx.surface) ? 'sm' : 0,
    children: [
      isCompact && t.scope?.length ? Box({ key: 'scope-' + t.id, paddingBottom: rich(ctx.surface) ? 'sm' : 0, children: [Text({ size: 'footnote', dimColor: true, wrap: 'wrap', children: [t.scope.join('; ')] })] }) : null,
      prLine(el, ctx, f, t),
      t.acceptance.length ? line('acceptance', t.acceptance.join(', ')) : null,
      t.dependsOn.length ? line('depends on', t.dependsOn.map((id) => { const d = tasks.find((x) => x.id === id); return id + (d && implemented(d, f.merges) ? ' ✓' : '') }).join(', ')) : null,
      line('project', t.project || '—'),
      t.branch ? line('branch', t.branch, { mono: true }) : null,
      !isCompact && t.files ? line('files', t.files, { mono: true }) : null,
    ].filter(Boolean),
  })
}

// A task's pull request: GitHub's icon in the colour of its state, the number as a link, the state.
// Number, state and link come from `gh pr list`; until it answers, the `pr:` value alone.
function prLine(el: any, ctx: Ctx, f: Feature, t: Task) {
  if (!t.pr) return null
  const { Box, Text, Svg, Link } = el
  const pr: TaskPr = f.prs?.[t.id] ?? { number: prNumber(t.pr), state: null, url: null }
  const label = 'PR ' + (pr.number !== null ? '#' + pr.number : t.pr)
  const isRich = rich(ctx.surface)
  return Box({
    key: 'pr-' + t.id, flexDirection: 'row', columnGap: 1, alignItems: 'center', paddingBottom: isRich ? 'sm' : 0,
    children: [
      isRich ? Svg({ alt: 'pull request ' + (pr.state ? PR_WORD[pr.state] : ''), width: 16, height: 16, source: prIconSvg(pr.state) }) : Text({ color: pr.state ? PR_KEY[pr.state] : undefined, dimColor: !pr.state, children: ['⇅'] }),
      Text({ size: 'footnote', weight: 'semibold', children: [pr.url && Link ? Link({ href: pr.url, children: [label] }) : label] }),
      pr.state ? Text({ size: 'footnote', color: PR_KEY[pr.state], children: [PR_WORD[pr.state]] }) : Text({ size: 'caption', dimColor: true, children: ['state not checked yet'] }),
    ],
  })
}

function docLinks(el: any, ctx: Ctx, f: Feature) {
  const { Box, Text, Button } = el
  const kinds = ['spec', 'plan', 'tasks', 'review'].filter((k) => k === 'spec' || (k === 'plan' && f.planStatus !== null) || (k === 'tasks' && f.tasks) || (k === 'review' && f.review))
  return Box({
    key: 'docs', flexDirection: 'row', columnGap: 2,
    children: [Text({ dimColor: true, size: 'footnote', children: ['Open'] }), ...kinds.map((k) => Button({ key: 'doc-' + k, label: k + '.md', plain: true, onPress: () => ctx.actions.doc(k) }))],
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

// Main view of a spec: what runs now, the phase, the next command, the tasks.
export function renderCurrent(el: any, ctx: Ctx) {
  const { Box, Text } = el
  const f = ctx.current
  if (!f) return Box({ flexDirection: 'column', rowGap: 2, children: [liveStrip(el, ctx), emptyState(el, ctx)] })
  const d = derive(f)
  const isRich = rich(ctx.surface)
  const kids: any[] = [liveStrip(el, ctx)]
  if (ctx.session?.kind === 'task') kids.push(Text({ key: 'task-note', size: 'footnote', dimColor: true, wrap: 'wrap', children: ['You are on the branch of ' + ctx.session.label + '. Commands that change the spec run in the main session.'] }))
  kids.push(Box({ key: 'head', flexDirection: 'column', rowGap: 1, children: [specHeader(el, ctx, f), phaseBar(el, ctx, f)] }))
  kids.push(phaseCard(el, ctx, f))
  if (d.phase === 'implement' || d.phase === 'review' || d.phase === 'done') {
    const rows = taskRows(el, ctx, f)
    if (rows) kids.push(rows)
  }
  if (d.phase !== 'done' && f.review) kids.push(Text({ key: 'verdict', color: f.review === 'READY' ? 'success' : 'error', weight: 'semibold', children: ['Review: ' + f.review.toLowerCase()] }))
  for (const w of warnings(f, ctx.branch)) kids.push(Text({ key: 'warn-' + w, color: 'error', wrap: 'wrap', children: ['⚠ ' + w] }))
  kids.push(docLinks(el, ctx, f))
  return Box({ flexDirection: 'column', rowGap: isRich ? 2 : 1, children: kids })
}

// First view of a task session (T8): the task this branch implements.
export function renderTicket(el: any, ctx: Ctx) {
  const { Box, Text, Button } = el
  const f = ctx.current
  const s = ctx.session
  const t = f && s && s.kind === 'task' ? (f.tasks ?? []).find((x) => x.id === s.taskId) : undefined
  if (!f || !t || !s || s.kind !== 'task') return renderCurrent(el, ctx)
  const isRich = rich(ctx.surface)
  const criteria = new Map((f.spec.criteria ?? []).map((c) => [c.id, c.text]))
  return Box({
    flexDirection: 'column', rowGap: isRich ? 2 : 1,
    children: [
      liveStrip(el, ctx),
      Box({
        key: 'ticket', borderStyle: 'round', borderColor: 'merged', padding: 'md', flexDirection: 'column', rowGap: isRich ? 2 : 1,
        children: [
          Box({
            flexDirection: 'column', rowGap: 1,
            children: [
              Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Text({ mono: true, weight: 'semibold', color: 'merged', children: [s.label] }), statusPill(el, ctx, t.status), Text({ size: 'footnote', dimColor: true, children: [t.project] })] }),
              Text({ size: 'title', weight: 'semibold', wrap: 'wrap', children: [t.title] }),
              ...(t.scope ?? []).map((a, i) => Text({ key: 'scope-' + i, size: 'footnote', wrap: 'wrap', children: ['• ' + a] })),
            ],
          }),
          t.acceptance.length
            ? Box({
                flexDirection: 'column', rowGap: 1,
                children: [
                  Text({ weight: 'semibold', size: 'footnote', children: ['Acceptance'] }),
                  ...t.acceptance.map((a) => Box({ key: 'ac-' + a, flexDirection: 'row', columnGap: 1, children: [Text({ mono: true, size: 'footnote', color: 'permission', children: [a] }), Text({ size: 'footnote', wrap: 'wrap', children: [criteria.get(a) ?? 'not in spec.md'] })] })),
                ],
              })
            : null,
          taskFacts(el, ctx, f, t, false),
        ].filter(Boolean),
      }),
      Box({ flexDirection: 'row', columnGap: 2, children: [Button({ key: 'open-spec', label: 'Open the spec pipeline', plain: true, onPress: () => ctx.actions.tab('current') }), Button({ key: 'doc-spec', label: 'spec.md', plain: true, onPress: () => ctx.actions.doc('spec') })] }),
    ],
  })
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
  const isRich = rich(ctx.surface)
  const filtered = ctx.features.filter((f) => {
    const p = derive(f).phase
    return ctx.filter === 'all' || (ctx.filter === 'done' ? p === 'done' : p !== 'done')
  })
  const cards = filtered.map((f) => {
    const isCurrent = ctx.current?.slug === f.slug
    const d = derive(f, isCurrent ? (runningCommand(ctx) ?? waitingCommand(ctx)) : null)
    const c = taskCounts(f.tasks, f.merges)
    const label = d.phase === 'done' ? 'Done' : STEP_LABELS.find((s) => s[0] === d.phase)?.[1] ?? d.phase
    const mini = miniPhaseSvg(d.steps)
    return Box({
      key: 'spec-' + f.slug, borderStyle: 'round', borderColor: isCurrent ? 'permission' : undefined, paddingX: 1, flexDirection: 'column', rowGap: isRich ? 1 : 0,
      ...(isRich ? { paddingY: 'xs', hover: { borderColor: isCurrent ? 'permission' : 'inactive' } } : {}),
      children: [
        Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [Box({ ...SHRINK, children: [Text({ weight: 'semibold', wrap: 'truncate-end', children: [f.spec.title || f.slug] })] }), statusPill(el, ctx, d.phase === 'done' ? 'done' : f.spec.status || 'draft')] }),
        Box({
          flexDirection: 'row', columnGap: 1, alignItems: 'center',
          children: [
            isRich ? el.Svg({ alt: 'Phase: ' + label, width: mini.width, height: mini.height, source: mini.source }) : Text({ children: [d.steps.map((s) => (s.state === 'done' ? '●' : s.state === 'current' ? '◉' : '○')).join('')] }),
            Text({ size: 'footnote', dimColor: true, wrap: 'truncate-end', children: [label + (c.total ? ' · ' + (c.done + c.review) + '/' + c.total + ' tasks' : '') + (f.modified ? ' · ' + ago(f.modified, ctx.now) : '')] }),
          ],
        }),
        Box({
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          children: [Text({ mono: true, size: 'caption', dimColor: true, wrap: 'truncate-end', children: ['specs/' + f.slug] }), Button({ key: 'show-' + f.slug, label: isCurrent ? 'Showing' : 'Show', plain: true, dimColor: isCurrent, onPress: () => ctx.actions.pin(f.slug) })],
        }),
      ],
    })
  })
  return Box({
    flexDirection: 'column', rowGap: isRich ? 2 : 1,
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
  const { Box } = el
  // No specs/ folder: the tabs have nothing to show, so only the setup card is drawn.
  if (ctx.isLoading) return Box({ flexDirection: 'column', padding: 'sm', children: [el.Text({ dimColor: true, children: ['Reading specs/…'] })] })
  if (!ctx.hasSpecs) return Box({ flexDirection: 'column', padding: 'sm', children: [emptyState(el, ctx)] })
  const tab = ctx.tab === 'ticket' && ctx.session?.kind !== 'task' ? 'current' : ctx.tab
  const view = tab === 'ticket' ? renderTicket(el, ctx) : tab === 'all' ? renderAll(el, ctx) : renderCurrent(el, ctx)
  return Box({
    flexDirection: 'column', rowGap: 1, padding: 'sm',
    children: [sessionStrip(el, ctx), tabBar(el, ctx), view, footer(el, ctx)].filter(Boolean),
  })
}

// When the data was read and where from, so a stale board is visible as such.
function footer(el: any, ctx: Ctx) {
  const parts = [ctx.freshness, ctx.source && ctx.session?.kind !== 'task' ? 'statuses from ' + ctx.source : ''].filter(Boolean)
  if (parts.length === 0) return null
  return el.Text({ key: 'freshness', dimColor: true, size: 'caption', tabular: true, wrap: 'wrap', children: [parts.join(' · ')] })
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
const TILE_BG = SURFACE

// "agent:python:python-developer" → pill "agent" + dim "python:" + "python-developer". Anything else is plain text.
function valueNode(el: any, isRich: boolean, e: { key: string; value: string; source: string }) {
  const { Box, Text } = el
  const m = FLOW.exec(e.value)
  if (!m) return Box({ ...SHRINK, children: [Text({ mono: true, size: 'footnote', wrap: 'truncate-end', dimColor: e.source === 'default', children: [e.value] })] })
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

// Read-only view of what the SDD commands will use: capabilities.yml with defaults filled in, and the
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
        Text({ weight: 'semibold', children: ['specs/capabilities.yml not found'] }),
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
        Box({ flexDirection: 'column', children: [Text({ weight: 'medium', size: 'heading', children: ['SDD configuration'] }), Text({ mono: true, dimColor: true, size: 'caption', children: [config.path] })] }),
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
          ...(isRich ? { backgroundColor: TILE_BG } : {}),
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

  if (config.legacy) {
    kids.push(
      Box({
        borderStyle: 'round', borderColor: 'warning', padding: 'md', flexDirection: 'column', rowGap: 1,
        children: [
          Text({ color: 'warning', weight: 'semibold', children: ['Old Markdown format'] }),
          Text({ dimColor: true, wrap: 'wrap', size: 'footnote', children: ['This version reads specs/capabilities.yml. /sdd:doctor init moves your values there and removes the .md file.'] }),
          Button({ key: 'cfg-migrate', label: 'Migrate with /sdd:doctor init', variant: 'primary', onPress: () => ctx.actions.run('sdd:doctor', 'init') }),
        ],
      }),
    )
  }

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
    // An option that belongs to another entry (merge and parallel under isolation) is drawn under it, behind a
    // connector, and shares one row of the card with it, so no hairline cuts the group.
    // The connector takes 2 key-column cells (18 wide on Desktop, the glyph and its gap in the terminal), which
    // the key column gives back so the values stay in one column. On Desktop it sits flush against the dot.
    const entryRow = (e: (typeof sec.entries)[number], child: 'none' | 'mid' | 'last') => {
      const dot = isRich
        ? Svg({ alt: e.source === 'set' ? 'set' : 'default', width: 8, height: 8, source: dotSvg(e.source === 'set') })
        : Text({ color: e.source === 'set' ? 'success' : undefined, dimColor: e.source !== 'set', children: [e.source === 'set' ? '●' : '○'] })
      return Box({
        key: sec.title + '-' + e.key, flexDirection: 'row', columnGap: 1, alignItems: 'center',
        children: [
          child === 'none'
            ? dot
            : isRich
              ? Box({ flexDirection: 'row', alignItems: 'center', children: [Svg({ alt: 'nested option', width: 18, height: 20, source: branchSvg(child === 'last') }), dot] })
              : Box({ flexDirection: 'row', columnGap: 1, children: [Text({ dimColor: true, children: [child === 'last' ? '└' : '├'] }), dot] }),
          Box({ width: Math.max(width + 1 - (child === 'none' ? 0 : 2), 6), children: [Text({ mono: true, size: 'footnote', dimColor: true, wrap: 'truncate-end', children: [e.key] })] }),
          valueNode(el, isRich, e),
          e.source === 'default' ? Text({ dimColor: true, size: 'caption', children: ['default'] }) : null,
        ].filter(Boolean),
      })
    }
    const top = sec.entries.filter((e) => !e.parent)
    kids.push(
      section(
        el, sctx, sec.title, set ? set + ' set' : 'all default',
        top.map((e) => {
          const children = sec.entries.filter((c) => c.parent === e.key)
          if (!children.length) return entryRow(e, 'none')
          return Box({
            key: sec.title + '-' + e.key + '-group', flexDirection: 'column',
            children: [entryRow(e, 'none'), ...children.map((c, i) => entryRow(c, i === children.length - 1 ? 'last' : 'mid'))],
          })
        }),
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
                      ...SHRINK,
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
