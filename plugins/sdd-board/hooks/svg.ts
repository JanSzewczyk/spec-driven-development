// SVG drawings for Desktop and VS Code. Fixed colors with enough contrast on light and dark.
import { PALETTE } from './model.ts'
import type { Step } from './model.ts'

const MUTED = '#8b93a1'
const TRACK = '#8b93a133'
const INK = '#8b93a1'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Pipeline stepper: circles on a line, check mark when done, ring on the current step.
export function stepperSvg(steps: Step[], width: number): string {
  const n = steps.length
  const pad = 26
  const gap = (width - pad * 2) / (n - 1)
  const y = 20
  let body = ''
  for (let i = 0; i < n - 1; i++) {
    const x1 = pad + gap * i + 11
    const x2 = pad + gap * (i + 1) - 11
    const color = steps[i].state === 'done' ? PALETTE.done : TRACK
    body += '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>'
  }
  steps.forEach((s, i) => {
    const x = pad + gap * i
    if (s.state === 'done') {
      body += '<circle cx="' + x + '" cy="' + y + '" r="10" fill="' + PALETTE.done + '"/>'
      body += '<path d="M' + (x - 4) + ' ' + y + ' l3 3.2 l5.2 -6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    } else if (s.state === 'current') {
      body += '<circle cx="' + x + '" cy="' + y + '" r="13" fill="' + PALETTE['in-progress'] + '" fill-opacity="0.18"/>'
      body += '<circle cx="' + x + '" cy="' + y + '" r="9" fill="' + PALETTE['in-progress'] + '"/>'
      body += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="#fff"/>'
    } else {
      body += '<circle cx="' + x + '" cy="' + y + '" r="9" fill="none" stroke="' + MUTED + '" stroke-opacity="0.55" stroke-width="2"/>'
    }
    const weight = s.state === 'current' ? '600' : '400'
    const fill = s.state === 'todo' ? MUTED : INK
    body += '<text x="' + x + '" y="52" text-anchor="middle" font-size="11" font-weight="' + weight + '" fill="' + fill + '" font-family="system-ui,sans-serif">' + esc(s.label) + '</text>'
  })
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' 62" width="' + width + '" height="62">' + body + '</svg>'
}

// Segmented progress bar: done, review, in-progress, draft.
export function progressSvg(c: Record<string, number>, width: number): string {
  const total = Math.max(c.total, 1)
  const parts: [string, number][] = [
    ['done', c.done],
    ['review', c.review],
    ['in-progress', c['in-progress']],
  ]
  let x = 0
  let body = '<rect x="0" y="0" width="' + width + '" height="8" rx="4" fill="' + TRACK + '"/>'
  body += '<clipPath id="r"><rect x="0" y="0" width="' + width + '" height="8" rx="4"/></clipPath><g clip-path="url(#r)">'
  for (const [k, v] of parts) {
    if (!v) continue
    const w = (v / total) * width
    body += '<rect x="' + x + '" y="0" width="' + w + '" height="8" fill="' + PALETTE[k] + '"/>'
    x += w
  }
  body += '</g>'
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' 8" width="' + width + '" height="8">' + body + '</svg>'
}

// Six small dots, one per pipeline step, for the overview cards.
export function dotsSvg(steps: Step[]): string {
  let body = ''
  steps.forEach((s, i) => {
    const x = 6 + i * 16
    const fill = s.state === 'done' ? PALETTE.done : s.state === 'current' ? PALETTE['in-progress'] : 'none'
    const stroke = s.state === 'todo' ? ' stroke="' + MUTED + '" stroke-opacity="0.55" stroke-width="1.5"' : ''
    body += '<circle cx="' + x + '" cy="6" r="' + (s.state === 'todo' ? 4.2 : 5) + '" fill="' + fill + '"' + stroke + '/>'
  })
  const w = steps.length * 16
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' 12" width="' + w + '" height="12">' + body + '</svg>'
}

// Status badge: small pill, tinted fill and a hairline border in the status color.
export function badgeSvg(label: string, color: string): { source: string; width: number; height: number } {
  const height = 20
  const width = Math.round(label.length * 6.4 + 18)
  const body =
    '<rect x="0.5" y="0.5" width="' + (width - 1) + '" height="' + (height - 1) + '" rx="10" fill="' + color + '" fill-opacity="0.16" stroke="' + color + '" stroke-opacity="0.4"/>' +
    '<text x="' + width / 2 + '" y="14" text-anchor="middle" font-size="11" font-weight="600" fill="' + color + '" font-family="system-ui,sans-serif">' + esc(label) + '</text>'
  return { source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '">' + body + '</svg>', width, height }
}

// Check icon for the readiness list: green disc with a tick, or an amber ring when still open.
export function checkSvg(ok: boolean): string {
  const body = ok
    ? '<circle cx="8" cy="8" r="7" fill="' + PALETTE.done + '"/><path d="M4.6 8.2 l2.2 2.3 l4.2 -4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<circle cx="8" cy="8" r="6.2" fill="' + PALETTE['in-progress'] + '" fill-opacity="0.14" stroke="' + PALETTE['in-progress'] + '" stroke-width="1.6"/>'
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">' + body + '</svg>'
}

// Claude Code's own colors (the CDS tokens Desktop maps its theme keys to), light and dark. Svg is
// drawn in its own frame without the app's CSS variables, so the drawings carry both values and switch
// with prefers-color-scheme. The attribute on each shape is the fallback when a style is not applied.
export type Role = 'success' | 'pro' | 'accent' | 'warning'
type Pair = [light: string, dark: string]
const CDS: { text: Record<Role, Pair>; bg: Record<Role, Pair>; border: Pair; borderStrong: Pair; muted: Pair } = {
  text: { success: ['#006300', '#0ca30c'], pro: ['#4a3aa7', '#a096eb'], accent: ['#184f95', '#6da7ec'], warning: ['#734500', '#db9300'] },
  bg: { success: ['#caeac7', '#11260f'], pro: ['#dfdbfd', '#1d1649'], accent: ['#cde2fb', '#032042'], warning: ['#f9dca4', '#311a00'] },
  border: ['rgba(11,11,11,0.1)', 'rgba(255,255,255,0.1)'],
  borderStrong: ['rgba(11,11,11,0.2)', 'rgba(255,255,255,0.2)'],
  muted: ['#898781', '#6d6b67'],
}
const FILL_SUCCESS = '#009300' // --fill-success, same in both themes
const FILL_WARNING = '#eda100' // --fill-warning

// rules: [selector, property, [light, dark]]
function themed(rules: [string, string, Pair][]): string {
  const light = rules.map(([sel, prop, [l]]) => sel + '{' + prop + ':' + l + '}').join('')
  const dark = rules.map(([sel, prop, [, d]]) => sel + '{' + prop + ':' + d + '}').join('')
  return '<style>' + light + '@media (prefers-color-scheme: dark){' + dark + '}</style>'
}

function svgDoc(width: number, height: number, body: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '">' + body + '</svg>'
}

// One short bar per command (test, coverage, typecheck, lint, dev): green when set, amber when the
// mandatory test command is missing, grey when optional and empty.
export function pipsSvg(present: boolean[]): { source: string; width: number; height: number } {
  const height = 8
  const width = present.length * 17 - 3
  let body = themed([['.n', 'fill', CDS.borderStrong]])
  present.forEach((ok, i) => {
    const attrs = ok ? 'fill="' + FILL_SUCCESS + '"' : i === 0 ? 'fill="' + FILL_WARNING + '"' : 'class="n" fill="' + MUTED + '" fill-opacity="0.4"'
    body += '<rect x="' + i * 17 + '" y="2" width="14" height="4" rx="2" ' + attrs + '/>'
  })
  return { source: svgDoc(width, height, body), width, height }
}

// Hairline between the rows of a card (--border), centred in a band that gives the rows their spacing.
export function dividerSvg(width: number, height = 15): string {
  const y = height / 2
  return svgDoc(width, height, themed([['line', 'stroke', CDS.border]]) + '<line x1="0" y1="' + y + '" x2="' + width + '" y2="' + y + '" stroke="' + MUTED + '" stroke-opacity="0.28"/>')
}

// Flat tinted pill (bg-<role> fill, text-<role> label), as Claude Code tints a role.
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

// Small marker for a configuration value: filled (--fill-success) when set by the user, hollow (--text-muted) when default.
export function dotSvg(isSet: boolean): string {
  const body = isSet
    ? '<circle cx="4" cy="4" r="3" fill="' + FILL_SUCCESS + '"/>'
    : themed([['circle', 'stroke', CDS.muted]]) + '<circle cx="4" cy="4" r="2.6" fill="none" stroke="' + MUTED + '" stroke-width="1"/>'
  return svgDoc(8, 8, body)
}
