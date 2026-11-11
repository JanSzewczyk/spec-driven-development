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
