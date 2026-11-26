// A strict YAML subset for specs/capabilities.yml. No dependency: mods may import only their own
// files and the sdd-check action runs on plain Node.
// Accepted: block mappings, block sequences (of scalars or mappings), flow [] / {} of scalars,
// plain / 'single' / "double" quoted scalars (an empty [] or {} may sit inside a flow collection), null (~, null, empty), integers, true/false, # comments.
// `on` / `off` / `yes` / `no` stay strings. Anything else (anchors, aliases, tags, block scalars,
// several documents, nested flow collections) is an error with its line number.

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue }
export type YamlError = { line: number; message: string }
export type YamlResult = { value: YamlValue; errors: YamlError[] }

type Line = { no: number; indent: number; text: string }

class YamlFail extends Error {
  line: number
  constructor(line: number, message: string) {
    super(message)
    this.line = line
  }
}

// Text before a `#` that starts a comment (at the start or after whitespace, outside quotes).
function stripComment(raw: string, no: number): string {
  let quote: string | null = null
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) {
        if (quote === "'" && raw[i + 1] === "'") i++
        else quote = null
      }
    } else if (c === '"' || c === "'") {
      const prev = raw[i - 1]
      if (i === 0 || prev === ' ' || prev === '[' || prev === '{' || prev === ',' || prev === ':' || prev === '-') quote = c
    } else if (c === '#' && (i === 0 || raw[i - 1] === ' ' || raw[i - 1] === '\t')) return raw.slice(0, i).trimEnd()
  }
  if (quote) throw new YamlFail(no, 'unterminated quoted string')
  return raw.trimEnd()
}

function lex(text: string): Line[] {
  const out: Line[] = []
  let docs = 0
  text.replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    const no = i + 1
    if (/^(---|\.\.\.)(\s|$)/.test(raw)) {
      if (raw.startsWith('...') || ++docs > 1 || out.length > 0) throw new YamlFail(no, 'only one YAML document is supported')
      return
    }
    if (/^\s*%/.test(raw) && out.length === 0) throw new YamlFail(no, 'directives (%) are not supported')
    const lead = raw.match(/^[ \t]*/)![0]
    if (lead.includes('\t')) throw new YamlFail(no, 'tabs are not allowed for indentation')
    const body = stripComment(raw.slice(lead.length), no)
    if (body === '') return
    out.push({ no, indent: lead.length, text: body })
  })
  return out
}

const INT = /^[-+]?(0|[1-9]\d*)$/

function scalar(src: string, no: number): YamlValue {
  const s = src.trim()
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null
  if (s.startsWith('"')) {
    if (!s.endsWith('"') || s.length < 2) throw new YamlFail(no, 'unterminated "double-quoted" string')
    const inner = s.slice(1, -1)
    let out = ''
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i]
      if (c === '"') throw new YamlFail(no, 'unexpected " inside a double-quoted string')
      if (c !== '\\') {
        out += c
        continue
      }
      const e = inner[++i]
      const map: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\', '/': '/', '0': '\0' }
      if (e === undefined || !(e in map)) throw new YamlFail(no, `unsupported escape \\${e ?? ''}`)
      out += map[e]
    }
    return out
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) throw new YamlFail(no, "unterminated 'single-quoted' string")
    const inner = s.slice(1, -1)
    if (inner.replace(/''/g, '').includes("'")) throw new YamlFail(no, "unexpected ' inside a single-quoted string")
    return inner.replace(/''/g, "'")
  }
  const c = s[0]
  if (c === '&' || c === '*') throw new YamlFail(no, `anchors and aliases are not supported: quote the value if "${c}" is part of it`)
  if (c === '!') throw new YamlFail(no, 'tags (!) are not supported')
  if (c === '|' || c === '>') throw new YamlFail(no, 'block scalars (| and >) are not supported: write the value on one line')
  if (c === '@' || c === '`' || c === '%') throw new YamlFail(no, `a plain value cannot start with "${c}": quote it`)
  if (c === '[' || c === '{') return flow(s, no)
  if (c === ']' || c === '}') throw new YamlFail(no, `unexpected "${c}"`)
  if (/:(\s|$)/.test(s)) throw new YamlFail(no, 'a value cannot contain ": " unless it is quoted')
  if (s === 'true' || s === 'True' || s === 'TRUE') return true
  if (s === 'false' || s === 'False' || s === 'FALSE') return false
  if (INT.test(s)) return Number(s)
  return s
}

// Split on commas outside quotes.
function splitFlow(body: string, no: number): string[] {
  const parts: string[] = []
  let cur = ''
  let quote: string | null = null
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (quote) {
      cur += c
      if (c === '\\' && quote === '"') cur += body[++i] ?? ''
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      cur += c
    } else if ((c === '[' && body[i + 1] === ']') || (c === '{' && body[i + 1] === '}')) {
      cur += c + body[++i] // an empty [] or {} is the one nested collection allowed
    } else if (c === '[' || c === '{' || c === ']' || c === '}') {
      throw new YamlFail(no, 'nested flow collections are not supported (except an empty [] or {})')
    } else if (c === ',') {
      parts.push(cur)
      cur = ''
    } else cur += c
  }
  parts.push(cur)
  const trimmed = parts.map((p) => p.trim())
  if (trimmed.length === 1 && trimmed[0] === '') return []
  if (trimmed[trimmed.length - 1] === '') trimmed.pop() // trailing comma
  if (trimmed.some((p) => p === '')) throw new YamlFail(no, 'empty entry in a flow collection')
  return trimmed
}

function flow(s: string, no: number): YamlValue {
  const open = s[0]
  const close = open === '[' ? ']' : '}'
  if (!s.endsWith(close)) throw new YamlFail(no, `flow collection not closed with "${close}" on the same line`)
  const items = splitFlow(s.slice(1, -1), no)
  if (open === '[') return items.map((it) => scalar(it, no))
  const out: { [key: string]: YamlValue } = {}
  for (const it of items) {
    const kv = splitKey(it, no)
    if (!kv) throw new YamlFail(no, `"${it}" is not a key: value pair`)
    if (kv.key in out) throw new YamlFail(no, `duplicate key "${kv.key}"`)
    out[kv.key] = scalar(kv.rest, no)
  }
  return out
}

// `key: rest` / `key:` → { key, rest }; null when the line is not a mapping entry.
function splitKey(text: string, no: number): { key: string; rest: string } | null {
  let key: string
  let after: string
  if (text.startsWith('"') || text.startsWith("'")) {
    const q = text[0]
    let end = -1
    for (let i = 1; i < text.length; i++) {
      if (text[i] === '\\' && q === '"') i++
      else if (text[i] === q) {
        if (q === "'" && text[i + 1] === "'") i++
        else {
          end = i
          break
        }
      }
    }
    if (end < 0) return null
    after = text.slice(end + 1)
    if (!/^:(\s|$)/.test(after)) return null
    key = String(scalar(text.slice(0, end + 1), no))
    return { key, rest: after.slice(1).trim() }
  }
  const m = text.match(/^([^\s#'"\[\]{},&*!|>%@`-][^:]*?|-[^\s:][^:]*?)\s*:(\s+(.*)|)$/)
  if (!m) return null
  key = m[1]
  if (key.startsWith('?')) throw new YamlFail(no, 'complex keys (?) are not supported')
  return { key, rest: (m[3] ?? '').trim() }
}

const isItem = (l: Line) => l.text === '-' || l.text.startsWith('- ')

class Parser {
  i = 0
  lines: Line[]
  constructor(lines: Line[]) {
    this.lines = lines
  }

  peek(): Line | undefined {
    return this.lines[this.i]
  }

  // A block whose lines are all at exactly `indent`.
  block(indent: number): YamlValue {
    const l = this.peek()
    if (!l) return null
    return isItem(l) ? this.sequence(indent) : this.mapping(indent)
  }

  // The value after `key:` / `-` with nothing on the same line: a nested block, or null.
  nested(parentIndent: number, allowSameIndentSeq: boolean): YamlValue {
    const next = this.peek()
    if (!next) return null
    if (next.indent > parentIndent) return this.block(next.indent)
    if (allowSameIndentSeq && next.indent === parentIndent && isItem(next)) return this.sequence(parentIndent)
    return null
  }

  mapping(indent: number, first?: { key: string; rest: string; no: number }): { [key: string]: YamlValue } {
    const out: { [key: string]: YamlValue } = {}
    const put = (key: string, value: YamlValue, no: number) => {
      if (key in out) throw new YamlFail(no, `duplicate key "${key}"`)
      out[key] = value
    }
    if (first) put(first.key, first.rest === '' ? this.nested(indent, true) : scalar(first.rest, first.no), first.no)
    for (let l = this.peek(); l; l = this.peek()) {
      if (l.indent < indent) break
      if (l.indent > indent) throw new YamlFail(l.no, 'unexpected indentation')
      if (isItem(l)) throw new YamlFail(l.no, 'a list item where a key was expected')
      const kv = splitKey(l.text, l.no)
      if (!kv) throw new YamlFail(l.no, `expected "key: value", got "${l.text}"`)
      this.i++
      put(kv.key, kv.rest === '' ? this.nested(indent, true) : scalar(kv.rest, l.no), l.no)
    }
    return out
  }

  sequence(indent: number): YamlValue[] {
    const out: YamlValue[] = []
    for (let l = this.peek(); l; l = this.peek()) {
      if (l.indent < indent) break
      if (l.indent > indent) throw new YamlFail(l.no, 'unexpected indentation')
      if (!isItem(l)) break
      this.i++
      const rest = l.text === '-' ? '' : l.text.slice(2).trim()
      if (rest === '') {
        out.push(this.nested(indent, false))
        continue
      }
      if (rest.startsWith('- ') || rest === '-') throw new YamlFail(l.no, 'nested inline lists (- -) are not supported')
      const kv = rest.startsWith('[') || rest.startsWith('{') ? null : splitKey(rest, l.no)
      if (kv) {
        // `- key: value` opens a mapping whose further keys sit under the key.
        const itemIndent = indent + (l.text.length - l.text.slice(1).trimStart().length)
        out.push(this.mapping(itemIndent, { ...kv, no: l.no }))
      } else out.push(scalar(rest, l.no))
    }
    return out
  }
}

export function parseYaml(text: string): YamlResult {
  try {
    const lines = lex(text)
    if (lines.length === 0) return { value: null, errors: [] }
    if (lines[0].indent !== 0) throw new YamlFail(lines[0].no, 'the document must start at column 1')
    const p = new Parser(lines)
    const first = lines[0]
    let value: YamlValue
    if (isItem(first) || splitKey(first.text, first.no)) value = p.block(0)
    else {
      value = scalar(first.text, first.no)
      p.i = 1
    }
    const left = p.peek()
    if (left) throw new YamlFail(left.no, left.indent > 0 ? 'unexpected indentation' : `unexpected "${left.text}"`)
    return { value, errors: [] }
  } catch (e) {
    if (e instanceof YamlFail) return { value: null, errors: [{ line: e.line, message: e.message }] }
    throw e
  }
}
