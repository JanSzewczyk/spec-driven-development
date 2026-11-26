// SVG drawings for Desktop and VS Code, in Claude Code's own colors: the CDS tokens Desktop maps its
// theme keys to, read from the Claude Desktop bundle. Desktop draws an Svg in its own frame without the
// app's CSS variables, so each drawing carries a light and a dark value and switches with
// prefers-color-scheme. The attribute on each shape is the fallback when a style is not applied.
import type { Role, Step, TaskLook } from './model.ts'

type Pair = [light: string, dark: string]

const CDS = {
  text: {
    success: ['#006300', '#0ca30c'], pro: ['#4a3aa7', '#a096eb'], accent: ['#184f95', '#6da7ec'],
    warning: ['#734500', '#db9300'], danger: ['#8e2626', '#ec7e7e'], neutral: ['#52514e', '#c3c2b7'],
  } as Record<Role, Pair>,
  bg: {
    success: ['#caeac7', '#11260f'], pro: ['#dfdbfd', '#1d1649'], accent: ['#cde2fb', '#032042'],
    warning: ['#f9dca4', '#311a00'], danger: ['#fad6d6', '#3c0e0e'], neutral: ['rgba(11,11,11,0.06)', 'rgba(255,255,255,0.08)'],
  } as Record<Role, Pair>,
  primary: ['#0b0b0b', '#f0efec'] as Pair, // --text-primary
  secondary: ['#52514e', '#c3c2b7'] as Pair, // --text-secondary
  muted: ['#898781', '#6d6b67'] as Pair, // --text-muted
  border: ['rgba(11,11,11,0.1)', 'rgba(255,255,255,0.1)'] as Pair, // --border
  borderStrong: ['rgba(11,11,11,0.2)', 'rgba(255,255,255,0.2)'] as Pair, // --border-strong
}

// --fill-<role>: the solid hue controls are drawn with, the same in both themes.
export const FILL: Record<Role, string> = { success: '#009300', pro: '#7161e0', accent: '#2a78d6', warning: '#fab219', danger: '#d03b3b', neutral: '#898781' }
const ON_FILL = '#0b0b0b' // --on-success / --on-warning
// Fallbacks for an unstyled drawing: mid tones that read on both themes.
const MID = '#8b8d98'
export const MID_TRACK = '#8b8d9840'
// Motion lives only inside drawings; a reader who asked for less motion gets none.
const NO_MOTION = '@media (prefers-reduced-motion: reduce){*{animation:none!important}}'

// rules: [selector, property, [light, dark]]
function themed(rules: [string, string, Pair][]): string {
  const light = rules.map(([sel, prop, [l]]) => sel + '{' + prop + ':' + l + '}').join('')
  const dark = rules.map(([sel, prop, [, d]]) => sel + '{' + prop + ':' + d + '}').join('')
  return '<style>' + light + '@media (prefers-color-scheme: dark){' + dark + '}</style>'
}

function svgDoc(width: number, height: number, body: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '">' + body + '</svg>'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Flat tinted pill (bg-<role> fill, text-<role> label), as Claude Code tints a role. Used for statuses,
// project kinds and flow types.
export function pillSvg(label: string, role: Role): { source: string; width: number; height: number } {
  const height = 18
  const width = Math.round(label.length * 6.2 + 16)
  const [, dark] = CDS.text[role]
  const body =
    themed([['rect', 'fill', CDS.bg[role]], ['rect', 'fill-opacity', ['1', '1']], ['text', 'fill', CDS.text[role]]]) +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="9" fill="' + dark + '" fill-opacity="0.2"/>' +
    '<text x="' + width / 2 + '" y="12.5" text-anchor="middle" font-size="11" font-weight="500" fill="' + dark + '" font-family="system-ui,sans-serif">' + esc(label) + '</text>'
  return { source: svgDoc(width, height, body), width, height }
}

// Check icon for the readiness list: a success disc with a tick, or a warning ring when still open.
export function checkSvg(ok: boolean): string {
  const body = ok
    ? '<circle cx="8" cy="8" r="7" fill="' + FILL.success + '"/><path d="M4.6 8.2 l2.2 2.3 l4.2 -4.6" fill="none" stroke="' + ON_FILL + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    : themed([['circle', 'fill', CDS.bg.warning], ['circle', 'fill-opacity', ['1', '1']]]) +
      '<circle cx="8" cy="8" r="6.2" fill="' + FILL.warning + '" fill-opacity="0.14" stroke="' + FILL.warning + '" stroke-width="1.6"/>'
  return svgDoc(16, 16, body)
}

// One short bar per command (test, coverage, typecheck, lint, dev): success when set, warning when the
// mandatory test command is missing, a neutral track when optional and empty.
export function pipsSvg(present: boolean[]): { source: string; width: number; height: number } {
  const height = 8
  const width = present.length * 17 - 3
  let body = themed([['.n', 'fill', CDS.borderStrong]])
  present.forEach((ok, i) => {
    const attrs = ok ? 'fill="' + FILL.success + '"' : i === 0 ? 'fill="' + FILL.warning + '"' : 'class="n" fill="' + MID_TRACK + '"'
    body += '<rect x="' + i * 17 + '" y="2" width="14" height="4" rx="2" ' + attrs + '/>'
  })
  return { source: svgDoc(width, height, body), width, height }
}

// Hairline between the rows of a card (--border), centred in a band that gives the rows their spacing.
export function dividerSvg(width: number, height = 15): string {
  const y = height / 2
  return svgDoc(width, height, themed([['line', 'stroke', CDS.border]]) + '<line x1="0" y1="' + y + '" x2="' + width + '" y2="' + y + '" stroke="' + MID + '" stroke-opacity="0.28"/>')
}

// Connector of an option nested under another row: a guide at x=4 (under the parent's 8px dot) that bends
// into the row; unless it is the last option the guide goes on to the next one. The arm stops 4 short of the
// right edge, where the option's dot follows with no gap of its own.
export function branchSvg(last: boolean, width = 18, height = 20): string {
  const y = height / 2
  const path = last
    ? 'M4 0 V' + (y - 4) + ' Q4 ' + y + ' 8 ' + y + ' H' + (width - 4)
    : 'M4 0 V' + height + ' M4 ' + y + ' H' + (width - 4)
  return svgDoc(width, height, themed([['path', 'stroke', CDS.borderStrong]]) + '<path d="' + path + '" fill="none" stroke="' + MID + '" stroke-width="1" stroke-linecap="round"/>')
}

// Small marker for a configuration value: filled (--fill-success) when set by the user, hollow (--text-muted) when default.
export function dotSvg(isSet: boolean): string {
  const body = isSet
    ? '<circle cx="4" cy="4" r="3" fill="' + FILL.success + '"/>'
    : themed([['circle', 'stroke', CDS.muted]]) + '<circle cx="4" cy="4" r="2.6" fill="none" stroke="' + MID + '" stroke-width="1"/>'
  return svgDoc(8, 8, body)
}

// Five small bars, one per pipeline step, for the specs list.
export function miniPhaseSvg(steps: Step[]): { source: string; width: number; height: number } {
  const width = steps.length * 13 - 2
  let body = themed([['.todo', 'fill', CDS.borderStrong]])
  steps.forEach((s, i) => {
    const x = i * 13
    body += s.state === 'todo'
      ? '<rect class="todo" x="' + x + '" y="0" width="11" height="5" rx="2.5" fill="' + MID_TRACK + '"/>'
      : '<rect x="' + x + '" y="0" width="11" height="5" rx="2.5" fill="' + (s.state === 'done' ? FILL.success : FILL.warning) + '"/>'
  })
  return { source: svgDoc(width, 5, body), width, height: 5 }
}

// A dot that pulses while something runs, a hollow ring when nothing does.
export function liveDotSvg(role: Role, isLive: boolean, size = 12): string {
  const c = size / 2
  if (!isLive) return svgDoc(size, size, themed([['circle', 'stroke', CDS.muted]]) + '<circle cx="' + c + '" cy="' + c + '" r="' + (c - 2.5) + '" fill="none" stroke="' + MID + '" stroke-width="1.5"/>')
  const f = FILL[role]
  return svgDoc(
    size,
    size,
    '<style>@keyframes p{0%{r:' + (c - 3) + 'px;opacity:.7}100%{r:' + c + 'px;opacity:0}}.p{animation:p 1.6s ease-out infinite}' + NO_MOTION + '</style>' +
      '<circle class="p" cx="' + c + '" cy="' + c + '" r="' + (c - 3) + '" fill="' + f + '"/><circle cx="' + c + '" cy="' + c + '" r="' + (c - 2.5) + '" fill="' + f + '"/>',
  )
}

// Task status glyph: done (tick), review (dot), in progress (an arc, turning while its lane runs),
// merged but not recorded (ringed tick), closed (red ring), blocked (dashed ring), draft (ring).
export function taskGlyphSvg(look: TaskLook, isLive = false): string {
  const ring = (attrs: string) => themed([['.r', 'stroke', CDS.muted]]) + '<circle class="r" cx="7" cy="7" r="5.2" fill="none" stroke="' + MID + '" stroke-width="1.4"' + attrs + '/>'
  const tick = (stroke: string) => '<path d="M4.4 7.2l2 2.1 3.6-4" fill="none" stroke="' + stroke + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  switch (look) {
    case 'done':
      return svgDoc(14, 14, '<circle cx="7" cy="7" r="6" fill="' + FILL.success + '"/>' + tick(ON_FILL))
    case 'review':
      return svgDoc(14, 14, '<circle cx="7" cy="7" r="6" fill="' + FILL.accent + '"/><circle cx="7" cy="7" r="2" fill="' + ON_FILL + '"/>')
    case 'merged':
      return svgDoc(14, 14, '<circle cx="7" cy="7" r="5.2" fill="none" stroke="' + FILL.success + '" stroke-width="1.6"/>' + tick(FILL.success))
    case 'closed':
      return svgDoc(14, 14, '<circle cx="7" cy="7" r="5.2" fill="none" stroke="' + FILL.danger + '" stroke-width="1.6"/><path d="M5 5l4 4M9 5l-4 4" stroke="' + FILL.danger + '" stroke-width="1.5" stroke-linecap="round"/>')
    case 'in-progress': {
      const spin = isLive ? '<style>@keyframes s{to{transform:rotate(360deg)}}.s{transform-origin:7px 7px;animation:s 2.4s linear infinite}' + NO_MOTION + '</style>' : ''
      return svgDoc(14, 14, spin + '<circle cx="7" cy="7" r="5.2" fill="none" stroke="' + FILL.warning + '" stroke-opacity="0.3" stroke-width="1.6"/><path class="s" d="M7 1.8 A5.2 5.2 0 0 1 12.2 7" fill="none" stroke="' + FILL.warning + '" stroke-width="1.8" stroke-linecap="round"/>')
    }
    case 'blocked':
      return svgDoc(14, 14, ring(' stroke-dasharray="2 2"'))
    default:
      return svgDoc(14, 14, ring(''))
  }
}

// A pull request's icon in GitHub's colors for its state: open (green branch with an arrow), merged
// (purple merge), closed (red branch with a cross); unknown state (gh not asked) in a mid tone.
export function prIconSvg(state: 'OPEN' | 'MERGED' | 'CLOSED' | null): string {
  const color = state === 'OPEN' ? FILL.success : state === 'MERGED' ? FILL.pro : state === 'CLOSED' ? FILL.danger : MID
  const s = ' fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'
  const dot = (x: number, y: number) => '<circle cx="' + x + '" cy="' + y + '" r="1.9"' + s + '/>'
  const body =
    state === 'MERGED'
      ? dot(4, 3.5) + dot(4, 12.5) + dot(12, 9) + '<path d="M4 5.4v5.2M4 5.4c0 2.6 2.4 3.6 6.1 3.6"' + s + '/>'
      : state === 'CLOSED'
        ? dot(4, 3.5) + dot(4, 12.5) + dot(12, 12.5) + '<path d="M4 5.4v5.2M12 7.5v3.1M10.2 2.2l3.6 3.6M13.8 2.2l-3.6 3.6"' + s + '/>'
        : dot(4, 3.5) + dot(4, 12.5) + dot(12, 12.5) + '<path d="M4 5.4v5.2M12 10.6V6.5c0-1.7-1-2.9-2.9-2.9H7.4M8.9 1.9L7.2 3.6l1.7 1.7"' + s + '/>'
  return svgDoc(16, 16, body)
}

// The bars (phase, progress, lanes) are rows of Boxes, so the layout gives them the pane's width; a
// drawing only gives a Box its height, or stripes the Box clips at its edge.
export function spacerSvg(height: number): string {
  return svgDoc(1, height, '')
}

// Wider than any pane: the Box holding it cuts it at its own edge.
export const STRIPES_WIDTH = 1600

// Stripes over a bar segment: white ones sliding through the running phase (color null), or a still
// hatch in `color` for a waiting lane.
export function stripesSvg(height: number, color: string | null): string {
  const isMoving = color === null
  let body = '<defs><pattern id="st" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="10" fill="' + (color ?? '#fff') + '" fill-opacity="' + (isMoving ? 0.28 : 0.7) + '"/></pattern></defs>'
  if (isMoving) body += '<style>@keyframes mv{to{transform:translateX(14.14px)}}.mv{animation:mv 1.1s linear infinite}' + NO_MOTION + '</style>'
  body += '<rect' + (isMoving ? ' class="mv"' : '') + ' x="-20" y="0" width="' + (STRIPES_WIDTH + 40) + '" height="' + height + '" fill="url(#st)"/>'
  return svgDoc(STRIPES_WIDTH, height, body)
}

export type GraphNode = { id: string; title: string; look: TaskLook; isLive: boolean; deps: string[] }

const NODE_ROLE: Record<TaskLook, Role | 'blocked'> = { done: 'success', merged: 'success', review: 'accent', 'in-progress': 'warning', closed: 'danger', draft: 'neutral', blocked: 'blocked' }
const IMPLEMENTED: TaskLook[] = ['done', 'merged', 'review']

// The tasks as a dependency graph, left to right: one column per wave (tasks that can run side by side),
// a line from each dependency to the task waiting on it. Hovering a node names the task.
export function taskGraphSvg(waves: GraphNode[][]): { source: string; width: number; height: number } {
  const TOP = 16 // the wave numbers above the columns
  const W = 46
  const H = 22
  const GAP = 8 // between the nodes of a column
  const COL = W + 30 // a column and the room for lines to the next one
  const most = Math.max(...waves.map((w) => w.length))
  const span = most * H + (most - 1) * GAP
  const width = (waves.length - 1) * COL + W + 2
  const height = TOP + span + 2
  const at = new Map<string, { x: number; y: number; col: number; look: TaskLook }>()
  waves.forEach((wave, i) => {
    const col = wave.length * H + (wave.length - 1) * GAP
    wave.forEach((n, j) => at.set(n.id, { x: i * COL + 1, y: TOP + (span - col) / 2 + j * (H + GAP) + 1, col: i, look: n.look }))
  })
  // Where a line may cross a column it skips: the gaps above, between and below that column's nodes.
  const gaps = waves.map((wave) => {
    const ys = wave.map((n) => at.get(n.id)!.y)
    return [ys[0] - GAP / 2, ...ys.map((y) => y + H + GAP / 2)]
  })
  const roles: Role[] = ['success', 'accent', 'warning', 'danger', 'neutral']
  let body = themed([
    ...roles.flatMap((r): [string, string, Pair][] => [['.r-' + r + ' rect', 'fill', CDS.bg[r]], ['.r-' + r + ' text', 'fill', CDS.text[r]]]),
    ['.r-blocked rect', 'stroke', CDS.muted],
    ['.r-blocked text', 'fill', CDS.muted],
    ['.e', 'stroke', CDS.muted],
    ['.d', 'fill', CDS.muted],
    ['.w', 'fill', CDS.muted],
  ])
  body += '<style>@keyframes pl{50%{stroke-opacity:0.25}}.live rect{animation:pl 1.4s ease-in-out infinite}' + NO_MOTION + '</style>'
  const curve = (x1: number, y1: number, x2: number, y2: number) => ' C' + (x1 + x2) / 2 + ' ' + y1 + ' ' + (x1 + x2) / 2 + ' ' + y2 + ' ' + x2 + ' ' + y2
  for (const wave of waves) {
    for (const n of wave) {
      const to = at.get(n.id)!
      for (const id of n.deps) {
        const from = at.get(id)
        if (!from || from.col >= to.col) continue
        const x2 = to.x - 1
        const y2 = to.y + H / 2
        let x = from.x + W
        let y = from.y + H / 2
        let d = 'M' + x + ' ' + y
        for (let k = from.col + 1; k < to.col; k++) {
          const want = y + (y2 - y) / (to.col - k + 1)
          const gy = gaps[k].reduce((best, g) => (Math.abs(g - want) < Math.abs(best - want) ? g : best))
          const left = k * COL + 1
          d += curve(x, y, left, gy) + ' L' + (left + W) + ' ' + gy
          x = left + W
          y = gy
        }
        d += curve(x, y, x2, y2)
        const isMet = IMPLEMENTED.includes(from.look)
        body += '<path class="' + (isMet ? '' : 'e') + '" d="' + d + '" fill="none" stroke="' + (isMet ? FILL.success : MID) + '" stroke-opacity="' + (isMet ? 0.55 : 1) + '" stroke-width="1.2"/>'
        body += '<circle class="' + (isMet ? '' : 'd') + '" cx="' + x2 + '" cy="' + y2 + '" r="1.8" fill="' + (isMet ? FILL.success : MID) + '"/>'
      }
    }
  }
  waves.forEach((wave, i) => {
    body += '<text class="w" x="' + (i * COL + 1 + W / 2) + '" y="10" text-anchor="middle" font-size="10" fill="' + MID + '" font-family="system-ui,sans-serif">' + (i + 1) + '</text>'
    for (const n of wave) {
      const p = at.get(n.id)!
      const role = NODE_ROLE[n.look]
      const stroke = role === 'blocked' ? MID : FILL[role]
      const dash = role === 'blocked' ? ' stroke-dasharray="3 2"' : ''
      body += '<g class="r-' + role + (n.isLive ? ' live' : '') + '"><title>' + esc(n.id + ' · ' + n.title + ' · ' + n.look) + '</title>'
      body += '<rect x="' + p.x + '" y="' + p.y + '" width="' + W + '" height="' + H + '" rx="6" fill="' + (role === 'blocked' ? 'none' : MID_TRACK) + '" stroke="' + stroke + '" stroke-opacity="' + (role === 'neutral' ? 0.5 : 0.8) + '"' + dash + '/>'
      body += '<text x="' + (p.x + W / 2) + '" y="' + (p.y + H / 2 + 4) + '" text-anchor="middle" font-size="11" font-weight="600" fill="' + MID + '" font-family="ui-monospace,monospace">' + esc(n.id) + '</text></g>'
    }
  })
  return { source: svgDoc(width, height, body), width, height }
}
