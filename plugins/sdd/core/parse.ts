// Pure parsers for the artifacts the sdd plugin writes under specs/<slug>/.
// No mods API in here: everything takes already-read text.

export type Task = {
  id: string
  title: string
  status: string
  project: string
  dependsOn: string[] // task ids that must be review|done first; [] when none or not stated
  acceptance: string[] // AC ids the task serves
  branch: string // task branch while it runs in its own worktree; '' otherwise
  pr: string // pull request (number or URL) while it waits for a merge; '' otherwise
  scope?: string[] // the `scope:` bullets
  files?: string // the `files:` value
}
export type SpecInfo = {
  title: string
  branch: string
  status: string
  type: string
  owner: string
  created: string
  acTotal: number
  acDone: number
  acReal: number // acceptance criteria that are not template placeholders
  openQuestions: number
  hasSummary: boolean
  storyCount: number
  edgeCases: number
  criteria?: { id: string; text: string }[] // acceptance criteria by id (`- [ ] AC1: text`)
}
export type PlanInfo = { status: string; missing: string[]; openItems: number }

function header(text: string, name: string): string {
  const m = text.match(new RegExp('^\\*\\*' + name + ':\\*\\*\\s*([^\\s<][^<]*?)\\s*(?:<!--.*)?$', 'm'))
  return m ? m[1].trim() : ''
}

function section(text: string, title: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  let inside = false
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      inside = line.toLowerCase().includes(title.toLowerCase())
      continue
    }
    if (inside) out.push(line)
  }
  return out
}

// Bullet texts of a section, minus template placeholders ("?", "...", "<role>") and "none" notes.
function bullets(lines: string[]): string[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((t) => t !== '' && !/^(\?|\.\.\.|…)$/.test(t) && !/<[^>]+>/.test(t) && !/^_?(none|all resolved|n\/a|no open)\b/i.test(t))
}

export function parseSpec(text: string): SpecInfo {
  const title = (text.match(/^#\s*Feature:\s*(.+)$/m)?.[1] ?? '').trim()
  const ac = section(text, 'Acceptance criteria').filter((l) => /^- \[[ xX]\]/.test(l))
  const open = bullets(section(text, 'Open questions')).filter((t) => !/^\[[xX]\]/.test(t))
  const summary = section(text, 'Summary').filter((l) => {
    const t = l.trim()
    return t !== '' && !t.startsWith('<!--') && t !== '---'
  })
  return {
    title,
    branch: header(text, 'Branch'),
    status: header(text, 'Status').split(/\s/)[0],
    type: header(text, 'Type').split(/\s/)[0],
    owner: header(text, 'Owner'),
    created: header(text, 'Created'),
    acTotal: ac.length,
    acDone: ac.filter((l) => /^- \[[xX]\]/.test(l)).length,
    acReal: ac.filter((l) => !/:\s*\.\.\.\s*$|given input X/.test(l)).length,
    openQuestions: open.length,
    hasSummary: summary.length > 0,
    storyCount: bullets(section(text, 'User stories')).length,
    edgeCases: bullets(section(text, 'Edge cases')).length,
    criteria: ac.flatMap((l) => {
      const m = l.match(/^- \[[ xX]\]\s*(AC\d+)\s*[:\-–·]?\s*(.*)$/)
      return m ? [{ id: m[1], text: m[2].trim() }] : []
    }),
  }
}

// plan.md written by /sdd:plan. "missing" lists the required sections that are absent or empty.
export function parsePlan(text: string): PlanInfo {
  const required: [string, string][] = [
    ['High-level approach', 'approach'],
    ['File-by-file change list', 'change list'],
    ['Risks', 'risks'],
  ]
  const missing = required.filter(([title]) => section(text, title).every((l) => l.trim() === '')).map(([, name]) => name)
  return { status: header(text, 'Status').split(/\s/)[0], missing, openItems: bullets(section(text, 'Open questions')).length }
}

export function parsePlanStatus(text: string): string {
  return header(text, 'Status').split(/\s/)[0]
}

// `**Epic:** ULOG` in the tasks.md header; '' when absent.
export function parseEpicId(text: string): string {
  return header(text, 'Epic').split(/\s/)[0]
}

// tasks.md: each task is a `### T<n>: title` heading followed by `key: value` lines.
export function parseTasks(text: string): Task[] {
  const tasks: Task[] = []
  let task: Task | null = null
  let inScope = false
  for (const raw of text.split('\n')) {
    const h = raw.match(/^###\s+(T\d+)\s*[:\-–·]\s*(.*)$/i)
    if (h) {
      task = { id: h[1].toUpperCase(), title: h[2].trim(), status: 'draft', project: '', dependsOn: [], acceptance: [], branch: '', pr: '' }
      tasks.push(task)
      inScope = false
      continue
    }
    if (!task) continue
    // `scope:` is followed by `- action` bullets; any other `key:` line ends the list.
    const bullet = raw.match(/^\s*[-*]\s+(.+)$/)
    if (inScope && bullet) {
      task.scope = [...(task.scope ?? []), bullet[1].trim()]
      continue
    }
    inScope = false
    if (/^scope:\s*$/.test(raw)) {
      inScope = true
      task.scope = []
      continue
    }
    const fl = raw.match(/^files:\s*(.*)$/)
    if (fl) {
      task.files = fl[1].trim()
      continue
    }
    const f = raw.match(/^(project|status|depends_on|acceptance|branch|pr):\s*(.*)$/)
    if (!f) continue
    const value = f[2].replace(/\s+#.*$/, '').trim()
    if (f[1] === 'depends_on' || f[1] === 'acceptance') {
      const list = value.replace(/^\[|\]$/g, '').split(',').map((v) => unquote(v.trim())).filter((v) => v && !/^(none|—|-)$/i.test(v))
      if (f[1] === 'depends_on') task.dependsOn = list
      else task.acceptance = list
    } else {
      task[f[1] as 'project' | 'status' | 'branch' | 'pr'] = unquote(value)
    }
  }
  return tasks
}

function unquote(v: string): string {
  return v.replace(/^["']|["']$/g, '')
}

export type Verdict = 'READY' | 'NOT READY'

// review.md written by the reviewer agent. Its body quotes findings from several agents, so a
// stray "NOT READY" in a finding must not decide it: the `**Verdict:**` header wins, then a
// "Verdict:" line, and only a file with neither falls back to the first verdict word anywhere.
// Reviews written before the rename say GO / NO-GO; they are read as READY / NOT READY.
function verdictOf(text: string): Verdict | null {
  if (/NOT[-_\s]?READY|NO[-_\s]?GO/i.test(text)) return 'NOT READY'
  if (/\bREADY\b|\bGO\b/.test(text)) return 'READY'
  return null
}

export function parseReview(text: string): Verdict | null {
  const head = header(text, 'Verdict')
  if (head && !head.includes('|')) return verdictOf(head)
  const line = text.match(/^\W*Verdict\W*:\W*(.+)$/im)
  if (line && !line[1].includes('|')) return verdictOf(line[1])
  return verdictOf(text)
}

// The checks a review.md records, in the line shapes agents/reviewer.md asks for. Older files fill
// what they can: an audit line without PASS / FAIL / SKIPPED has a null result.
export type Severity = 'critical' | 'major' | 'minor'
export type Finding = { severity: Severity; text: string; at: string }
export type ReviewTest = { project: string; text: string; passed: boolean | null }
export type ReviewAudit = { name: string; label: string; result: 'PASS' | 'FAIL' | 'SKIPPED' | null; counts: string; note: string; findings: Finding[] }
export type Blocker = { mustFix: boolean; text: string; check: string; task: string }
export type ReviewDetail = {
  verdict: Verdict | null
  ac: { met: number; total: number } | null
  tests: ReviewTest[]
  rules: { respected: number; violated: Finding[] }
  audits: ReviewAudit[]
  blockers: Blocker[]
  accepted: string[]
}

const AT = /`([^`\s]+:\d[\d,\-–]*)`/ // `file:line` inside a finding

export function parseReviewDetail(text: string): ReviewDetail {
  const top = (title: string) => section(text, title).filter((l) => /^[-*]\s/.test(l)).map((l) => l.replace(/^[-*]\s+/, '').trim())
  const ac = section(text, 'Spec compliance').join('\n').match(/(\d+)\s*\/\s*(\d+)\s+AC\b/)
  const tests = top('Tests').flatMap((t) => {
    const m = t.match(/^`?([^`:]+?)`?:\s*(.+)$/)
    if (!m || /<[^>]+>/.test(t)) return []
    const r = m[2].match(/\s+[—–-]\s+(pass|fail)(?:ed)?\b\.?\s*(?:\([^)]*\))?\s*$/i)
    return [{ project: m[1].trim(), text: (r ? m[2].slice(0, r.index) : m[2]).replace(/`/g, '').trim(), passed: r ? r[1].toLowerCase() === 'pass' : null }]
  })
  const rules = { respected: 0, violated: [] as Finding[] }
  for (const r of top('Constitution rules')) {
    if (/[—–-]\s*violated/i.test(r)) rules.violated.push({ severity: 'major', text: r.replace(/\s*[—–-]\s*violated.*$/i, '').replace(/`/g, ''), at: r.match(AT)?.[1] ?? '' })
    else if (/[—–-]\s*respected/i.test(r)) rules.respected += 1
  }
  const audits: ReviewAudit[] = []
  for (const line of section(text, 'Audits')) {
    // `- <name> (<label>): <result>`, or `- <name>: <result>`; a name may hold colons (nextjs:code-reviewer).
    const withLabel = line.match(/^[-*]\s+(\S.*?)\s+\(([^)]*)\):\s*(.*)$/)
    const bare = withLabel ? null : line.match(/^[-*]\s+([^\s:]+(?::[^\s:]+)*):\s*(.*)$/)
    const head = withLabel ? withLabel.slice(1) : bare ? [bare[1], '', bare[2]] : null
    const sub = line.match(/^\s+[-*]\s+(Critical|Major|Minor)\b[^:]*:\s*(.+)$/i)
    if (sub && audits.length) {
      // A finding that opens with its location: the location goes to `at`, the text keeps the rest.
      const body = sub[2].replace(/^`[^`\s]+:\d[^`]*`(?:\s*\([^)]*\)\s*|[.:]?\s+)/, '').replace(/\s*\(`[^`]+`\)\s*$/, '').trim()
      audits[audits.length - 1].findings.push({ severity: sub[1].toLowerCase() as Severity, text: (body || sub[2].trim()).replace(/`/g, ''), at: sub[2].match(AT)?.[1] ?? '' })
    } else if (head && !/<[^>]+>/.test(line)) {
      const [name, label, rest] = head
      const r = rest.match(/^(PASS|FAIL|SKIPPED)\b[.\s—–-]*(.*)$/)
      const counts = (r ? r[2] : rest).match(/\d+\s+critical,?\s+\d+\s+major,?\s+\d+\s+minor/i)?.[0].replace(/,/g, '') ?? ''
      const note = (r ? r[2] : rest).replace(/`/g, '').split(/(?<=\.)\s/)[0].replace(/\.$/, '').trim()
      audits.push({ name: name.replace(/`/g, '').trim(), label: label.replace(/`/g, '').trim(), result: r ? (r[1] as ReviewAudit['result']) : null, counts, note, findings: [] })
    }
  }
  const blockers = top('Blockers').flatMap((b) => {
    const m = b.match(/^(must fix|acceptable):\s*(.+?)(?:\s+[—–]\s+(.+?))?(?:\s+·\s+(T\d+|none))?\s*$/i)
    return m ? [{ mustFix: m[1].toLowerCase() === 'must fix', text: m[2].trim(), check: (m[3] ?? '').trim(), task: m[4] && m[4] !== 'none' ? m[4] : '' }] : []
  })
  const accepted = top('Accepted').filter((a) => !/<[^>]+>/.test(a))
  return { verdict: parseReview(text), ac: ac ? { met: Number(ac[1]), total: Number(ac[2]) } : null, tests, rules, audits, blockers, accepted }
}
