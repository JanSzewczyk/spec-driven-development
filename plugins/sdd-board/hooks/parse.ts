// Pure parsers for the artifacts the sdd plugin writes under specs/<slug>/.
// No mods API in here: everything takes already-read text.

export type Task = {
  id: string
  title: string
  status: string
  project: string
  dependsOn: string[] // task ids that must be review|done first; [] when none or not stated
  acceptance: string[] // AC ids the task serves
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

// tasks.md: each task is a `### T<n>: title` heading followed by `key: value` lines.
export function parseTasks(text: string): Task[] {
  const tasks: Task[] = []
  let task: Task | null = null
  for (const raw of text.split('\n')) {
    const h = raw.match(/^###\s+(T\d+)\s*[:\-–·]\s*(.*)$/i)
    if (h) {
      task = { id: h[1].toUpperCase(), title: h[2].trim(), status: 'draft', project: '', dependsOn: [], acceptance: [] }
      tasks.push(task)
      continue
    }
    if (!task) continue
    const f = raw.match(/^(project|status|depends_on|acceptance):\s*(.*)$/)
    if (!f) continue
    const value = f[2].replace(/\s+#.*$/, '').trim()
    if (f[1] === 'depends_on' || f[1] === 'acceptance') {
      const list = value.replace(/^\[|\]$/g, '').split(',').map((v) => unquote(v.trim())).filter((v) => v && !/^(none|—|-)$/i.test(v))
      if (f[1] === 'depends_on') task.dependsOn = list
      else task.acceptance = list
    } else {
      task[f[1] as 'project' | 'status'] = unquote(value)
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
