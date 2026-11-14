// SVG drawings for Desktop and VS Code, in Claude Code's own colors: the CDS tokens Desktop maps its
// theme keys to, read from the Claude Desktop bundle. Desktop draws an Svg in its own frame without the
// app's CSS variables, so each drawing carries a light and a dark value and switches with
// prefers-color-scheme. The attribute on each shape is the fallback when a style is not applied.
import type { Role, Step } from './model.ts'

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

// Pipeline stepper: circles on a line, check mark when done, ring on the current step.
export function stepperSvg(steps: Step[], width: number): string {
  const n = steps.length
  const pad = 26
  const gap = (width - pad * 2) / (n - 1)
  const y = 20
  let body = themed([
    ['.track', 'stroke', CDS.borderStrong],
    ['.todo', 'stroke', CDS.muted],
    ['.l-done', 'fill', CDS.secondary],
    ['.l-current', 'fill', CDS.primary],
    ['.l-todo', 'fill', CDS.muted],
  ])
  for (let i = 0; i < n - 1; i++) {
    const x1 = pad + gap * i + 11
    const x2 = pad + gap * (i + 1) - 11
    const line = steps[i].state === 'done' ? 'stroke="' + FILL.success + '"' : 'class="track" stroke="' + MID_TRACK + '"'
    body += '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" ' + line + ' stroke-width="2" stroke-linecap="round"/>'
  }
  steps.forEach((s, i) => {
    const x = pad + gap * i
    if (s.state === 'done') {
      body += '<circle cx="' + x + '" cy="' + y + '" r="10" fill="' + FILL.success + '"/>'
      body += '<path d="M' + (x - 4) + ' ' + y + ' l3 3.2 l5.2 -6" fill="none" stroke="' + ON_FILL + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    } else if (s.state === 'current') {
      body += '<circle cx="' + x + '" cy="' + y + '" r="13" fill="' + FILL.warning + '" fill-opacity="0.22"/>'
      body += '<circle cx="' + x + '" cy="' + y + '" r="9" fill="' + FILL.warning + '"/>'
      body += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="' + ON_FILL + '"/>'
    } else {
      body += '<circle class="todo" cx="' + x + '" cy="' + y + '" r="9" fill="none" stroke="' + MID + '" stroke-width="2"/>'
    }
    const weight = s.state === 'current' ? '600' : '400'
    body += '<text class="l-' + s.state + '" x="' + x + '" y="52" text-anchor="middle" font-size="11" font-weight="' + weight + '" fill="' + MID + '" font-family="system-ui,sans-serif">' + esc(s.label) + '</text>'
  })
  return svgDoc(width, 62, body)
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

// Six small dots, one per pipeline step, for the overview cards.
export function dotsSvg(steps: Step[]): string {
  let body = themed([['.todo', 'stroke', CDS.muted]])
  steps.forEach((s, i) => {
    const x = 6 + i * 16
    if (s.state === 'todo') body += '<circle class="todo" cx="' + x + '" cy="6" r="4.2" fill="none" stroke="' + MID + '" stroke-width="1.5"/>'
    else body += '<circle cx="' + x + '" cy="6" r="5" fill="' + (s.state === 'done' ? FILL.success : FILL.warning) + '"/>'
  })
  return svgDoc(steps.length * 16, 12, body)
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

// Small marker for a configuration value: filled (--fill-success) when set by the user, hollow (--text-muted) when default.
export function dotSvg(isSet: boolean): string {
  const body = isSet
    ? '<circle cx="4" cy="4" r="3" fill="' + FILL.success + '"/>'
    : themed([['circle', 'stroke', CDS.muted]]) + '<circle cx="4" cy="4" r="2.6" fill="none" stroke="' + MID + '" stroke-width="1"/>'
  return svgDoc(8, 8, body)
}
