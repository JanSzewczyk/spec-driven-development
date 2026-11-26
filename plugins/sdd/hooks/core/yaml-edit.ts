// Line-level edit of one scalar in a YAML file of the subset yaml.ts reads (block mappings, # comments).
// Only the touched line changes (plus the lines of a new key), so comments, order and alignment stay.
// Lists and non-empty flow collections are not edited: the caller gets an error instead. Pure.

export type YamlEdit = { ok: true; text: string } | { ok: false; error: string }

const KEY = /^(\s*)([A-Za-z_][\w-]*|"[^"]*"|'[^']*'):(?=\s|$)(.*)$/
const NULLISH = /^(|null|~|\{\s*\})$/

// A value as YAML: null, integers and booleans as they are, plain text when it is safe, else double-quoted.
export function renderScalar(value: string): string {
  const v = value.trim()
  if (NULLISH.test(v)) return 'null'
  if (/^-?\d+$/.test(v) || v === 'true' || v === 'false') return v
  if (/^[A-Za-z0-9_./@+-][A-Za-z0-9_./@+:=-]*$/.test(v) && !/:$/.test(v)) return v
  return JSON.stringify(v)
}

// `value  # comment` → [value, '  # comment'] (a # starts a comment after whitespace, outside quotes).
function splitComment(rest: string): [string, string] {
  let quote: string | null = null
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '#' && (i === 0 || /\s/.test(rest[i - 1]))) {
      const start = rest.slice(0, i).search(/\s*$/)
      return [rest.slice(0, start).trim(), rest.slice(start)]
    }
  }
  return [rest.trim(), '']
}

const indentOf = (line: string) => line.match(/^ */)![0].length
const isContent = (line: string) => line.trim() !== '' && !line.trim().startsWith('#')
const unquote = (k: string) => k.replace(/^["']|["']$/g, '')

// The line after the last line of the block under line i (content more indented than it, and the comments between).
function blockEnd(lines: string[], i: number): number {
  const own = indentOf(lines[i])
  let end = i + 1
  for (let j = i + 1; j < lines.length; j++) {
    if (!isContent(lines[j])) {
      if (lines[j].trim() !== '' && indentOf(lines[j]) > own) end = j + 1
      continue
    }
    if (indentOf(lines[j]) <= own) break
    end = j + 1
  }
  return end
}

// `key: value  # comment`, keeping the comment's column when the new text is not longer.
function keyLine(indent: string, key: string, value: string, comment: string, old: string): string {
  const head = `${indent}${key}:${value === '' ? '' : ' ' + value}`
  if (!comment) return head
  const column = old.length - comment.trimStart().length
  return head.length < column ? head.padEnd(column) + comment.trimStart() : head + ' ' + comment.trimStart()
}

function nested(path: string[], from: number, indent: number, rendered: string): string[] {
  return path.slice(from).map((k, n) => ' '.repeat(indent + 2 * n) + k + ':' + (from + n === path.length - 1 ? ' ' + rendered : ''))
}

// Sets path (e.g. ['implementation', 'isolation', 'worktree', 'merge']) to value. Missing keys are
// added at the end of their parent; a null / `{}` / `none` value on the way becomes a mapping;
// setting a mapping to null or `none` replaces its block.
export function setYamlScalar(text: string, path: string[], value: string): YamlEdit {
  const lines = text.split('\n')
  const rendered = renderScalar(value)
  const name = path.join('.')
  let lo = 0
  let hi = lines.length
  let parentIndent = -1
  for (let d = 0; d < path.length; d++) {
    const first = lines.slice(lo, hi).find(isContent)
    const childIndent = first !== undefined ? indentOf(first) : parentIndent + 2
    let at = -1
    for (let i = lo; i < hi; i++) {
      if (!isContent(lines[i]) || indentOf(lines[i]) !== childIndent) continue
      const m = lines[i].match(KEY)
      if (m && unquote(m[2]) === path[d]) {
        at = i
        break
      }
      if (lines[i].trim().startsWith('- ')) return { ok: false, error: `${path.slice(0, d).join('.')} is a list; edit it by hand or with /sdd:doctor init` }
    }

    if (at < 0) {
      let insert = lo
      for (let i = lo; i < hi; i++) if (lines[i].trim() !== '' && indentOf(lines[i]) > parentIndent) insert = i + 1
      const added = nested(path, d, Math.max(childIndent, 0), rendered)
      if (d === 0 && insert > 0 && lines[insert - 1]?.trim() !== '') added.unshift('')
      lines.splice(insert, 0, ...added)
      return { ok: true, text: lines.join('\n') }
    }

    const m = lines[at].match(KEY)!
    const [current, comment] = splitComment(m[3])
    const end = blockEnd(lines, at)
    const children = lines.slice(at + 1, end).filter(isContent)
    const last = d === path.length - 1
    if (current.startsWith('[') || children[0]?.trim().startsWith('- ')) return { ok: false, error: `${path.slice(0, d + 1).join('.')} is a list; edit it by hand or with /sdd:doctor init` }

    if (last) {
      if (children.length > 0) {
        if (rendered !== 'null' && rendered !== 'none') return { ok: false, error: `${name} is a mapping; set a key under it` }
        lines.splice(at, end - at, keyLine(m[1], m[2], rendered, '', lines[at]))
      } else {
        lines[at] = keyLine(m[1], m[2], rendered, comment, lines[at])
      }
      return { ok: true, text: lines.join('\n') }
    }
    if (children.length === 0) {
      if (!NULLISH.test(current) && current !== 'none') return { ok: false, error: `${path.slice(0, d + 1).join('.')} is "${current}", not a mapping` }
      lines.splice(at, 1, `${m[1]}${m[2]}:`, ...nested(path, d + 1, indentOf(lines[at]) + 2, rendered))
      return { ok: true, text: lines.join('\n') }
    }
    lo = at + 1
    hi = end
    parentIndent = indentOf(lines[at])
  }
  return { ok: false, error: 'empty key' }
}
