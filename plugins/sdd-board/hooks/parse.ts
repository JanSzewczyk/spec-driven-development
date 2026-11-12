// Pure parsers for the artifacts the sdd plugin writes under specs/<slug>/.
// No mods API in here: everything takes already-read text.

export type Task = { id: string; title: string; type: string; agent: string; model: string; status: string }
export type Story = { id: string; name: string; tasks: Task[] }
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

export function parseTasks(text: string): Story[] {
  const stories: Story[] = []
  let story: Story | null = null
  let task: Task | null = null
  for (const raw of text.split('\n')) {
    const s = raw.match(/^###\s+Story\s+(S\d+)\s*[:\-–]?\s*(.*)$/i)
    if (s) {
      story = { id: s[1].toUpperCase(), name: s[2].trim(), tasks: [] }
      stories.push(story)
      task = null
      continue
    }
    if (!story) continue
    const id = raw.match(/^-\s+id:\s*(\S+)/)
    if (id) {
      task = { id: id[1], title: '', type: '', agent: '', model: '', status: 'draft' }
      story.tasks.push(task)
      continue
    }
    if (!task) continue
    const f = raw.match(/^\s{2,}(title|type|agent|model|status):\s*(.*)$/)
    if (f) (task as Record<string, string>)[f[1]] = f[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')
  }
  return stories
}

// review.md written by the reviewer agent. Its body quotes findings from several agents, so a
// stray "NO-GO" in a finding must not decide it: the `**Verdict:**` header wins, then a
// "Verdict:" line, and only a file with neither falls back to the first verdict word anywhere.
function verdictOf(text: string): 'GO' | 'NO-GO' | null {
  if (/NO[-_\s]?GO/i.test(text)) return 'NO-GO'
  if (/\bGO\b/.test(text)) return 'GO'
  return null
}

export function parseReview(text: string): 'GO' | 'NO-GO' | null {
  const head = header(text, 'Verdict')
  if (head && !head.includes('|')) return verdictOf(head)
  const line = text.match(/^\W*Verdict\W*:\W*(.+)$/im)
  if (line && !line[1].includes('|')) return verdictOf(line[1])
  return verdictOf(text)
}
