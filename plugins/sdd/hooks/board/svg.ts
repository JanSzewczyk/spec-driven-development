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
const FILL: Record<Role, string> = { success: '#009300', pro: '#7161e0', accent: '#2a78d6', warning: '#fab219', danger: '#d03b3b', neutral: '#898781' }
const ON_FILL = '#0b0b0b' // --on-success / --on-warning
// Fallbacks for an unstyled drawing: mid tones that read on both themes.
const MID = '#8b8d98'
const MID_TRACK = '#8b8d9840'
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

// Segmented progress bar: done, review, in-progress over a neutral track.
export function progressSvg(c: Record<string, number>, width: number): string {
  const total = Math.max(c.total, 1)
  const parts: [Role, number][] = [
    ['success', c.done],
    ['accent', c.review],
    ['warning', c['in-progress']],
  ]
  let x = 0
  let body = themed([['.track', 'fill', CDS.borderStrong]])
  body += '<rect class="track" x="0" y="0" width="' + width + '" height="8" rx="4" fill="' + MID_TRACK + '"/>'
  body += '<clipPath id="r"><rect x="0" y="0" width="' + width + '" height="8" rx="4"/></clipPath><g clip-path="url(#r)">'
  for (const [role, v] of parts) {
    if (!v) continue
    const w = (v / total) * width
    body += '<rect x="' + x + '" y="0" width="' + w + '" height="8" fill="' + FILL[role] + '"/>'
    x += w
  }
  body += '</g>'
  return svgDoc(width, 8, body)
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

// Phase bar: one segment per pipeline step, the current one wider with stripes moving through it (red
// and still when the last review was not ready); the step names under the segments.
export function phaseBarSvg(steps: Step[], width: number, isAlert = false): string {
  const gap = 4
  const h = 10
  const n = steps.length
  const weights = steps.map((s) => (s.state === 'current' ? 2.2 : 1))
  const unit = (width - gap * (n - 1)) / weights.reduce((a, b) => a + b, 0)
  let body = themed([
    ['.todo', 'fill', CDS.borderStrong],
    ['.l', 'fill', CDS.muted],
    ['.l-done', 'fill', CDS.secondary],
    ['.l-current', 'fill', CDS.primary],
  ])
  body += '<defs><pattern id="st" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="10" fill="#fff" fill-opacity="0.28"/></pattern></defs>'
  body += '<style>@keyframes mv{to{transform:translateX(14.14px)}}.mv{animation:mv 1.1s linear infinite}' + NO_MOTION + '</style>'
  let x = 0
  steps.forEach((s, i) => {
    const w = unit * weights[i]
    const fill = s.state === 'done' ? FILL.success : s.state === 'current' ? (isAlert ? FILL.danger : FILL.warning) : null
    body += fill
      ? '<rect x="' + x + '" y="0" width="' + w + '" height="' + h + '" rx="3" fill="' + fill + '"/>'
      : '<rect class="todo" x="' + x + '" y="0" width="' + w + '" height="' + h + '" rx="3" fill="' + MID_TRACK + '"/>'
    if (s.state === 'current' && !isAlert) {
      body += '<clipPath id="c' + i + '"><rect x="' + x + '" y="0" width="' + w + '" height="' + h + '" rx="3"/></clipPath>'
      body += '<g clip-path="url(#c' + i + ')"><rect class="mv" x="' + (x - 20) + '" y="0" width="' + (w + 40) + '" height="' + h + '" fill="url(#st)"/></g>'
    }
    // The end labels sit 4px in, so a drawing a few pixels wider than its slot keeps them whole.
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
    const tx = i === 0 ? x + 1 : i === n - 1 ? x + w - 4 : x + w / 2
    const weight = s.state === 'current' ? '600' : '400'
    body += '<text class="l l-' + s.state + '" x="' + tx + '" y="27" text-anchor="' + anchor + '" font-size="11" font-weight="' + weight + '" fill="' + MID + '" font-family="system-ui,sans-serif">' + esc(s.label) + '</text>'
    x += w + gap
  })
  return svgDoc(width, 32, body)
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

// One lane on the live strip's time axis: from its start (clamped to the window) to its end or now.
// A waiting lane is hatched, a finished one faded, a failed one red.
export function laneBarSvg(lane: { since: number; endedAt?: number; state: 'working' | 'waiting' | 'done' | 'failed' }, role: Role, now: number, windowMs: number, width: number): string {
  const at = (t: number) => Math.max(0, Math.min(width, width * (1 - (now - t) / windowMs)))
  const x0 = at(lane.since)
  const x1 = Math.max(x0 + 3, at(lane.endedAt ?? now))
  let body = themed([['.track', 'stroke', CDS.border]]) + '<line class="track" x1="0" y1="3" x2="' + width + '" y2="3" stroke="' + MID_TRACK + '" stroke-width="1" stroke-dasharray="2 3"/>'
  if (lane.state === 'waiting') {
    body += '<defs><pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="' + FILL[role] + '"/></pattern></defs>'
    body += '<rect x="' + x0 + '" y="0" width="' + (x1 - x0) + '" height="6" rx="3" fill="url(#h)" fill-opacity="0.7"/>'
  } else {
    const fill = lane.state === 'failed' ? FILL.danger : FILL[role]
    body += '<rect x="' + x0 + '" y="0" width="' + (x1 - x0) + '" height="6" rx="3" fill="' + fill + '" fill-opacity="' + (lane.state === 'working' ? 1 : 0.45) + '"/>'
  }
  return svgDoc(width, 6, body)
}

// The live strip's time axis: four ticks from the window's start to now.
export function axisSvg(windowMs: number, width: number): string {
  const min = windowMs / 60_000
  let body = themed([['text', 'fill', CDS.muted], ['line', 'stroke', CDS.borderStrong]])
  const ticks: [number, string][] = [[1, '−' + min + 'm'], [2 / 3, '−' + Math.round((min * 2) / 3) + 'm'], [1 / 3, '−' + Math.round(min / 3) + 'm'], [0, 'now']]
  ticks.forEach(([f, label], i) => {
    const x = width * (1 - f)
    const anchor = i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'
    body += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="3" stroke="' + MID + '"/>'
    body += '<text x="' + x + '" y="13" font-size="10" text-anchor="' + anchor + '" fill="' + MID + '" font-family="system-ui,sans-serif">' + label + '</text>'
  })
  return svgDoc(width, 15, body)
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
